# Zheng Jie Lim

Static personal website at [limzhengjie.com](https://limzhengjie.com/), published with GitHub Pages.

- `/`: biography, Home / Writing / Designs navigation and profile links.
- `/writing/`: Artemis bylines first, then the latest 25 Learn To Invest articles.
- `/designs/`: four dated infographics in a minimal image grid. Click a preview for a full-image viewer with zoom and an original-image link. The portfolio is indexable and included in the sitemap.

The existing terminal intro remains on the homepage. Reduced-motion preferences skip it; Writing and Designs render without JavaScript. Designs progressively enhances its image links with a viewer when JavaScript is available.

## Automatic writing updates

The **Publish website** GitHub Actions workflow runs daily at **12:23 UTC**, on pushes to `master`, and through **Run workflow**. It fetches public article metadata, validates the result, and publishes a static Pages artifact. It does not push commits or need repository write access, API keys, an AI service, or a paid CMS.

Artemis uses its public paginated archive endpoint. Only posts with the exact `zhengjielimm` byline, including coauthored pieces, qualify. The archive starts at March 19, 2026 to retain the approved seven initial selections. Weekly roundups (`This Week in …` and `Artemis Weekly …`) are excluded. Newly published qualifying articles are added automatically.

Learn To Invest uses WordPress's public posts API for the newest 25 published posts across the site. Its actual person or publication byline is retained; posts are not all attributed to Zheng Jie. Publisher canonical URLs remain the destination for every article.

`data/writing-overrides.json` preserves the current original summaries. To edit a summary, add or update the entry keyed by the article's canonical URL. New articles use the publisher's description or excerpt, limited to two sentences and 360 characters. No AI model generates investment claims.

`data/articles.json` and `writing/index.html` are committed reference snapshots. Scheduled updates are deployed artifacts, so they do **not** create commits. `templates/writing.html` is the editable page shell. The generator supplies both the visible cards and JSON-LD from the same records.

Before publishing, the workflow checks source completeness, author filtering, unique HTTPS canonicals, date ordering, summaries, generated output and the test suite. If either source or a check fails, the workflow fails and the last deployed site remains live. The next daily run retries. Failures appear in GitHub Actions; notification delivery follows your GitHub notification settings.

The live page is used to detect removed Artemis bylines and preserve sitemap `lastmod` on unchanged runs. Dates are not bumped just because the workflow ran. Other sitemap entries remain controlled by the repository. Artemis's archive is an undocumented endpoint; a source format change may require updating the adapter. GitHub may disable schedules in public repositories after 60 days without repository activity; re-enable the workflow in Actions if that happens.

## Local validation

Python 3.12 is used in CI. No third-party Python packages are required.

```sh
python3 scripts/writing.py --sync
python3 -m unittest discover -s tests -v
python3 scripts/writing.py --check
```

For a local preview, run `python3 -m http.server 8000` and visit `http://localhost:8000/`. To match scheduled production behavior, run `python3 scripts/writing.py --sync --published`, which compares against the live site.

## Deployment and indexing

GitHub Pages must use **GitHub Actions** as its build source, with `limzhengjie.com` as the custom domain and HTTPS enforced. The build has read-only repository permissions; the separate deployment job has only `pages: write` and `id-token: write`. Only the public pages, assets and SEO files enter the deployment artifact.

The sitemap and robots file advertise `https://limzhengjie.com/writing/`. Article schema points to the original publishers. The index has a self canonical, topic-specific title and description, social metadata, and breadcrumb schema. Submit the sitemap and request `/writing/` in Google Search Console using a verified owner or full-user account. Deployment does not guarantee Google indexing.

## Infographic portfolio

Designs contains static snapshots supplied by Zheng Jie, newest first. Visible dates describe each graphic's data period, not a live refresh or publication date. The original PNGs in `assets/designs/` are unchanged; 800px and 1600px WebP copies provide smaller responsive previews. Only the first preview loads eagerly. Each image is a direct link to its original PNG, enhanced by `assets/js/designs.js` with an accessible native dialog, fit/zoom controls, Escape-to-close and focus restoration. Without JavaScript, or when opening a link in another tab, visitors go directly to the original. Original branding and source notes remain in the artwork; CollectionPage / ItemList / ImageObject schema describes the displayed work.

Infographic statistics do not auto-update. To add a piece, copy its original and preview assets, add the article and matching schema entry in `designs/index.html`, and update the Designs sitemap modification date. Keep historical reporting periods and estimates explicit.
