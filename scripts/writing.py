#!/usr/bin/env python3
"""Fetch public article metadata and render a static, crawlable writing index."""

import argparse
from datetime import date, datetime, timezone
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://limzhengjie.com'
SOURCES = {
    'artemis': ('Artemis', 'research.artemis.ai'),
    'lti': ('Learn To Invest', 'learntoinvests.com'),
}
ARTEMIS_START = '2026-03-19'
HANDLE = 'zhengjielimm'
MAX_PAGES = 100


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        elif tag in ('p', 'br', 'div', 'li'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        elif tag in ('p', 'div', 'li'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain(value):
    if not isinstance(value, str):
        raise ValueError('Expected text from the publisher')
    parser = PlainText()
    parser.feed(value)
    return ' '.join(''.join(parser.parts).split())


def summary(value):
    text = re.sub(r'\s*\[(?:…|\.{3})\].*$', '', plain(value))
    # Use the publisher's short description; keep at most two complete sentences.
    sentences = re.findall(r'.+?[.!?](?=\s+[A-Z“‘"\d]|$)', text)
    if sentences:
        text = ' '.join(s.strip() for s in sentences[:2])
    if len(text) > 360:
        text = text[:357].rsplit(' ', 1)[0].rstrip('.,;:') + '…'
    if len(text) < 15:
        raise ValueError('Publisher summary is missing or too short; preserve the previous page')
    if text[-1] not in '.!?…':
        text += '.'
    return text


def canonical(url, source):
    parts = urlsplit(url)
    if (parts.scheme != 'https' or parts.netloc != SOURCES[source][1]
            or parts.query or parts.fragment or parts.path in ('', '/')
            or (source == 'artemis' and not parts.path.startswith('/p/'))):
        raise ValueError(f'Invalid {source} canonical: {url!r}')
    return url


def fetch_text(url):
    if urlsplit(url).netloc not in {s[1] for s in SOURCES.values()} | {'limzhengjie.com'}:
        raise ValueError('Unexpected source host')
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'ZhengJieWritingIndex/1.0 (+https://limzhengjie.com/)', 'Accept': 'application/json'})
            with urlopen(request, timeout=30) as response:
                if urlsplit(response.url).netloc != urlsplit(url).netloc:
                    raise ValueError('Unexpected redirect from source API')
                body = response.read(4_000_001)
                if len(body) > 4_000_000:
                    raise ValueError('Source response exceeds size limit')
                return body.decode('utf-8')
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def fetch_json(url):
    return json.loads(fetch_text(url))


def person(byline):
    handle = byline.get('handle')
    name = plain(byline['name'])
    if handle == HANDLE:
        return {'@type': 'Person', '@id': SITE + '/#person', 'name': 'Zheng Jie Lim', 'url': SITE + '/'}
    result = {'@type': 'Person', 'name': name}
    if handle and re.fullmatch(r'[A-Za-z0-9_-]+', handle):
        result['url'] = 'https://substack.com/@' + handle
    return result


def artemis_posts(fetch=fetch_json):
    posts, seen = [], set()
    previous_date = None
    for page in range(MAX_PAGES):
        batch = fetch('https://research.artemis.ai/api/v1/archive?' + urlencode({'sort': 'new', 'offset': page * 20, 'limit': 20}))
        if not isinstance(batch, list) or (page == 0 and not batch):
            raise ValueError('Artemis archive is unavailable or malformed')
        reached_start = False
        for raw in batch:
            published = date.fromisoformat(raw['post_date'][:10]).isoformat()
            if previous_date and published > previous_date:
                raise ValueError('Artemis archive is not in date order')
            previous_date = published
            if published < ARTEMIS_START:
                reached_start = True
                continue
            bylines = raw.get('publishedBylines')
            if not isinstance(bylines, list) or not bylines:
                raise ValueError('Artemis archive omitted author bylines')
            if not any(b.get('handle') == HANDLE for b in bylines):
                continue
            title = plain(raw['title'])
            if re.match(r'^(?:This Week in|Artemis Weekly)\b', title, re.I):
                continue
            url = canonical(raw['canonical_url'], 'artemis')
            if url in seen:
                raise ValueError('Artemis pagination repeated an article')
            seen.add(url)
            posts.append({'source': 'artemis', 'url': url, 'title': title, 'date': published,
                          'authors': [person(b) for b in bylines],
                          'source_summary': raw.get('description') or raw.get('subtitle') or ''})
        if reached_start or len(batch) < 20:
            return posts
    raise ValueError('Artemis pagination limit reached before completing the archive')


