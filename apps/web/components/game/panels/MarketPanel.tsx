"use client";
// The player market: items for sale as cards, and a stall of your own. The contract holds a
// listed item until it sells or you cancel; 2% of each sale is burned.
import { useState } from "react";
import { isTrophy, type ListingJson, type PlayerJson } from "@slay/rules";
import { Coin, ItemArt } from "../ItemArt";
import { ItemCard, SectionTitle } from "./ItemCard";
import { itemTitle } from "@/lib/items";
import { trophyTraits } from "@/lib/trophy";
import { parseSlay, slay, who } from "@/lib/format";
import { play } from "@/lib/sfx";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;

export function MarketPanel({
  listings,
  player,
  account,
  pending,
  act,
  randomness,
}: {
  listings: ListingJson[];
  player: PlayerJson | null;
  account: string | null;
  pending: string | null;
  act: Act;
  randomness: Map<string, string>;
}) {
  const owned: [string, string][] = player ? [...player.items.filter(([, q]) => q !== "0"), ...player.trophies.map((t) => [t, "1"] as [string, string])] : [];
  const [pick, setPick] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("10");
  const sel = pick && owned.some(([t]) => t === pick) ? pick : (owned[0]?.[0] ?? null);
  const max = BigInt(owned.find(([t]) => t === sel)?.[1] ?? "0");
  const q = /^\d{1,6}$/.test(qty) ? BigInt(qty) : 0n;
  const p = parseSlay(price);
  const name = (t: string) => (isTrophy(t) ? trophyTraits(t, randomness.get(t)).name : itemTitle(t));
  const others = listings.filter((l) => l.seller !== account);
  const mine = listings.filter((l) => l.seller === account);

  return (
    <div>
      <p className="text-sm text-dim">Trade items with other players. The contract holds what you list until it sells; 2% of every sale is burned.</p>

      <SectionTitle note={`${others.length} for sale`}>🛒 For sale</SectionTitle>
      {others.length === 0 ? (
        <p className="text-sm text-dim">Nothing for sale right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {others.map((l) => (
            <ItemCard
              key={l.id}
              id={l.token_id}
              qty={isTrophy(l.token_id) ? null : l.qty}
              title={name(l.token_id)}
              traits={isTrophy(l.token_id) ? trophyTraits(l.token_id, randomness.get(l.token_id)) : undefined}
              randomness={randomness.get(l.token_id)}
              blurb={`by ${who(l.seller, account)}`}
            >
              <button
                type="button"
                className="btn btn-primary flex items-center gap-1 px-2 py-1 text-xs"
                disabled={!player || BigInt(player.balance) < BigInt(l.price) || !!pending}
                onClick={async () => {
                  const r = await act({ method: "buy", listingId: l.id, qty: 1n }, "Buy", `Bought ${name(l.token_id)}`);
                  if (r.ok) play("coin");
                }}
              >
                Buy for <Coin className="h-3.5 w-3.5" /> {slay(l.price, 2)}
              </button>
            </ItemCard>
          ))}
        </div>
      )}

      {account && (
        <>
          <SectionTitle note="Cancel any time">🏷️ Your stall</SectionTitle>
          {mine.length === 0 ? (
            <p className="text-sm text-dim">You have nothing listed.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {mine.map((l) => (
                <ItemCard key={l.id} id={l.token_id} qty={isTrophy(l.token_id) ? null : l.qty} title={name(l.token_id)} randomness={randomness.get(l.token_id)} blurb={`${slay(l.price, 2)} $SLAY each`}>
                  <button type="button" className="btn px-2 py-1 text-xs" disabled={!!pending} onClick={() => void act({ method: "cancel", listingId: l.id }, "Cancel", "Listing cancelled")}>
                    Take back
                  </button>
                </ItemCard>
              ))}
            </div>
          )}

          <SectionTitle>Sell something</SectionTitle>
          {owned.length === 0 ? (
            <p className="text-sm text-dim">Win raids for drops, or forge weapons, to have something to sell.</p>
          ) : (
            <div className="rounded-xl border border-edge bg-black/25 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {owned.map(([t, n]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPick(t)}
                    className={`w-20 shrink-0 rounded-lg border p-1 text-center text-[10px] ${sel === t ? "border-ember bg-ember/10" : "border-edge"}`}
                    aria-pressed={sel === t}
                  >
                    <ItemCardArt id={t} randomness={randomness.get(t)} />
                    <span className="block truncate">{name(t)}</span>
                    <span className="text-dim">×{n}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-dim">How many (of {max.toString()})</span>
                  <input className="input w-24" value={qty} onChange={(e) => setQty(e.target.value)} disabled={sel !== null && isTrophy(sel)} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-dim">Price each ($SLAY)</span>
                  <input className="input w-28" value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn btn-primary px-4 py-2"
                  disabled={!sel || q === 0n || q > max || !p || !!pending}
                  onClick={() => sel && p && void act({ method: "list", token: sel, qty: isTrophy(sel) ? 1n : q, price: p }, "List", `Listed ${name(sel)}`)}
                >
                  Put on sale
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemCardArt({ id, randomness }: { id: string; randomness?: string }) {
  return (
    <span className="mx-auto block h-12 w-12">
      <ItemArt id={id} randomness={randomness} />
    </span>
  );
}
