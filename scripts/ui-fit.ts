// Does the game fit the screen? Opens the town in the offline simulation at several window sizes,
// checks that the play button is on screen, strikes once, and checks that the HUD, the scene and
// the strike button are on screen without scrolling or zooming. Saves screenshots per size.
//   npx tsx scripts/ui-fit.ts --url http://localhost:3100 [--out dir] [--sizes 1024x468,1366x650]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3100");
const out = arg("out", join(process.env.TEMP ?? ".", "slay-fit"));
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sizes = arg("sizes", "1024x468,1280x600,1366x650,1440x780,1536x740,1920x950,1360x925,768x1024,844x390,667x375,390x844,375x667")
  .split(",")
  .map((s) => s.split("x").map(Number) as [number, number]);

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  let failures = 0;
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // a fresh player: the tutorial shows, as it would for a newcomer
    await page.goto(`${url}/?mode=sim`);
    const name = `${width}x${height}`;
    const start = page.getByRole("button", { name: /Start the simulation/ });
    await start.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `${name}-title.png`) });
    // the play button must be on screen without scrolling
    const sb = (await start.boundingBox())!;
    const startVisible = sb.y >= 0 && sb.y + sb.height <= height;
    // click where it is, so a click can't scroll the page for us
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    const hold = page.getByRole("button", { name: /Hold to charge/ });
    await hold.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const b = (await hold.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    // a string, so tsx's helpers (e.g. __name) don't end up inside the page
    const m = (await page.evaluate(`(() => {
      const r = (el) => {
        if (!el) return null;
        const x = el.getBoundingClientRect();
        return { top: x.top, bottom: x.bottom, left: x.left, right: x.right, width: x.width, height: x.height };
      };
      return {
        scene: r(document.querySelector(".scene-box")),
        hold: r(document.querySelector('button[aria-label*="Hold to charge"]')),
        controls: r(document.querySelector(".controls")),
        hud: r(document.querySelector("[data-tour=menu]")),
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight,
      };
    })()`)) as { scene: Box | null; hold: Box | null; controls: Box | null; hud: Box | null; overflowX: number; scrollY: number; innerHeight: number };
    await page.screenshot({ path: join(out, `${name}.png`) });
    const s = m.scene!;
    const h = m.hold!;
    const hud = m.hud!;
    const fits =
      startVisible &&
      m.scrollY === 0 &&
      hud.top >= 0 &&
      h.bottom <= m.innerHeight &&
      h.top >= 0 &&
      s.top >= hud.bottom &&
      s.bottom <= m.innerHeight + 0.5;
    const layout = m.controls && m.controls.left >= s.right - 1 ? "side" : "stacked";
    if (!fits || m.overflowX > 0 || errors.length) failures++;
    console.log(
      `${fits ? "FITS" : "SCROLL"} ${name.padEnd(9)} ${layout.padEnd(7)} hud ${Math.round(hud.top)}..${Math.round(hud.bottom)}, ` +
        `scene ${Math.round(s.width)}x${Math.round(s.height)} (${(s.width / s.height).toFixed(2)}:1, ` +
        `${Math.round(s.top)}..${Math.round(s.bottom)}), hold ${Math.round(h.top)}..${Math.round(h.bottom)}` +
        `${startVisible ? "" : ", PLAY BUTTON OFF SCREEN"}${m.scrollY ? `, SCROLLED ${Math.round(m.scrollY)}px` : ""}` +
        `${m.overflowX > 0 ? `, OVERFLOW ${m.overflowX}px` : ""}${errors.length ? `, errors: ${errors.join("; ")}` : ""}`,
    );
    await page.close();
  }
  await browser.close();
  console.log(failures ? `${failures} size(s) need attention` : "every size fits");
  if (failures) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
