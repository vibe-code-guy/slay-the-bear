"use client";
// Raider levels and the Top Slayers board, worked out from the contract's views: every settled
// raid's participants (early and late damage) and settlements. Nothing is stored off-chain, so a
// player's level is the same on every device and anyone can recompute it.
import { useEffect, useMemo, useRef, useState } from "react";
import { ONE, Tactic, lootShare, weight, type ParticipantJson, type PlayerJson, type RoundJson } from "@slay/rules";
import { Hero, heroKindOf } from "./Hero";
import { isVillager, slay, who } from "@/lib/format";
import type { Backend } from "@/lib/types";

const WINDOW = 20;

export interface SlayerRow {
  account: string;
  damage: bigint;
  raids: number;
  wins: number;
  loot: bigint;
}

const TITLES: [number, string][] = [
  [10, "Bear-Slayer"],
  [8, "Champion"],
  [6, "Bear-Hunter"],
  [5, "Veteran"],
  [4, "Warrior"],
  [3, "Raider"],
  [2, "Militia"],
  [1, "Peasant"],
];

/** Level from total raw damage in whole $SLAY: level n needs 100 × (n-1)² damage. */
export function levelOf(damageWhole: number) {
  const level = Math.floor(Math.sqrt(Math.max(0, damageWhole) / 100)) + 1;
  const base = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  return { level, title: TITLES.find(([l]) => level >= l)![1], progress: (damageWhole - base) / (next - base), toNext: next - damageWhole };
}

export function useSlayers(backend: Backend, history: RoundJson[]) {
  const cache = useRef(new Map<number, { round: RoundJson; parts: ParticipantJson[] }>());
  const [version, setVersion] = useState(0);
  const settledIds = history.filter((r) => r.settlement).map((r) => r.id);
  const key = settledIds.join(",");

  useEffect(() => {
    let off = false;
    (async () => {
      const newest = settledIds[0];
      if (newest === undefined) return;
      const want: number[] = [];
      for (let id = newest; id > Math.max(0, newest - WINDOW); id--) if (!cache.current.has(id)) want.push(id);
      if (want.length === 0) return;
      // rounds beyond the snapshot's history come from get_rounds
      const known = new Map(history.map((r) => [r.id, r]));
      const missing = want.filter((id) => !known.has(id));
      if (missing.length) {
        const older = await backend.rounds(Math.max(...missing) + 1, missing.length).catch(() => [] as RoundJson[]);
        for (const r of older) known.set(r.id, r);
      }
      for (let i = 0; i < want.length; i += 6) {
        const batch = want.slice(i, i + 6);
        const parts = await Promise.all(batch.map((id) => backend.participants(id).catch(() => null)));
        batch.forEach((id, j) => {
          const r = known.get(id);
          if (r?.settlement && parts[j]) cache.current.set(id, { round: r, parts: parts[j]! });
        });
        if (off) return;
      }
      setVersion((v) => v + 1);
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, key]);

  return useMemo(() => {
    const rows = new Map<string, SlayerRow>();
    for (const { round, parts } of cache.current.values()) {
      const s = round.settlement!;
      for (const p of parts) {
        const row = rows.get(p.account) ?? { account: p.account, damage: 0n, raids: 0, wins: 0, loot: 0n };
        row.damage += BigInt(p.early) + BigInt(p.late);
        row.raids += 1;
        if (s.outcome === "win") {
          row.wins += 1;
          row.loot += lootShare(weight(BigInt(p.early), BigInt(p.late), s.tactic as Tactic), BigInt(s.total_weight), BigInt(s.reward));
        }
        rows.set(p.account, row);
      }
    }
    return { rows: [...rows.values()].sort((a, b) => (b.damage > a.damage ? 1 : b.damage < a.damage ? -1 : 0)), raids: cache.current.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}

export function TopSlayers({ rows, raids, account }: { rows: SlayerRow[]; raids: number; account: string | null }) {
  return (
    <section className="card">
      <h3 className="mb-1 text-lg font-bold">🏆 Top slayers</h3>
      <p className="mb-2 text-xs text-dim">
        {raids === 0
          ? "Ranks and levels come from settled raids, read from the contract."
          : `Damage over the last ${raids === 1 ? "settled raid" : `${raids} settled raids`}, read from the contract.`}
      </p>
      <ol className="space-y-1 text-sm">
        {rows.slice(0, 8).map((r, i) => {
          const lv = levelOf(Number(r.damage / ONE));
          return (
            <li key={r.account} className={`flex items-center gap-2 rounded-lg px-1 ${r.account === account ? "bg-ember/15" : ""}`}>
              <span className="w-5 text-right font-bold text-dim">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
              <span className="h-7 w-6 shrink-0">
                <Hero kind={heroKindOf(r.account, account)} account={r.account} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {who(r.account, account)}
                {isVillager(r.account) && <span className="ml-1 rounded bg-hide px-1 text-[10px] text-dim">NPC</span>}
                <span className="block text-[11px] text-dim">
                  Lv {lv.level} {lv.title} · {r.wins}/{r.raids} raids won
                </span>
              </span>
              <span className="text-right font-mono text-xs">
                {slay(r.damage)}
                <span className="block text-[10px] text-moss">+{slay(r.loot)}</span>
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-dim">No settled raids yet.</li>}
      </ol>
    </section>
  );
}

export function badgesOf(row: SlayerRow | undefined, player: PlayerJson | null) {
  const items = new Map((player?.items ?? []).map(([t, q]) => [t, BigInt(q)]));
  return [
    { icon: "🩸", name: "First blood", got: !!row && row.damage > 0n, hint: "Hit the Bear once" },
    { icon: "🏅", name: "Victor", got: !!row && row.wins > 0, hint: "Win a raid" },
    { icon: "💰", name: "Paid", got: !!row && row.loot >= 100n * ONE, hint: "Earn 100 $SLAY of loot" },
    { icon: "⚒️", name: "Armed", got: ["club", "sword", "slayer"].some((w) => (items.get(w) ?? 0n) > 0n), hint: "Own weapon charges" },
    { icon: "🏆", name: "Trophy hunter", got: (player?.trophies.length ?? 0) > 0, hint: "Win a Bear trophy drop" },
    { icon: "🔥", name: "Regular", got: !!row && row.raids >= 5, hint: "Fight in 5 raids" },
  ];
}
