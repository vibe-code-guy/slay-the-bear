"use client";
import { useState } from "react";
import {
  ONE,
  RECIPES,
  isMaterial,
  isTrophy,
  itemName,
  smithForgeBundles,
  type GameConfig,
  type ListingJson,
  type PlayerJson,
  type RecipeId,
  type StatusJson,
} from "@slay/rules";
import { itemIcon, parseSlay, slay, who } from "@/lib/format";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;

export function Pouch({ player, account, mode }: { player: PlayerJson | null; account: string | null; mode: "live" | "sim" }) {
  if (!player || !account) return null;
  return (
    <section className="card space-y-2">
      <h3 className="text-lg font-bold">Your pouch</h3>
      <div className="text-2xl font-bold">
        {slay(player.balance, 2)} <span className="text-base text-dim">$SLAY</span>
      </div>
      <ul className="space-y-0.5 text-sm">
        {player.items.map(([t, q]) => (
          <li key={t}>
            {itemIcon(t)} {itemName(t)} × {q}
          </li>
        ))}
        {player.trophies.map((t) => (
          <li key={t}>🏆 {itemName(t)}</li>
        ))}
        {player.items.length === 0 && player.trophies.length === 0 && <li className="text-dim">No items yet. Win raids for drops.</li>}
      </ul>
      <p className="break-all text-xs text-dim">
        {mode === "live" ? "Account" : "Simulated account"}: {account}
      </p>
    </section>
  );
}

