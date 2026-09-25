/**
 * Renders the app icon (scripts/icon.svg.mjs) to the PNGs app.json uses,
 * with Chromium through Playwright. Run from apps/mobile:
 *   node scripts/make-icons.mjs [path to playwright's index.mjs]
 */
import { writeFile } from 'node:fs/promises';

import { iconSvg } from './icon.svg.mjs';

const { chromium } = await import(process.argv[2] ?? 'playwright');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();

async function render(part, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${iconSvg(part, size)}</body>`);
  await writeFile(file, await page.locator('svg').screenshot({ omitBackground: true }));
}

await render('full', 1024, 'assets/images/icon.png');
await render('background', 1024, 'assets/images/android-icon-background.png');
await render('foreground', 1024, 'assets/images/android-icon-foreground.png');
await render('mono', 1024, 'assets/images/android-icon-monochrome.png');
await render('mark', 512, 'assets/images/splash-icon.png');
await render('full', 48, 'assets/images/favicon.png');
await browser.close();
console.log('ok');
