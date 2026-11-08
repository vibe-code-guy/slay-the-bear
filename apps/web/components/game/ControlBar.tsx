"use client";
// Beside or under the scene: the one big action for this moment (claim your pouch, strike, spin
// the wheel, claim loot), your weapon and swing size, and today's goals.
import { useEffect, useState } from "react";
import { ONE, WEAPON_MULT_BPS, roundTime, type GameConfig, type ParticipantJson, type PlayerJson, type RoundJson, type WeaponId } from "@slay/rules";
import { StrikeButton } from "./StrikeButton";
import { ItemArt } from "./ItemArt";
import { GoalsCard } from "./GoalsCard";
import type { PanelId } from "./HudBar";
import type { RevealState } from "./RaidScene";
import type { Goal } from "@/lib/goals";
import { clock, slay } from "@/lib/format";
import { itemTitle } from "@/lib/items";
import { previewHit, type Phase } from "@/lib/derive";
import { play, unlockAudio } from "@/lib/sfx";

const CAPS = [25, 100, 250, 500, 1000];
const WEAPONS = ["club", "sword", "slayer"] as const;

export function ControlBar(props: {
  mode: "live" | "sim";
  config: GameConfig;
  round: RoundJson | null;
  phase: Phase;
  now: number;
  player: PlayerJson | null;
  me: ParticipantJson | null;
  account: string | null;
  claimable: { roundId: number; share: bigint }[];
  pending: string | null;
  reveal: RevealState | null;
  weapon: string | null;
  setWeapon: (w: string | null) => void;
  goals: { goals: Goal[]; streak: number; msLeft: number; allDone: boolean };
  onOpen: (p: PanelId) => void;
  onCharge: (amount: number | null) => void;
  onPouch: () => void;
  onStrike: (amountWhole: number, weapon: string | null) => void;
  onSpin: (roundId: number) => void;
  onClaim: (roundId: number, share: bigint) => void;
}) {
  const { config, round, phase, now, player, account, pending, reveal } = props;
  const [cap, setCap] = useState(250);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    const saved = Number(localStorage.getItem("slay-cap"));
    if (CAPS.includes(saved)) setCap(saved);
  }, []);

  if (!account || !player) {
    // the title screen over the scene has the play button; this is the one-minute version of the rules
    return (
      <div className="card controls-join flex flex-col gap-3">
        <h3 className="text-lg font-bold text-[#fde68a]">How a raid works</h3>
        <ol className="space-y-2 text-sm">
          {[
            ["⚔️", "Hold to strike", "Burn $SLAY to hit the Bear. Early hits deal up to ×1.5 damage."],
            ["⏳", "Beat the timer", "Together, deal the Bear's health before time runs out."],
            ["🎡", "Spin the wheel", "drand's randomness picks the Bear's tactic. Win, and split its hoard."],
          ].map(([icon, title, text]) => (
            <li key={title} className="flex gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember/15 text-lg">{icon}</span>
              <span>
                <b>{title}</b>
                <span className="block text-xs text-dim">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="link self-start text-xs" onClick={() => props.onOpen("help")}>
          The full rules
        </button>
      </div>
    );
  }

  const have = (t: string) => BigInt(player.items.find(([x]) => x === t)?.[1] ?? "0");
  const balanceWhole = Number(BigInt(player.balance) / ONE);
  const minWhole = Number(config.minHit / ONE);
  const maxWhole = Number(config.maxHit / ONE);
  const topWhole = Math.max(0, Math.min(cap, balanceWhole, maxWhole));
  const w = props.weapon && have(props.weapon) > 0n ? props.weapon : null;
  const open = phase === "open" ? round : null;
  const shownAmount = preview ?? topWhole;
  const dmg = previewHit(config, open, now, BigInt(shownAmount) * ONE, w);
  const spinning = !!reveal && reveal.stage !== "landed";
  // no spoilers: loot from the raid on the wheel appears once the wheel has stopped
  const claimable = props.claimable.filter((c) => !(spinning && reveal?.roundId === c.roundId));

  const beaconAt = round ? Number(roundTime(BigInt(round.target_drand_round))) * 1000 + 1500 : 0;
  const ready = now >= beaconAt;

  let action: React.ReactNode;
  if (!player.pouch_claimed) {
    action = (
      <button className="btn btn-primary px-6 py-3 text-lg" disabled={!!pending} onClick={props.onPouch}>
        👛 Claim your starter pouch
      </button>
    );
  } else if (phase === "ended" && round) {
    action = (
      <div className="flex flex-col items-center gap-1">
        <button
          data-tour="spin"
          className="btn btn-primary wheel-cta max-w-full px-6 py-3 text-lg"
          disabled={!ready || !!pending || spinning}
          onClick={() => {
            void unlockAudio();
            props.onSpin(round.id);
          }}
        >
          {spinning ? "The wheel is spinning…" : ready ? "🎡 Spin the Wheel of Fate" : `drand beacon in ${clock(beaconAt - now)}`}
        </button>
        <span className="text-center text-xs text-dim">Settles raid #{round.id} with drand round {round.target_drand_round} and pays you 5 $SLAY.</span>
      </div>
    );
  } else {
    action = (
      <div className="flex items-center gap-3 sm:gap-4">
        <span data-tour="strike" className="rounded-full">
          <StrikeButton
            disabled={!!pending || spinning || topWhole < minWhole}
            minWhole={minWhole}
            topWhole={topWhole}
            label={open ? "Strike the Bear" : "Wake the Bear and strike first"}
            onCharge={(a) => {
              setPreview(a);
              props.onCharge(a);
            }}
            onStrike={(a) => props.onStrike(a, w)}
          />
        </span>
        <div className="min-w-0 text-left" title="Hold to charge, release to strike. Space works too.">
          <div className="font-[family-name:var(--font-display)] text-lg font-bold">{open ? "Strike!" : "Wake the Bear"}</div>
          <div className="text-sm">
            <b className="text-ember">{shownAmount}</b> $SLAY → <b>{slay(dmg.damage)}</b> damage
          </div>
          <div className="text-xs text-dim">
            ×{(Number(dmg.bonusBps) / 10_000).toFixed(2)} early{w ? ` · ${itemTitle(w).toLowerCase()} ×${Number(WEAPON_MULT_BPS[w as WeaponId]) / 10_000}` : ""}
            {dmg.late ? " · late hit" : ""}
          </div>
          <div className="controls-hint mt-0.5 text-[11px] text-dim">Hold to charge, release to strike. Space works too.</div>
        </div>
      </div>
    );
  }

  // Where each part goes (a row under the scene, or a column beside it on short screens) is set
  // by the .controls grid areas in globals.css.
  return (
    <div className={`card controls ${claimable.length ? "has-claim" : ""}`}>
      {/* today's goals */}
      <div className="controls-you">
        <GoalsCard {...props.goals} />
      </div>

      {/* loot to claim: beside the goals on a wide bar, so the bar keeps its height */}
      {claimable.length > 0 && (
        <div className="controls-claim" data-tour="claim">
          {claimable.map((c) => (
            <button
              key={c.roundId}
              className="btn claim-cta bg-moss px-4 py-2 text-sm text-white"
              disabled={!!pending}
              onClick={() => {
                void unlockAudio();
                props.onClaim(c.roundId, c.share);
              }}
            >
              💰 Claim +{slay(c.share, 2)} $SLAY from raid #{c.roundId}
            </button>
          ))}
        </div>
      )}

      {/* the one action */}
      <div className="controls-action">{action}</div>

      {/* weapon and swing */}
      <div className="controls-settings space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-xs text-dim">Weapon</span>
          <WeaponButton id="paws" label="Bare paws ×1" selected={!w} onClick={() => props.setWeapon(null)} />
          {WEAPONS.map((t) => {
            const n = have(t);
            return (
              <WeaponButton
                key={t}
                id={t}
                qty={n}
                label={n > 0n ? `${itemTitle(t)} ×${Number(WEAPON_MULT_BPS[t]) / 10_000}, ${n} charges` : `${itemTitle(t)}: none yet, open the ${t === "club" ? "smith" : "forge"}`}
                selected={w === t}
                locked={n === 0n}
                onClick={() => {
                  if (n === 0n) props.onOpen(t === "club" ? "smith" : "forge");
                  else {
                    play("click");
                    props.setWeapon(t);
                  }
                }}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-xs text-dim">Max swing</span>
          {CAPS.map((c) => (
            <button
              key={c}
              className={`btn px-2 py-1 text-xs ${cap === c ? "border-ember text-ember" : ""}`}
              onClick={() => {
                setCap(c);
                localStorage.setItem("slay-cap", String(c));
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {props.me && round && !round.settlement && (
          <div className="controls-mine text-xs text-dim">
            You: {props.me.hits} {props.me.hits === 1 ? "hit" : "hits"}, {slay(BigInt(props.me.early) + BigInt(props.me.late))} damage this raid
          </div>
        )}
      </div>
    </div>
  );
}

function WeaponButton({ id, qty, label, selected, locked, onClick }: { id: string; qty?: bigint; label: string; selected: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={`weapon-btn relative h-10 w-10 rounded-lg border bg-black/30 p-1 ${selected ? "border-ember shadow-[0_0_0_2px_rgba(245,158,11,0.35)]" : "border-edge hover:border-ember/60"} ${locked ? "opacity-45" : ""}`}
    >
      <span className={`block h-full w-full ${locked ? "grayscale" : ""}`}>
        <ItemArt id={id} />
      </span>
      {qty !== undefined && qty > 0n && <span className="absolute -bottom-1.5 -right-1.5 rounded-full border border-night bg-ember px-1 text-[9px] font-black text-night">{qty.toString()}</span>}
      {locked && <span className="absolute -bottom-1 -right-1 text-[10px]">🔒</span>}
    </button>
  );
}
