// Render the social card with the same typography, palette and portrait crop as the site.
// Run explicitly when the profile changes; committed output keeps deployments reproducible.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

async function run() {
  const portrait = (await fs.readFile(path.join(root, 'assets/profile/zheng-jie-lim.jpg'))).toString('base64');
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
      <title>Zheng Jie Lim — social preview</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; width: 1200px; height: 630px; background: #f6f4ef; color: #1c1b18;
          padding: 76px 84px; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
        main { flex: 1; display: flex; align-items: center; gap: 52px; }
        .portrait { width: 180px; height: 180px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
        img { width: 100%; height: 100%; object-fit: cover; object-position: center bottom; transform: scale(2.8); }
        h1 { font-family: Georgia, serif; font-size: 68px; font-weight: 400; letter-spacing: -2px; margin: 0 0 22px; }
        p { font-size: 27px; color: #5c5a54; margin: 0; }
        footer { border-top: 1px solid #d8d4cb; padding-top: 28px; display: flex; justify-content: space-between;
          font-size: 21px; color: #5c5a54; }
      </style><body><main>
        <div class="portrait"><img src="data:image/jpeg;base64,${portrait}" alt="Zheng Jie Lim"></div>
        <div><h1>Zheng Jie Lim</h1><p>Data and Research @ Artemis</p></div>
      </main><footer><span>Crypto, FinTech and AI</span><span>limzhengjie.com</span></footer></body></html>`);
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: path.join(root, 'assets/brand/zheng-jie-lim-social.png') });
    // Keep previously shared image URLs useful while new metadata uses a fresh URL.
    await fs.copyFile(path.join(root, 'assets/brand/zheng-jie-lim-social.png'), path.join(root, 'og-image.png'));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
