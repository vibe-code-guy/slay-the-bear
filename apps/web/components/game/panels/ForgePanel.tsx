"use client";
// The forge: turn materials (and, for the Bear-slayer, a trophy) into weapon charges. The hammer
// keeps falling while the transaction is on its way; the new weapon is revealed when it lands.
import { useEffect, useRef, useState } from "react";
import { RECIPES, WEAPON_MULT_BPS, type PlayerJson, type RecipeId } from "@slay/rules";
import { Coin, ItemArt } from "../ItemArt";
import { SectionTitle } from "./ItemCard";
import { itemTitle } from "@/lib/items";
import { trophyTraits } from "@/lib/trophy";
import { slay } from "@/lib/format";
import { play } from "@/lib/sfx";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;

export function ForgePanel({ player, pending, act, randomness }: { player: PlayerJson | null; pending: string | null; act: Act; randomness: Map<string, string> }) {
  const [working, setWorking] = useState<RecipeId | null>(null);
  const [made, setMade] = useState<RecipeId | null>(null);
  const [trophy, setTrophy] = useState<string | null>(null);
  const hammer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (hammer.current && clearInterval(hammer.current)), []);

  if (!player) return <p className="text-dim">Join the town to use the forge.</p>;
  const have = (t: string) => BigInt(player.items.find(([x]) => x === t)?.[1] ?? "0");
  const bal = BigInt(player.balance);
  const chosen = trophy && player.trophies.includes(trophy) ? trophy : (player.trophies[0] ?? null);

  const forge = async (id: RecipeId) => {
    setWorking(id);
    play("clank");
    hammer.current = setInterval(() => play("clank", 0.9 + Math.random() * 0.25), 420);
    const r = RECIPES[id];
    const res = await act({ method: "craft", recipe: id, trophy: r.trophy ? chosen : null }, "Forge", "");
    if (hammer.current) clearInterval(hammer.current);
    setWorking(null);
    if (res.ok) {
      setMade(id);
      play("fanfare");
      setTimeout(() => setMade((m) => (m === id ? null : m)), 2600);
    }
  };

  return (
    <div className="relative">
      <p className="text-sm text-dim">Crafting burns the inputs and a $SLAY fee, on-chain. Weapons come in charges; each hit spends one.</p>

      <div className="mt-3 grid gap-3">
        {(Object.keys(RECIPES) as RecipeId[]).map((id) => {
          const r = RECIPES[id];
          const needs: { id: string; have: bigint; need: bigint; label: string }[] = [];
          if (r.wood) needs.push({ id: "wood", have: have("wood"), need: r.wood, label: "wood" });
          if (r.iron) needs.push({ id: "iron", have: have("iron"), need: r.iron, label: "iron" });
          if (r.trophy) needs.push({ id: chosen ?? "trophy-0-0", have: BigInt(player.trophies.length), need: 1n, label: "trophy" });
          const feeOk = bal >= r.fee;
          const ok = feeOk && needs.every((n) => n.have >= n.need);
          const missing = needs.filter((n) => n.have < n.need).map((n) => `${n.need - n.have} ${n.label}`);
          if (!feeOk) missing.push(`${slay(r.fee - bal)} $SLAY`);
          return (
            <div key={id} className={`forge-row relative overflow-hidden rounded-xl border p-3 ${working === id ? "forge-working border-ember" : "border-edge"} bg-black/30`}>
              {/* what goes in and what comes out (wraps on a narrow panel), then the button */}
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  {needs.map((n) => (
                    <div key={n.label} className="flex items-center gap-1">
                      <div className={`relative h-12 w-12 ${n.have >= n.need ? "" : "opacity-40 grayscale"}`}>
                        <ItemArt id={n.id} randomness={n.label === "trophy" ? randomness.get(n.id) : undefined} />
                      </div>
                      <span className={`text-xs font-bold ${n.have >= n.need ? "text-moss" : "text-blood"}`}>
                        {n.have.toString()}/{n.need.toString()}
                      </span>
                      <span className="ml-1 text-dim">+</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <Coin className="h-8 w-8" />
                    <span className={`text-xs font-bold ${feeOk ? "text-moss" : "text-blood"}`}>{slay(r.fee)}</span>
                  </div>
                  <span className="text-2xl text-dim">→</span>
                  <div className="flex items-center gap-2">
                    <div className={`relative h-16 w-16 ${made === id ? "forge-reveal" : ""}`}>
                      <ItemArt id={id} />
                    </div>
                    <div>
                      <div className="font-bold">
                        {r.charges.toString()} × {itemTitle(id)}
                      </div>
                      <div className="text-xs text-dim">×{Number(WEAPON_MULT_BPS[id]) / 10_000} damage per hit</div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <button type="button" className="btn btn-primary px-4 py-2 font-bold" disabled={!ok || !!pending || !!working} onClick={() => void forge(id)}>
                    {working === id ? "🔨 Forging…" : made === id ? "✓ Forged!" : "🔨 Forge"}
                  </button>
                  {!ok && <span className="text-[11px] text-dim">Need {missing.join(", ")}</span>}
                </div>
              </div>
              {working === id && <ForgeSparks />}
              {made === id && (
                <div className="forge-banner pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-black text-[#fde68a]">
                  +{r.charges.toString()} {itemTitle(id)} charges!
                </div>
              )}
            </div>
          );
        })}
      </div>

      {player.trophies.length > 1 && (
        <>
          <SectionTitle note="The Bear-slayer burns one">Which trophy to forge</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {player.trophies.map((t) => {
              const tr = trophyTraits(t, randomness.get(t));
              return (
                <button key={t} type="button" onClick={() => setTrophy(t)} className={`w-24 rounded-xl border p-1 text-center text-[11px] ${chosen === t ? "border-ember" : "border-edge"}`} aria-pressed={chosen === t}>
                  <div className="mx-auto h-16 w-16">
                    <ItemArt id={t} randomness={randomness.get(t)} />
                  </div>
                  {tr.name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ForgeSparks() {
  return (
    <div className="pointer-events-none absolute right-24 top-1/2 h-0 w-0" aria-hidden>
      <div className="forge-hammer absolute -left-6 -top-10 text-3xl">🔨</div>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="forge-spark absolute h-1 w-1 rounded-full bg-yellow-300" style={{ ["--a" as string]: `${i * 45}deg`, animationDelay: `${(i % 4) * 0.1}s` }} />
      ))}
    </div>
  );
}
