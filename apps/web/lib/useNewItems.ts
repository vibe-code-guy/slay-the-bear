"use client";
// The red dot on the backpack: how many kinds of material and trophy you have gained since you
// last opened it. What you hold comes from the contract; what you last saw is remembered in this
// browser (live) or only for this visit (the simulation starts over on every load).
import { useEffect, useMemo, useState } from "react";
import { isWeapon, type PlayerJson } from "@slay/rules";

type Seen = Record<string, string>;

/** Materials and trophies by token id; weapons are left out, you made or bought those yourself. */
function inventoryOf(p: PlayerJson): Seen {
  const inv: Seen = {};
  for (const [t, q] of p.items) if (!isWeapon(t)) inv[t] = q;
  for (const t of p.trophies) inv[t] = "1";
  return inv;
}

function read(key: string): Seen | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}

export function useNewItems(account: string | null, player: PlayerJson | null, looking: boolean, persist: boolean): number {
  const key = account ? `slay-seen:${account}` : null;
  // what you last saw, once loaded for this account (null: never looked)
  const [state, setState] = useState<{ key: string; seen: Seen | null } | null>(null);
  const inv = useMemo(() => (player ? inventoryOf(player) : null), [player]);

  useEffect(() => {
    setState(key ? { key, seen: persist ? read(key) : null } : null);
  }, [key, persist]);

  // the first time, and while the backpack is open, what you hold is what you have seen
  useEffect(() => {
    if (!key || !inv || state?.key !== key) return;
    if (state.seen !== null && !looking) return;
    if (JSON.stringify(inv) === JSON.stringify(state.seen)) return;
    if (persist) localStorage.setItem(key, JSON.stringify(inv));
    setState({ key, seen: inv });
  }, [key, inv, state, looking, persist]);

  if (!inv || !state?.seen) return 0;
  const seen = state.seen;
  return Object.entries(inv).filter(([t, q]) => BigInt(q) > BigInt(seen[t] ?? "0")).length;
}
