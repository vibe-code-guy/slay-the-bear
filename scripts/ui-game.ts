// Play one raid of the game scene in headless Chrome and screenshot each moment.
//   npx tsx scripts/ui-game.ts --url http://localhost:3100 [--mode sim|live] [--out dir] [--width 1360] [--height 925]
//   phone: --width 390 --height 844
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3100");
const mode = arg("mode", "sim");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-game"));
const width = Number(arg("width", "1360"));
const height = Number(arg("height", String(Math.round(width * 0.68))));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function shot(page: Page, name: string, full = false) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  console.log(`saved ${name}.png`);
}

async function hold(page: Page, ms: number) {
  const btn = page.getByRole("button", { name: /Hold to charge/ });
  // disabled while a move is pending or the wheel is still turning
  for (let i = 0; i < 120 && !(await btn.isEnabled()); i++) await page.waitForTimeout(500);
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${url}/?mode=${mode}`);
  await page.getByRole("button", { name: mode === "sim" ? /Start the simulation/ : /Play as a guest/ }).click({ timeout: 60_000 });
  // live, the raid may already be over and waiting for its wheel spin
  await page
    .locator('button[aria-label*="Hold to charge"], button:has-text("Spin the Wheel of Fate"), button:has-text("drand beacon in")')
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot(page, "1-idle");
  const canStrike = (await page.getByRole("button", { name: /Hold to charge/ }).count()) > 0;

  if (canStrike) {
    await hold(page, 900);
    await page.waitForTimeout(350);
    await shot(page, "2-strike");
    if (mode === "live") {
      // the strike is a real transaction: wait for the raid to show up (or say why it didn't)
      try {
        await page.getByText(/^Raid #\d+$/).waitFor({ timeout: 60_000 });
      } catch (e) {
        const toasts = await page.locator("[aria-live=polite]").innerText().catch(() => "");
        throw new Error(`the strike did not open a raid. Toasts: ${toasts || "none"}`, { cause: e });
      }
    }
    await page.waitForTimeout(2500);
    await shot(page, "3-raid", true);
  }

  if (mode === "sim") {
    await page.getByRole("button", { name: "+30 s" }).click();
    await page.waitForTimeout(2500);
    await hold(page, 400);
    await page.waitForTimeout(400);
    await shot(page, "4-second-strike");
    await page.getByRole("button", { name: "to the deadline" }).click();
    await page.waitForTimeout(1200);
    await shot(page, "5-times-up");
    // spin the wheel yourself once the beacon is out (the keeper waits 15 s for a player)
    const spin = page.getByRole("button", { name: /Spin the Wheel of Fate/ });
    await spin.waitFor({ timeout: 30_000 });
    await shot(page, "5b-ready");
    await spin.click();
    await page.waitForTimeout(1500);
    await shot(page, "6-wheel-spin");
    await page.getByText(/^(VICTORY!|THE BEAR WINS)$/).waitFor({ timeout: 30_000 });
    await shot(page, "7-result", true);
    // a won raid opens your loot chest after the banner, if the beacon gave you anything
    const chest = page.getByRole("dialog", { name: /Your loot/ });
    if (await chest.waitFor({ timeout: 6000 }).then(() => true, () => false)) {
      await page.waitForTimeout(1600);
      await shot(page, "7a-loot");
      // a click closes it: the items fly to the backpack
      await chest.click();
      await page.waitForTimeout(300);
      await shot(page, "7a-fly");
    }
    // the result card comes in once the VICTORY / THE BEAR WINS banner (and the chest) has gone
    await page.getByText(/: the town won|: the Bear won/).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await shot(page, "7b-card");
    const claim = page.getByRole("button", { name: /Claim \+/ });
    if (await claim.count()) {
      await shot(page, "7c-claim-ready");
      await claim.first().click();
      await page.waitForTimeout(700);
      await shot(page, "8-claim");
    }
    await page.waitForTimeout(1000);
    // a newcomer's tutorial ends with the first raid: "done" once the loot is claimed (or lost)
    console.log(`tutorial: ${await page.evaluate("localStorage.getItem('slay-tutorial-v1')")}, bubbles left: ${await page.getByRole("dialog", { name: /^Tutorial/ }).count()}`);
  } else {
    // live: sit out the real raid, then settle it from the UI with the drand beacon
    if (canStrike) {
      // by now the villagers (woken by the page's /api/tick) have usually charged in
      await page.waitForTimeout(45_000);
      await shot(page, "4-mid-raid");
      await page.getByText("TIME'S UP!").waitFor({ timeout: 10 * 60_000 });
      await shot(page, "5-times-up");
    }
    const spin = page.getByRole("button", { name: /Spin the Wheel of Fate/ });
    await spin.waitFor({ timeout: 120_000 });
    await shot(page, "5b-ready");
    await spin.click();
    await page.waitForTimeout(1500);
    await shot(page, "6-wheel-spin");
    try {
      await page.getByText(/^(VICTORY!|THE BEAR WINS)$/).waitFor({ timeout: 90_000 });
    } catch (e) {
      await shot(page, "6-failed", true);
      const toasts = await page.locator("[aria-live=polite]").innerText().catch(() => "");
      throw new Error(`no result after the spin. Toasts: ${toasts || "none"}`, { cause: e });
    }
    await shot(page, "7-result", true);
    await page.getByText(/: the town won|: the Bear won/).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);
    await shot(page, "7b-card");
    const claim = page.getByRole("button", { name: /Claim \+/ });
    if (await claim.count()) {
      await claim.first().click();
      await page.waitForTimeout(8000);
      await shot(page, "8-claim", true);
    }
  }
  await browser.close();
  console.log(errors.length ? `errors:\n${[...new Set(errors)].join("\n")}` : "no page errors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
