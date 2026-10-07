// Renders the SVG app icon to the PNG sizes the PWA manifest needs.
// Needs Playwright (npx playwright) available; only used to regenerate the PNG icons.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (size, file, pad = 0) => {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:#0d0f1a"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  writeFileSync(file, await page.screenshot({ type: 'png' }));
};
await render(192, 'public/icons/icon-192.png');
await render(512, 'public/icons/icon-512.png');
await render(512, 'public/icons/icon-maskable-512.png', 56);
await render(180, 'public/icons/apple-touch-icon.png');
await browser.close();
