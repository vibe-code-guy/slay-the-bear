"use client";
// The smith's shop. The smith is an NPC that lives in the contract: it sells club charges at a
// price that rises as its stock falls (and 20% more right after a Bear win), buys wood and iron,
// and forges clubs from its own wood at each raid's open. Half of every sale is burned.
import { useState } from "react";
import { isMaterial, smithForgeBundles, type GameConfig, type PlayerJson, type StatusJson } from "@slay/rules";
import { Coin, ItemArt } from "../ItemArt";
import { SectionTitle } from "./ItemCard";
import { slay } from "@/lib/format";
import { play } from "@/lib/sfx";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;

export function SmithPanel({ config, status, player, pending, act }: { config: GameConfig; status: StatusJson; player: PlayerJson | null; pending: string | null; act: Act }) {
  const [qty, setQty] = useState(5);
  const price = BigInt(status.club_price);
  const stock = BigInt(status.smith_clubs);
  const wood = BigInt(status.smith_wood);
  const plan = smithForgeBundles(config, stock, wood, BigInt(status.smith_balance));
  const mats = (player?.items ?? []).filter(([t, n]) => isMaterial(t) && n !== "0");
  const q = BigInt(qty);
  const cost = q * price;
  const say =
    stock * 2n >= config.smith.clubTargetStock
      ? `I have ${stock} club charges. Each one hits a quarter harder.`
      : plan > 0n
        ? `Stock is low. At the next raid I forge ${plan * 10n} charges from ${plan * 2n} of my wood.`
        : `Stock is low and I have only ${wood} wood. Sell me some!`;

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="h-32 w-28 shrink-0">
          <SmithArt />
        </div>
        <div className="relative flex-1 rounded-2xl border-2 border-night bg-parch px-3 py-2 text-sm font-semibold text-night">
          “{say}”{status.bear_won_last && " Prices are up 20%: the town is scared since the Bear won."}
          <span className="absolute -left-2 top-6 h-4 w-4 rotate-45 border-b-2 border-l-2 border-night bg-parch" aria-hidden />
        </div>
      </div>

      <SectionTitle note={`${stock.toString()} in stock`}>Buy club charges</SectionTitle>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-edge bg-black/30 p-3">
        <div className="h-16 w-16">
          <ItemArt id="club" />
        </div>
        <div className="text-sm">
          <div className="font-bold">Club charge · ×1.25 damage</div>
          <div className="flex items-center gap-1 text-dim">
            <Coin className="h-4 w-4" /> {slay(price, 2)} $SLAY each
          </div>
        </div>
        {player && (
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-lg border border-edge">
              <button type="button" className="px-3 py-1.5 hover:bg-hide" onClick={() => setQty((x) => Math.max(1, x - 1))} aria-label="One less">
                −
              </button>
              <span className="w-10 text-center font-mono">{qty}</span>
              <button type="button" className="px-3 py-1.5 hover:bg-hide" onClick={() => setQty((x) => Math.min(99, x + 1))} aria-label="One more">
                +
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary flex items-center gap-1 px-3 py-2"
              disabled={q > stock || BigInt(player.balance) < cost || !!pending}
              onClick={async () => {
                const r = await act({ method: "buy_from_smith", qty: q }, "Buy clubs", `Bought ${qty} club charges`);
                if (r.ok) play("clank");
              }}
            >
              Buy for <Coin className="h-4 w-4" /> {slay(cost, 2)}
            </button>
          </div>
        )}
      </div>

      <SectionTitle note="Lower as its stock grows">Sell materials</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["wood", "iron"] as const).map((m) => {
          const n = mats.find(([t]) => t === m)?.[1] ?? "0";
          const each = BigInt(m === "wood" ? status.wood_price : status.iron_price);
          return (
            <div key={m} className="flex items-center gap-3 rounded-xl border border-edge bg-black/30 p-3">
              <div className="h-12 w-12">
                <ItemArt id={m} />
              </div>
              <div className="flex-1 text-sm">
                <div className="font-bold capitalize">{m}</div>
                <div className="text-xs text-dim">
                  {slay(each, 2)} $SLAY each · you have {n}
                </div>
              </div>
              <button
                type="button"
                className="btn px-3 py-1.5 text-sm"
                disabled={!player || n === "0" || !!pending}
                onClick={async () => {
                  const r = await act({ method: "sell_to_smith", token: m, qty: BigInt(n) }, "Sell", `Sold ${n} ${m}`);
                  if (r.ok) play("coin");
                }}
              >
                Sell all
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-dim">
        The smith holds {slay(status.smith_balance)} $SLAY, {status.smith_wood} wood and {status.smith_iron} iron, all in the contract. Half of what you pay is burned.
      </p>
    </div>
  );
}

/** The smith: a burly NPC in a leather apron, hammer in hand. */
function SmithArt() {
  return (
    <svg viewBox="0 0 100 130" className="h-full w-full" aria-hidden>
      <ellipse cx="50" cy="124" rx="30" ry="5" fill="#000" opacity="0.35" />
      <rect x="35" y="96" width="11" height="24" rx="3" fill="#1f160e" />
      <rect x="54" y="96" width="11" height="24" rx="3" fill="#1f160e" />
      <path d="M26 60 L74 60 L80 104 L20 104 Z" fill="#7c2d12" />
      <path d="M34 62 L66 62 L70 104 L30 104 Z" fill="#78350f" stroke="#451a03" strokeWidth="1.5" />
      <rect x="44" y="72" width="12" height="10" rx="2" fill="#451a03" />
      <rect x="16" y="62" width="13" height="32" rx="6" fill="#d6a77a" transform="rotate(12 22 62)" />
      <circle cx="50" cy="40" r="19" fill="#d6a77a" />
      <path d="M32 44 Q50 70 68 44 Q64 58 50 60 Q36 58 32 44 Z" fill="#57534e" />
      <path d="M33 34 Q50 16 67 34 Q58 28 50 28 Q42 28 33 34 Z" fill="#292524" />
      <circle cx="43" cy="40" r="2.2" fill="#1b120a" />
      <circle cx="57" cy="40" r="2.2" fill="#1b120a" />
      <path d="M41 35 L46 36 M54 36 L59 35" stroke="#1b120a" strokeWidth="2" strokeLinecap="round" />
      <g className="smith-hammer">
        <rect x="70" y="60" width="13" height="30" rx="6" fill="#d6a77a" transform="rotate(-30 76 60)" />
        <rect x="82" y="34" width="5" height="40" rx="2" fill="#78350f" transform="rotate(20 84 54)" />
        <rect x="80" y="26" width="20" height="12" rx="2" fill="#6b7280" stroke="#374151" strokeWidth="1.5" transform="rotate(20 90 32)" />
      </g>
    </svg>
  );
}
