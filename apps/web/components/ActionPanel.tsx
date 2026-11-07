"use client";
import { useMemo, useState } from "react";
import { ONE, TACTIC_EFFECTS, Tactic, isWeapon, itemName, roundTime, type GameConfig, type ParticipantJson, type PlayerJson, type RoundJson } from "@slay/rules";
import { clock, itemIcon, parseSlay, slay, TACTIC_ICON, tacticName, who } from "@/lib/format";
import { previewHit, shares, type Phase } from "@/lib/derive";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;

export function ActionPanel(props: {
  mode: "live" | "sim";
  config: GameConfig;
  round: RoundJson | null;
  participants: ParticipantJson[];
  player: PlayerJson | null;
  me: ParticipantJson | null;
  account: string | null;
  phase: Phase;
  now: number;
  pending: string | null;
  act: Act;
  join: () => Promise<void>;
}) {
  const { config, round, player, account, phase, now, pending, act } = props;

  if (!account || !player) {
    return (
      <section className="card space-y-3 border-ember/60">
        <h3 className="text-xl font-bold">Join the town</h3>
        {props.mode === "live" ? (
          <p className="text-dim">
            One click creates a NEAR testnet account for you, <code>p-…​.slaythebear.testnet</code>. Its key is made in this browser and never
            leaves it; the key can only call the game contract. A relayer pays the gas, so you need no wallet and no tokens. Your
            starter pouch holds 1,000 $SLAY.
          </p>
        ) : (
          <p className="text-dim">
            Simulation mode runs the same rules in your browser, with a local beacon instead of drand. No network, no accounts. Use
            the skip buttons to fast-forward a raid.
          </p>
        )}
        <button className="btn btn-primary text-lg" disabled={!!pending} onClick={() => void props.join()}>
          {pending ?? (props.mode === "live" ? "Play as a guest (free)" : "Start the simulation")}
        </button>
      </section>
    );
  }

  if (!player.pouch_claimed) {
    return (
      <section className="card">
        <button className="btn btn-primary" disabled={!!pending} onClick={() => void act({ method: "claim_pouch" }, "Claim pouch", "1,000 $SLAY claimed")}>
          Claim your starter pouch
        </button>
      </section>
    );
  }

  if (phase === "ended" && round) return <SettlePanel {...props} round={round} />;
  return (
    <>
      {phase === "settled" && round && <ResultPanel {...props} round={round} />}
      <HitPanel {...props} />
    </>
  );
}

