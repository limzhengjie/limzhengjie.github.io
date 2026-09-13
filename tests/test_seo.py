"""Check crawlable page and asset contracts across the published site."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unittest
from urllib.parse import urljoin, urlsplit
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

    def test_all_indexed_pages_are_reachable_from_home(self):
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

    def test_internal_links_images_and_scripts_exist(self):
        for url, page in self.pages.items():
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

    def test_image_sitemap_references_real_originals(self):
        for url in self.sitemap.findall('s:url', NS):
            for image in url.findall('image:image', NS):
                source = image.findtext('image:loc', namespaces=NS)
                self.assertEqual(urlsplit(source).netloc, urlsplit(SITE).netloc)
                self.assertTrue(local_path(source).is_file())
                self.assertIn(source, self.html[url.findtext('s:loc', namespaces=NS)])


if __name__ == '__main__':
    unittest.main()
