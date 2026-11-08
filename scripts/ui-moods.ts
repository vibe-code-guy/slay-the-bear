// The scene's moods in headless Chrome: your hero winding up while you hold the strike button,
// the last ten seconds of a raid (the Bear rears up, red edges), and the music switched on.
//   npx tsx scripts/ui-moods.ts --url http://localhost:3100 [--out dir]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3100");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-moods"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`saved ${name}.png`);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 925 } });
  await ctx.addInitScript("localStorage.setItem('slay-tutorial-v1', 'done')");
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${url}/?mode=sim`);
  const start = page.getByRole("button", { name: /Start the simulation/ });
  await start.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  const sb = (await start.boundingBox())!;
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  const hold = page.getByRole("button", { name: /Hold to charge/ });
  await hold.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  console.log(`scrolled ${await page.evaluate("window.scrollY")}px after joining`);

  // hold the button: the hero leans back with the weapon raised, in a growing glow
  const b = (await hold.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  console.log(`scrolled ${await page.evaluate("window.scrollY")}px while charging`);
  console.log(
    `aura: ${await page.evaluate(`(() => { const a = document.querySelector('.hero-aura'); if (!a) return 'none'; const s = getComputedStyle(a); const r = a.getBoundingClientRect(); return [s.backgroundImage.slice(0, 80), s.transform, s.opacity, Math.round(r.width) + 'x' + Math.round(r.height)].join(' | '); })()`)}`,
  );
  await shot(page, "1-charging");
  await page.mouse.up();
  await page.waitForTimeout(1500);

  // the music: on, then a moment of it
  await page.getByRole("button", { name: "Turn the music on" }).click();
  await page.waitForTimeout(1500);
  await shot(page, "2-music-on");

  // skip to the last ten seconds
  for (const s of ["+2 min", "+2 min", "+30 s"]) {
    await page.getByRole("button", { name: s }).click();
    await page.waitForTimeout(400);
  }
  const left = await page.evaluate("document.querySelector('.timer-late, [class*=timer]')?.textContent ?? ''");
  console.log(`timer: ${left}`);
  await page.waitForTimeout(19_500);
  await shot(page, "3-final-seconds");

  await page.getByRole("button", { name: "Turn the music off" }).click();
  await browser.close();
  console.log(errors.length ? `errors:\n${[...new Set(errors)].join("\n")}` : "no page errors");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