function HitPanel({ config, round, player, phase, now, pending, act }: Parameters<typeof ActionPanel>[0]) {
  const [amount, setAmount] = useState("50");
  const [weapon, setWeapon] = useState<string>("");
  const balance = BigInt(player!.balance);
  const weapons = player!.items.filter(([t]) => isWeapon(t));
  const parsed = parseSlay(amount);
  const w = weapon && weapons.some(([t]) => t === weapon) ? weapon : null;
  const open = phase === "open" ? round : null;
  const preview = useMemo(() => (parsed ? previewHit(config, open, now, parsed, w) : null), [config, open, now, parsed, w]);
  const valid = parsed !== null && parsed >= config.minHit && parsed <= config.maxHit && parsed <= balance;
  const maxHit = balance < config.maxHit ? balance : config.maxHit;

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-bold">{open ? "Hit the Bear" : "Wake the Bear and strike first"}</h3>
        <span className="text-sm text-dim">You hold {slay(balance)} $SLAY</span>
      </div>
      <p className="text-sm text-dim">
        A hit burns the $SLAY you put in. Damage = $SLAY × weapon × early bonus. If the town&apos;s damage reaches the Bear&apos;s health by the
        deadline, raiders split the loot by damage.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-28 font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="$SLAY to burn" />
        {[10n, 50n, 100n, 250n].map((v) => (
          <button key={v} className="btn text-sm" onClick={() => setAmount(v.toString())}>
            {v.toString()}
          </button>
        ))}
        <button className="btn text-sm" onClick={() => setAmount((maxHit / ONE).toString())}>
          max
        </button>
        <select className="input" value={w ?? ""} onChange={(e) => setWeapon(e.target.value)} aria-label="Weapon">
          <option value="">bare paws (×1.00)</option>
          {weapons.map(([t, q]) => (
            <option key={t} value={t}>
              {itemIcon(t)} {itemName(t)} ×{t === "club" ? "1.25" : t === "sword" ? "1.50" : "2.00"} ({q} left)
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-danger px-6 py-3 text-lg"
          disabled={!valid || !!pending}
          onClick={() => void act({ method: "hit", amount: parsed!, weapon: w }, "Hit", `Hit for ${preview ? slay(preview.damage) : "?"} damage`)}
        >
          {pending ?? `⚔️ Hit for ${preview ? slay(preview.damage) : "…"} damage`}
        </button>
        {preview && (
          <span className="text-sm text-dim">
            burns {amount} $SLAY · bonus ×{(Number(preview.bonusBps) / 10_000).toFixed(2)}
            {w ? ` · ${w}` : ""}
            {preview.late ? " · late hit (a Feint would halve it)" : ""}
          </span>
        )}
      </div>
      {!valid && parsed !== null && <p className="text-sm text-blood">Hits are 1 to {slay(config.maxHit)} $SLAY and at most your balance.</p>}
    </section>
  );
}

function SettlePanel({ round, now, pending, act }: Parameters<typeof ActionPanel>[0] & { round: RoundJson }) {
  const beaconAt = Number(roundTime(BigInt(round.target_drand_round))) * 1000 + 1500;
  const ready = now >= beaconAt;
  return (
    <section className="card space-y-3 border-ember/60">
      <h3 className="text-xl font-bold">Time&apos;s up! Settle raid #{round.id}</h3>
      <p className="text-dim">
        Anyone may settle and earns a 5 $SLAY tip. Your settlement hands the contract drand round #{round.target_drand_round}; the contract
        checks its BLS signature and uses it to draw the Bear&apos;s tactic and the drops. Nobody picks the roll.
      </p>
      <button
        className="btn btn-primary"
        disabled={!ready || !!pending}
        onClick={() => void act({ method: "settle", roundId: round.id }, "Settle", `Raid #${round.id} settled. Tip earned.`)}
      >
        {pending ?? (ready ? "⚖️ Settle with the drand beacon" : `Beacon in ${clock(beaconAt - now)}`)}
      </button>
    </section>
  );
}

function ResultPanel({ round, participants, me, account, pending, act }: Parameters<typeof ActionPanel>[0] & { round: RoundJson }) {
  const s = round.settlement!;
  const win = s.outcome === "win";
  const mine = shares(participants, s.tactic as Tactic, BigInt(s.reward)).get(account ?? "") ?? 0n;
  const myDrops = s.drops.filter((d) => d.account === account);
  return (
    <section className={`card space-y-2 ${win ? "border-moss/70" : "border-blood/70"}`}>
      <h3 className="text-xl font-bold">
        {win ? "🎉 The town slew the Bear!" : "🐻 The Bear won raid"} {win ? `(raid #${round.id})` : `#${round.id}`}
      </h3>
      <p className="text-sm">
        The beacon rolled <b>{s.tactic_roll}</b> of 10,000: the Bear used {TACTIC_ICON[s.tactic]} <b>{tacticName(s.tactic)}</b>.{" "}
        <span className="text-dim">{TACTIC_EFFECTS[s.tactic as Tactic]}</span>
      </p>
      <p className="text-sm text-dim">
        Damage {slay(s.total_weight)} against {slay(s.effective_health)} health.{" "}
        {win ? `Loot: ${slay(s.reward)} $SLAY for ${round.participants} raiders.` : `It stole ${slay(s.steal)} $SLAY from the treasury.`}
      </p>
      {win && s.drops.length > 0 && (
        <p className="text-sm text-dim">Drops: {s.drops.map((d) => `${itemIcon(d.token_id)} ${d.qty} ${itemName(d.token_id)} → ${who(d.account, account)}`).join(" · ")}</p>
      )}
      {win && me && !me.claimed && (
        <button className="btn btn-primary" disabled={!!pending} onClick={() => void act({ method: "claim", roundId: round.id }, "Claim", `Claimed ${slay(mine)} $SLAY`)}>
          💰 Claim your {slay(mine)} $SLAY
        </button>
      )}
      {win && me?.claimed && <p className="text-sm text-moss">You claimed your share{myDrops.length ? " and got a drop!" : "."}</p>}
    </section>
  );
}
