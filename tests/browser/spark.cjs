const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
// Browser transport fixture. Atomicity and restart persistence are tested against real Redis separately.
let total = 100, saved = new Set(), failNext = false, dropNext = false, holdNext = false, release;
const server = http.createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/spark') {
      if (failNext) { failNext = false; res.writeHead(503); return res.end('{}'); }
      if (req.method === 'POST') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        if (!saved.has(body.requestId)) { saved.add(body.requestId); total += body.amount; }
        // An unreadable response after committing forces the app-level retry path;
        // Chromium can transparently retry a closed keepalive socket itself.
        if (dropNext) { dropNext = false; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{'); }
        if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ total }));
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch (_) { res.writeHead(404); res.end(); }
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function count(page, value) {
  await page.waitForFunction(expected => document.querySelector('[data-spark-count]')?.textContent === expected.toLocaleString('en-US'), value);
}
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('[data-spark-status]')?.textContent === '');
}
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await playwright[engine].launch({ headless: true,
        executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined });
      try {
        for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
          const before = total;
          const context = await browser.newContext({ colorScheme: theme, reducedMotion: 'reduce', viewport: { width, height: 900 } });
          const page = await context.newPage();
          const errors = []; page.on('pageerror', error => errors.push(error.message));
          await page.goto(base);
          await count(page, before + 1); await settle(page);
          const button = page.getByRole('button', { name: 'Add a spark', exact: true });
          const box = await button.boundingBox();
          assert.ok(box.width >= 44 && box.height >= 44, 'tap target is too small');
          assert.ok(await page.locator('[data-spark]').evaluate(element =>
            Boolean(element.previousElementSibling?.matches('nav[aria-label="Profile links"]'))), 'spark is not at the bottom');
          await button.focus(); await page.keyboard.press('Enter');
          await count(page, before + 2); await settle(page);
          await button.evaluate(element => { for (let i = 0; i < 8; i++) element.click(); });
          await count(page, before + 10); await settle(page);
          assert.equal(await page.locator('.spark-particle').count(), 0, 'reduced motion generated particles');
          assert.equal(await button.evaluate(element => element.getAnimations().length), 0);
          await page.reload(); await count(page, before + 10); await settle(page);
          await page.waitForTimeout(1000);
          for (const route of ['writing', 'designs', 'projects']) {
            await page.locator(`.site-nav a[href="/${route}/"]`).click();
            await page.waitForURL(base + `/${route}/`);
          }
          await page.locator('.site-nav a[href="/"]').click(); await page.waitForURL(base + '/');
          await count(page, before + 10); await settle(page);
          assert.equal(total, before + 10, 'navigation/reload counted another visit');
          const otherContext = await browser.newContext({ reducedMotion: 'reduce' });
          const other = await otherContext.newPage();
          await other.goto(base + '/designs/ai-adoption/');
          for (let i = 0; i < 50 && total !== before + 11; i++) await sleep(20);
          assert.equal(total, before + 11, 'a separate visitor entering a detail page did not count');
          await other.goto(base); await count(other, before + 11); await settle(other);
          await other.getByRole('button', { name: 'Add a spark', exact: true }).click();
          await count(other, before + 12); await settle(other);
          await page.reload(); await count(page, before + 12); await settle(page);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.deepEqual(errors, []);
          if (process.env.SPARK_SCREENSHOTS) {
            await fs.mkdir(process.env.SPARK_SCREENSHOTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SPARK_SCREENSHOTS, `${engine}-${theme}-${width}.png`), fullPage: true });
          }
          await otherContext.close(); await context.close();
          console.log(`${engine} ${theme} ${width}px: visits, taps, shared total, reload, navigation, keyboard and reduced motion passed`);
        }
        const context = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await context.newPage();
        const initial = total;
        await page.goto(base); await count(page, initial + 1); await settle(page);
        const before = total;
        dropNext = true;
        await page.getByRole('button', { name: 'Add a spark', exact: true }).click();
        await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
        assert.equal(total, before + 1, 'fixture did not save before dropping response');
        await count(page, before);
        await page.reload(); await count(page, before + 1); await settle(page);
        assert.equal(total, before + 1, 'reload duplicated an uncertain saved tap');
        failNext = true;
        await page.getByRole('button', { name: 'Add a spark', exact: true }).click();
        await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
        assert.equal(total, before + 1);
        await count(page, before + 1);
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await count(page, before + 2); await settle(page);
        await page.waitForTimeout(1000);
        holdNext = true;
        await page.getByRole('button', { name: 'Add a spark', exact: true }).click();
        for (let i = 0; i < 50 && !release; i++) await sleep(20);
        assert.ok(release);
        await page.locator('.site-nav a[href="/writing/"]').click(); await page.waitForURL(base + '/writing/');
        release(); release = undefined;
        await page.locator('.site-nav a[href="/"]').click(); await page.waitForURL(base + '/');
        await count(page, before + 3); await settle(page);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.getByRole('button', { name: 'Add a spark', exact: true }).click();
        assert.ok(await page.locator('.spark-particle').count() > 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForFunction(() => !document.querySelector('.spark-particle'));
        await count(page, before + 4); await settle(page);
        await context.close();
        console.log(`${engine}: interrupted response, reload deduplication, explicit retry, pending navigation and motion change passed`);
        const blocked = await browser.newContext({ reducedMotion: 'reduce' });
        await blocked.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } }));
        const blockedPage = await blocked.newPage(); const blockedBefore = total;
        await blockedPage.goto(base); await count(blockedPage, blockedBefore + 1); await settle(blockedPage);
        await blockedPage.getByRole('button', { name: 'Add a spark', exact: true }).click();
        await count(blockedPage, blockedBefore + 2); await settle(blockedPage);
        await blocked.close();
        const noJS = await browser.newContext({ javaScriptEnabled: false });
        const noJSPage = await noJS.newPage(); const noJSBefore = total;
        await noJSPage.goto(base);
        assert.equal(await noJSPage.locator('[data-spark]').isVisible(), false);
        assert.equal(total, noJSBefore);
        await noJS.close();
        console.log(`${engine}: blocked storage and no-JavaScript fallback passed`);
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
