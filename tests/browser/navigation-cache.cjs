// A long read must not turn a known page into a blocking navigation request.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const base = 'http://site.test';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

async function run() {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await playwright[engine].launch({
      executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined,
    });
    try {
      for (const mode of ['refresh', 'failed-refresh', 'new-build', 'removed']) {
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        let stale = false, requests = 0, released = false, refreshFinished = false;
        let release;
        const gate = new Promise(resolve => { release = () => { released = true; resolve(); }; });
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.pathname === '/api/spark') return route.fulfill({ json: { total: 0 } });
          if (url.origin !== base) return route.abort();
          const file = path.resolve(root, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
          assert.ok(file.startsWith(root + path.sep));
          let body = await fs.readFile(file), status = 200;
          if (stale && url.pathname === '/projects/') {
            if (req.resourceType() === 'fetch') {
              requests++;
              await gate;
              if (mode === 'failed-refresh') {
                await route.abort();
                refreshFinished = true;
                return;
              }
            }
            if (mode === 'removed') {
              status = 404;
              body = await fs.readFile(path.join(root, '404.html'));
            } else {
              body = body.toString().replace('<p class="page-placeholder">', '<p class="page-placeholder" data-cache-generation="new">');
              if (mode === 'new-build') body = body.replace(/navigation\.js\?v=[a-f0-9]+/, 'navigation.js?v=next-build');
            }
          }
          await route.fulfill({ status, contentType: types[path.extname(file)] || 'application/octet-stream', body });
          if (stale && url.pathname === '/projects/' && req.resourceType() === 'fetch') refreshFinished = true;
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [], documents = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (r.isNavigationRequest()) documents.push(r.url()); });
        try {
          await page.goto(base + '/', { waitUntil: 'load' });
          await page.waitForTimeout(500);
          stale = true;
          const result = await page.evaluate(() => {
            window.cacheTestMarker = 'same document';
            const now = Date.now;
            Date.now = () => now() + 10 * 60_000;
            document.querySelector('.site-nav a[href="/projects/"]').click();
            return { path: location.pathname, heading: document.querySelector('main h1').textContent };
          });
          assert.deepEqual(result, { path: '/projects/', heading: 'Projects' });
          assert.equal(documents.length, 1, `${mode}: long read caused a document request`);
          assert.equal(await page.evaluate(() => window.cacheTestMarker), 'same document');
          assert.equal(await page.locator('[data-cache-generation]').count(), 0);
          // More intent events during a refresh must share the same background request.
          await page.evaluate(() => {
            const link = document.querySelector('.site-nav a[href="/projects/"]');
            link.dispatchEvent(new Event('pointerover', { bubbles: true }));
            link.dispatchEvent(new Event('focusin', { bubbles: true }));
          });
          assert.equal(released, false);
          assert.equal(requests, 1, 'background refresh was duplicated');
          release();
          for (let i = 0; i < 100 && !refreshFinished; i++) await page.waitForTimeout(20);
          assert.equal(refreshFinished, true);
          await page.waitForTimeout(100);
          assert.equal(await page.locator('[data-cache-generation]').count(), 0, 'refresh replaced the page being read');
          assert.equal(await page.locator('main h1').textContent(), 'Projects');
          await page.locator('.site-nav a[href="/"]').click();
          await page.waitForURL(base + '/');
          await page.locator('.site-nav a[href="/projects/"]').click();
          await page.waitForURL(base + '/projects/');
          if (mode === 'refresh' || mode === 'failed-refresh') {
            assert.equal(documents.length, 1);
            assert.equal(await page.evaluate(() => window.cacheTestMarker), 'same document');
            assert.equal(await page.locator('[data-cache-generation]').count(), mode === 'refresh' ? 1 : 0);
          } else {
            await page.waitForLoadState('load');
            assert.equal(documents.length, 2, `${mode}: reused an incompatible or removed page`);
            assert.equal(await page.evaluate(() => window.cacheTestMarker), undefined);
            if (mode === 'removed') assert.equal(await page.locator('main h1').textContent(), 'Page not found');
          }
          assert.deepEqual(errors, []);
          console.log(`${engine}: long-read ${mode} preserves speed, freshness and safe navigation`);
        } finally { release(); await context.close(); }
      }
    } finally { await browser.close(); }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
