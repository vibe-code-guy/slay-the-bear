"use client";
// Small things that fly across the page to a part of the HUD: coins to the coin counter, loot
// to the backpack. Purely visual: what they stand for has already happened on-chain.

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COIN_SVG =
  '<svg viewBox="0 0 20 20" width="100%" height="100%"><circle cx="10" cy="10" r="9" fill="#f59e0b" stroke="#92400e" stroke-width="1.6"/><circle cx="10" cy="10" r="5.6" fill="none" stroke="#fde68a" stroke-width="1.4"/><path d="M8 6.5v7M10 6v8M12 6.5v7" stroke="#92400e" stroke-width="1.3" stroke-linecap="round"/></svg>';

/** The HUD part something flies to: the coin counter or the backpack button. */
export type FlyTarget = "coins" | "backpack";
const SELECTOR: Record<FlyTarget, string> = { coins: "[data-coin-target]", backpack: '[data-hud="backpack"]' };

/** A little hop of the target, as if it caught what flew in. */
export function bump(target: FlyTarget) {
  const el = document.querySelector<HTMLElement>(SELECTOR[target]);
  el?.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)" }, { transform: "scale(1)" }], { duration: 360, easing: "cubic-bezier(.3,1.6,.6,1)" });
}

/**
 * Fly `count` copies of a node (or a coin) from a point on the screen to the target, along an
 * arc, then bump the target. Resolves when the last one lands.
 */
export function flyTo(target: FlyTarget, from: { x: number; y: number }, opts: { node?: Element; count?: number; size?: number; spread?: number; ms?: number } = {}): Promise<void> {
  const to = document.querySelector(SELECTOR[target]);
  if (!to || reduced()) {
    if (to) bump(target);
    return Promise.resolve();
  }
  const r = to.getBoundingClientRect();
  const tx = r.left + r.width / 2;
  const ty = r.top + r.height / 2;
  const { count = 1, size = 22, spread = 30, ms = 800 } = opts;
  const flights: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:70;pointer-events:none;will-change:transform`;
    if (opts.node) {
      const copy = opts.node.cloneNode(true) as HTMLElement;
      copy.style.width = "100%";
      copy.style.height = "100%";
      el.appendChild(copy);
    } else el.innerHTML = COIN_SVG;
    document.body.appendChild(el);
    const sx = from.x + (Math.random() - 0.5) * spread;
    const sy = from.y + (Math.random() - 0.5) * spread * 0.6;
    // the top of the arc: above both ends, a little to one side
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 120;
    const my = Math.min(sy, ty) - 60 - Math.random() * 60;
    const at = (x: number, y: number, s: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
    const anim = el.animate(
      [
        { transform: at(sx, sy, 0.6), opacity: 0 },
        { transform: at(sx, sy - 8, 1.1), opacity: 1, offset: 0.12 },
        { transform: at(mx, my, 1), opacity: 1, offset: 0.55 },
        { transform: at(tx, ty, 0.45), opacity: 0.9 },
      ],
      { duration: ms, delay: i * 70, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" },
    );
    flights.push(
      anim.finished.then(
        () => el.remove(),
        () => el.remove(),
      ),
    );
  }
  return Promise.all(flights).then(() => bump(target));
}

/** The middle of an element on the screen. */
export function centerOf(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
