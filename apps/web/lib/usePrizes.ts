"use client";
// Little prizes as they happen: a goal of the day done, all three done (the goal sash), an
// achievement earned. Each is announced once; what was already true when the page loaded is not
// news. Everything here is worked out from the contract's views.
import { useEffect, useRef } from "react";
import type { Goal } from "./goals";
import type { Toast } from "./useGame";
import { play } from "./sfx";

interface Badge {
  icon: string;
  name: string;
  got: boolean;
  hint: string;
}

export function usePrizes(
  account: string | null,
  /** the settled raids are read, so goals and badges are as the chain has them */
  ready: boolean,
  goals: { goals: Goal[]; allDone: boolean },
  badges: Badge[],
  day: number,
  notify: (t: Omit<Toast, "id">) => void,
) {
  const seen = useRef<{ account: string; goals: Set<string>; badges: Set<string>; allDone: string | null } | null>(null);

  useEffect(() => {
    if (!account || !ready) return;
    const goalKey = (g: Goal) => `${day}:${g.id}:${g.target}`;
    const s = seen.current;
    if (!s || s.account !== account) {
      seen.current = {
        account,
        goals: new Set(goals.goals.filter((g) => g.done).map(goalKey)),
        badges: new Set(badges.filter((b) => b.got).map((b) => b.name)),
        allDone: goals.allDone ? String(day) : null,
      };
      return;
    }
    let sound = false;
    for (const g of goals.goals) {
      if (g.done && !s.goals.has(goalKey(g))) {
        s.goals.add(goalKey(g));
        notify({ kind: "prize", text: `⭐ Goal done: ${g.text}` });
        sound = true;
      }
    }
    if (goals.allDone && s.allDone !== String(day)) {
      s.allDone = String(day);
      notify({ kind: "prize", text: "🎖️ All three goals done today! Your hero wears the goal sash until midnight UTC." });
      sound = true;
    }
    // several at once (a first won raid earns three) share one toast
    const earned = badges.filter((b) => b.got && !s.badges.has(b.name));
    earned.forEach((b) => s.badges.add(b.name));
    if (earned.length === 1) notify({ kind: "prize", text: `${earned[0]!.icon} Achievement: ${earned[0]!.name}. ${earned[0]!.hint}.` });
    if (earned.length > 1) notify({ kind: "prize", text: `🎖️ ${earned.length} achievements: ${earned.map((b) => `${b.icon} ${b.name}`).join(", ")}` });
    if (earned.length) sound = true;
    if (sound) play("sparkle", 1.1);
  }, [account, ready, goals, badges, day, notify]);
}
