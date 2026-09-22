# Zheng Jie Lim

Static personal website at [limzhengjie.com](https://limzhengjie.com/), published with GitHub Pages.

- `/`: biography, portrait, Home / Writing / Designs / Projects navigation and profile links.
- `/writing/`: Artemis bylines first, then the latest 25 Learn To Invest articles.
- `/designs/`: four dated infographics in a minimal image grid. Click a preview for a full-image viewer with zoom and an original-image link. The portfolio is indexable and included in the sitemap.
- `/designs/<subject>/`: individual research graphics with a summary, data date, source credits and reporting context. Gallery titles link to these pages while image clicks keep opening the viewer.
- `/projects/`: four project hypotheses with links to reproducible synthetic demos; indexable and included in the sitemap.
- `/small-wins/`: small wins in life: four dated research mentions and appearances, with links to original sources. Linked below the homepage About text; indexable and included in the sitemap.
- `/me/`: me as a person, a short list of traits. Reached from the homepage rather than the navigation, so the tab row stays short; excluded from indexing for now.
- `404.html`: a themed error page with navigation back into the site; GitHub Pages serves it with HTTP 404 for unknown URLs.

All pages include their content and navigation in the initial HTML and work without JavaScript. With JavaScript, the homepage shows the approved six-second full-screen introduction once per browser. X or Escape dismisses it immediately; reduced-motion preferences skip it. The hanging lamp switches between saved light and dark themes. Cached navigation makes warmed page links immediate, with ordinary navigation as the fallback. Designs enhances its image links with a full-image viewer.

## Automatic writing updates

The **Publish website** GitHub Actions workflow runs daily at **12:23 UTC**, on pushes to `master`, and through **Run workflow**. It fetches public article metadata, validates the result, and publishes a static Pages artifact. It does not push commits or need repository write access, API keys, an AI service, or a paid CMS.

Artemis uses its public paginated archive endpoint. Only posts with the exact `zhengjielimm` byline, including coauthored pieces, qualify. The archive starts at March 19, 2026 to retain the approved seven initial selections. Weekly roundups (`This Week in …` and `Artemis Weekly …`) are excluded. Newly published qualifying articles are added automatically.

Learn To Invest uses WordPress's public posts API for the newest 25 published posts across the site. Its actual person or publication byline is retained; posts are not all attributed to Zheng Jie. Publisher canonical URLs remain the destination for every article.

`data/writing-overrides.json` preserves the current original summaries. To edit a summary, add or update the entry keyed by the article's canonical URL. New articles use the publisher's description or excerpt, limited to two sentences and 360 characters. No AI model generates investment claims.

`data/articles.json` and `writing/index.html` are committed reference snapshots. Scheduled updates are deployed artifacts, so they do **not** create commits. `templates/writing.html` is the editable page shell. The generator supplies both the visible cards and JSON-LD from the same records.

Before every publication, the workflow reuses the same Python, browser and counter checks as pull requests. Only after they pass does it fetch new writing metadata, then check source completeness, author filtering, unique HTTPS canonicals, date ordering, summaries and generated output again. If either source or a check fails, the workflow fails and the last deployed site remains live. The next daily run retries. Failures appear in GitHub Actions; notification delivery follows your GitHub notification settings.

The live page is used to detect removed Artemis bylines and preserve sitemap `lastmod` on unchanged runs. Dates are not bumped just because the workflow ran. Other sitemap entries remain controlled by the repository. Artemis's archive is an undocumented endpoint; a source format change may require updating the adapter. GitHub may disable schedules in public repositories after 60 days without repository activity; re-enable the workflow in Actions if that happens.

## Local validation

Python 3.12 is used in CI. No third-party Python packages are required.

```sh
python3 scripts/writing.py --sync
python3 -m unittest discover -s tests -v
python3 scripts/writing.py --check
```

For a local preview, run `python3 -m http.server 8000` and visit `http://localhost:8000/`. To match scheduled production behavior, run `python3 scripts/writing.py --sync --published`, which compares against the live site.

After editing shared JavaScript or CSS, refresh its existing versioned references and regenerate Writing:

```sh
python3 scripts/asset_versions.py
python3 -m unittest discover -s tests -q
python3 scripts/writing.py --check
```

For browser and counter validation, use Node 22, `npm ci`, and `npx playwright install chromium webkit`. The counter tests also require `redis-server` on PATH. Run `npm run test:counter` and `npm run test:browser`; CI installs the Linux browser dependencies automatically. These tests use isolated counter/analytics fixtures.

## Deployment and indexing

GitHub Pages must use **GitHub Actions** as its build source, with `limzhengjie.com` as the custom domain and HTTPS enforced. The build has read-only repository permissions; the separate deployment job has only `pages: write` and `id-token: write`. Only the public pages, assets and SEO files enter the deployment artifact.

The sitemap advertises nine canonical pages, the portrait and four original infographics. Robots allows crawling; Me as a person and the 404 page carry `noindex`. Projects is indexable. Article schema points to the original publishers. Indexable pages have self canonicals, unique titles and descriptions, social metadata and appropriate structured data. See [the SEO audit and Search Console checklist](docs/seo.md) for verification status. Deployment does not establish Google indexing.

GitHub Pages serves the canonical site at `limzhengjie.com`. Vercel serves previews and the spark API. `vercel.json` adds `X-Robots-Tag: noindex` only on `*.vercel.app`, so the alternate site copies stay out of search without blocking the canonical domain or redirecting the API.

The SEO suite checks sitemap coverage, crawl directives, metadata, social-image dimensions and alt descriptions, responsive image paths, structured data, and content hashes for versioned shared assets. The browser suite also checks the 404 layout in both themes and at enlarged text sizes.

To refresh the homepage/Writing social preview after changing the profile, run `node scripts/social-image.cjs` with Playwright Chromium installed. It renders the approved portrait and site typography to `assets/brand/zheng-jie-lim-social.png`, with `og-image.png` retained as a legacy copy. Set `CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_MODULE` when using a bundled runtime. New artwork should use a new metadata URL when an already-shared preview must be refreshed; social platforms control their own caches.

## Infographic portfolio

Designs contains static snapshots supplied by Zheng Jie, newest first. Visible dates describe each graphic's data period, not a live refresh or publication date. The original PNGs in `assets/designs/` are unchanged; 800px and 1600px WebP copies provide smaller responsive previews. Only the first preview loads eagerly. Each image is a direct link to its original PNG, enhanced by `assets/js/designs.js` with an accessible native dialog, fit/zoom controls, Escape-to-close and focus restoration. Without JavaScript, or when opening a link in another tab, visitors go directly to the original. Original branding and source notes remain in the artwork; CollectionPage / ItemList / ImageObject schema describes the displayed work.

Zheng Jie owns the four infographics. Their gallery and detail-page ImageObject entries include the same copyright notice, rights URL and permission-request URL. The compact image-use note at `/designs/#image-use` reserves rights and links to his public email for reuse requests. New images need accurate ownership information in both visible text and every schema occurrence.

Infographic statistics do not auto-update. To add a piece, copy its original and preview assets, add the gallery entry and a detail page, and update matching schema and sitemap entries. Keep historical reporting periods and estimates explicit. Each detail page has its own canonical URL, title, description, social image and image sitemap entry.

## SEO maintenance

The site is focused on data, research and investing. The homepage uses connected WebSite, ProfilePage and Person structured data; Writing keeps original publisher canonicals and bylines; each infographic detail page includes ImageObject and breadcrumb markup with visible research context. The normal test suite checks crawl paths from the homepage, unique page metadata, canonical URLs, local links and assets, structured data and image sitemap references.

See [the SEO notes](docs/seo.md) for the audit, publication rules and remaining Search Console setup.

## Visitor analytics

[Umami Cloud dashboard](https://cloud.umami.is/analytics/us/websites/18e0df56-605b-4290-a456-65f6b65f6d99) is private to the site owner. The US-region Hobby plan is free, with 100,000 events per month and six months of retention as shown during setup on September 14, 2026. Search Console remains the source for Google search queries and impressions. Umami starts collecting new activity after installation; it cannot reconstruct past visits.

`assets/js/analytics.js` runs only on `limzhengjie.com`, excluding localhost, GitHub's alternate hostname and Vercel previews. It sends one pageview for each actual page change, including cached navigation and back/forward. The external tracker loads after the site's load event; failures never delay links or break navigation. Requests are asynchronous, and queued events preserve the page and title where they occurred.

Events: `navigation_click`, `article_click`, `infographic_open`, `original_image_click`, `profile_click`, `contact_click` and other `outbound_click` actions. Article events include the public article title, publisher and destination. Email clicks include only the channel label, not the email address or message. Page URLs retain only UTM campaign parameters; other query parameters and fragments are dropped. External referrers are reduced to their origin. The integration does not set custom visitor IDs or enable session recordings.

For shared links, use campaign tags such as `https://limzhengjie.com/?utm_source=linkedin&utm_medium=social&utm_campaign=profile`. Use each platform's name consistently so referrals and campaigns are easy to compare.

To exclude your own browser, open `https://limzhengjie.com/?analytics=off`. The setting is saved locally as `umami.disabled`, and the preference parameter is removed before any tracking. Repeat on each browser or device you use. Open `https://limzhengjie.com/?analytics=on` to re-enable. Do Not Track and Global Privacy Control are also respected. These controls do not change the separate spark counter.

`npm run test:browser` includes adapter tests for attribution, delayed/blocked tracking, cache navigation, browser history, clicks and exclusions. Tests intercept analytics requests so QA does not pollute the dashboard. To verify a downloaded copy of the public Umami SDK against the same tests, set `ANALYTICS_REAL_SDK` to that JavaScript file and run `node tests/browser/analytics.cjs`. Production canaries should opt out or intercept tracking, except for one explicitly labelled ingestion check.
