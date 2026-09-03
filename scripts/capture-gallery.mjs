/**
 * Capture Devpost gallery frames from the live clinical chrome.
 * Usage: FARADAY_URL=... bun scripts/capture-gallery.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.FARADAY_URL ?? "http://127.0.0.1:4173/faraday/";
const OUT = join(import.meta.dirname, "../demo/gallery");

async function call(page, name, args = {}) {
  return page.evaluate(
    async ({ name, args }) => {
      const raw = await navigator.modelContextTesting.executeTool(name, JSON.stringify(args));
      return JSON.parse(raw);
    },
    { name, args },
  );
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, "01-empty.png") });

await page.getByRole("button", { name: /Sample study/i }).first().click();
await page.waitForFunction(() => /UPENN-GBM/.test(document.body.innerText) && !/Decoding/.test(document.body.innerText));
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, "02-loaded.png") });

const describe = await call(page, "describe_study");
const win = describe.structuredContent?.suggested_window ?? { min: 1145, max: 2189 };
await call(page, "find_regions", {
  min_intensity: win.min,
  max_intensity: win.max,
});
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, "03-regions.png") });

await call(page, "focus_region", { region_id: 1 });
await call(page, "set_view", { view: "render" });
await page.waitForTimeout(1000);
await page.screenshot({ path: join(OUT, "04-render.png") });

const exportPromise = call(page, "export_findings", { note: "gallery" });
await page.waitForSelector(".confirm", { timeout: 10_000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "05-hitl.png") });
await page.getByRole("button", { name: "Approve" }).click();
await exportPromise;

console.log("gallery written to", OUT);
await browser.close();
