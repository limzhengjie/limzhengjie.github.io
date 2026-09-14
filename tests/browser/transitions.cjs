// Navigation motion must never delay content or block the next interaction.
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
      const browser = await playwright[engine].launch({
        executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined,
      });
      try {
        for (const theme of ['light', 'dark']) {
          for (const width of [390, 1440]) {
            const context = await browser.newContext({ viewport: { width, height: 900 },
              colorScheme: theme, hasTouch: width === 390, reducedMotion: 'no-preference' });
            // QA must never increment the live spark or send production analytics.
            await context.route('**/api/spark', route => route.fulfill({ json: { total: 0 } }));
            await context.route('https://cloud.umami.is/script.js', route => route.abort());
            await context.addInitScript(() => {
              localStorage.setItem('zj-intro-seen', '1');
              localStorage.setItem('umami.disabled', '1');
              window.pageLoads = [];
              window.documentMarker = Math.random();
              document.addEventListener('site:load', () => window.pageLoads.push({
                path: location.pathname, title: document.title,
                canonical: document.querySelector('link[rel="canonical"]')?.href,
              }));
            });
            const page = await context.newPage();
            page.setDefaultTimeout(10_000);
            page.setDefaultNavigationTimeout(10_000);
            const errors = [], documents = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('request', req => { if (req.isNavigationRequest()) documents.push(req.url()); });
            await page.goto(base + '/', { waitUntil: 'load' });
            await page.waitForTimeout(1200);
            const marker = await page.evaluate(() => window.documentMarker);
            await page.evaluate(() => { window.originalLamp = document.querySelector('.theme-lamp'); });
            const settled = () => page.waitForFunction(() => !document.querySelector('main').getAnimations().length);
            const click = async route => {
              const link = page.locator(`.site-nav a[href="${route}"]`);
              if (width === 390) await link.tap();
              else { await link.focus(); await page.keyboard.press('Enter'); }
              await page.waitForURL(base + route);
              await settled();
              assert.equal(await page.evaluate(() => window.documentMarker), marker);
              assert.equal(await page.locator('.site-nav [aria-current="page"]').getAttribute('href'), route);
              assert.equal(await page.locator('main').evaluate(e => e === document.activeElement), true);
              assert.equal(await page.evaluate(() => document.querySelector('.theme-lamp') === window.originalLamp), true);
              assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
              assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
              assert.equal(await page.locator('main').evaluate(e => getComputedStyle(e).opacity), '1');
            };
            // All three requested outward and return trips, plus changes among tabs.
            for (const route of ['/writing/', '/', '/designs/', '/', '/projects/', '/', '/writing/', '/designs/', '/projects/']) await click(route);
            assert.equal(documents.length, 1);
            assert.equal((await page.evaluate(() => window.pageLoads)).length, 9);
            assert.ok((await page.evaluate(() => window.pageLoads)).every(p => p.canonical === 'https://limzhengjie.com' + p.path));

            // Inspect the running effect, then interrupt it with a real pointer.
            const motion = await page.evaluate(() => {
              document.querySelector('.site-nav a[href="/writing/"]').click();
              const main = document.querySelector('main');
              const animation = main.getAnimations()[0];
              window.previousEntrance = animation;
              animation.pause();
              animation.currentTime = 60;
              return { path: location.pathname, duration: animation.effect.getTiming().duration,
                opacity: Number(getComputedStyle(main).opacity), transform: getComputedStyle(main).transform,
                lampMotion: window.originalLamp.querySelector('.lamp-fixture').getAnimations()[0].playState };
            });
            assert.equal(motion.path, '/writing/', 'page update waited for animation');
            assert.equal(motion.duration, 240);
            assert.ok(motion.opacity > 0 && motion.opacity < 1, 'fade is not visible');
            assert.notEqual(motion.transform, 'none');
            assert.equal(motion.lampMotion, 'running');
            if (process.env.TRANSITION_ARTIFACT_DIR) {
              await fs.mkdir(process.env.TRANSITION_ARTIFACT_DIR, { recursive: true });
              await page.screenshot({ path: path.join(process.env.TRANSITION_ARTIFACT_DIR, `${engine}-${theme}-${width}-mid-transition.png`) });
            }
            const target = await page.locator('.site-nav a[href="/designs/"]').boundingBox();
            await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
            await page.waitForURL(base + '/designs/');
            assert.equal(await page.evaluate(() => window.previousEntrance.playState), 'idle');
            await settled();
            await page.locator('.design-open').first().click();
            await page.locator('.image-viewer[open]').waitFor();
            await page.keyboard.press('Escape');

            await page.goBack();
            await page.waitForURL(base + '/writing/');
            await settled();
            await page.evaluate(() => scrollTo(0, 850));
            const scroll = await page.evaluate(() => scrollY);
            await page.evaluate(() => document.querySelector('.site-nav a[href="/projects/"]').click());
            await page.waitForURL(base + '/projects/');
            await settled();
            await page.goBack();
            await page.waitForURL(base + '/writing/');
            await settled();
            assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) < 3, 'Back lost reading position');
            await page.goForward();
            await page.waitForURL(base + '/projects/');
            await settled();

            // A burst of clicks is handled immediately, without a stale page resurfacing.
            const finalPath = await page.evaluate(() => {
              for (const route of ['/designs/', '/writing/', '/', '/projects/']) {
                document.querySelector(`.site-nav a[href="${route}"]`).click();
              }
              return location.pathname;
            });
            assert.equal(finalPath, '/projects/');
            await settled();
            assert.equal(await page.locator('main h1').textContent(), 'Projects');

            // Changing the motion preference cancels an in-flight effect.
            await page.evaluate(() => document.querySelector('.site-nav a[href="/writing/"]').click());
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await settled();
            await click('/');
            assert.equal(await page.locator('main').evaluate(e => e.getAnimations().length), 0);
            const loads = await page.evaluate(() => window.pageLoads.length);
            await page.locator('.site-nav a[href="/"]').click();
            assert.equal(await page.evaluate(() => window.pageLoads.length), loads, 'current tab doubled a pageview');

            // Unsupported or failed animation must leave the new page fully visible.
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page.evaluate(() => { Element.prototype.animate = undefined; });
            await click('/writing/');
            await page.evaluate(() => { Element.prototype.animate = () => { throw new Error('Unavailable'); }; });
            await click('/');
            assert.deepEqual(errors, []);
            console.log(`${engine} ${theme} ${width}px: bidirectional motion, uninterrupted lamp, rapid clicks, history, scroll, reduced motion and fallback passed`);
            await context.close();
          }
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
