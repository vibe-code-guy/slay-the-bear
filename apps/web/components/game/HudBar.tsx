"use client";
// The bar above the raid: your hero and level, the game menu (each entry opens a panel over the
// town), your $SLAY, and the switch between the live game and the offline simulation.
import { useEffect, useRef, useState } from "react";
import { ONE } from "@slay/rules";
import { Hero, type HeroLook } from "./Hero";
import { Coin } from "./ItemArt";
import { levelOf } from "./Progress";
import { slay } from "@/lib/format";

export type PanelId = "backpack" | "forge" | "market" | "smith" | "trophies" | "tavern" | "help";

/** label: the panel's title; short: under the icon in the HUD; mini: the same on phones */
export const MENU: { id: PanelId; icon: string; label: string; short: string; mini?: string; hint: string }[] = [
  { id: "backpack", icon: "🎒", label: "Backpack", short: "Backpack", mini: "Bag", hint: "Your items, trophies and achievements" },
  { id: "forge", icon: "🔨", label: "Forge", short: "Forge", hint: "Turn wood, iron and trophies into weapons" },
  { id: "market", icon: "🏷️", label: "Market", short: "Market", hint: "Trade items with other players" },
  { id: "smith", icon: "⚒️", label: "Smith", short: "Smith", hint: "Buy club charges, sell materials" },
  { id: "trophies", icon: "🏆", label: "Trophies", short: "Trophies", mini: "Trophy", hint: "Every one-of-one Bear trophy and who holds it" },
  { id: "tavern", icon: "🍺", label: "Tavern", short: "Tavern", hint: "Leaderboard, town news and past raids" },
  { id: "help", icon: "📜", label: "How to play", short: "Guide", hint: "How to play: the rules in one minute" },
];

/** A number that counts up or down to its new value. */
function useTween(target: number, ms = 700) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

