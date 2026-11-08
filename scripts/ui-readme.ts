// The README's screenshots: the live town mid-raid as a guest, the Trophy Hall and the market on
// the live game, and a loot chest from the offline simulation.
//   npx tsx scripts/ui-readme.ts --url http://localhost:3123 [--out docs/img]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const out = arg("out", "docs/img");
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`saved ${join(out, `${name}.png`)}`);
}

/** Click where a button is, so the click can't scroll the page. */
async function press(page: Page, name: RegExp | string) {
  const b = page.getByRole("button", { name });
  await b.waitFor({ timeout: 90_000 });
  const box = (await b.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function strike(page: Page, ms: number) {
  const box = (await page.getByRole("button", { name: /Hold to charge/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript("localStorage.setItem('slay-tutorial-v1', 'done')");
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // live: a guest strikes into an open raid (waits for the villagers to open one if needed)
  await page.goto(`${url}/?mode=live`);
  await press(page, /Play as a guest/);
  const hold = page.getByRole("button", { name: /Hold to charge/ });
  await page.locator('button[aria-label*="Hold to charge"], button:has-text("Claim your starter pouch")').first().waitFor({ timeout: 90_000 });
  const pouch = page.getByRole("button", { name: /Claim your starter pouch/ });
  if (await pouch.count()) {
    await press(page, /Claim your starter pouch/);
    await hold.waitFor({ timeout: 60_000 });
  }
  for (let i = 0; i < 80; i++) {
    const open = await page.getByText(/^Raid #\d+$/).count();
    if (open && (await hold.isEnabled())) break;
    await page.waitForTimeout(5000);
  }
  await page.waitForTimeout(1500);
  await strike(page, 700);
  await page.waitForTimeout(9000);
  await shot(page, "town");

  for (const [name, file] of [
    ["Trophies", "trophies"],
    ["Market", "market"],
  ] as const) {
    await page.getByRole("navigation", { name: "Game menu" }).getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(name === "Trophies" ? 7000 : 1500);
    await shot(page, file);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  // offline: strike, skip to the end, spin, and catch the loot chest
  const sim = await ctx.newPage();
  sim.on("pageerror", (e) => errors.push(String(e)));
  await sim.goto(`${url}/?mode=sim`);
  await press(sim, /Start the simulation/);
  await sim.getByRole("button", { name: /Hold to charge/ }).waitFor({ timeout: 60_000 });
  await sim.waitForTimeout(800);
  await strike(sim, 1200);
  await sim.waitForTimeout(2500);
  await press(sim, "to the deadline");
  await press(sim, /Spin the Wheel of Fate/);
  const chest = sim.getByRole("dialog", { name: /Your loot/ });
  if (await chest.waitFor({ timeout: 40_000 }).then(() => true, () => false)) {
    await sim.waitForTimeout(1700);
    await shot(sim, "loot");
  } else console.log("no loot chest this time (the town lost or you got nothing)");

  await browser.close();
  console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no page errors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
