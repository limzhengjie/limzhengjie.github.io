// Browser regressions for themes and readable layouts. See docs/theme-qa.md.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const routes = ['/', '/writing/', '/designs/', '/projects/',
  '/designs/ai-adoption/', '/designs/cxmt-price-discovery/',
  '/designs/agentic-payments/', '/designs/revenue-per-employee/', '/missing-page/'];
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const opposite = theme => theme === 'dark' ? 'light' : 'dark';

async function expectTheme(page, theme) {
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme &&
    getComputedStyle(document.body).backgroundColor ===
      (theme === 'dark' ? 'rgb(20, 20, 19)' : 'rgb(246, 244, 239)'), theme);
  assert.equal(await page.locator('.theme-lamp').getAttribute('aria-label'),
    `Switch to ${opposite(theme)} mode`);
}

async function expectCenteredIntro(page) {
  const screen = await page.locator('.site-boot').boundingBox();
  assert.ok(await page.locator('.site-boot').evaluate(e => e.matches(':modal')), 'startup must block interaction with the homepage');
  assert.ok(Math.abs(screen.width - page.viewportSize().width) < 2 && Math.abs(screen.height - page.viewportSize().height) < 2, 'startup does not cover the viewport');
  await page.locator('.boot-console').evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
  const box = await page.locator('.boot-console').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2, 'startup is not horizontally centered');
  assert.ok(Math.abs(box.y + box.height / 2 - viewport.height / 2) < 2, 'startup is not vertically centered');
}

