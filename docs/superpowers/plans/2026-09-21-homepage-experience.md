# Homepage Experience Implementation Plan

**Goal:** Add one compact “Experience +” disclosure below the biography and above social links. The current Artemis role stays visible; opening it reveals four previous roles. There are no nested disclosures.

**Architecture:** A native `details` element and clickable `summary` contain an ordered list rendered in the initial HTML. Scoped CSS uses the existing light/dark palette, a 44px heading target and a brief opening animation that respects reduced-motion preferences. No additional JavaScript or dependencies.

**Content:** Owner-supplied résumé, with Artemis, PayMongo and Fifth Person dates and all locations separately confirmed by the owner. Include only company, role, dates and location:

- Artemis Analytics — Research & Data Engineer — December 2024 – Present — New York.
- PayMongo — Product Intern — April 2024 – September 2024 — Philippines.
- Fifth Person — Investment Analyst Intern — April 2021 – October 2022 — Singapore.
- UOB — Software Engineer — February – April 2021 — Singapore.
- SAS Institute — Sales Engineer Intern — March – August 2020 — Singapore.

## Implementation and verification

- [x] Replace individual role disclosures with one section-level disclosure, closed by default with the current role always visible. Make the summary clickable; change the plus to a minus when open.
- [x] Show companies above full-width roles, with a muted location underneath. Align dates right on every screen and put spaces around each date separator. Preserve readable contrast and keyboard focus.
- [x] Keep the whole list in the initial HTML and usable without JavaScript. Use semantic month values for dates. Do not add the source documents or personal contact details to the repository.
- [x] Refresh shared stylesheet content-hash URLs across pages and the Writing template. Keep the homepage sitemap date accurate.
- [x] Run all 32 Python site/SEO tests, generated Writing consistency and diff checks.
- [ ] Verify the updated single disclosure on mobile/desktop in both themes, with keyboard interaction, navigation away/back and enlarged text. Run existing browser CI.

## Existing fixture correction

The spark transport test injects rejected-tap failures only into POST requests, so a visibility-triggered background GET cannot consume the failure. This correction passed the full browser suite on the previous draft commit.
