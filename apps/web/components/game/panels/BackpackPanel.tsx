"use client";
// Your backpack: your hero and level, $SLAY, weapon charges (pick one to fight with), materials,
// trophies and achievements. Everything here is read from the contract (get_player).
import { ONE, type PlayerJson } from "@slay/rules";
import { Hero } from "../Hero";
import { Coin } from "../ItemArt";
import { badgesOf, levelOf, type SlayerRow } from "../Progress";
import { ItemCard, SectionTitle } from "./ItemCard";
import type { PanelId } from "../HudBar";
import { itemBlurb, itemTitle } from "@/lib/items";
import { trophyTraits } from "@/lib/trophy";
import { slay } from "@/lib/format";

const WEAPONS = ["club", "sword", "slayer"] as const;

export function BackpackPanel({
  player,
  account,
  accountHref,
  mode,
  myRow,
  weapon,
  setWeapon,
  randomness,
  open,
  look,
}: {
  player: PlayerJson | null;
  account: string | null;
  accountHref: string | null;
  mode: "live" | "sim";
  myRow: SlayerRow | undefined;
  weapon: string | null;
  setWeapon: (w: string | null) => void;
  randomness: Map<string, string>;
  /** opens another panel; for the market, with the item to sell picked */
  open: (p: PanelId, token?: string) => void;
  look: React.ComponentProps<typeof Hero>["look"];
}) {
  if (!player || !account) {
    return <p className="text-dim">Join the town to get a backpack: a free guest account and a starter pouch of 1,000 $SLAY.</p>;
  }
  const have = (t: string) => BigInt(player.items.find(([x]) => x === t)?.[1] ?? "0");
  const lv = levelOf(Number((myRow?.damage ?? 0n) / ONE));
  const badges = badgesOf(myRow, player);
  const materials = (["wood", "iron"] as const).filter((m) => have(m) > 0n);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-black/30 p-3">
        <div className="h-28 w-24 shrink-0">
          <Hero kind="you" weapon={weapon} look={look} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-[#fde68a]">
            Level {lv.level} · {lv.title}
          </div>
          <div className="mt-1 h-2.5 max-w-sm overflow-hidden rounded-full bg-night">
            <div className="h-full bg-gradient-to-r from-ember to-yellow-300" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
          </div>
          <div className="mt-1 text-xs text-dim">
            {slay(myRow?.damage ?? 0n)} damage over the last raids · {lv.toNext.toLocaleString("en-US")} more to level {lv.level + 1}
          </div>
          <div className="mt-2 flex items-center gap-2 text-2xl font-black">
            <Coin className="h-7 w-7" /> {slay(player.balance, 2)} <span className="text-sm font-normal text-dim">$SLAY</span>
          </div>
        </div>
      </div>

      <SectionTitle note="One charge per hit. Pick what you fight with.">⚔️ Weapons</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ItemCard id="paws" title="Bare paws" blurb="×1 damage, free." selected={!weapon} onClick={() => setWeapon(null)} />
        {WEAPONS.map((w) => {
          const n = have(w);
          return (
            <ItemCard
              key={w}
              id={w}
              qty={n}
              title={itemTitle(w)}
              blurb={itemBlurb(w)}
              locked={n === 0n}
              selected={weapon === w && n > 0n}
              onClick={n > 0n ? () => setWeapon(w) : () => open(w === "club" ? "smith" : "forge")}
            />
          );
        })}
      </div>

      <SectionTitle note="Drops from won raids">🪵 Materials</SectionTitle>
      {materials.length === 0 ? (
        <p className="text-sm text-dim">None yet. Each won raid drops 3 items to raiders, picked by damage: wood, iron, or a rare trophy.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {materials.map((m) => (
            <ItemCard key={m} id={m} qty={have(m)} title={itemTitle(m)} blurb={itemBlurb(m)}>
              <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => open("forge")}>
                Forge
              </button>
              <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => open("smith")}>
                Sell
              </button>
            </ItemCard>
          ))}
        </div>
      )}

      <SectionTitle note="One of one, NEP-245">🏆 Trophies</SectionTitle>
      {player.trophies.length === 0 ? (
        <p className="text-sm text-dim">
          No trophy yet. Every drop has a 5% chance to be a one-of-one Bear trophy, shaped by that raid&apos;s drand beacon.{" "}
          <button type="button" className="link" onClick={() => open("trophies")}>
            See the Trophy Hall
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {player.trophies.map((t) => {
            const tr = trophyTraits(t, randomness.get(t));
            return (
              <ItemCard key={t} id={t} title={tr.name} traits={tr} randomness={randomness.get(t)} blurb={`${tr.grade} · raid #${tr.round}, drop ${tr.draw}`}>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => open("forge")}>
                  Forge
                </button>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => open("market", t)}>
                  Sell
                </button>
              </ItemCard>
            );
          })}
        </div>
      )}

      <SectionTitle note={`${badges.filter((b) => b.got).length} of ${badges.length}`}>🎖️ Achievements</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {badges.map((b) => (
          <div key={b.name} className={`flex items-center gap-2 rounded-xl border p-2 ${b.got ? "border-ember/60 bg-ember/10" : "border-edge bg-black/20 opacity-60"}`}>
            <span className={`text-2xl ${b.got ? "" : "grayscale"}`}>{b.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{b.name}</span>
              <span className="block text-[11px] text-dim">{b.hint}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 break-all text-xs text-dim">
        {mode === "live" ? "Testnet account" : "Simulated account"}:{" "}
        {accountHref ? (
          <a className="link" href={accountHref} target="_blank" rel="noreferrer">
            {account}
          </a>
        ) : (
          account
        )}
      </p>
    </div>
  );
}