export function HudBar({
  mode,
  liveAvailable,
  choose,
  account,
  balance,
  damage,
  dots,
  onOpen,
  sim,
  contractUrl,
  accountUrl,
  look,
}: {
  /** the gear your hero has earned, drawn in the portrait */
  look?: HeroLook;
  mode: "live" | "sim";
  liveAvailable: boolean;
  choose: (m: "live" | "sim") => void;
  account: string | null;
  balance: bigint | null;
  /** your raw damage over the counted raids, base units */
  damage: bigint;
  /** small badges on menu entries, e.g. trophies you hold */
  dots: Partial<Record<PanelId, number>>;
  onOpen: (p: PanelId) => void;
  sim: React.ReactNode;
  contractUrl: string | null;
  accountUrl: string | null;
}) {
  const lv = levelOf(Number(damage / ONE));
  const coins = useTween(balance === null ? 0 : Number(balance / (ONE / 100n)) / 100);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const last = useRef<bigint | null>(balance);
  useEffect(() => {
    if (balance === null || last.current === null) {
      last.current = balance;
      return;
    }
    if (balance !== last.current) {
      setFlash(balance > last.current ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 900);
      last.current = balance;
      return () => clearTimeout(t);
    }
  }, [balance]);

  const R = 19;
  const C = 2 * Math.PI * R;
  return (
    <div className="hud-bar flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3" data-tour="menu">
      {/* you */}
      <button
        type="button"
        className="group flex min-w-0 items-center gap-2 rounded-full pr-2 text-left max-md:pr-0 compact:pr-0"
        onClick={() => onOpen("backpack")}
        aria-label={account ? `Your hero: level ${lv.level} ${lv.title}. Open the backpack` : "Open the backpack"}
        title={account ? `${lv.toNext} more damage to level ${lv.level + 1}` : "Join to start levelling up"}
      >
        <span className="relative block h-11 w-11 shrink-0">
          <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle cx="22" cy="22" r={R} fill="#2e241b" stroke="#4a3a2a" strokeWidth="3" />
            <circle cx="22" cy="22" r={R} fill="none" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (account ? lv.progress : 0))} />
          </svg>
          <span className="absolute inset-[5px] overflow-hidden rounded-full bg-[#3a2d21]">
            <span className="absolute left-1/2 top-[2px] block h-[46px] w-[36px] -translate-x-1/2">
              <Hero kind="you" look={look} />
            </span>
          </span>
          {account && (
            <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-night bg-ember px-1 text-[10px] font-black text-night">
              {lv.level}
            </span>
          )}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight md:flex compact:hidden lg:hidden xl:flex">
          <span className="truncate text-sm font-bold group-hover:text-ember">{account ? lv.title : "Newcomer"}</span>
          <span className="text-[11px] text-dim">{account ? `Level ${lv.level} · ${Math.round(lv.progress * 100)}%` : "not in town yet"}</span>
        </span>
      </button>

      {/* the game menu: icon over a short label, like a game's tab bar; a full-width row on
          phones, icons only in the HUD row on short narrow windows */}
      <nav
        className="order-last flex w-full gap-1 compact:order-none compact:w-auto compact:flex-1 compact:justify-center lg:order-none lg:w-auto lg:flex-1 lg:justify-center"
        aria-label="Game menu"
      >
        {MENU.map((m) => (
          <button
            key={m.id}
            type="button"
            className="hud-btn relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-edge bg-bark px-1 py-1 text-parch hover:border-ember hover:bg-hide compact:h-10 compact:max-w-12 lg:w-[3.6rem] lg:flex-none"
            onClick={() => onOpen(m.id)}
            title={m.hint}
            aria-label={m.label}
            data-hud={m.id}
          >
            <span className="text-lg leading-none" aria-hidden>
              {m.icon}
            </span>
            <span className="max-w-full truncate text-[10px] font-semibold leading-tight compact:hidden" aria-hidden>
              <span className="sm:hidden">{m.mini ?? m.short}</span>
              <span className="max-sm:hidden">{m.short}</span>
            </span>
            {!!dots[m.id] && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blood px-1 text-[10px] font-black text-white">{dots[m.id]}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {account && balance !== null && (
          <span
            data-coin-target
            className={`flex items-center gap-1.5 rounded-full border border-edge bg-bark py-1 pl-1 pr-3 text-sm font-bold transition-colors ${flash === "up" ? "coin-up border-moss" : flash === "down" ? "border-blood" : ""}`}
            title={`${slay(balance, 2)} $SLAY`}
          >
            <Coin className="h-6 w-6" />
            <span className="font-mono tabular-nums">{Math.floor(coins).toLocaleString("en-US")}</span>
            <span className="hidden text-xs font-normal text-dim lg:inline">$SLAY</span>
          </span>
        )}
        {/* icons only below laptop width; the names are in the title and the aria label */}
        <div className="inline-flex overflow-hidden rounded-full border border-edge text-xs">
          <button
            type="button"
            className={`px-2.5 py-1.5 ${mode === "live" ? "bg-ember font-bold text-night" : "bg-bark text-dim hover:text-parch"}`}
            disabled={!liveAvailable}
            onClick={() => choose("live")}
            aria-label="Live on NEAR testnet"
            title="Live: the real game on NEAR testnet"
          >
            🌐<span className="max-lg:hidden"> Live</span>
          </button>
          <button
            type="button"
            className={`px-2.5 py-1.5 ${mode === "sim" ? "bg-ember font-bold text-night" : "bg-bark text-dim hover:text-parch"}`}
            onClick={() => choose("sim")}
            aria-label="Offline simulation"
            title="Offline: the same rules in your browser, nothing on the network"
          >
            🧪<span className="max-lg:hidden"> Offline</span>
          </button>
        </div>
        {mode === "live" && (contractUrl || accountUrl) && (
          <a className="hidden text-xs text-dim hover:text-parch lg:inline" href={accountUrl ?? contractUrl!} target="_blank" rel="noreferrer" title="Open on the NEAR explorer">
            {accountUrl ? "your account ↗" : "contract ↗"}
          </a>
        )}
      </div>
      {sim}
    </div>
  );
}
