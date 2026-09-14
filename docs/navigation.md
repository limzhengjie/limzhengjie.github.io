# Navigation performance

The original navigation used a new document request on every tab click. In a September 13, 2026 production sample, first visits to Writing and Designs waited roughly 50–90 ms for HTML, then parsed the page and loaded page-specific assets. Fetching HTML ahead of time avoided the document transfer in Chromium, but WebKit still requested it on navigation.

`assets/js/navigation.js` fetches the three other navigation pages at low priority after the current page loads. Hover, keyboard focus and touch can also warm an internal page. A completed, recent preload allows a content change without replacing the document, stylesheet or lamp. Navigation never waits for a fade-out or a network request.

Cached page changes show the new content immediately in its final position, with a 100 ms fade from 90% to full opacity using Web Animations. There is no invisible starting frame or sliding motion. The live main landmark stays interactive throughout; the lamp and background persist outside the animation. Content, URL, focus, metadata and analytics update synchronously, with no outgoing-animation delay. Another click immediately replaces the page and cancels the old effect. Browser Back/Forward uses the same entrance and restores the saved reading position.

Reduced motion skips the effect. Motion is canceled when the preference changes or the document is hidden. Unsupported or failed animation calls leave the new page fully visible. Clicking the current tab returns to the top without animating or creating another pageview. The first-visit introduction keeps its own animation; neither it nor network loading is extended by page transitions.

The enhancement keeps real, crawlable HTML links. An unfinished, failed, expired, redirected or incompatible preload falls back to ordinary browser navigation immediately. Query strings, hashes, external links, downloads, new tabs and modified clicks keep native behavior. Saving data or a reported 2G connection disables preloading. Background requests are aborted when leaving the document.

Only HTML is prefetched; the cache stays in memory, expires after 60 seconds and contains at most 12 pages. No service worker, persistent page cache, framework or external runtime is added. A change in stylesheet or script URLs also forces normal navigation. Changed shared assets use a content-hash query parameter in every page and the Writing template to avoid combining freshly loaded HTML with older cached scripts; update that parameter when changing those assets. Future page-specific scripts should use `site:load` for initialization and `site:before-render` for cleanup, or use different asset URLs to opt out.

Each content change updates the title, description, robots directives, canonical, social metadata and JSON-LD. The theme preference and lamp persist. Focus moves to the main landmark, and history entries record the reading position for back/forward. The intro only runs on a first homepage visit; image viewer controls initialize for the newly inserted page.

## Validation

`npm run test:browser` includes the existing 132 layout/theme checks plus `tests/browser/navigation.cjs`:

- Chromium and WebKit; 390px touch and 1440px keyboard navigation; light and dark modes.
- Warm tab changes keep the same document, with correct active navigation, page metadata, photo and Projects noindex handling.
- Theme changes, infographic viewing/zoom, first-visit intro cleanup, back/forward and restored reading positions.
- No JavaScript, blocked navigation script, failed/pending preloads, data saving and expired cache all retain ordinary navigation.
- Modified clicks, external links, downloads, image files, hashes and query strings are not intercepted.

`tests/browser/transitions.cjs` checks motion-enabled navigation in both engines, themes and viewports: all outward/return trips, a real pointer click during a paused entrance, rapid successive clicks, uninterrupted lamp motion, Back/Forward reading positions, runtime reduced-motion changes, and missing/failed animation APIs. The analytics suite also exercises the animated route sequence and checks one correctly attributed pageview per destination. These checks mock the spark and analytics endpoints.

The regression failed before the fix with `Writing reloads the entire document`. The test server adds 180 ms to HTML responses so eliminating a document request has a meaningful benefit even on a local machine. Timing output measures click-event to the next animation frame and is diagnostic, not a universal speed guarantee.
