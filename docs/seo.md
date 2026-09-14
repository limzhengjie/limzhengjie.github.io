# Search visibility: data, research and investing

The site should help people find Zheng Jie Lim and his research on crypto, fintech and investing. Preserve the minimal design; give individual work useful context on its own page rather than filling the homepage or gallery with keyword lists.

## September 13, 2026 audit

Technical eligibility is verified. Search Console confirms the homepage is indexed; the remaining URLs are being checked individually. Rankings are not established by this audit. Public HTTP requests returned the following results:

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

The approved full-screen introduction lasts about six seconds on a first visit, with immediate X/Escape dismissal and reduced-motion bypass. It intentionally delays seeing the homepage. Biography, navigation and portrait remain in the initial HTML and work without JavaScript. This is an intentional experience tradeoff, not a performance optimization or proof of good field Core Web Vitals. Search Console reports insufficient usage data for both mobile and desktop in the last 90 days. Mobile Lighthouse 12.8.2 lab audits scored Home 99 performance and Writing/Designs 100. All three scored 100 for accessibility, best practices and SEO, with zero total blocking time and effectively zero layout shift. These single-run lab results are not field Core Web Vitals or a guarantee of every visitor’s experience.

## Publishing rules

- Use the HTTPS limzhengjie.com URL as each page's canonical. Keep publisher article URLs as the canonical identities and destinations of external writing.
- Give new original work a permanent page with a descriptive heading and useful, original context. Do not duplicate entire external articles just to add pages.
- Put actual data dates, estimates and reporting limitations near research graphics. Do not present a historical graphic as current data.
- Include original image links, descriptive alt text and compressed responsive previews. Add the page and image to the sitemap.
- Update lastmod when content changes, not on every scheduled run. The writing sync preserves unrelated sitemap entries.
- Projects is a "Coming soon" placeholder, with `noindex, follow` and no sitemap entry. Add useful project content before removing `noindex` and adding its canonical URL to the sitemap.
- Run the test suite and browser checks before publishing. The SEO tests cover sitemap pages, Projects and the 404 page; the browser suite includes both themes and 200% text.
- Prefer specific, natural topic language to keyword repetition. Extra schema fields and word count alone do not establish expertise or guarantee search features.

## Search Console: verified on September 13, 2026

The signed-in Search Console domain property confirms verified ownership, valid robots.txt files and a property-added date of September 13, 2026. The built-in browser tool could not initialize, so these checks used Chrome's normal macOS accessibility interface. No browser security setting or verification token was changed.

The sitemap was resubmitted successfully. Its discovered-page count increased from one to all seven canonical pages. Discovery is not the same as indexing. The overview's Page Indexing and Performance reports are still processing.

URL Inspection confirms the homepage is on Google, with a successful smartphone crawl on September 13, 2026 at 01:16:07 (as displayed by Search Console). Crawling and indexing are allowed, and Google selected the inspected HTTPS homepage as canonical. A fresh indexing request was accepted for the homepage. Writing is discovered but not yet indexed, with no recorded crawl or Google-selected canonical.

Writing's indexing request was also accepted. The public GitHub profile now links to `https://limzhengjie.com/`; LinkedIn's personal website was updated from the old GitHub Pages URL and its Learn To Invest blog link was preserved. Both profile changes were verified after saving.

Use URL Inspection to check the other five pages' actual indexing verdicts; their individual requests are not yet confirmed. Keep Projects excluded while it is a placeholder. Requests can take days or weeks; repeating them does not accelerate crawling. Record new results when Google updates its reports rather than treating successful deployment or sitemap discovery as proof of indexing.

## Research notes and measurement

Each infographic detail page now includes linked primary references, explanations of displayed calculations and contextual links to related work. The original data dates and images remain intact. The notes distinguish current documentation from historical source data; no underlying dataset has been reconstructed or represented as newly verified.

