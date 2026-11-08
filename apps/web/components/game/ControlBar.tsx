"use client";
// Under the scene: who you are (level, balance, weapons), the one big action for this moment
// (join, strike, spin the wheel, claim) and the strike settings.
import { useEffect, useState } from "react";
import { ONE, WEAPON_MULT_BPS, isWeapon, itemName, roundTime, type GameConfig, type ParticipantJson, type PlayerJson, type RoundJson, type WeaponId } from "@slay/rules";
import { StrikeButton } from "./StrikeButton";
import { Hero } from "./Hero";
import { levelOf, badgesOf, type SlayerRow } from "./Progress";
import type { RevealState } from "./RaidScene";
import { clock, itemIcon, slay } from "@/lib/format";
import { previewHit, type Phase } from "@/lib/derive";
import { unlockAudio } from "@/lib/sfx";

const CAPS = [25, 100, 250, 500, 1000];

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
  myRow: SlayerRow | undefined;
  weapon: string | null;
  setWeapon: (w: string | null) => void;
  onCharge: (amount: number | null) => void;
  onJoin: () => void;
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
    return (
      <div className="card flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <div className="h-24 w-20 shrink-0">
          <Hero kind="you" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold">Join the raid</h3>
          <p className="text-sm text-dim">
            {props.mode === "live"
              ? "One tap makes you a NEAR testnet account with 1,000 $SLAY. Your key stays in this browser and can only play this game; the game pays the gas."
              : "The simulation runs the same rules in your browser with a local beacon. Nothing touches the network."}
          </p>
        </div>
        <button
          className="btn btn-primary px-6 py-3 text-lg"
          disabled={!!pending}
          onClick={() => {
            void unlockAudio();
            props.onJoin();
          }}
        >
          {pending ?? (props.mode === "live" ? "Play as a guest (free)" : "Start the simulation")}
        </button>
      </div>
    );
  }

  const balanceWhole = Number(BigInt(player.balance) / ONE);
  const minWhole = Number(config.minHit / ONE);
  const maxWhole = Number(config.maxHit / ONE);
  const topWhole = Math.max(0, Math.min(cap, balanceWhole, maxWhole));
  const weapons = player.items.filter(([t]) => isWeapon(t)) as [WeaponId, string][];
  const w = props.weapon && weapons.some(([t]) => t === props.weapon) ? props.weapon : null;
  const open = phase === "open" ? round : null;
  const shownAmount = preview ?? topWhole;
  const dmg = previewHit(config, open, now, BigInt(shownAmount) * ONE, w);
  const lv = levelOf(Number((props.myRow?.damage ?? 0n) / ONE));
  const badges = badgesOf(props.myRow, player);
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
          className="btn btn-primary wheel-cta px-6 py-3 text-lg"
          disabled={!ready || !!pending || spinning}
          onClick={() => {
            void unlockAudio();
            props.onSpin(round.id);
          }}
        >
          {spinning ? "The wheel is spinning…" : ready ? "🎡 Spin the Wheel of Fate" : `drand beacon in ${clock(beaconAt - now)}`}
        </button>
        <span className="text-xs text-dim">Settles raid #{round.id} with drand round {round.target_drand_round} and pays you 5 $SLAY.</span>
      </div>
    );
  } else {
    action = (
      <div className="flex items-center gap-4">
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
        <div className="text-left">
          <div className="font-[family-name:var(--font-display)] text-lg font-bold">{open ? "Strike!" : "Wake the Bear"}</div>
          <div className="text-sm">
            <b className="text-ember">{shownAmount}</b> $SLAY → <b>{slay(dmg.damage)}</b> damage
          </div>
          <div className="text-xs text-dim">
            ×{(Number(dmg.bonusBps) / 10_000).toFixed(2)} early{w ? ` · ${w} ×${Number(WEAPON_MULT_BPS[w as WeaponId]) / 10_000}` : ""}
            {dmg.late ? " · late hit" : ""}
          </div>
          <div className="mt-0.5 text-[11px] text-dim">Hold to charge, release to strike. Space works too.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
      {/* you */}
      <div className="flex items-center gap-3">
        <div className="h-20 w-16 shrink-0">
          <Hero kind="you" weapon={w} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            Lv {lv.level} {lv.title}
            <span className="ml-2 font-normal text-dim">{slay(player.balance)} $SLAY</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-night" title={`${lv.toNext} more damage to the next level`}>
            <div className="h-full bg-gradient-to-r from-ember to-yellow-300" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b.name} title={`${b.name}: ${b.hint}`} className={`rounded px-1 text-sm ${b.got ? "bg-hide" : "opacity-25 grayscale"}`}>
                {b.icon}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* the one action: first on narrow screens, so it sits right under the scene */}
      <div className="flex flex-col items-center gap-2 max-lg:order-first">
        {claimable.map((c) => (
          <button
            key={c.roundId}
            className="btn claim-cta bg-moss px-5 py-2 text-white"
            disabled={!!pending}
            onClick={() => {
              void unlockAudio();
              props.onClaim(c.roundId, c.share);
            }}
          >
            💰 Claim +{slay(c.share, 2)} $SLAY from raid #{c.roundId}
          </button>
        ))}
        {action}
      </div>

      {/* strike settings */}
      <div className="space-y-2 text-sm lg:justify-self-end">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-xs text-dim">Weapon</span>
          <button className={`btn px-2 py-1 text-xs ${!w ? "border-ember text-ember" : ""}`} onClick={() => props.setWeapon(null)}>
            👊 paws
          </button>
          {weapons.map(([t, q]) => (
            <button key={t} className={`btn px-2 py-1 text-xs ${w === t ? "border-ember text-ember" : ""}`} onClick={() => props.setWeapon(t)} title={`${itemName(t)}: ×${Number(WEAPON_MULT_BPS[t]) / 10_000} damage`}>
              {itemIcon(t)} ×{Number(WEAPON_MULT_BPS[t]) / 10_000} ({q})
            </button>
          ))}
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
          <div className="text-xs text-dim">
            You: {props.me.hits} {props.me.hits === 1 ? "hit" : "hits"}, {slay(BigInt(props.me.early) + BigInt(props.me.late))} damage this raid
          </div>
        )}
      </div>
    </div>
  );
}
