# Search visibility: data, research and investing

The site should help people find Zheng Jie Lim and his research on crypto, fintech and investing. Preserve the minimal design; give individual work useful context on its own page rather than filling the homepage or gallery with keyword lists.

## September 13, 2026 audit

Public checks confirmed that Home, Writing and Designs return HTTP 200, HTTP and www redirect to the HTTPS apex domain, the github.io hostname redirects to the custom domain, and an unknown route returns a real 404. Canonical URLs, navigation and the sitemap were already in place. The writing publishing workflow was healthy.

A mobile-sized Chromium run with normal motion settings measured the biography becoming visible about 10.6 seconds after navigation because of the terminal intro. This is a one-run browser observation, not a field Core Web Vitals result. The blocking intro and external Typed.js dependency have been removed so the same HTML can render immediately.

At the owner’s request, a later update adds a full-screen first-visit introduction lasting about six seconds, with immediate X/Escape dismissal and reduced-motion bypass. It intentionally covers the homepage until completion or dismissal. The biography, navigation and portrait remain in the initial HTML; without JavaScript the homepage is shown directly. The supplied portrait is also in Person metadata.

The next layer of work adds a page per research infographic, with a topic-specific title and description, visible context, original source credits, dates, image and breadcrumb metadata, image sitemap entries, and links from the gallery captions. Clicking the images still opens the full-image viewer. Homepage metadata and biography now focus on the requested subjects, with consistent WebSite / ProfilePage / Person identity. Obsolete meta keywords have been removed.

## Publishing rules

- Use the HTTPS limzhengjie.com URL as each page's canonical. Keep publisher article URLs as the canonical identities and destinations of external writing.
- Give new original work a permanent page with a descriptive heading and useful, original context. Do not duplicate entire external articles just to add pages.
- Put actual data dates, estimates and reporting limitations near research graphics. Do not present a historical graphic as current data.
- Include original image links, descriptive alt text and compressed responsive previews. Add the page and image to the sitemap.
- Update lastmod when content changes, not on every scheduled run. The writing sync preserves unrelated sitemap entries.
- Projects is a "Coming soon" placeholder, with `noindex, follow` and no sitemap entry. Add useful project content before removing `noindex` and adding its canonical URL to the sitemap.
- Run the test suite and browser checks before publishing. The SEO tests cover every page listed in the sitemap.
- Prefer specific, natural topic language to keyword repetition. Extra schema fields and word count alone do not establish expertise or guarantee search features.

## Search Console: account step still required

Automated access to the signed-in browser failed in this session, so no Search Console property, sitemap submission or indexing request has been verified or completed.

1. Open the verified property for limzhengjie.com in Google Search Console. If none exists, verify a domain property using the DNS TXT record Google supplies, or verify the HTTPS URL-prefix property using Google's supplied HTML file or meta tag. Never invent a verification token.
2. Submit `https://limzhengjie.com/sitemap.xml` in Sitemaps.
3. Use URL Inspection on Home, Writing, Designs and the four new infographic pages. Check Google's selected canonical, crawl access and indexing status. Request indexing for the new pages where appropriate.
4. Once data accumulates, use Performance to inspect branded queries, research-topic queries, clicks and impressions. Review Page Indexing and Core Web Vitals for actual issues. Deployment and valid markup do not guarantee indexing, rankings or rich results.

## Growth after the technical work

Publish original research notes when there is a worthwhile new finding, and link related writing and infographics together. Link to relevant pages from genuine public profiles and bylines when appropriate. Keep experience and affiliations accurate; distinguish personal research from the wider Learn To Invest feed.

Sources: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google image SEO](https://developers.google.com/search/docs/appearance/google-images), [site-name markup](https://developers.google.com/search/docs/appearance/site-names), [profile-page markup](https://developers.google.com/search/docs/appearance/structured-data/profile-page).
