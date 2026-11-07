// Drive the web app in a real browser (the system Chrome) and save screenshots.
//   npx tsx scripts/ui-check.ts --url http://localhost:3123 --out <dir> [--live]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { arg, flag } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-ui"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  // Simulation: join, hit, skip to the deadline, see the result.
  await page.goto(`${url}/?mode=sim`);
  await page.getByRole("button", { name: /Start the simulation/ }).click();
  await page.getByText("Your pouch").waitFor();
  await page.getByRole("button", { name: /Hit for/ }).click();
  await page.getByText("Raid board").waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "sim-raid");
  await page.getByRole("button", { name: "to the deadline" }).click();
  await page.waitForTimeout(8000);
  await shot(page, "sim-settled");
  const verifyButtons = page.getByRole("button", { name: "Verify" });
  if (await verifyButtons.count()) {
    await verifyButtons.first().click();
    await page.getByText(/checks out|failed for raid/).waitFor({ timeout: 15000 });
    await shot(page, "sim-verify");
  }

  if (flag("live")) {
    await page.goto(`${url}/?mode=live`);
    await page.getByRole("button", { name: /Play as a guest/ }).click({ timeout: 30000 });
    await page.getByText("Your pouch").waitFor({ timeout: 90000 });
    await page.waitForTimeout(3000);
    await shot(page, "live-joined");
    const hit = page.getByRole("button", { name: /Hit for/ });
    if (await hit.isEnabled()) {
      await hit.click();
      await page.waitForTimeout(9000);
    } else {
      const settle = page.getByRole("button", { name: /Settle with the drand beacon/ });
      if (await settle.count()) {
        await settle.click();
        await page.waitForTimeout(9000);
      }
    }
    await shot(page, "live-after-move");
    await page.goto(`${url}/verify`);
    await page.getByText(/checks out|failed for raid|No raid has been settled/).waitFor({ timeout: 30000 });
    await shot(page, "live-verify");
  }

  await page.goto(`${url}/rules`);
  await shot(page, "rules");
  await page.goto(`${url}/fast-forward`);
  await page.getByRole("button", { name: "Run" }).click();
  await page.getByText("Raid by raid").waitFor({ timeout: 60000 });
  await shot(page, "fast-forward");

  await browser.close();
  console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
