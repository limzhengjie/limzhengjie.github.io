const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

async function run() {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      assert.ok(file.startsWith(root + path.sep));
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = process.env.SITE_URL || `http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await playwright[engine].launch({ executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined });
      try {
        for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
          const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme,
            hasTouch: true, reducedMotion: 'reduce' });
          await context.route('**/api/spark', route => route.fulfill({ json: { total: 0 } }));
          await context.addInitScript(() => {
            localStorage.setItem('umami.disabled', '1');
            localStorage.setItem('zj-intro-seen', '1');
            window.documentMarker = Math.random();
          });
          const page = await context.newPage();
          page.setDefaultTimeout(15000);
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          try {
            await page.goto(base + '/writing/');
            const marker = await page.evaluate(() => window.documentMarker);
            const visible = () => page.locator('.writing-list > li:visible').count();
            const query = page.getByRole('searchbox', { name: 'Search writing' });
            const links = await page.locator('.writing-read a').evaluateAll(els => els.map(el => el.href));
            const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
            assert.equal(await visible(), 32);
            await query.fill('FÍGMA');
            assert.equal(await visible(), 1);
            assert.equal(await page.locator('#writing-results').textContent(), '1 article');
            await query.fill('Artemis September impossible');
            assert.equal(await visible(), 0);
            assert.match(await page.locator('#writing-results').textContent(), /No matching articles/);
            await query.press('Enter');
            assert.equal(page.url(), base + '/writing/');
            await query.fill('artemis 2026');
            assert.equal(await visible(), 7);
            await page.getByRole('button', { name: 'Clear search' }).click();
            assert.equal(await visible(), 32);
            assert.equal(await query.evaluate(el => el === document.activeElement), true);
            assert.deepEqual(await page.locator('.writing-read a').evaluateAll(els => els.map(el => el.href)), links);
            assert.deepEqual(await page.locator('script[type="application/ld+json"]').allTextContents(), schema);

            // Wait for actual prefetch completion before testing the cached route.
            await page.waitForFunction(() => performance.getEntriesByType('resource').some(e =>
              new URL(e.name).pathname === '/designs/' && e.initiatorType === 'fetch' && e.responseEnd > 0));
            await page.locator('.site-nav a[href="/designs/"]').click();
            await page.waitForURL(base + '/designs/');
            assert.equal(await page.evaluate(() => window.documentMarker), marker);
            const originals = await page.locator('.design-open').evaluateAll(els => els.map(el => el.href));
            await page.locator('.design-open').first().click();
            const position = page.locator('.viewer-pager [role="status"]');
            assert.equal(await position.textContent(), '1 of 4');
            await page.getByRole('button', { name: 'Previous image' }).click();
            assert.equal(await position.textContent(), '4 of 4');
            assert.equal(await page.locator('#viewer-original').getAttribute('href'), originals[3]);
            await page.keyboard.press('ArrowRight');
            assert.equal(await position.textContent(), '1 of 4');
            await page.keyboard.press('ArrowRight');
            assert.equal(await position.textContent(), '2 of 4');
            await page.waitForFunction(() => !document.querySelector('#viewer-zoom').disabled);
            await page.locator('#viewer-zoom').click();
            await page.keyboard.press('ArrowRight');
            assert.equal(await position.textContent(), '2 of 4', 'arrows must pan while zoomed');
            await page.locator('#viewer-zoom').click();

            // Touch-event cases cover direction, cancellation and multi-touch on both engines.
            async function gesture(kind) {
              await page.locator('.viewer-stage').evaluate((stage, kind) => {
                const point = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
                const send = (type, touches, changedTouches = touches) => {
                  const event = new Event(type, { bubbles: true });
                  Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
                  stage.dispatchEvent(event);
                };
                const start = point(1, 250, 250);
                send('touchstart', [start]);
                if (kind === 'pinch') send('touchstart', [start, point(2, 150, 250)]);
                if (kind === 'cancel') send('touchcancel', [], [start]);
                const end = kind === 'vertical' ? point(1, 230, 400) : point(1, 80, 250);
                send('touchend', [], [end]);
              }, kind);
            }
            for (const kind of ['vertical', 'pinch', 'cancel']) {
              await gesture(kind);
              assert.equal(await position.textContent(), '2 of 4', kind + ' changed the image');
            }
            await gesture('swipe');
            assert.equal(await position.textContent(), '3 of 4');
            if (engine === 'chromium' && width === 390) {
              const cdp = await context.newCDPSession(page);
              const box = await page.locator('.viewer-stage').boundingBox();
              const y = box.y + box.height / 2;
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y }] });
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y }] });
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y }] });
              await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
              assert.equal(await position.textContent(), '4 of 4', 'real mobile swipe did not advance');
              await cdp.detach();
            }
            // Rapid selection must show the final image after earlier downloads finish.
            await page.evaluate(() => { for (let i = 0; i < 9; i++) document.querySelector('.viewer-pager button:last-child').click(); });
            const finalIndex = Number((await position.textContent()).split(' ')[0]) - 1;
            await page.waitForFunction(() => {
              const img = document.querySelector('.viewer-image');
              return img.complete && img.naturalWidth > 0 && !document.querySelector('#viewer-zoom').disabled;
            });
            assert.equal(await page.locator('.viewer-image').getAttribute('src'), originals[finalIndex]);
            assert.equal(await page.locator('#viewer-original').getAttribute('href'), originals[finalIndex]);
            if (process.env.GALLERY_ARTIFACT_DIR) {
              await fs.mkdir(process.env.GALLERY_ARTIFACT_DIR, { recursive: true });
              await page.screenshot({ path: path.join(process.env.GALLERY_ARTIFACT_DIR, `${engine}-${theme}-${width}-viewer.png`) });
            }
            // Dialog close events are queued. Wait for the handler before
            // checking restored focus, rather than racing the browser task.
            await page.evaluate(() => {
              window.galleryClosed = new Promise(resolve => document.querySelector('.image-viewer')
                .addEventListener('close', () => resolve(true), { once: true }));
            });
            await page.keyboard.press('Escape');
            await page.evaluate(() => window.galleryClosed);
            assert.equal(await page.locator('.design-open').nth(finalIndex).evaluate(el => el === document.activeElement), true);
            await page.locator('.site-nav a[href="/writing/"]').click();
            await page.waitForURL(base + '/writing/');
            assert.equal(await visible(), 32);
            await page.getByRole('searchbox').fill('figma');
            assert.equal(await visible(), 1, 'search did not reinitialize after navigation');
            if (process.env.GALLERY_ARTIFACT_DIR) await page.screenshot({ path: path.join(process.env.GALLERY_ARTIFACT_DIR, `${engine}-${theme}-${width}-search.png`) });
            await page.setViewportSize({ width: 320, height: 900 });
            await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await page.goto(base + '/designs/ai-adoption/');
            await page.locator('.design-open').click();
            assert.equal(await page.locator('.viewer-pager').count(), 0, 'detail pages have only one image');
            await page.keyboard.press('Escape');
            assert.deepEqual(errors, []);
            console.log(`${engine} ${theme} ${width}px: search, unchanged article/schema links, gallery arrows/swipe/zoom/focus, cached navigation passed`);
          } finally { await context.close(); }
        }

        for (const disabled of ['javascript', 'search-script']) {
          const context = await browser.newContext({ javaScriptEnabled: disabled !== 'javascript', reducedMotion: 'reduce' });
          if (disabled === 'search-script') await context.route('**/assets/js/writing.js*', route => route.abort());
          const page = await context.newPage();
          await page.goto(base + '/writing/');
          assert.equal(await page.locator('.writing-card:visible').count(), 32);
          assert.equal(await page.locator('#writing-search').isVisible(), false);
          assert.equal(await page.locator('.writing-read a[href^="https://"]').count(), 32);
          await context.close();
        }

        const context = await browser.newContext({ reducedMotion: 'reduce' });
        await context.addInitScript(() => localStorage.setItem('umami.disabled', '1'));
        await context.route('**/assets/designs/ai-adoption.png', route => route.abort());
        const page = await context.newPage();
        await page.goto(base + '/designs/');
        await page.locator('.design-open').first().click();
        await page.getByText('Image could not load. Try the Original link above.').waitFor();
        await page.getByRole('button', { name: 'Next image' }).click();
        await page.waitForFunction(() => !document.querySelector('#viewer-zoom').disabled);
        assert.equal(await page.locator('.viewer-status').isVisible(), false);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => performance.getEntriesByType('resource').some(e =>
          new URL(e.name).pathname === '/writing/' && e.initiatorType === 'fetch' && e.responseEnd > 0));
        await page.locator('.site-nav a[href="/writing/"]').click();
        await page.waitForURL(base + '/writing/');
        await page.locator('.site-nav a[href="/designs/"]').click();
        await page.waitForURL(base + '/designs/');
        assert.equal(await page.locator('.viewer-pager').count(), 1, 'cached initial gallery duplicated controls');
        await page.locator('.design-open').nth(1).click();
        await page.getByRole('button', { name: 'Next image' }).click();
        assert.equal(await page.locator('.viewer-pager [role="status"]').textContent(), '3 of 4');
        await context.close();
        console.log(`${engine}: no-JavaScript/blocked search retains 32 articles; failed image recovers on Next`);
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
