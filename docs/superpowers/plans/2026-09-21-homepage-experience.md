# Homepage Experience Implementation Plan

**Goal:** Add the compact Experience section approved in the conversation, between the homepage biography and social links.

**Architecture:** Render a short, chronological list directly in the homepage HTML. Use native `details` and `summary` for optional one-sentence descriptions, with scoped CSS using the existing theme variables. No new JavaScript, dependency or navigation item.

**Tech Stack:** Static HTML and CSS; existing Python SEO tests and browser QA.

## Constraints

- Use only confirmed companies, roles, dates and descriptions. Artemis / Data & Research / Present is confirmed. Earlier employment and exact dates are awaiting the user's reply; omit unconfirmed entries from public HTML.
- Company above role, dates aligned right on desktop and below the role on screens up to 480px wide.
- Existing light/dark colors, a thin rule, generous spacing, and a visible keyboard focus indicator.
- Content must remain available with JavaScript disabled and cached navigation enabled.

## Implementation and verification

- [x] Insert `<section class="experience" aria-labelledby="experience-heading">` after `.about`, with an `h2`, ordered list, and one native disclosure per confirmed role. Artemis description: “Data and research focused on crypto, FinTech and AI.”
- [x] Add only `.experience`-scoped CSS to `assets/css/site.css`; use grid columns `minmax(0, 1fr) auto auto` for identity, dates and disclosure marker. Move dates to row two at 480px; keep the marker at the far right.
- [x] Update all existing CSS content-hash URLs after editing the shared stylesheet; preserve generated Writing/template parity. Update the homepage sitemap modification date.
- [x] Run `python3 -m unittest discover -s tests -v` and `python3 scripts/writing.py --check`.
- [x] Check local preview in light/dark themes on desktop and mobile, plus keyboard expansion, touch/click, no-JavaScript rendering, 200% text and navigation away/back.
- [ ] Incorporate the user's previous-role details when supplied. Until then, retain this as a reviewable branch/preview and report the missing content clearly.

## Verification — 21 September 2026

32 Python site/SEO tests and generated Writing check pass. Browser checks passed on desktop and a 390px mobile viewport in light/dark themes, with Space/Enter disclosure controls and Home → Projects → Home navigation. A script-free rendering at 320px and 200% text successfully expanded the native details and had no horizontal overflow. Earlier-role content remains pending, so the change is a draft.