def lti_posts(fetch=fetch_json):
    query = urlencode({'per_page': 25, 'orderby': 'date', 'order': 'desc', 'status': 'publish', '_fields': 'id,date,link,title,excerpt,author'})
    rows = fetch('https://learntoinvests.com/wp-json/wp/v2/posts?' + query)
    if not isinstance(rows, list) or len(rows) != 25:
        raise ValueError('Learn To Invest must return its newest 25 published posts')
    ids = sorted({int(row['author']) for row in rows})
    users = fetch('https://learntoinvests.com/wp-json/wp/v2/users?' + urlencode({'include': ','.join(map(str, ids)), 'per_page': 100, '_fields': 'id,name,link'}))
    if not isinstance(users, list):
        raise ValueError('Learn To Invest author metadata is unavailable')
    authors = {u['id']: {'@type': 'Organization' if u['name'] == 'Learn To Invest' else 'Person', 'name': plain(u['name']), 'url': canonical(u['link'], 'lti')} for u in users}
    return [{'source': 'lti', 'url': canonical(r['link'], 'lti'), 'title': plain(r['title']['rendered']),
             'date': date.fromisoformat(r['date'][:10]).isoformat(), 'authors': [authors[r['author']]],
             'source_summary': r['excerpt']['rendered']} for r in rows]


def collect(overrides, previous, fetch=fetch_json):
    # Both sources finish and validate before any output is touched.
    articles = artemis_posts(fetch) + lti_posts(fetch)
    urls = {a['url'] for a in articles}
    previous_artemis = {a['url'] for a in previous if a['source'] == 'artemis'}
    seeds = {url for url in overrides if urlsplit(url).netloc == SOURCES['artemis'][1]}
    if not (previous_artemis | seeds).issubset(urls):
        raise ValueError('Artemis source lost previously published bylines; preserve the last good index')
    for article in articles:
        custom = overrides.get(article['url'], {}).get('summary')
        article['summary'] = custom if custom else summary(article['source_summary'])
        article['summary_origin'] = 'editorial' if custom else 'publisher'
        del article['source_summary']
    articles.sort(key=lambda a: (0 if a['source'] == 'artemis' else 1, -date.fromisoformat(a['date']).toordinal(), a['url']))
    validate(articles)
    return articles


def validate(articles):
    if not articles or not isinstance(articles, list):
        raise ValueError('Missing article list')
    if len({a['url'] for a in articles}) != len(articles):
        raise ValueError('Duplicate article canonical')
    if sum(a['source'] == 'lti' for a in articles) != 25 or sum(a['source'] == 'artemis' for a in articles) < 7:
        raise ValueError('Expected at least seven Artemis articles and exactly 25 Learn To Invest articles')
    expected = sorted(articles, key=lambda a: (0 if a['source'] == 'artemis' else 1, -date.fromisoformat(a['date']).toordinal(), a['url']))
    if articles != expected:
        raise ValueError('Articles must be Artemis first and newest first within each source')
    today = datetime.now(timezone.utc).date()
    for article in articles:
        canonical(article['url'], article['source'])
        if date.fromisoformat(article['date']) > today:
            raise ValueError('Article date is in the future')
        if not article['title'].strip() or not article['summary'].strip() or not article['authors']:
            raise ValueError('Incomplete article metadata')
        if len(article['summary']) > 700:
            raise ValueError('Summary is longer than an index card')
        for author in article['authors']:
            if not author.get('name') or author.get('@type') not in ('Person', 'Organization'):
                raise ValueError('Invalid author metadata')
        if article['source'] == 'artemis' and not any(a.get('@id') == SITE + '/#person' for a in article['authors']):
            raise ValueError('Artemis article does not include Zheng Jie in its byline')


def render(articles, template):
    validate(articles)
    items = []
    for i, article in enumerate(articles, 1):
        publisher, host = SOURCES[article['source']]
        items.append({'@type': 'ListItem', 'position': i, 'item': {
            '@type': 'BlogPosting', '@id': article['url'], 'url': article['url'],
            'mainEntityOfPage': article['url'], 'headline': article['title'],
            'description': article['summary'], 'datePublished': article['date'],
            'author': article['authors'], 'publisher': {'@type': 'Organization', 'name': publisher, 'url': f'https://{host}/'},
        }})
    graph = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', '@id': SITE + '/writing/#webpage', 'url': SITE + '/writing/',
         'name': 'Writing on Stocks, Crypto & Finance — Zheng Jie Lim', 'inLanguage': 'en',
         'description': 'Artemis research by Zheng Jie Lim and the latest from Learn To Invest. Read articles on stocks, crypto, fintech, and personal finance.',
         'isPartOf': {'@type': 'WebSite', '@id': SITE + '/#website', 'url': SITE + '/', 'name': 'Zheng Jie Lim'},
         'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(items), 'itemListElement': items},
         'breadcrumb': {'@id': SITE + '/writing/#breadcrumb'}},
        {'@type': 'BreadcrumbList', '@id': SITE + '/writing/#breadcrumb', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Writing', 'item': SITE + '/writing/'},
        ]},
    ]}
    sections = []
    for source, heading, note in [('artemis', 'Artemis research', 'Research and essays I’ve written or coauthored at Artemis.'), ('lti', 'Learn To Invest', 'The latest essays and guides from Learn To Invest.')]:
        cards = []
        for a in [a for a in articles if a['source'] == source]:
            d = date.fromisoformat(a['date'])
            when = f'{d.day} {d.strftime("%b %Y")}'
            cards.append(f'''          <li>
            <article class="writing-card">
              <h3>{escape(a['title'])}</h3>
              <p class="writing-meta"><time datetime="{a['date']}">{when}</time></p>
              <p class="writing-summary">{escape(a['summary'])}</p>
              <p class="writing-read"><a href="{escape(a['url'], quote=True)}" rel="noopener noreferrer" target="_blank">Read at {SOURCES[source][0]}</a></p>
            </article>
          </li>''')
        sections.append(f'''      <section class="writing-section" aria-labelledby="{source}-heading">
        <h2 id="{source}-heading">{heading}</h2>
        <p class="section-note">{note}</p>
        <ol class="writing-list">
{chr(10).join(cards)}
        </ol>
      </section>''')
    schema = json.dumps(graph, ensure_ascii=False, indent=2).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    if template.count('@@SCHEMA@@') != 1 or template.count('@@ARTICLES@@') != 1:
        raise ValueError('Writing template must contain one schema and article placeholder')
    return template.replace('@@SCHEMA@@', schema).replace('@@ARTICLES@@', '\n'.join(sections))


