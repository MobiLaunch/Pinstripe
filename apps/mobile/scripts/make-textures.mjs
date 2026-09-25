/**
 * Renders the app's material textures (tileable PNGs) from SVG noise
 * filters with Chromium through Playwright. Run from apps/mobile:
 *   node scripts/make-textures.mjs [path to playwright's index.mjs]
 *
 * - linen: the dark woven linen behind Notification Center and the desktop.
 * - metal: horizontally brushed aluminium for toolbars.
 * - wood: warm grain for the profile's video shelves.
 */
import { writeFile } from 'node:fs/promises';

const { chromium } = await import(process.argv[2] ?? 'playwright');

const textures = {
  linen: {
    w: 256,
    h: 256,
    svg: `
      <filter id="warp" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.035" numOctaves="3" seed="4" stitchTiles="stitch" result="a"/>
        <feColorMatrix in="a" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 -0.2" result="warpThreads"/>
      </filter>
      <filter id="weft" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves="3" seed="9" stitchTiles="stitch" result="b"/>
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.3"/>
      </filter>
      <filter id="fleck" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="2" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 -0.12"/>
      </filter>
      <rect width="256" height="256" fill="#3b3e44"/>
      <rect width="256" height="256" filter="url(#warp)" opacity="0.35"/>
      <rect width="256" height="256" filter="url(#weft)" opacity="0.55"/>
      <rect width="256" height="256" filter="url(#fleck)" opacity="0.25"/>`,
  },
  metal: {
    w: 512,
    h: 128,
    svg: `
      <filter id="brush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.7" numOctaves="4" seed="7" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 -0.35"/>
      </filter>
      <filter id="brushDark" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.9" numOctaves="3" seed="3" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.4"/>
      </filter>
      <rect width="512" height="128" fill="#b9bdc3"/>
      <rect width="512" height="128" filter="url(#brush)" opacity="0.55"/>
      <rect width="512" height="128" filter="url(#brushDark)" opacity="0.35"/>`,
  },
  wood: {
    w: 512,
    h: 256,
    svg: `
      <filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.003 0.04" numOctaves="5" seed="12" stitchTiles="stitch" result="n"/>
        <feComponentTransfer in="n" result="rings">
          <feFuncR type="table" tableValues="0 1 0 1 0 1 0 1 0"/>
        </feComponentTransfer>
        <feColorMatrix in="rings" type="matrix" values="
          0.36 0 0 0 0.30
          0.25 0 0 0 0.16
          0.15 0 0 0 0.075
          0 0 0 0 1"/>
      </filter>
      <filter id="pores" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.9" numOctaves="2" seed="5" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0 0  0 0 0 0.8 -0.3"/>
      </filter>
      <rect width="512" height="256" filter="url(#grain)"/>
      <rect width="512" height="256" filter="url(#pores)" opacity="0.35"/>`,
  },
};

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
for (const [name, t] of Object.entries(textures)) {
  await page.setViewportSize({ width: t.w, height: t.h });
  await page.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${t.w}" height="${t.h}">${t.svg}</svg></body>`);
  await writeFile(`assets/textures/${name}.png`, await page.locator('svg').screenshot());
}
await browser.close();
console.log('ok');
