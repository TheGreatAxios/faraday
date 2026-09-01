/**
 * Record a silent <3min Faraday demo for Devpost.
 * Usage: bun run scripts/record-demo.ts
 * Output: demo/*.webm
 */
import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.FARADAY_URL ?? "https://thegreataxios.github.io/faraday/";
const OUT_DIR = join(import.meta.dir, "..", "demo");

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function callTool(page: import("playwright").Page, name: string, args: Record<string, unknown> = {}) {
  return page.evaluate(
    async ({ name, args }) => {
      const testing = (
        navigator as unknown as {
          modelContextTesting?: { executeTool: (n: string, input: string) => Promise<string> };
        }
      ).modelContextTesting;
      if (!testing) throw new Error("modelContextTesting unavailable");
      return JSON.parse(await testing.executeTool(name, JSON.stringify(args))) as {
        content?: Array<{ text?: string }>;
        isError?: boolean;
        structuredContent?: Record<string, unknown>;
      };
    },
    { name, args },
  );
}

async function waitForVolume(page: import("playwright").Page) {
  for (let i = 0; i < 60; i += 1) {
    const result = await callTool(page, "describe_study");
    if (!result.isError && result.content?.[0]?.text?.includes("voxels")) return result;
    await sleep(1000);
  }
  throw new Error("volume did not become ready within 60s");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-unsafe-webgpu"],
  });
  const context = await browser.newContext({
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console:", msg.text());
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(2000);
  await page.getByRole("button", { name: "Load demo CT/MR" }).click();

  const describe = await waitForVolume(page);
  console.log("describe:", describe.content?.[0]?.text?.slice(0, 240));
  await sleep(4000);

  const windowHint = describe.structuredContent?.suggested_window as
    | { min?: number; max?: number }
    | undefined;
  const min = typeof windowHint?.min === "number" ? windowHint.min : 900;
  const max = typeof windowHint?.max === "number" ? windowHint.max : 2200;

  const found = await callTool(page, "find_regions", {
    min_intensity: min,
    max_intensity: max,
    min_volume_ml: 0.2,
    limit: 5,
  });
  console.log("find:", found.content?.[0]?.text?.slice(0, 280));
  await sleep(4500);

  await callTool(page, "focus_region", { region_id: 1 });
  await sleep(3000);
  await callTool(page, "set_view", { view: "render" });
  await sleep(5000);

  const exportPromise = callTool(page, "export_findings", {
    note: "Demo export — measurements only",
  });
  await page.waitForSelector(".confirm", { timeout: 15000 });
  await sleep(2500);
  await page.getByRole("button", { name: "Approve" }).click();
  const exported = await exportPromise;
  console.log("export:", exported.content?.[0]?.text?.slice(0, 200), "isError=", exported.isError);
  await sleep(5000);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const path = await video.path();
    const dest = join(OUT_DIR, "faraday-demo.webm");
    await rename(path, dest);
    console.log("recorded:", dest);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