def update_sitemap(text, day):
    namespace = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    root = ET.fromstring(text)
    match = [u for u in root.findall('s:url', namespace) if u.findtext('s:loc', namespaces=namespace) == SITE + '/writing/']
    if len(match) != 1:
        raise ValueError('Sitemap must contain the canonical Writing URL exactly once')
    return re.sub(r'(<loc>https://limzhengjie\.com/writing/</loc>\s*<lastmod>)[^<]+', lambda m: m[1] + day, text)


def writing_lastmod(text):
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    root = ET.fromstring(text)
    for url in root.findall('s:url', ns):
        if url.findtext('s:loc', namespaces=ns) == SITE + '/writing/':
            return date.fromisoformat(url.findtext('s:lastmod', namespaces=ns)).isoformat()
    raise ValueError('Published sitemap has no Writing lastmod')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sync', action='store_true', help='Fetch public source metadata before rendering')
    parser.add_argument('--check', action='store_true', help='Check committed output without writing it')
    parser.add_argument('--published', action='store_true', help='Compare against the live site to preserve lastmod across scheduled builds')
    args = parser.parse_args()
    data_path = ROOT / 'data/articles.json'
    previous = json.loads(data_path.read_text()) if data_path.exists() else []
    baseline = (ROOT / 'writing/index.html').read_text()
    sitemap_path = ROOT / 'sitemap.xml'
    sitemap = sitemap_path.read_text()
    if args.published:
        if not args.sync:
            parser.error('--published requires --sync')
        baseline = fetch_text(SITE + '/writing/')
        live_sitemap = fetch_text(SITE + '/sitemap.xml')
        # Preserve additions and metadata from this checkout on other routes.
        sitemap = update_sitemap(sitemap, writing_lastmod(live_sitemap))
        # Compare with the last deployment, including posts newer than the git snapshot.
        published_schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', baseline, re.S)[1])
        collection = next((n for n in published_schema.get('@graph', [published_schema]) if n.get('@type') == 'CollectionPage'), None)
        if not collection:
            raise ValueError('Published Writing schema is unavailable')
        for element in collection['mainEntity']['itemListElement']:
            url = element['item']['url']
            if urlsplit(url).netloc == SOURCES['artemis'][1]:
                previous.append({'source': 'artemis', 'url': canonical(url, 'artemis')})
    overrides = json.loads((ROOT / 'data/writing-overrides.json').read_text())
    articles = collect(overrides, previous) if args.sync else previous
    # Stable ordering includes a tie-break for posts published on the same day.
    articles.sort(key=lambda a: (0 if a['source'] == 'artemis' else 1, -date.fromisoformat(a['date']).toordinal(), a['url']))
    output = render(articles, (ROOT / 'templates/writing.html').read_text())
    output_path = ROOT / 'writing/index.html'
    changed = output != baseline
    sitemap = update_sitemap(sitemap, datetime.now(timezone.utc).date().isoformat()) if changed else sitemap
    if args.check:
        if changed:
            raise SystemExit('Generated writing/index.html is stale; run python3 scripts/writing.py')
    else:
        # Preparation and validation above complete before any files are replaced.
        for target, content in [(data_path, json.dumps(articles, ensure_ascii=False, indent=2) + '\n'), (output_path, output), (sitemap_path, sitemap)]:
            if not target.exists() or target.read_text() != content:
                temporary = target.with_suffix(target.suffix + '.tmp')
                temporary.write_text(content)
                temporary.replace(target)
    print(f'Validated {len(articles)} articles ({sum(a["source"] == "artemis" for a in articles)} Artemis + 25 Learn To Invest); page {"changed" if changed else "unchanged"}.')


if __name__ == '__main__':
    main()
