import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('/home/x/.local/share/fnm/node-versions/v24.12.0/installation/lib/node_modules/playwright');

const BASE = 'http://localhost:3001';
const CREDS = { username: 'Marcus', password: 'manager' };

const pages = [
  { path: '/', name: '02-dashboard' },
  { path: '/clients', name: '03-clients-list' },
  { path: '/clients/new', name: '04-clients-new' },
  { path: '/follow-ups', name: '05-follow-ups' },
  { path: '/analytics', name: '06-analytics' },
  { path: '/analytics/collections', name: '07-analytics-collections' },
  { path: '/promos', name: '08-promos' },
  { path: '/smart-lists', name: '09-smart-lists' },
  { path: '/banned', name: '10-banned' },
  { path: '/unsubscribed', name: '11-unsubscribed' },
  { path: '/settings', name: '12-settings' },
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login page screenshot (before auth)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.screenshot({ path: `${__dirname}/screenshots/01-login.png`, fullPage: true });
  console.log('✅ 01-login (unauthenticated)');

  // Authenticate
  await page.fill('input[id="username"]', CREDS.username);
  await page.fill('input[id="password"]', CREDS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/login**', { timeout: 5000 }).catch(() => {});
  // Wait for redirect to dashboard or any page
  await page.waitForTimeout(2000);
  const currentUrl = page.url();
  console.log(`  After login: ${currentUrl}`);

  // If still on login, try navigating directly
  if (currentUrl.includes('/login')) {
    // Check for error
    console.log('  Still on login — checking for error...');
    // Try waiting longer
    await page.waitForTimeout(3000);
    const newUrl = page.url();
    console.log(`  After wait: ${newUrl}`);
  }

  // Screenshot all authenticated pages
  for (const { path, name } of pages) {
    const url = `${BASE}${path}`;
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      const status = resp?.status();
      const filePath = `${__dirname}/screenshots/${name}.png`;
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`✅ ${name} — ${path} [${status}]`);
    } catch (e) {
      console.log(`❌ ${name} — ${path} — ${e.message}`);
      try {
        await page.screenshot({ path: `${__dirname}/screenshots/${name}-error.png` });
      } catch {}
    }
  }

  // Try client detail page
  try {
    await page.goto(`${BASE}/clients`, { waitUntil: 'networkidle', timeout: 10000 });
    const clientLink = await page.$('a[href*="/clients/"]');
    if (clientLink) {
      const href = await clientLink.getAttribute('href');
      await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.screenshot({ path: `${__dirname}/screenshots/13-client-detail.png`, fullPage: true });
      console.log(`✅ 13-client-detail — ${href}`);

      await page.goto(`${BASE}${href}/edit`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.screenshot({ path: `${__dirname}/screenshots/14-client-edit.png`, fullPage: true });
      console.log(`✅ 14-client-edit — ${href}/edit`);
    } else {
      console.log('ℹ️ No client links found — skipping detail/edit');
    }
  } catch (e) {
    console.log(`❌ client detail — ${e.message}`);
  }

  // Mobile dashboard
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  try {
    await mobilePage.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 10000 });
    await mobilePage.screenshot({ path: `${__dirname}/screenshots/15-dashboard-mobile.png`, fullPage: true });
    console.log('✅ 15-dashboard-mobile');
  } catch (e) {
    console.log(`❌ mobile dashboard — ${e.message}`);
  }

  await browser.close();
  console.log('\nDone!');
})();
