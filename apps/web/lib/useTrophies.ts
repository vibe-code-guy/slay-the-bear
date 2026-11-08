"use client";
// Every Bear trophy so far and where it is now, from the contract's own views: settlements list
// the drops (and the beacon randomness that shapes each trophy's look), the market lists those
// for sale, get_player says who still holds one, and mt_supply is 0 once one was forged into a
// Bear-slayer. Nothing is stored off-chain.
import { useEffect, useMemo, useRef, useState } from "react";
import { isTrophy, type ListingJson, type RoundJson } from "@slay/rules";
import { trophyTraits, type TrophyTraits } from "./trophy";
import type { Backend } from "./types";

export type TrophyWhere =
  | { kind: "held"; owner: string }
  | { kind: "listed"; seller: string; price: string; listingId: number }
  | { kind: "forged" }
  | { kind: "traded" }
  | { kind: "unknown" };

export interface TrophyInfo {
  id: string;
  traits: TrophyTraits;
  round: number;
  draw: number;
  droppedTo: string;
  /** settlement time, ms */
  at: number;
  where: TrophyWhere;
}

interface Dropped {
  id: string;
  round: number;
  draw: number;
  droppedTo: string;
  randomness: string;
  at: number;
}

export function useTrophies(
  backend: Backend | null,
  history: RoundJson[],
  listings: ListingJson[],
  resolveOwners: boolean,
  myTrophies: string[],
  account: string | null,
) {
  const rounds = useRef(new Map<number, Dropped[]>());
  const [dropsVersion, setDropsVersion] = useState(0);
  const [where, setWhere] = useState<Map<string, TrophyWhere>>(new Map());
  const settledKey = history
    .filter((r) => r.settlement)
    .map((r) => r.id)
    .join(",");

  // read every settled raid once (they never change), newest pages first
  useEffect(() => {
    if (!backend) return;
    let off = false;
    const take = (list: RoundJson[]) => {
      let added = false;
      for (const r of list) {
        if (!r.settlement || rounds.current.has(r.id)) continue;
        const drops = r.settlement.drops
          .filter((d) => isTrophy(d.token_id))
          .map((d) => ({ id: d.token_id, round: r.id, draw: d.draw, droppedTo: d.account, randomness: r.settlement!.randomness, at: Number(BigInt(r.settlement!.settled_at) / 1_000_000n) }));
        rounds.current.set(r.id, drops);
        added = true;
      }
      return added;
    };
    (async () => {
      let added = take(history);
      const oldest = Math.min(...history.map((r) => r.id), Infinity);
      let before = Number.isFinite(oldest) ? oldest : undefined;
      // older raids than the snapshot's history, 50 at a time
      while (before !== undefined && before > 1) {
        const missing = [...Array(before - 1).keys()].some((i) => !rounds.current.has(i + 1));
        if (!missing) break;
        const page = await backend.rounds(before, 50).catch(() => [] as RoundJson[]);
        if (off || page.length === 0) break;
        added = take(page) || added;
        before = Math.min(...page.map((r) => r.id));
      }
      if (!off && added) setDropsVersion((v) => v + 1);
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, settledKey]);

  const dropped = useMemo(() => [...rounds.current.values()].flat().sort((a, b) => b.round - a.round || a.draw - b.draw), [dropsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // where each trophy is now (only while someone is looking)
  const listingsKey = listings.map((l) => `${l.id}:${l.token_id}`).join(",");
  const mineKey = myTrophies.join(",");
  useEffect(() => {
    if (!backend || !resolveOwners || dropped.length === 0) return;
    let off = false;
    (async () => {
      const next = new Map<string, TrophyWhere>();
      const holders = new Map<string, Set<string>>();
      const heldBy = async (acc: string) => {
        if (!holders.has(acc)) holders.set(acc, new Set((await backend.player(acc).catch(() => null))?.trophies ?? []));
        return holders.get(acc)!;
      };
      for (const t of dropped) {
        const l = listings.find((x) => x.token_id === t.id);
        if (l) next.set(t.id, { kind: "listed", seller: l.seller, price: l.price, listingId: l.id });
        else if (account && myTrophies.includes(t.id)) next.set(t.id, { kind: "held", owner: account });
        else if ((await heldBy(t.droppedTo)).has(t.id)) next.set(t.id, { kind: "held", owner: t.droppedTo });
        else {
          const supply = await backend.itemSupply(t.id).catch(() => null);
          next.set(t.id, supply === 0n ? { kind: "forged" } : supply === null ? { kind: "unknown" } : { kind: "traded" });
        }
        if (off) return;
      }
      setWhere(next);
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, resolveOwners, dropped, listingsKey, mineKey, account]);

  const list: TrophyInfo[] = useMemo(
    () =>
      dropped.map((d) => ({
        id: d.id,
        traits: trophyTraits(d.id, d.randomness),
        round: d.round,
        draw: d.draw,
        droppedTo: d.droppedTo,
        at: d.at,
        where: where.get(d.id) ?? { kind: "unknown" },
      })),
    [dropped, where],
  );
  /** The settlement randomness behind each trophy, for drawing its art anywhere. */
  const randomness = useMemo(() => new Map(dropped.map((d) => [d.id, d.randomness])), [dropped]);
  return { list, randomness };
}
