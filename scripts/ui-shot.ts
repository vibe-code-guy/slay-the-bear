// Screenshot one page of the web app after a wait, e.g. the development previews.
//   npx tsx scripts/ui-shot.ts --url http://localhost:3100/dev/loot [--wait 2500] [--out file.png] [--width 1360] [--height 925]
import { join } from "node:path";
import { chromium } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3100/");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-shot.png"));
const wait = Number(arg("wait", "2500"));
const width = Number(arg("width", "1360"));
const height = Number(arg("height", "925"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`saved ${out}${errors.length ? `\nerrors:\n${errors.join("\n")}` : ""}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
