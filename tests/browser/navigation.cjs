// Native links remain the fallback; cached navigation must not restart the document.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      if (file.endsWith('.html')) await sleep(180); // Reproduce the wait on a modest connection.
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(await fs.readFile(path.join(root, '404.html')));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = process.env.SITE_URL || `http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await playwright[engine].launch({ headless: true,
        executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined });
      try {
        for (const theme of ['light', 'dark']) {
          for (const width of [390, 1440]) {
            const context = await browser.newContext({ colorScheme: theme,
              viewport: { width, height: 900 }, hasTouch: width === 390, reducedMotion: 'reduce' });
            const page = await context.newPage();
            const errors = [], documents = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', req => { if (req.isNavigationRequest()) documents.push(req.url()); });
            await page.goto(base + '/', { waitUntil: 'load' });
            // Allow the small, idle background loads to finish before testing a warm click.
            await page.waitForTimeout(1500);
            await page.evaluate(() => {
              window.navigationTestMarker = 'same document';
              window.navigationPaintTimes = [];
              let start;
              document.addEventListener('click', () => { start = performance.now(); }, true);
              document.addEventListener('site:load', () => requestAnimationFrame(() =>
                window.navigationPaintTimes.push(Math.round(performance.now() - start))));
            });
            const timings = [];
            for (const [name, route] of [['Writing', '/writing/'], ['Designs', '/designs/'], ['Projects', '/projects/'], ['Home', '/']]) {
              const link = page.locator('.site-nav').getByRole('link', { name, exact: true });
              const start = Date.now();
              if (width === 390) await link.tap(); else { await link.focus(); await page.keyboard.press('Enter'); }
              await page.waitForURL(base + route);
              await page.locator('.site-nav [aria-current="page"]').filter({ hasText: name }).waitFor();
              timings.push({ name, milliseconds: Date.now() - start });
              assert.equal(await page.evaluate(() => window.navigationTestMarker), 'same document', `${name} reloads the entire document`);
              assert.equal(await page.locator('.theme-lamp').count(), 1);
              assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
              assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true, 'focus moves to new content');
              assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://limzhengjie.com' + route);
              assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://limzhengjie.com' + route);
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
              if (name !== 'Home') assert.match(await page.title(), new RegExp(name === 'Designs' ? 'Infographics' : name));
              if (name === 'Designs') {
                await page.locator('.design-open').first().click();
                await page.waitForFunction(() => !document.querySelector('#viewer-zoom').disabled);
                await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => !document.body.classList.contains('viewer-open'));
              }
              if (name === 'Projects') assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
              if (name === 'Home') {
                assert.equal(await page.locator('.profile-portrait').count(), 1);
                assert.equal(await page.locator('.site-boot').count(), 0);
                assert.doesNotMatch(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
              }
            }
            assert.equal(documents.length, 1, 'warm tab changes issue new document requests');
            await page.goBack();
            await page.waitForURL(base + '/projects/');
            await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
            await page.goForward();
            await page.waitForURL(base + '/');
            await page.locator('.profile-portrait').waitFor();
            await page.locator('.theme-lamp').click();
            const chosen = theme === 'light' ? 'dark' : 'light';
            await page.locator('.site-nav').getByRole('link', { name: 'Writing', exact: true }).click();
            assert.equal(await page.locator('html').getAttribute('data-theme'), chosen);
            await page.evaluate(() => scrollTo(0, 900));
            const previousScroll = await page.evaluate(() => scrollY);
            // Preserve a reading position when leaving via a link without scrolling the nav into view.
            await page.evaluate(() => document.querySelector('.site-nav a[href="/projects/"]').click());
            await page.waitForURL(base + '/projects/');
            await page.goBack();
            await page.waitForURL(base + '/writing/');
            await page.waitForFunction(y => Math.abs(scrollY - y) < 3, previousScroll);
            assert.deepEqual(errors, []);
            console.log(`${engine} ${theme} ${width}px: no-reload navigation, viewer, metadata, theme, history and scroll passed; click-to-frame ms:`, JSON.stringify(await page.evaluate(() => window.navigationPaintTimes.slice(0, 4))));
            await context.close();
          }
        }
        // A queued preload must not start during the next document's response wait.
        const departing = await browser.newContext({ reducedMotion: 'reduce' });
        const departingPage = await departing.newPage();
        const latePreloads = [];
        departingPage.on('console', message => {
          if (message.text() === 'late-preload') latePreloads.push(message.text());
        });
        await departingPage.addInitScript(() => {
          let leaving = false;
          window.addEventListener('beforeunload', () => { leaving = true; });
          const fetch = window.fetch;
          window.fetch = (...args) => {
            if (leaving && !String(args[0]).endsWith('/api/spark')) console.log('late-preload');
            return fetch(...args);
          };
        });
        await departingPage.goto(base + '/writing/', { waitUntil: 'load' });
        await departingPage.goto(base + '/projects/', { waitUntil: 'load' });
        assert.deepEqual(latePreloads, [], 'queued preloads started after native navigation began');
        await departing.close();
        console.log(`${engine}: departing documents do not start new preloads`);

        // Recovery from a real 404 must also replace noindex metadata on the destination.
        for (const javaScriptEnabled of [true, false]) {
          const context = await browser.newContext({ javaScriptEnabled, reducedMotion: 'reduce' });
          const page = await context.newPage();
          assert.equal((await page.goto(base + '/missing-page/', { waitUntil: 'load' })).status(), 404);
          await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor();
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
          assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
          if (javaScriptEnabled) await page.waitForTimeout(1200);
          await page.locator('.site-nav a[href="/writing/"]').click();
          await page.waitForURL(base + '/writing/');
          assert.ok(!(await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));
          assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://limzhengjie.com/writing/');
          await page.goBack();
          await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor();
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
          assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
          await context.close();
          console.log(`${engine}: 404 recovery, history and indexing directives passed (JavaScript ${javaScriptEnabled})`);
        }
        // Direct entry, cold/error fallback, native link behavior, and saved-data preferences.
        for (const mode of ['no-js', 'blocked-script', 'failed-prefetch', 'pending-prefetch', 'save-data', 'expired-cache']) {
          const context = await browser.newContext({ javaScriptEnabled: mode !== 'no-js', reducedMotion: 'reduce' });
          const page = await context.newPage();
          const fetches = [];
          page.on('request', req => { if (req.resourceType() === 'fetch' && !req.url().endsWith('/api/spark')) fetches.push(req.url()); });
          if (mode === 'blocked-script') await page.route('**/assets/js/navigation.js*', route => route.abort());
          if (mode === 'save-data') await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
          let release;
          if (mode === 'failed-prefetch' || mode === 'pending-prefetch') {
            const hold = new Promise(resolve => { release = resolve; });
            await page.route('**/writing/', async route => {
              if (route.request().resourceType() !== 'fetch') return route.continue();
              if (mode === 'pending-prefetch') await hold;
              await route.abort().catch(() => {});
            });
          }
          await page.goto(base + '/', { waitUntil: 'load' });
          await page.waitForTimeout(1200);
          if (mode === 'expired-cache') await page.evaluate(() => {
            const now = Date.now;
            Date.now = () => now() + 120_000;
          });
          if (mode !== 'no-js') await page.evaluate(() => { window.navigationTestMarker = 'must reload'; });
          // Calling the real anchor's click skips hover prefetch, reproducing an immediate tap.
          if (mode === 'no-js') await page.locator('.site-nav a[href="/writing/"]').click();
          else await page.evaluate(() => document.querySelector('.site-nav a[href="/writing/"]').click());
          await page.waitForURL(base + '/writing/');
          await page.getByRole('heading', { name: 'Writing', exact: true }).waitFor();
          if (mode !== 'no-js') assert.equal(await page.evaluate(() => window.navigationTestMarker), undefined, mode);
          if (mode === 'save-data') assert.equal(fetches.length, 0);
          release?.();
          await context.close();
          console.log(`${engine}: ${mode} keeps ordinary navigation working`);
        }
        const context = await browser.newContext({ reducedMotion: 'no-preference' });
        const page = await context.newPage();
        await page.goto(base + '/designs/ai-adoption/', { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        await page.locator('.site-nav a[href="/"]').click();
        await page.locator('.site-boot').waitFor();
        await page.getByRole('button', { name: 'Skip introduction' }).click();
        await page.locator('.site-nav a[href="/writing/"]').click();
        assert.equal(await page.locator('.site-boot').count(), 0, 'intro removed on navigation');
        await page.locator('.site-nav a[href="/"]').click();
        assert.equal(await page.locator('.site-boot').count(), 0, 'intro does not replay');
        await page.evaluate(() => {
          window.nativeLinkResults = [];
          for (const [href, attrs, event] of [
            ['/writing/', {}, { metaKey: true }],
            ['/writing/', {}, { ctrlKey: true }],
            ['/writing/', {}, { button: 1 }],
            ['/writing/', { target: '_blank' }, {}],
            ['/writing/', { download: '' }, {}],
            ['/writing/?filter=all', {}, {}],
            ['/#main-content', {}, {}],
            ['https://example.com/', {}, {}],
            ['/assets/designs/ai-adoption.png', {}, {}]
          ]) {
            const a = document.createElement('a');
            a.href = href;
            Object.entries(attrs).forEach(([key, value]) => a.setAttribute(key, value));
            document.body.append(a);
            // Observe after the document handler, then prevent the test from opening tabs/files.
            window.addEventListener('click', e => { window.nativeLinkResults.push(!e.defaultPrevented); e.preventDefault(); }, { once: true });
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...event }));
            a.remove();
          }
        });
        assert.ok((await page.evaluate(() => window.nativeLinkResults)).every(Boolean), 'modified/external/file links are intercepted');
        await context.close();
        console.log(`${engine}: direct detail-page entry, intro lifecycle, and native links passed`);
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
