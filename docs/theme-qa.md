# Theme and homepage browser checks

Run the static site checks with `python3 -m unittest discover -s tests -v` and `python3 scripts/writing.py --check`.

Run the browser regressions with Node 22 or newer:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run test:browser
```

The browser script serves the repository on an ephemeral localhost port and closes the server and browsers when finished. It checks 96 page/layout/theme combinations in Chromium and WebKit, plus first-visit animation, portrait loading, skip and reduced motion, remembered themes, keyboard controls, and full-image viewing. Set `SITE_URL=https://limzhengjie.com` to check production instead. An existing browser installation can be supplied with `CHROMIUM_EXECUTABLE_PATH` / `WEBKIT_EXECUTABLE_PATH`; `PLAYWRIGHT_MODULE` can point to an existing Playwright module.

The Check website workflow runs these browser regressions on pull requests and master pushes. Node dependencies are for testing only; production remains static HTML, CSS and small scripts.

## September 13, 2026 findings

The deeper live audit covered all eight pages, both themes, and six viewports from 320×568 through 1920×1080 in Chromium and WebKit (192 combinations). It also checked landscape rotation, touch, repeated toggles, browser history, cross-tab preferences, blocked storage, no JavaScript, missing scripts, delayed CSS/script loading, reduced motion, and failed-image recovery.

It found one layout issue: infographic author/date lines overflowed at 200% text size on a 320px screen because they could not wrap. The detail-page date line now wraps. The committed browser test reproduced the failure before the fix and passed afterward in both engines.

A repeated-Tab check initially flagged native dialog focus entering browser chrome. Inspection confirmed the page had lost focus and no background page control was focused. The regression permits normal browser-toolbar navigation while still rejecting focus on controls behind the modal.

The lowest measured HTML text contrast in the initial audit was 6.27:1. Text was evaluated against the [W3C contrast minimum criteria](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). The lamp remains visible in both modes, and the original artwork and portrait retain their colors. These are automated browser and emulated viewport checks, not physical-device or full accessibility certification.

## First-visit introduction

The homepage shows a full-screen terminal-style introduction once per browser storage profile. Its three lines type over six seconds, then the screen fades away in 180 ms. The native modal keeps the underlying homepage out of the keyboard order during the introduction. X and Escape remove it immediately and focus the homepage; reduced-motion users skip it. If persistent storage is blocked, it uses session storage, then skips the intro if both are unavailable. The portrait is the supplied original JPEG, framed using CSS; the source image is unchanged.

The browser suite checks full viewport coverage, centred text, duration, focus containment, synchronous X dismissal, Escape, automatic completion, restored scrolling and no replay. The focus regression also covers Safari activation when focus was in browser chrome.

The lamp sways gently and gives a stronger, brief swing when clicked or tapped. Both movements are disabled with reduced motion. Browser regressions check the pull response, return to the idle sway, and reduced-motion behavior.

The supplied portrait is 960×1280 (141,310 bytes), preserved byte-for-byte. Its 112px frame and 2.8× CSS crop retain enough source pixels for a 3× display, which the browser suite checks. The source is not a 4K image; increasing the file dimensions would not recover additional captured detail.