The revenue-per-employee notes explicitly flag the OnlyFans row's arithmetic mismatch and the difference between Anthropic's company-reported year-end run-rate and the graphic's estimate. AI notes distinguish whole-population estimates from working-age adoption and developer surveys. CXMT notes explain the opening-price denominator. x402 notes distinguish payments, buyers, merchants and volume, and identify the unspecified weighting of the historical mix percentages.

Mobile lab baseline (Lighthouse 12.8.2, simulated mobile throttling, fresh isolated browser profiles, September 13, 2026):

| Page | Performance | Accessibility / Best practices / SEO | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- |
| Home | 99 | 100 / 100 / 100 | 1.6 s | 0 ms | <0.001 |
| Writing | 100 | 100 / 100 / 100 | 0.9 s | 0 ms | 0 |
| Designs | 100 | 100 / 100 / 100 | 1.1 s | 0 ms | 0 |

Lighthouse flagged the homepage portrait's image-delivery size and GitHub Pages' short asset cache lifetime. The original portrait resolution is intentional and the six-second intro is approved. The approved portrait and intro are preserved. Lab LCP does not measure the full time spent in the intro. Field interaction quality remains unmeasured until enough real-user data is available.

## Growth after the technical work

Publish original research notes when there is a worthwhile new finding, and link related writing and infographics together. Link to relevant pages from genuine public profiles and bylines when appropriate. Keep experience and affiliations accurate; distinguish personal research from the wider Learn To Invest feed.

Sources: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide), [Google image SEO](https://developers.google.com/search/docs/appearance/google-images), [site-name markup](https://developers.google.com/search/docs/appearance/site-names), [profile-page markup](https://developers.google.com/search/docs/appearance/structured-data/profile-page), [requesting a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [limits of the site: operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site).


## Small Wins — September 14, 2026

The Small Wins page now contains four concise milestones with visible dates and direct source links. Repeated coverage of the same Forbes story or Solana appearance is grouped rather than presented as separate achievements. The references were checked against Forbes and Solana's own pages:

- July 28, 2026: [Forbes cited Zheng Jie Lim's DeFi stablecoin research](https://www.forbes.com/sites/ninabambysheva/2026/07/28/a-500-million-defi-stablecoin-operation-built-on-saylors-preferred-stock-is-now-on-shaky-ground/).
- March 10, 2026: [Forbes quoted Zheng Jie Lim on Binance's revenue and business](https://www.forbes.com/sites/ninabambysheva/2026/03/10/binance-founder-cz-is-now-richer-than-bill-gates/). March 11 is the date of the supplied follow-on coverage; the original Forbes piece is March 10.
- February 11, 2026: [Solana Accelerate APAC's Hong Kong agenda lists Zheng Jie Lim's keynote](https://solana.com/accelerate/hong-kong/agenda), “What Wall Street Wants: Metrics That Matter.” The [clip shared by Solana](https://x.com/solana/status/2021485856398139573) is the additional link supplied by Zheng Jie; automated retrieval of X was unavailable.
- September 1, 2025: [Forbes quoted Zheng Jie Lim on Hyperliquid](https://www.forbes.com/sites/digital-assets/2025/09/01/why-hyperliquid-is-cryptos-new-killer-app/).

The page has `index, follow`, a self canonical, unique description/social metadata, connected CollectionPage/ItemList and BreadcrumbList markup, and a sitemap entry dated September 14. There are now eight indexable canonical pages in the source. Projects, Me as a person and the real 404 remain noindex. The collection's author is the site's owner; the external articles are references, not articles authored by him. Schema list entries match the visible links and preserve outbound source URLs. The writing sync still preserves unrelated sitemap entries. The GitHub Pages packaging step now includes both `me` and `small-wins`; previously, those folders were present in Vercel previews but would have been omitted from the production Pages artifact. A regression checks the real packaging recipe against all public pages and their assets.

These are publication settings, not evidence of Google indexing. The protected Vercel preview is for review; check production HTTP status and indexing directives after merge, then submit the production Small Wins URL in Search Console. Do not submit the preview URL. The earlier image-rights metadata warnings remain pending confirmation of the copyright holder; adding invented rights solely to silence those warnings is not part of this update.
