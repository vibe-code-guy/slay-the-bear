// A tour of the game shell in headless Chrome: the title screen, the first strike with the
// tutorial, and every panel of the game menu. Saves a screenshot of each.
//   npx tsx scripts/ui-tour.ts --url http://localhost:3100 [--mode sim|live] [--out dir] [--width 1360] [--height 925]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { arg, flag } from "./lib/near";

const url = arg("url", "http://localhost:3100");
const mode = arg("mode", "sim");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-tour"));
const width = Number(arg("width", "1360"));
const height = Number(arg("height", "925"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function shot(page: Page, name: string, full = false) {
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  console.log(`saved ${name}.png`);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // React's warnings put the details (a key, a component stack) in the arguments
    void Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?"))).then((args) => errors.push([m.text(), ...args.slice(1).map(String)].join(" | ")));
  });

  await page.goto(`${url}/?mode=${mode}`);
  const play = page.getByRole("button", { name: mode === "sim" ? /Start the simulation/ : /Play as a guest/ });
  await play.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot(page, "1-title");

  // --watch: look around without joining (live, nothing is sent)
  if (!flag("watch")) {
    await play.click();
    const hold = page.getByRole("button", { name: /Hold to charge/ });
    await hold.waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1200);
    await shot(page, "2-tutorial-strike");

    const b = (await hold.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(2500);
    await shot(page, "3-tutorial-timer");
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.count()) {
      await gotIt.click();
      await page.waitForTimeout(600);
      await shot(page, "4-tutorial-menu");
      if (await gotIt.count()) await gotIt.click();
    }
  }

  for (const [i, name] of ["Backpack", "Forge", "Market", "Smith", "Trophies", "Tavern", "How to play"].entries()) {
    await page.getByRole("navigation", { name: "Game menu" }).getByRole("button", { name, exact: true }).click();
    await page.getByRole("dialog", { name }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(name === "Trophies" ? 6000 : 700);
    await shot(page, `p${i + 1}-${name.toLowerCase().replace(/ /g, "-")}`);
    if (name === "Trophies") {
      // the first trophy's card, with how its look is derived
      const first = page.locator("[data-trophy]").first();
      if (await first.count()) {
        await first.click();
        await page.waitForTimeout(800);
        await shot(page, `p${i + 1}b-trophy-detail`);
      }
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await browser.close();
  console.log(errors.length ? `errors:\n${[...new Set(errors)].join("\n")}` : "no page errors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
