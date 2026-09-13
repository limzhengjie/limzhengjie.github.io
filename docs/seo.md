# Search visibility: data, research and investing

The site should help people find Zheng Jie Lim and his research on crypto, fintech and investing. Preserve the minimal design; give individual work useful context on its own page rather than filling the homepage or gallery with keyword lists.

## September 13, 2026 audit

Technical eligibility is verified; Google's actual indexing and ranking are not yet verified. Public HTTP requests returned the following results:

| Page | HTTP | Canonical and indexing policy |
| --- | --- | --- |
| `/` | 200 | HTTPS self canonical, indexable |
| `/writing/` | 200 | HTTPS self canonical, indexable |
| `/designs/` | 200 | HTTPS self canonical, indexable |
| `/designs/ai-adoption/` | 200 | HTTPS self canonical, indexable |
| `/designs/cxmt-price-discovery/` | 200 | HTTPS self canonical, indexable |
| `/designs/agentic-payments/` | 200 | HTTPS self canonical, indexable |
| `/designs/revenue-per-employee/` | 200 | HTTPS self canonical, indexable |
| `/projects/` | 200 | `noindex, follow`, excluded from sitemap |
| Unknown path | 404 | Real error response, not a homepage redirect |

All seven indexable pages have unique titles and descriptions, one H1 and no HTTP `X-Robots-Tag` block. The audit fetched 27 page assets successfully and checked 37 outbound links: 36 returned 200; LinkedIn returned its automated-access response (999), which is not evidence of a broken profile. HTTP, www and github.io requests redirect permanently to the HTTPS apex while preserving the tested paths. `/writing` redirects to `/writing/`. Explicit `index.html` variants return 200 on GitHub Pages but declare the clean directory URL as canonical; internal links and the sitemap consistently use that URL.

The cleanup replaces the old cartoon/github.io social preview with the approved portrait, current name and domain. Home, Writing and Projects now declare image dimensions and descriptive social alt text. Legacy favicon URLs use the current ZJ mark, and an unused cartoon favicon is removed. The portrait joins the four original graphics in the image sitemap. A custom 404 page keeps the site navigation and theme, with `noindex` and no misleading homepage canonical.

The expanded checks run before publishing. They catch missing sitemap entries, accidental indexing of placeholders, blocked crawling, future sitemap dates, missing responsive images, social-image metadata errors and stale shared-asset versions. They validate markup and files; they do not claim that Google has indexed a page.

Browser QA also reproduced a WebKit navigation race: the 150ms preload timer could fire after native navigation started but before `pagehide`. The navigation helper now cancels queued and in-flight work at departure, releases its temporary unload guard when idle, and resumes warming after a back/forward-cache restore. A regression observes late fetches during a delayed document response. The previously unversioned navigation script now has a content hash across every page, so existing visitors fetch the fix.

The approved full-screen introduction lasts about six seconds on a first visit, with immediate X/Escape dismissal and reduced-motion bypass. It intentionally delays seeing the homepage. Biography, navigation and portrait remain in the initial HTML and work without JavaScript. This is an intentional experience tradeoff, not a performance optimization or proof of good field Core Web Vitals. No verified Search Console/Chrome User Experience Report performance data is available in this audit.

## Publishing rules

- Use the HTTPS limzhengjie.com URL as each page's canonical. Keep publisher article URLs as the canonical identities and destinations of external writing.
- Give new original work a permanent page with a descriptive heading and useful, original context. Do not duplicate entire external articles just to add pages.
- Put actual data dates, estimates and reporting limitations near research graphics. Do not present a historical graphic as current data.
- Include original image links, descriptive alt text and compressed responsive previews. Add the page and image to the sitemap.
- Update lastmod when content changes, not on every scheduled run. The writing sync preserves unrelated sitemap entries.
- Projects is a "Coming soon" placeholder, with `noindex, follow` and no sitemap entry. Add useful project content before removing `noindex` and adding its canonical URL to the sitemap.
- Run the test suite and browser checks before publishing. The SEO tests cover sitemap pages, Projects and the 404 page; the browser suite includes both themes and 200% text.
- Prefer specific, natural topic language to keyword repetition. Extra schema fields and word count alone do not establish expertise or guarantee search features.

## Search Console: account step still required

Automated access to the signed-in browser failed again during this audit because the browser tool's sandbox could not initialize. No Search Console connector is available. No property verification, sitemap submission or indexing request has been verified or completed. A public search-tool check did not surface results for the exact domain, but that tool is not Search Console and an empty `site:` query cannot establish that a page is absent from Google's index.

1. Open the verified property for limzhengjie.com in [Google Search Console](https://search.google.com/search-console). If none exists, verify a domain property using the DNS TXT record Google supplies, or verify the HTTPS URL-prefix property using Google's supplied HTML file or meta tag. Never invent a verification token.
2. Submit `https://limzhengjie.com/sitemap.xml` in Sitemaps.
3. Use URL Inspection on Home, Writing, Designs and the four new infographic pages. Check Google's selected canonical, crawl access and indexing status. Request indexing for the new pages where appropriate.
4. Record each page's indexed/not-indexed verdict, last crawl date, Google-selected canonical and any exclusion reason. The URL Inspection live test establishes current accessibility; it does not replace the indexed-version verdict.
5. Once data accumulates, use Performance to inspect branded queries, research-topic queries, clicks and impressions. Review Page Indexing and Core Web Vitals for actual issues. Deployment and valid markup do not guarantee indexing, rankings or rich results. Requests can take days or weeks; repeating them does not accelerate crawling.

## Growth after the technical work

Publish original research notes when there is a worthwhile new finding, and link related writing and infographics together. Link to relevant pages from genuine public profiles and bylines when appropriate. Keep experience and affiliations accurate; distinguish personal research from the wider Learn To Invest feed.

Sources: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google image SEO](https://developers.google.com/search/docs/appearance/google-images), [site-name markup](https://developers.google.com/search/docs/appearance/site-names), [profile-page markup](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [requesting a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [limits of the site: operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site).
