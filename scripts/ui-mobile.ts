// Screenshot the town at phone size in simulation mode.
//   npx tsx scripts/ui-mobile.ts --url http://localhost:3123 --out <dir>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-ui-mobile"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${url}/?mode=sim`);
await page.getByRole("button", { name: /Start the simulation/ }).click();
await page.getByText("Your pouch").waitFor();
await page.getByRole("button", { name: /Hit for/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, "mobile.png"), fullPage: false });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log(`horizontal overflow: ${overflow}px; errors: ${errors.length ? errors.join("; ") : "none"}`);
await browser.close();
