const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const site = 'https://limzhengjie.com';
const sdk = 'https://cloud.umami.is/script.js';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    colorScheme: 'dark', reducedMotion: 'reduce', ...options.context });
  const events = [], documents = [], errors = [];
  let sdkRequests = 0;
  let release;
  const gate = options.delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest()) documents.push(url.href);
    if (url.href === sdk) {
      sdkRequests++;
      if (options.blocked) return route.abort();
      await gate;
      if (process.env.ANALYTICS_REAL_SDK) {
        return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(process.env.ANALYTICS_REAL_SDK) });
      }
      // Test our adapter independently of Umami availability. A separate live
      // canary verifies the real SDK and ingestion after deployment.
      return route.fulfill({ contentType: 'text/javascript', body: `
        window.umami = { track: payload => fetch('https://analytics.test/collect', {
          method: 'POST', body: JSON.stringify(payload), keepalive: true
        }) };
      ` });
    }
    if (url.hostname === 'analytics.test' || url.hostname === 'gateway.umami.is') {
      const body = JSON.parse(request.postData());
      events.push(body.payload || body);
      return route.fulfill({ json: { cache: 'test-session' }, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.pathname === '/api/spark') return route.fulfill({ json: { total: 0 } });
    if ([new URL(site).hostname, 'preview.vercel.app', 'localhost'].includes(url.hostname)) {
      let pathname = url.pathname;
      if (pathname.endsWith('/')) pathname += 'index.html';
      try {
        const file = path.resolve(root, '.' + pathname);
        assert.ok(file.startsWith(root + path.sep));
        return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream',
          body: await fs.readFile(file) });
      } catch (_) {
        return route.fulfill({ status: 404, contentType: types['.html'], body: await fs.readFile(path.join(root, '404.html')) });
      }
    }
    // External article clicks must not visit publishers or send real analytics.
    return route.fulfill({ contentType: 'text/html', body: '<title>External destination</title>' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function waitForCount(count) {
    for (let i = 0; i < 100 && events.length < count; i++) await pause(20);
    assert.equal(events.length, count);
  }
  return { context, page, events, documents, errors, waitForCount,
    sdkRequests: () => sdkRequests, release: () => release?.() };
}

async function run() {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await playwright[engine].launch({
      executablePath: process.env[`${engine.toUpperCase()}_EXECUTABLE_PATH`] || undefined,
    });
    try {
      const f = await fixture(browser, { delayed: true });
      try {
        await f.page.goto(site + '/?utm_source=linkedin&utm_campaign=profile&email=private#intro',
          { referer: 'https://www.google.com/search?q=private', waitUntil: 'load' });
        // The analytics transport remains pending while the site's load event
        // and navigation warming complete normally.
        await f.page.waitForTimeout(500);
        await f.page.evaluate(() => { window.documentMarker = 'initial'; });
        await f.page.locator('.site-nav a[href="/writing/"]').click();
        await f.page.waitForURL(site + '/writing/');
        assert.equal(await f.page.evaluate(() => window.documentMarker), 'initial');
        assert.equal(f.documents.length, 1, 'analytics transport broke cached navigation');
        assert.equal(f.events.length, 0);
        f.release();
        await f.waitForCount(3);
        assert.equal(f.events[0].url, '/?utm_source=linkedin&utm_campaign=profile');
        assert.equal(f.events[0].referrer, 'https://www.google.com');
        assert.match(f.events[0].title, /Zheng Jie Lim/);
        assert.equal(f.events[1].name, 'navigation_click');
        assert.equal(f.events[1].url, f.events[0].url, 'click attributed to its destination');
        assert.equal(f.events[2].url, '/writing/');
        assert.match(f.events[2].title, /Writing/);
        assert.equal(f.events[2].referrer, f.events[0].url);
        assert.equal(f.sdkRequests(), 1);

        const popup = f.context.waitForEvent('page');
        const article = f.page.locator('.writing-read a').first();
        const destination = await article.getAttribute('href');
        await article.click();
        await (await popup).close();
        await f.waitForCount(4);
        assert.equal(f.events[3].name, 'article_click');
        assert.equal(f.events[3].url, '/writing/');
        assert.equal(f.events[3].data.destination, destination);
        assert.ok(f.events[3].data.title);

        await f.page.locator('.site-nav a[href="/designs/"]').click();
        await f.page.waitForURL(site + '/designs/');
        await f.waitForCount(6);
        await f.page.locator('.design-open').first().click();
        await f.page.locator('.image-viewer[open]').waitFor();
        await f.waitForCount(7);
        assert.equal(f.events[6].name, 'infographic_open');
        assert.equal(f.events[6].data.image, 'ai-adoption.png');
        await f.page.keyboard.press('Escape');
        await f.page.goBack();
        await f.page.waitForURL(site + '/writing/');
        await f.waitForCount(8);
        assert.equal(f.events[7].url, '/writing/');
        assert.equal(f.events[7].referrer, '/designs/');
        await f.page.goForward();
        await f.page.waitForURL(site + '/designs/');
        await f.waitForCount(9);
        assert.equal(f.events[8].url, '/designs/');
        await f.page.evaluate(() => document.dispatchEvent(new Event('site:load')));
        await f.page.waitForTimeout(350);
        assert.equal(f.events.length, 9, 'same-page reinitialization doubled a pageview');
        assert.ok(f.events.every(event => event.website === '18e0df56-605b-4290-a456-65f6b65f6d99'));
        assert.ok(f.events.every(event => !('id' in event)));
        assert.ok(!JSON.stringify(f.events).includes('private'));
        assert.deepEqual(f.errors, []);
      } finally { f.release(); await f.context.close(); }

      const links = await fixture(browser, { context: { viewport: { width: 1440, height: 900 }, colorScheme: 'light' } });
      try {
        await links.page.goto(site);
        await links.waitForCount(1);
        const email = links.page.getByRole('link', { name: 'Email', exact: true });
        // Suppress launching the operating system's mail app during QA.
        await email.evaluate(el => el.addEventListener('click', e => e.preventDefault(), { once: true }));
        await email.focus(); await links.page.keyboard.press('Enter');
        await links.waitForCount(2);
        assert.deepEqual(links.events[1].data, { channel: 'Email' });
        assert.equal(links.events[1].name, 'contact_click');
        const popup = links.context.waitForEvent('page');
        await links.page.getByRole('link', { name: 'LinkedIn', exact: true }).click();
        await (await popup).close();
        await links.waitForCount(3);
        assert.equal(links.events[2].name, 'profile_click');
        assert.equal(links.events[2].data.channel, 'LinkedIn');
        await links.page.goto(site + '/designs/');
        await links.waitForCount(4);
        await links.page.locator('.design-open').first().click();
        await links.waitForCount(5);
        const original = links.page.locator('#viewer-original');
        await original.evaluate(el => el.addEventListener('click', e => e.preventDefault(), { once: true }));
        await original.click();
        await links.waitForCount(6);
        assert.equal(links.events[5].name, 'original_image_click');
        assert.equal(links.events[5].data.image, 'ai-adoption.png');
        await links.page.getByRole('button', { name: 'Next image' }).click();
        await links.waitForCount(7);
        assert.equal(links.events[6].name, 'infographic_open');
        assert.equal(links.events[6].data.image, 'cxmt-price-discovery.png');
        await links.page.keyboard.press('ArrowRight');
        await links.waitForCount(8);
        assert.equal(links.events[7].name, 'infographic_open');
        await links.page.keyboard.press('Escape');
        await links.page.goto(site + '/writing/');
        await links.waitForCount(9);
        await links.page.getByRole('searchbox').fill('private search query');
        await links.page.waitForTimeout(200);
        assert.equal(links.events.length, 9, 'search terms must stay in the browser');
        assert.deepEqual(links.errors, []);
      } finally { await links.context.close(); }

      const motion = await fixture(browser, { context: { reducedMotion: 'no-preference' } });
      try {
        await motion.context.addInitScript(() => localStorage.setItem('zj-intro-seen', '1'));
        await motion.page.goto(site);
        await motion.waitForCount(1);
        await motion.page.waitForTimeout(500);
        for (const [route, count] of [['/writing/', 3], ['/designs/', 5], ['/projects/', 7], ['/', 9]]) {
          await motion.page.locator(`.site-nav a[href="${route}"]`).click();
          await motion.page.waitForURL(site + route);
          await motion.waitForCount(count);
          assert.equal(motion.events[count - 1].url, route);
          assert.equal(motion.events[count - 2].name, 'navigation_click');
          assert.equal(motion.events[count - 2].url, motion.events[count - 3].url);
        }
        await motion.page.waitForTimeout(350);
        assert.deepEqual(motion.events.filter(event => !event.name).map(event => event.url),
          ['/', '/writing/', '/designs/', '/projects/', '/']);
        assert.equal(motion.documents.length, 1);
        assert.deepEqual(motion.errors, []);
      } finally { await motion.context.close(); }

      for (const test of ['preview', 'localhost', 'opt-out', 'do-not-track', 'global-privacy-control', 'blocked-storage']) {
        const f = await fixture(browser);
        try {
          if (test === 'do-not-track') await f.context.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { value: '1' }));
          if (test === 'global-privacy-control') await f.context.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
          if (test === 'blocked-storage') await f.context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } }));
          const origin = test === 'preview' ? 'https://preview.vercel.app' : test === 'localhost' ? 'http://localhost' : site;
          await f.page.goto(origin + (test === 'opt-out' ? '/?analytics=off' : '/'));
          await f.page.waitForTimeout(250);
          assert.equal(f.sdkRequests(), 0, test);
          assert.equal(f.events.length, 0, test);
          if (test === 'opt-out') {
            assert.equal(f.page.url(), site + '/');
            await f.page.reload();
            assert.equal(f.sdkRequests(), 0, 'opt-out must persist on reload');
            await f.page.goto(site + '/?analytics=on');
            await f.waitForCount(1);
            assert.equal(f.page.url(), site + '/');
            assert.equal(f.events[0].url, '/');
          }
          assert.deepEqual(f.errors, []);
        } finally { await f.context.close(); }
      }

      const blocked = await fixture(browser, { blocked: true });
      try {
        await blocked.page.goto(site);
        await blocked.page.waitForTimeout(500);
        await blocked.page.locator('.site-nav a[href="/designs/"]').click();
        await blocked.page.waitForURL(site + '/designs/');
        await blocked.page.locator('.design-open').first().click();
        await blocked.page.locator('.image-viewer[open]').waitFor();
        assert.equal(blocked.events.length, 0);
        assert.deepEqual(blocked.errors, []);
      } finally { await blocked.context.close(); }
      console.log(`${engine}: attribution, delayed tracker, cached navigation, history, article/image clicks, exclusions and failure fallback passed`);
    } finally { await browser.close(); }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