async function run() {
  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(await fs.readFile(file));
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(await fs.readFile(path.join(root, '404.html')));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = process.env.SITE_URL || `http://127.0.0.1:${server.address().port}`;
  let cases = 0;
  try {
    for (const engine of ['chromium', 'webkit']) {
      const browser = await playwright[engine].launch({
        headless: true,
        executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined,
      });
      try {
        const welcome = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark', reducedMotion: 'no-preference' });
        const home = await welcome.newPage();
        await home.goto(base + '/', { waitUntil: 'domcontentloaded' });
        await home.locator('.site-boot').waitFor();
        await expectCenteredIntro(home);
        assert.equal(await home.locator('.about').evaluate(e => getComputedStyle(e).opacity), '1');
        assert.ok(await home.locator('.site-nav').isVisible());
        await home.locator('.profile-portrait img').evaluate(e => e.decode());
        assert.ok(await home.locator('.profile-portrait img').evaluate(e =>
          e.naturalWidth >= e.getBoundingClientRect().width * devicePixelRatio), 'portrait has enough source pixels for a 3× display');
        assert.equal(await home.locator('.profile-portrait img').evaluate(e => getComputedStyle(e).filter), 'none');
        await home.waitForTimeout(3200);
        assert.ok(await home.locator('.site-boot').isVisible(), 'startup ends before readers can see it');
        assert.equal(await home.locator('.boot-skip').evaluate(e => e === document.activeElement), true);
        for (let i = 0; i < 3; i++) {
          await home.keyboard.press('Tab');
          assert.ok(await home.evaluate(() => document.querySelector('.site-boot').contains(document.activeElement) ||
            (document.activeElement === document.body && !document.hasFocus())), 'focus escaped to the homepage');
        }
        const skipped = await home.evaluate(() => {
          document.querySelector('.boot-skip').click();
          return { removed: !document.querySelector('.site-boot'), locked: getComputedStyle(document.body).overflow === 'hidden',
            focus: document.activeElement === document.querySelector('main') };
        });
        assert.deepEqual(skipped, { removed: true, locked: false, focus: true }, 'X must reveal the homepage synchronously');
        await home.locator('.theme-lamp').click();
        await expectTheme(home, 'light');
        assert.equal(await home.locator('.lamp-fixture').evaluate(e => getComputedStyle(e).animationName), 'lamp-pull');
        await home.waitForFunction(() => !document.querySelector('.theme-lamp').classList.contains('is-pulled'));
        assert.equal(await home.locator('.lamp-fixture').evaluate(e => getComputedStyle(e).animationName), 'lamp-sway');
        assert.equal(await home.locator('.profile-portrait img').evaluate(e => getComputedStyle(e).filter), 'none');
        await home.locator('.site-boot').waitFor({ state: 'detached', timeout: 4000 });
        await home.reload({ waitUntil: 'load' });
        assert.equal(await home.locator('.site-boot').count(), 0, 'intro repeats after first visit');
        await welcome.close();

        for (const reducedMotion of ['reduce', 'no-preference']) {
          const context = await browser.newContext({ reducedMotion });
          const page = await context.newPage();
          await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
          if (reducedMotion === 'reduce') {
            assert.equal(await page.locator('.site-boot').count(), 0);
            await page.locator('.theme-lamp').click();
            assert.equal(await page.locator('.lamp-fixture').evaluate(e => getComputedStyle(e).animationName), 'none');
          }
          else {
            await expectCenteredIntro(page);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.site-boot').count(), 0);
            assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true);
          }
          await context.close();
        }

        const automatic = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference' });
        const automaticPage = await automatic.newPage();
        await automaticPage.goto(base + '/', { waitUntil: 'domcontentloaded' });
        await expectCenteredIntro(automaticPage);
        await automaticPage.waitForTimeout(3500);
        assert.ok(await automaticPage.locator('.site-boot').isVisible(), 'startup should last longer than the old introduction');
        await automaticPage.locator('.site-boot').waitFor({ state: 'detached', timeout: 5000 });
        assert.equal(await automaticPage.locator('main').evaluate(e => e === document.activeElement), true);
        assert.equal(await automaticPage.locator('body').evaluate(e => getComputedStyle(e).overflow === 'hidden'), false);
        await automaticPage.reload({ waitUntil: 'load' });
        assert.equal(await automaticPage.locator('.site-boot').count(), 0, 'automatic completion must not replay on reload');
        await automatic.close();

        for (const initial of ['light', 'dark']) {
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 }, colorScheme: initial, hasTouch: true,
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const route of routes) {
              const response = await page.goto(base + route, { waitUntil: 'load' });
              assert.equal(response.status(), route === '/missing-page/' ? 404 : 200, route);
              if (await page.locator('.site-boot').count()) await page.getByRole('button', { name: 'Skip introduction' }).click();
              await expectTheme(page, initial);
              await page.locator('.theme-lamp').tap();
              await expectTheme(page, opposite(initial));
              await page.reload({ waitUntil: 'load' });
              await expectTheme(page, opposite(initial));
              await page.locator('.theme-lamp').focus();
              await page.keyboard.press('Space');
              await expectTheme(page, initial);
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route);
              assert.deepEqual(await page.locator('.site-nav a').allTextContents(), ['Home', 'Writing', 'Designs', 'Projects']);
              cases++;
            }
          }
          // The author/date line must wrap when readers enlarge their text.
          await page.setViewportSize({ width: 320, height: 568 });
          for (const route of routes) {
            await page.goto(base + route, { waitUntil: 'load' });
            await page.addStyleTag({ content: 'html { font-size: 200%; }' });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              `${engine} ${initial} ${route}: horizontal overflow at 200% text`);
            cases++;
          }
          await page.goto(base + '/designs/', { waitUntil: 'load' });
          const opener = page.locator('.design-open').first();
          await opener.click();
          await page.waitForFunction(() => !document.querySelector('#viewer-zoom').disabled);
          await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
          await page.getByRole('button', { name: 'Fit image', exact: true }).click();
          await page.locator('#viewer-close').focus();
          for (let i = 0; i < 8; i++) {
            await page.keyboard.press('Tab');
            // Native dialogs allow focus to enter browser chrome, but never the underlying page.
            assert.ok(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement) ||
              (document.activeElement === document.body && !document.hasFocus())));
          }
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.body.classList.contains('viewer-open'));
          assert.ok(await opener.evaluate(element => element === document.activeElement));
          assert.deepEqual(errors, []);
          await context.close();
        }
      } finally { await browser.close(); }
      console.log(`${engine}: themes, saved preferences, keyboard, reflow, and image viewer passed`);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`${cases} page/layout/theme checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
