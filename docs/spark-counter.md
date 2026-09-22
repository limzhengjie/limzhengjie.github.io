# Shared spark

A small, monochrome spark sits below the homepage’s profile links. Tapping it adds
one to a total shared by all visitors. A new browser-tab session also adds one,
including visits that start on an article or infographic page. Reloading or
changing pages in that session does not add more visits. It is labelled “sparks,”
because taps and visits are combined. The icon briefly turns and a small `+1`
floats up; reduced-motion visitors get the same functionality without animation.
The saved total is the only number shown. Loading or failure must never look like
a saved zero or a successful tap.
Successful taps use only the spark animation and updated count; no “Saving” label
appears while a request is in flight.

## Implementation

- Keep GitHub Pages as the public website. A Vercel function serves the counter;
  Upstash Redis holds its durable total. No database credentials go into HTML or
  client JavaScript. Provision a claimed, free database before enabling production.
- Use one atomic Redis script for incrementing, deduplicating retries, and limiting
  a network address to 120 taps per minute. Only a short-lived HMAC of the address
  is stored. This is a playful tap total, not a count of people or bot-proof voting.
- Batch rapid taps in groups of up to ten. Keep the current request ID on retries
  so an interrupted response cannot double-count a saved batch. Remember pending
  batches in session storage when available. The total itself lives in Redis.
- Use a separate preview namespace. Do not disable preview deployment protection.
- Record the visit once; refresh the total when the footer approaches the viewport.
  No continuous polling, libraries,
  cookies, or changes to the existing intro, page text, portrait, and navigation.
- Preserve pending work during cached navigation; reconnect the small UI when the
  visitor returns home. Failures provide an explicit retry instead of a fake total.

## Validation

Run API tests against an isolated local Redis instance: concurrent increments,
duplicate requests, payload validation, rate limits, CORS, storage failures, and
preview isolation. Run browser checks in Chromium and WebKit for mobile/desktop,
light/dark, keyboard, reduced motion, navigation, refresh, and retry behavior.
Finally test two independent browser contexts against the deployed preview store,
then verify the public production endpoint without a Vercel login.

## Deployment configuration

The function requires `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and
`SPARK_RATE_SALT` (a random private value). `SPARK_ALLOWED_ORIGINS` is a comma-separated
list of exact permitted origins. Production uses `spark:production`; previews use
`spark:preview`. Development and automated tests use `spark:development`.
The Vercel integration’s `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases are also
supported. Preview requests retain same-origin Vercel authentication; the public
site sends no cross-origin cookies to the counter.

The shared script points the public GitHub Pages site to the Vercel production alias.
Vercel previews and localhost use their own `/api/spark` endpoint. Never put the
write token in that attribute. The counter key has no expiry; request IDs expire
after 24 hours, and pending browser requests expire after one hour. Expiry is checked both when restoring a tab session and before sending a batch from an open tab. When every pending batch has expired, the client reads the authoritative total; it never creates replacement IDs for uncertain writes.

No paid plan, automatic upgrades, or ephemeral unclaimed database should be enabled
for this feature. If storage is unavailable, visitors can still use the whole site.

Provisioned September 13, 2026: Vercel project `limzhengjie-github-io`, Upstash
resource `personal-site-sparks`, Free plan, primary region `iad1`, automatic upgrades
off, eviction off. Database credentials are managed by the Vercel integration.
The public production API is `https://limzhengjie-github-io.vercel.app/api/spark`.

Local validation passed: 26 Python site/writing checks, eight tests using real
Redis (including a server restart), and the full Chromium/WebKit browser suite.
The latter includes 108 existing layout/theme cases plus navigation, intro,
image-viewer, and spark interaction checks. Counter checks cover both themes at
390 and 1440 px, separate visitors, repeat taps, refreshes, detail-page entry,
interrupted responses, explicit retries, navigation while saving, blocked session
storage, no JavaScript, keyboard access, and reduced-motion changes. When session
storage is blocked, a reload can count another visit; the counter is not analytics.
