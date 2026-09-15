import copy
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import writing as w


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def artemis_row(number=1, handles=(w.HANDLE,), day='2026-09-01'):
    return {'title': f'Article {number}', 'post_date': day + 'T12:00:00Z',
            'canonical_url': f'https://research.artemis.ai/p/article-{number}',
            'publishedBylines': [{'name': h, 'handle': h} for h in handles],
            'description': 'A useful publisher description about this article.'}


class SourceTests(unittest.TestCase):
    def test_exact_byline_and_coauthors_without_incidental_mentions(self):
        other = artemis_row(2, ('other',))
        other['description'] = 'An interview with zhengjielimm.'
        coauthored = artemis_row(3, ('other', w.HANDLE))
        weekly = artemis_row(4)
        weekly['title'] = 'This Week in Digital Finance'
        other_weekly = artemis_row(5)
        other_weekly['title'] = 'Artemis Weekly Digital Finance Fundamentals 2026.4.11'
        posts = w.artemis_posts(lambda _: [artemis_row(), other, coauthored, weekly, other_weekly])
        self.assertEqual(len(posts), 2)
        self.assertEqual(len(posts[1]['authors']), 2)
        self.assertEqual(posts[1]['authors'][1]['@id'], w.SITE + '/#person')

    def test_archive_paginates_past_first_twenty_posts(self):
        calls = []
        def fetch(url):
            offset = int(parse_qs(urlsplit(url).query)['offset'][0])
            calls.append(offset)
            return [artemis_row(i, ('other',)) for i in range(20)] if offset == 0 else [artemis_row(21)]
        self.assertEqual(len(w.artemis_posts(fetch)), 1)
        self.assertEqual(calls, [0, 20])

    def test_failure_during_pagination_propagates(self):
        def fetch(url):
            if 'offset=0' in url:
                return [artemis_row(i) for i in range(20)]
            raise OSError('source outage')
        with self.assertRaises(OSError):
            w.artemis_posts(fetch)

    def test_empty_and_missing_bylines_fail_closed(self):
        for rows in [[], [{'post_date': '2026-09-01'}], {'error': 'rate limit'}]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                w.artemis_posts(lambda _: rows)

    def test_invalid_outbound_canonicals_are_rejected(self):
        for url in ['javascript:alert(1)', 'https://research.artemis.ai.evil.test/p/x',
                    'https://research.artemis.ai@evil.test/p/x', 'http://research.artemis.ai/p/x',
                    'https://research.artemis.ai/p/x?tracking=1', 'https://research.artemis.ai/']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                w.canonical(url, 'artemis')

    def test_short_wordpress_feed_rejected(self):
        with self.assertRaises(ValueError):
            w.lti_posts(lambda _: [])

    def test_source_html_is_cleaned_and_sentences_bounded(self):
        text = w.summary('<p>First useful sentence. Second useful sentence. Third sentence.</p><script>bad()</script>')
        self.assertEqual(text, 'First useful sentence. Second useful sentence.')
        self.assertEqual(w.plain('AT&amp;T <em>research</em>'), 'AT&T research')
        with self.assertRaises(ValueError):
            w.summary('')


class SiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.articles = json.loads((w.ROOT / 'data/articles.json').read_text())
        cls.template = (w.ROOT / 'templates/writing.html').read_text()

    def test_new_posts_keep_curated_summaries_and_use_publisher_fallback(self):
        original = copy.deepcopy(self.articles)
        raw = [{**a, 'source_summary': 'New publisher text about the subject.'} for a in original]
        overrides = {a['url']: {'summary': a['summary']} for a in original}
        new = {**raw[0], 'url': 'https://research.artemis.ai/p/new-article', 'title': 'New article'}
        with patch.object(w, 'artemis_posts', return_value=[a for a in raw if a['source'] == 'artemis'] + [new]), patch.object(w, 'lti_posts', return_value=[a for a in raw if a['source'] == 'lti']):
            result = w.collect(overrides, original)
        indexed = {a['url']: a for a in result}
        for a in original:
            self.assertEqual(indexed[a['url']]['summary'], a['summary'])
        self.assertEqual(indexed[new['url']]['summary_origin'], 'publisher')

    def test_disappearing_existing_artemis_post_stops_sync(self):
        raw = [{**a, 'source_summary': 'A sufficiently long publisher description.'} for a in self.articles]
        with patch.object(w, 'artemis_posts', return_value=[a for a in raw if a['source'] == 'artemis'][1:]), patch.object(w, 'lti_posts', return_value=[a for a in raw if a['source'] == 'lti']), self.assertRaises(ValueError):
            w.collect({}, self.articles)

    def test_render_is_deterministic_and_matches_committed_page(self):
        html = w.render(self.articles, self.template)
        self.assertEqual(html, w.render(self.articles, self.template))
        self.assertEqual(html, (w.ROOT / 'writing/index.html').read_text())

    def test_render_escapes_source_html_and_script_delimiters(self):
        articles = copy.deepcopy(self.articles)
        articles[0]['summary'] = '</script><script>alert("test")</script>'
        html = w.render(articles, self.template)
        self.assertNotIn('<script>alert(', html)
        self.assertIn('\\u003c/script\\u003e', html)
        self.assertIn('&lt;/script&gt;', html)

    def test_schema_canonicals_titles_and_dates_match_visible_cards(self):
        html = w.render(self.articles, self.template)
        schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
        collection = schema['@graph'][0]
        self.assertEqual(collection['@type'], 'CollectionPage')
        items = collection['mainEntity']['itemListElement']
        tags = Elements(html).tags
        hrefs = [a['href'] for t, a in tags if t == 'a' and a.get('target') == '_blank']
        dates = [a['datetime'] for t, a in tags if t == 'time']
        self.assertEqual(hrefs, [i['item']['url'] for i in items])
        self.assertEqual(dates, [i['item']['datePublished'] for i in items])
        self.assertEqual([i['position'] for i in items], list(range(1, len(items) + 1)))
        self.assertEqual(len(re.findall('<h1>', html)), 1)
        self.assertNotRegex(html, r'<h3>\s*<a')

    def test_duplicate_urls_rejected(self):
        with self.assertRaises(ValueError):
            w.validate(self.articles + [self.articles[0]])

    def test_navigation_and_designs_indexing(self):
        for path, current in [('index.html', '/'), ('writing/index.html', '/writing/'), ('designs/index.html', '/designs/'), ('projects/index.html', '/projects/')]:
            tags = Elements((w.ROOT / path).read_text()).tags
            links = [a for t, a in tags if t == 'a']
            self.assertTrue({'/', '/writing/', '/designs/', '/projects/'}.issubset({a.get('href') for a in links}))
            self.assertEqual([a['href'] for a in links if a.get('aria-current') == 'page'], [current])
        designs = (w.ROOT / 'designs/index.html').read_text()
        self.assertIn('content="index, follow, max-image-preview:large"', designs)
        self.assertNotIn('Coming soon.', designs)
        self.assertIn('/designs/', (w.ROOT / 'sitemap.xml').read_text())
        self.assertIn('content="index, follow, max-image-preview:large"', (w.ROOT / 'projects/index.html').read_text())
        self.assertIn('/projects/', (w.ROOT / 'sitemap.xml').read_text())

    def test_sitemap_date_changes_only_for_writing(self):
        xml = (w.ROOT / 'sitemap.xml').read_text()
        result = w.update_sitemap(xml, '2030-01-02')
        self.assertEqual(result.count('2030-01-02'), 1)
        ET.fromstring(result)
        self.assertEqual(w.update_sitemap(result, '2030-01-02'), result)
        self.assertEqual(w.writing_lastmod(result), '2030-01-02')

    def test_published_unchanged_run_preserves_lastmod_and_local_sitemap_entries(self):
        html = w.render(self.articles, self.template)
        original_xml = (w.ROOT / 'sitemap.xml').read_text()
        live_xml = w.update_sitemap(original_xml, '2026-08-01')
        local_xml = original_xml.replace('</urlset>', '<url><loc>https://limzhengjie.com/future/</loc></url></urlset>')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for folder in ['data', 'writing', 'templates']:
                (root / folder).mkdir()
            for path, text in [('data/articles.json', json.dumps(self.articles)), ('data/writing-overrides.json', '{}'),
                               ('templates/writing.html', self.template), ('writing/index.html', html), ('sitemap.xml', local_xml)]:
                (root / path).write_text(text)
            def fetch(url):
                return html if url.endswith('/writing/') else live_xml
            with patch.object(w, 'ROOT', root), patch.object(w, 'fetch_text', side_effect=fetch), patch.object(w, 'collect', return_value=copy.deepcopy(self.articles)), patch.object(sys, 'argv', ['writing.py', '--sync', '--published']):
                w.main()
            result = (root / 'sitemap.xml').read_text()
            self.assertEqual(w.writing_lastmod(result), '2026-08-01')
            self.assertIn('https://limzhengjie.com/future/', result)

    def test_source_failure_leaves_output_unchanged(self):
        paths = [w.ROOT / path for path in ['data/articles.json', 'writing/index.html', 'sitemap.xml']]
        before = [p.read_bytes() for p in paths]
        with patch.object(w, 'collect', side_effect=OSError('source offline')), patch.object(sys, 'argv', ['writing.py', '--sync']), self.assertRaises(OSError):
            w.main()
        self.assertEqual(before, [p.read_bytes() for p in paths])


if __name__ == '__main__':
    unittest.main()
