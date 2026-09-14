"""Check crawlable page and asset contracts across the published site."""
from html import unescape
from html.parser import HTMLParser
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shlex
import unittest
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.robotparser import RobotFileParser
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://limzhengjie.com'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9',
      'image': 'http://www.google.com/schemas/sitemap-image/1.1'}


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def attrs(self, tag):
        return [attrs for name, attrs in self.elements if name == tag]


def local_path(url):
    path = urlsplit(url).path
    return ROOT / (path.lstrip('/') + 'index.html' if path.endswith('/') else path.lstrip('/'))


class SEOTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sitemap = ET.fromstring((ROOT / 'sitemap.xml').read_text())
        cls.urls = [url.findtext('s:loc', namespaces=NS) for url in cls.sitemap.findall('s:url', NS)]
        cls.html = {url: local_path(url).read_text() for url in cls.urls}
        cls.pages = {url: Page(html) for url, html in cls.html.items()}
        cls.public_pages = dict(cls.pages)
        for path in ['projects/index.html', 'me/index.html', '404.html']:
            cls.public_pages[SITE + '/' + path.replace('index.html', '')] = Page((ROOT / path).read_text())

    def test_sitemap_pages_have_unique_metadata_and_self_canonicals(self):
        self.assertEqual(len(self.urls), len(set(self.urls)))
        titles, descriptions = [], []
        for url, page in self.pages.items():
            with self.subTest(url=url):
                self.assertEqual(urlsplit(url).scheme, 'https')
                self.assertEqual(urlsplit(url).netloc, urlsplit(SITE).netloc)
                self.assertEqual([a['href'] for a in page.attrs('link') if a.get('rel') == 'canonical'], [url])
                meta = {a.get('name', a.get('property')): a.get('content', '') for a in page.attrs('meta')}
                self.assertNotIn('noindex', meta.get('robots', ''))
                self.assertEqual(meta['og:url'], url)
                self.assertTrue(meta['description'].strip())
                self.assertEqual(len(page.attrs('h1')), 1)
                title = re.findall(r'<title>(.*?)</title>', self.html[url], re.S)
                self.assertEqual(len(title), 1)
                self.assertTrue(title[0].strip())
                titles.append(title[0])
                descriptions.append(meta['description'])
        self.assertEqual(len(titles), len(set(titles)))
        self.assertEqual(len(descriptions), len(set(descriptions)))

    def test_all_sitemap_pages_are_reachable_from_home(self):
        reached, pending = set(), [SITE + '/']
        while pending:
            url = pending.pop()
            if url in reached:
                continue
            reached.add(url)
            for attrs in self.pages[url].attrs('a'):
                link = urljoin(url, attrs.get('href', '')).split('#')[0]
                if link in self.pages and link not in reached:
                    pending.append(link)
        self.assertEqual(reached, set(self.urls))

    def test_vercel_search_exclusion_does_not_match_the_canonical_domain(self):
        config = json.loads((ROOT / 'vercel.json').read_text())
        rules = [rule for rule in config.get('headers', [])
                 if any(header['key'].lower() == 'x-robots-tag'
                        and 'noindex' in header['value'].lower()
                        for header in rule['headers'])]
        self.assertTrue(rules, 'Public Vercel copies must be excluded from search')
        for rule in rules:
            self.assertEqual(rule['source'], '/(.*)')
            hosts = [condition['value'] for condition in rule.get('has', [])
                     if condition['type'] == 'host']
            self.assertTrue(hosts, 'Never apply noindex to every production host')
            for host in [urlsplit(SITE).netloc, 'www.limzhengjie.com',
                         'limzhengjie.github.io', 'vercel.app.example.com']:
                self.assertFalse(any(re.fullmatch(pattern, host) for pattern in hosts), host)
        for host in ['limzhengjie-github-io.vercel.app',
                     'limzhengjie-github-preview-123.vercel.app']:
            self.assertTrue(any(re.fullmatch(condition['value'], host)
                                for rule in rules for condition in rule['has']
                                if condition['type'] == 'host'), host)

    def test_internal_links_images_and_scripts_exist(self):
        for url, page in self.public_pages.items():
            for tag, attrs in page.elements:
                ref = attrs.get('href') if tag in ('a', 'link') else attrs.get('src') if tag in ('img', 'script') else None
                if not ref:
                    continue
                target = urljoin(url, ref)
                if urlsplit(target).netloc != urlsplit(SITE).netloc:
                    continue
                with self.subTest(page=url, resource=ref):
                    self.assertTrue(local_path(target).is_file(), target)
            for img in page.attrs('img'):
                self.assertIn('alt', img)
                if img.get('src'):
                    self.assertGreater(int(img['width']), 0)
                    self.assertGreater(int(img['height']), 0)
                for candidate in img.get('srcset', '').split(','):
                    if candidate.strip():
                        self.assertTrue(local_path(urljoin(url, candidate.strip().split()[0])).is_file())

    def test_public_page_inventory_has_an_explicit_indexing_policy(self):
        files = set(ROOT.glob('*.html'))
        # Discover, do not enumerate. A hand-listed set stops where its author
        # stopped looking, and a new page folder would silently skip this contract.
        for folder in sorted(p for p in ROOT.iterdir() if p.is_dir()
                             and not p.name.startswith('.')
                             and p.name not in {'assets', 'data', 'docs', 'scripts', 'tests', 'templates', 'api', 'node_modules'}):
            files.update(folder.rglob('*.html'))
        eligible = set()
        for file in files:
            page = Page(file.read_text())
            robots = [a['content'] for a in page.attrs('meta') if a.get('name') == 'robots']
            self.assertEqual(len(robots), 1, file)
            canonical = [a['href'] for a in page.attrs('link') if a.get('rel') == 'canonical']
            if 'noindex' in robots[0]:
                self.assertTrue(set(canonical).isdisjoint(self.urls), file)
            else:
                self.assertEqual(len(canonical), 1, file)
                eligible.add(canonical[0])
        self.assertEqual(eligible, set(self.urls), 'An indexable page is missing from the sitemap')
        for path in ['/projects/', '/me/', '/404.html']:
            page = self.public_pages[SITE + path]
            self.assertIn('noindex', next(a['content'] for a in page.attrs('meta') if a.get('name') == 'robots'))
        self.assertFalse([a for a in self.public_pages[SITE + '/404.html'].attrs('link') if a.get('rel') == 'canonical'])

    def test_deployment_package_includes_every_public_page(self):
        workflow = (ROOT / '.github/workflows/publish.yml').read_text()
        copied = re.findall(r'^\s+cp (?:-R )?(.+) _site/$', workflow, re.M)
        self.assertTrue(copied, 'No public packaging commands found')
        packaged = set()
        for command in copied:
            for source in shlex.split(command):
                path = ROOT / source
                self.assertTrue(path.exists(), source)
                packaged.update(path.rglob('*') if path.is_dir() else [path])
        for url in self.public_pages:
            self.assertIn(local_path(url), packaged, f'{url} would be missing after deployment')
        for url, page in self.public_pages.items():
            for tag, attrs in page.elements:
                ref = attrs.get('src') if tag in ('script', 'img') else attrs.get('href') if tag == 'link' else None
                if ref and urlsplit(urljoin(url, ref)).netloc == urlsplit(SITE).netloc:
                    self.assertIn(local_path(urljoin(url, ref)), packaged, ref)

    def test_search_preview_images_have_real_dimensions_and_descriptions(self):
        for url, page in self.public_pages.items():
            if url.endswith('/404.html'):
                continue
            meta = {a.get('name', a.get('property')): a.get('content', '') for a in page.attrs('meta')}
            with self.subTest(url=url):
                self.assertEqual(meta['og:image'], meta['twitter:image'])
                for key in ['og:image:alt', 'twitter:image:alt']:
                    self.assertTrue(meta[key].strip())
                image_url = meta['og:image']
                self.assertEqual(urlsplit(image_url).scheme, 'https')
                self.assertEqual(urlsplit(image_url).netloc, urlsplit(SITE).netloc)
                # All current social cards are PNGs. Inspect their header without adding a dependency.
                data = local_path(image_url).read_bytes()
                self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                width, height = struct.unpack('>II', data[16:24])
                self.assertEqual((int(meta['og:image:width']), int(meta['og:image:height'])), (width, height))

    def test_sitemap_dates_and_robots_allow_search_discovery(self):
        robots_text = (ROOT / 'robots.txt').read_text()
        robots = RobotFileParser()
        robots.parse(robots_text.splitlines())
        self.assertIn(SITE + '/sitemap.xml', robots.site_maps())
        for url in self.sitemap.findall('s:url', NS):
            modified = date.fromisoformat(url.findtext('s:lastmod', namespaces=NS))
            self.assertLessEqual(modified, datetime.now(timezone.utc).date())
        for url, page in self.public_pages.items():
            targets = [url] + [urljoin(url, a['src']) for a in page.attrs('script') if a.get('src')]
            targets += [urljoin(url, a['src']) for a in page.attrs('img') if a.get('src')]
            for target in targets:
                self.assertTrue(robots.can_fetch('Googlebot', target), target)

    def test_shared_asset_versions_match_files_on_every_page(self):
        signatures = []
        for url, page in self.public_pages.items():
            refs = [a['src'] for a in page.attrs('script') if a.get('src')]
            refs += [a['href'] for a in page.attrs('link') if a.get('rel') == 'stylesheet']
            signatures.append(refs)
            for ref in refs:
                version = parse_qs(urlsplit(ref).query).get('v')
                if version:
                    digest = hashlib.sha256(local_path(ref).read_bytes()).hexdigest()[:12]
                    self.assertEqual(version, [digest], f'{url}: stale asset URL {ref}')
        self.assertTrue(all(refs == signatures[0] for refs in signatures), 'Shared asset URLs must agree for cached navigation')

    def test_search_keeps_every_article_in_initial_html(self):
        page = self.pages[SITE + '/writing/']
        self.assertEqual(len([a for a in page.attrs('article') if a.get('class') == 'writing-card']), 32)
        for tag in ['section', 'li', 'article']:
            self.assertTrue(all('hidden' not in a for a in page.attrs(tag)), 'Search must not hide source articles')
        form = next(a for a in page.attrs('form') if a.get('id') == 'writing-search')
        self.assertIn('hidden', form, 'Only reveal search after its script initializes')
        self.assertNotIn('action', form, 'Do not create crawlable empty search-result URLs')

    def test_structured_data_matches_page_identity_and_images(self):
        for url, html in self.html.items():
            blocks = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
            self.assertTrue(blocks, url)
            nodes = []
            for block in blocks:
                schema = json.loads(block)
                self.assertEqual(schema['@context'], 'https://schema.org')
                nodes.extend(schema.get('@graph', [schema]))
            self.assertTrue(any(n.get('url') == url for n in nodes), url)
            for node in nodes:
                if node.get('@type') == 'ImageObject':
                    self.assertEqual(node['mainEntityOfPage'], url)
                    self.assertTrue(local_path(node['contentUrl']).is_file())
                    self.assertEqual(urljoin(SITE, urlsplit(node['@id']).path), url)
        home = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', self.html[SITE + '/'], re.S)[1])
        nodes = {n['@type']: n for n in home['@graph']}
        self.assertEqual(nodes['ProfilePage']['mainEntity']['@id'], nodes['Person']['@id'])
        self.assertEqual(nodes['WebSite']['url'], SITE + '/')

    def test_image_rights_are_consistent_and_link_to_visible_permission_details(self):
        def image_objects(value):
            if isinstance(value, dict):
                if value.get('@type') == 'ImageObject':
                    yield value
                for child in value.values():
                    yield from image_objects(child)
            elif isinstance(value, list):
                for child in value:
                    yield from image_objects(child)

        rights_by_image = {}
        occurrences = {}
        for url, html in self.html.items():
            # The gallery embeds images inside ItemList entries, while detail
            # pages put them at the graph root. Both occurrences need rights.
            blocks = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
            visible = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
            visible = unescape(re.sub(r'<[^>]+>', ' ', visible))
            for block in blocks:
                for node in image_objects(json.loads(block)):
                    with self.subTest(page=url, image=node['contentUrl']):
                        notice = node.get('copyrightNotice', '')
                        self.assertTrue(notice.strip(), 'Image copyright notice is required')
                        self.assertIn('Zheng Jie Lim', notice)
                        self.assertIn(notice, visible)
                        rights = [notice]
                        for field in ('license', 'acquireLicensePage'):
                            target = node.get(field, '')
                            parsed = urlsplit(target)
                            self.assertEqual(parsed.scheme, 'https')
                            self.assertEqual(parsed.netloc, urlsplit(SITE).netloc)
                            self.assertTrue(local_path(target).is_file(), target)
                            landing_html = local_path(target).read_text()
                            landing = Page(landing_html)
                            self.assertTrue(parsed.fragment, 'Link directly to the image-use details')
                            self.assertIn(parsed.fragment, [a.get('id') for _, a in landing.elements])
                            self.assertIn(notice, unescape(landing_html))
                            self.assertTrue(any(a.get('href', '').startswith('mailto:limzhengjiework@gmail.com')
                                                for a in landing.attrs('a')))
                            rights.append(target)
                        source = node['contentUrl']
                        self.assertEqual(rights_by_image.setdefault(source, rights), rights)
                        occurrences.setdefault(source, set()).add(url)
        gallery = SITE + '/designs/'
        originals = {urljoin(gallery, a['href']) for a in self.pages[gallery].attrs('a')
                     if a.get('class') == 'design-open'}
        self.assertTrue(originals)
        self.assertEqual(set(rights_by_image), originals)
        for source, pages in occurrences.items():
            self.assertIn(gallery, pages)
            self.assertEqual(len(pages), 2, source)

    def test_small_wins_schema_matches_visible_sources_and_dates(self):
        url = SITE + '/small-wins/'
        html = self.html[url]  # The page must be included in the indexable sitemap.
        schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
        collection = next(n for n in schema['@graph'] if n['@type'] == 'CollectionPage')
        items = collection['mainEntity']['itemListElement']
        listing = re.search(r'<ol class="wins-list">(.*?)</ol>', html, re.S)[1]
        rows = re.findall(r'<li>(.*?)</li>', listing, re.S)
        self.assertGreater(len(rows), 0)
        self.assertEqual(len(rows), collection['mainEntity']['numberOfItems'])
        self.assertEqual(len(rows), len(items))
        dates, sources = [], []
        for position, (row, item) in enumerate(zip(rows, items), 1):
            page = Page(row)
            source = page.attrs('a')[0]['href']
            label = unescape(re.search(r'<p><a[^>]*>(.*?)</a>', row, re.S)[1])
            self.assertEqual(item['position'], position)
            self.assertEqual(item['name'], label)
            self.assertEqual(item['item'], source)
            self.assertEqual(urlsplit(source).scheme, 'https')
            self.assertNotEqual(urlsplit(source).netloc, urlsplit(SITE).netloc)
            occurred = date.fromisoformat(page.attrs('time')[0]['datetime'])
            self.assertLessEqual(occurred, datetime.now(timezone.utc).date())
            dates.append(occurred)
            sources.append(source)
        self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual(len(sources), len(set(sources)))
        self.assertEqual(collection['about']['@id'], SITE + '/#person')
        self.assertNotIn('Coming soon', html)

    def test_image_sitemap_references_real_originals(self):
        for url in self.sitemap.findall('s:url', NS):
            for image in url.findall('image:image', NS):
                source = image.findtext('image:loc', namespaces=NS)
                self.assertEqual(urlsplit(source).netloc, urlsplit(SITE).netloc)
                self.assertTrue(local_path(source).is_file())
                self.assertIn(source, self.html[url.findtext('s:loc', namespaces=NS)])


if __name__ == '__main__':
    unittest.main()