export function Forge({ player, pending, act }: { player: PlayerJson | null; pending: string | null; act: Act }) {
  if (!player) return null;
  const has = (t: string) => BigInt(player.items.find(([x]) => x === t)?.[1] ?? "0");
  const bal = BigInt(player.balance);
  const trophy = player.trophies[0] ?? null;
  return (
    <section className="card space-y-2">
      <h3 className="text-lg font-bold">Forge</h3>
      <p className="text-xs text-dim">Crafting burns the inputs and a $SLAY fee. Weapons come in charges; a hit spends one.</p>
      {(Object.keys(RECIPES) as RecipeId[]).map((id) => {
        const r = RECIPES[id];
        const ok = has("wood") >= r.wood && has("iron") >= r.iron && bal >= r.fee && (r.trophy === 0n || trophy !== null);
        const needs = [r.wood ? `${r.wood} 🪵` : "", r.iron ? `${r.iron} ⛓️` : "", r.trophy ? "1 🏆" : "", `${slay(r.fee)} $SLAY`].filter(Boolean).join(" + ");
        return (
          <div key={id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {itemIcon(id)} {r.charges.toString()} {itemName(id)}s <span className="text-dim">← {needs}</span>
            </span>
            <button
              className="btn text-xs"
              disabled={!ok || !!pending}
              onClick={() => void act({ method: "craft", recipe: id, trophy: r.trophy ? trophy : null }, "Craft", `Forged ${r.charges} ${id} charges`)}
            >
              Craft
            </button>
          </div>
        );
      })}
    </section>
  );
}

export function Smith({ config, status, player, pending, act }: { config: GameConfig; status: StatusJson; player: PlayerJson | null; pending: string | null; act: Act }) {
  const [qty, setQty] = useState("5");
  const q = /^\d{1,4}$/.test(qty) ? BigInt(qty) : 0n;
  const price = BigInt(status.club_price);
  const stock = BigInt(status.smith_clubs);
  const wood = BigInt(status.smith_wood);
  const plan = smithForgeBundles(config, stock, wood, BigInt(status.smith_balance));
  const mats = (player?.items ?? []).filter(([t]) => isMaterial(t));
  const note =
    stock * 2n >= config.smith.clubTargetStock
      ? `“I have ${stock} club charges. No need to forge.”`
      : plan > 0n
        ? `“Stock is low. At the next raid I forge ${plan * 10n} charges from ${plan * 2n} wood.”`
        : `“Stock is low and I have only ${wood} wood. Sell me wood!”`;
  return (
    <section className="card space-y-2">
      <h3 className="text-lg font-bold">The smith</h3>
      <p className="text-sm italic text-dim">{note}</p>
      <div className="text-sm">
        Club charges: <b>{slay(price, 2)} $SLAY</b> each, {stock.toString()} in stock{status.bear_won_last ? " (prices up 20%: the town is scared)" : ""}.
        Half of every sale is burned.
      </div>
      {player && (
        <div className="flex items-center gap-2">
          <input className="input w-20" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Club charges to buy" />
          <button
            className="btn text-sm"
            disabled={q === 0n || q > stock || BigInt(player.balance) < q * price || !!pending}
            onClick={() => void act({ method: "buy_from_smith", qty: q }, "Buy clubs", `Bought ${q} club charges`)}
          >
            Buy for {slay(q * price, 2)}
          </button>
        </div>
      )}
      <div className="text-sm text-dim">
        Buys 🪵 wood at {slay(status.wood_price, 2)} and ⛓️ iron at {slay(status.iron_price, 2)} $SLAY (lower as its stock grows).
      </div>
      {mats.map(([t, n]) => (
        <button key={t} className="btn mr-2 text-xs" disabled={!!pending} onClick={() => void act({ method: "sell_to_smith", token: t, qty: BigInt(n) }, "Sell", `Sold ${n} ${t}`)}>
          Sell {n} {itemIcon(t)} {t}
        </button>
      ))}
    </section>
  );
}

export function Market({ listings, player, account, pending, act }: { listings: ListingJson[]; player: PlayerJson | null; account: string | null; pending: string | null; act: Act }) {
  const [token, setToken] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("5");
  const owned: [string, string][] = player ? [...player.items, ...player.trophies.map((t) => [t, "1"] as [string, string])] : [];
  const t = token && owned.some(([x]) => x === token) ? token : (owned[0]?.[0] ?? "");
  const q = /^\d{1,6}$/.test(qty) ? BigInt(qty) : 0n;
  const p = parseSlay(price);
  return (
    <section className="card space-y-2">
      <h3 className="text-lg font-bold">Market</h3>
      <p className="text-xs text-dim">Player-to-player item trades. 2% of each sale is burned.</p>
      <ul className="space-y-1 text-sm">
        {listings.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2">
            <span>
              {itemIcon(l.token_id)} {l.qty} × {itemName(l.token_id)} @ {slay(l.price, 2)} <span className="text-dim">by {who(l.seller, account)}</span>
            </span>
            {l.seller === account ? (
              <button className="btn text-xs" disabled={!!pending} onClick={() => void act({ method: "cancel", listingId: l.id }, "Cancel", "Listing cancelled")}>
                Cancel
              </button>
            ) : (
              <button
                className="btn text-xs"
                disabled={!player || BigInt(player.balance) < BigInt(l.price) || !!pending}
                onClick={() => void act({ method: "buy", listingId: l.id, qty: 1n }, "Buy", `Bought 1 ${l.token_id}`)}
              >
                Buy 1
              </button>
            )}
          </li>
        ))}
        {listings.length === 0 && <li className="text-dim">No listings.</li>}
      </ul>
      {owned.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-edge/50 pt-2 text-sm">
          <select className="input" value={t} onChange={(e) => setToken(e.target.value)} aria-label="Item">
            {owned.map(([x, n]) => (
              <option key={x} value={x}>
                {itemIcon(x)} {itemName(x)} ({n})
              </option>
            ))}
          </select>
          <input className="input w-16" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
          <input className="input w-20" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price each" />
          <button
            className="btn text-xs"
            disabled={!t || q === 0n || !p || !!pending}
            onClick={() => void act({ method: "list", token: t, qty: q, price: p! }, "List", "Listed on the market")}
          >
            List
          </button>
        </div>
      )}
    </section>
  );
}

export function TownStats({ status }: { status: StatusJson }) {
  const rows: [string, string][] = [
    ["Total supply", status.total_supply],
    ["Burned so far", status.burned],
    ["Town treasury", status.treasury],
    ["The Bear's hoard", status.hoard],
    ["Held by players", status.player_supply],
    ["Starter pouches left", status.reserve],
  ];
  return (
    <section className="card">
      <h3 className="mb-2 text-lg font-bold">Town ledger</h3>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-dim">{k}</dt>
            <dd className="text-right font-mono">{slay(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-dim">
        $SLAY is minted once at launch. Every hit, craft fee and half of each smith sale is burned. Only the rules move the
        treasury, the hoard and the pouch chest; their accounts cannot sign anything.
      </p>
    </section>
  );
}

export const isTrophyItem = isTrophy;
export const ONE_SLAY = ONE;
