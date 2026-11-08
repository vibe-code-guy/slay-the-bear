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

/** Hold the strike button for `ms` and let go: one hit. */
async function strike(page: Page, ms = 600) {
  const btn = page.getByRole("button", { name: /Hold to charge/ });
  await btn.waitFor({ timeout: 90_000 });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  // a returning player: no tutorial bubbles in front of the buttons
  await ctx.addInitScript("localStorage.setItem('slay-tutorial-v1', 'done')");
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  // Simulation: join, strike, skip to the deadline, watch the wheel, verify the raid.
  await page.goto(`${url}/?mode=sim`);
  await page.getByRole("button", { name: /Start the simulation/ }).click();
  await strike(page);
  await page.getByText(/^Raid #\d+$/).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "sim-raid");
  await page.getByRole("button", { name: "to the deadline" }).click();
  // spin the wheel once the beacon is out, as a player would
  await page.getByRole("button", { name: /Spin the Wheel of Fate/ }).click({ timeout: 30_000 });
  await page.getByText(/: the town won|: the Bear won/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await shot(page, "sim-settled");
  // past raids are in the Tavern; each one can be verified in the browser
  await page.getByRole("button", { name: "Tavern" }).click();
  await page.getByRole("tab", { name: /Past raids/ }).click();
  const verifyButtons = page.getByRole("button", { name: "Verify" });
  if (await verifyButtons.count()) {
    await verifyButtons.first().click();
    await page.getByText(/checks out|failed for raid/).waitFor({ timeout: 15000 });
    await shot(page, "sim-verify");
  } else {
    errors.push("no Verify button under the Tavern's past raids");
  }
  await page.keyboard.press("Escape");

  if (flag("live")) {
    await page.goto(`${url}/?mode=live`);
    await page.getByRole("button", { name: /Play as a guest/ }).click({ timeout: 30000 });
    await page
      .locator('button[aria-label*="Hold to charge"], button:has-text("Claim your starter pouch"), button:has-text("Spin the Wheel of Fate"), button:has-text("drand beacon in")')
      .first()
      .waitFor({ timeout: 90000 });
    await page.waitForTimeout(3000);
    await shot(page, "live-joined");
    const pouch = page.getByRole("button", { name: /Claim your starter pouch/ });
    if (await pouch.count()) {
      await pouch.click();
      await page.waitForTimeout(6000);
    }
    const hold = page.getByRole("button", { name: /Hold to charge/ });
    const spin = page.getByRole("button", { name: /Spin the Wheel of Fate/ });
    if ((await hold.count()) && (await hold.isEnabled())) {
      await strike(page, 300);
      await page.waitForTimeout(9000);
    } else if ((await spin.count()) && (await spin.isEnabled())) {
      await spin.click();
      await page.waitForTimeout(12000);
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
