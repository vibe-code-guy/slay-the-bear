"use client";
// Today's goals and your streak. Progress is counted from the contract's views (the raids you
// fought today, your damage, wins, settles and claims), so it is the same on every device. The
// three goals of the day are picked from the date and your account. The streak counts the days
// in a row on which you fought; past days are remembered in this browser as the chain showed them.
import { useEffect, useMemo, useState } from "react";
import { ONE, type ParticipantJson, type RoundJson } from "@slay/rules";

export interface Goal {
  id: string;
  text: string;
  icon: string;
  progress: number;
  target: number;
  done: boolean;
}

interface Template {
  id: string;
  icon: string;
  text: (n: number) => string;
  targets: number[];
  measure: (t: Today) => number;
}

interface Today {
  raids: number;
  damage: number;
  hits: number;
  wins: number;
  settles: number;
  claims: number;
}

const TEMPLATES: Template[] = [
  { id: "raids", icon: "⚔️", text: (n) => `Fight in ${n} raids`, targets: [2, 3], measure: (t) => t.raids },
  { id: "damage", icon: "💥", text: (n) => `Deal ${n.toLocaleString("en-US")} damage`, targets: [300, 600, 1000], measure: (t) => t.damage },
  { id: "hits", icon: "🗡️", text: (n) => `Land ${n} hits`, targets: [3, 5], measure: (t) => t.hits },
  { id: "win", icon: "🏅", text: () => "Win a raid", targets: [1], measure: (t) => t.wins },
  { id: "spin", icon: "🎡", text: () => "Spin the Wheel of Fate", targets: [1], measure: (t) => t.settles },
  { id: "claim", icon: "💰", text: () => "Claim your loot", targets: [1], measure: (t) => t.claims },
];

const DAY = 86_400_000;
const dayOf = (ms: number) => Math.floor(ms / DAY);

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The day's three goals: one of the "fight" kind, then two of the rest, with targets picked too. */
function pick(day: number, account: string): { t: Template; target: number }[] {
  const h = hash(`${day}:${account}`);
  const first = TEMPLATES[h % 3]!;
  const rest = TEMPLATES.slice(3);
  const second = rest[(h >>> 4) % rest.length]!;
  const third = [...TEMPLATES.slice(0, 3).filter((x) => x !== first), ...rest.filter((x) => x !== second)][(h >>> 8) % 4]!;
  return [first, second, third].map((t, i) => ({ t, target: t.targets[(h >>> (12 + i * 3)) % t.targets.length]! }));
}

export function useGoals(account: string | null, rounds: { round: RoundJson; parts: ParticipantJson[] }[], now: number) {
  const day = dayOf(now);
  const today = useMemo<Today>(() => {
    const t: Today = { raids: 0, damage: 0, hits: 0, wins: 0, settles: 0, claims: 0 };
    if (!account) return t;
    for (const { round, parts } of rounds) {
      const p = parts.find((x) => x.account === account);
      const opened = Number(BigInt(round.opened_at) / 1_000_000n);
      const s = round.settlement;
      if (s && s.settler === account && dayOf(Number(BigInt(s.settled_at) / 1_000_000n)) === day) t.settles += 1;
      if (!p || dayOf(opened) !== day) continue;
      t.raids += 1;
      t.damage += Number((BigInt(p.early) + BigInt(p.late)) / ONE);
      t.hits += p.hits;
      if (s?.outcome === "win") t.wins += 1;
      if (p.claimed) t.claims += 1;
    }
    return t;
  }, [account, rounds, day]);

  const goals: Goal[] = useMemo(() => {
    if (!account) return [];
    return pick(day, account).map(({ t, target }) => {
      const progress = Math.min(target, t.measure(today));
      return { id: t.id, icon: t.icon, text: t.text(target), progress, target, done: progress >= target };
    });
  }, [account, day, today]);

  // the streak: days in a row with a raid, today included once you have fought
  const [days, setDays] = useState<number[]>([]);
  useEffect(() => {
    if (!account) return;
    const key = `slay-days:${account}`;
    const saved = new Set<number>(JSON.parse(localStorage.getItem(key) ?? "[]") as number[]);
    if (today.raids > 0) saved.add(day);
    const list = [...saved].sort((a, b) => b - a).slice(0, 60);
    localStorage.setItem(key, JSON.stringify(list));
    setDays(list);
  }, [account, day, today.raids]);
  let streak = 0;
  for (let d = days.includes(day) ? day : day - 1; days.includes(d); d--) streak++;

  const msLeft = (day + 1) * DAY - now;
  return { goals, allDone: goals.length > 0 && goals.every((g) => g.done), streak, msLeft, today };
}
