"use client";
import { ONE, describeMood, explainBearMood, moodInputOf, roundTime, stealAmount, type GameConfig, type RoundJson, type StatusJson } from "@slay/rules";
import { BearArt } from "./BearArt";
import { clock, pct, slay, TACTIC_ICON, tacticName } from "@/lib/format";
import { lateStartsAtMs, lootPool, nextHealth, outcomes, previewHit, winChanceBps, type Phase } from "@/lib/derive";

export function BearPanel({
  config,
  status,
  round,
  history,
  phase,
  now,
}: {
  config: GameConfig;
  status: StatusJson;
  round: RoundJson | null;
  history: RoundJson[];
  phase: Phase;
  now: number;
}) {
  const live = round && (phase === "open" || phase === "ended") ? round : null;
  const mood = live ? live.mood : status.next_mood;
  const prev = live ? history.find((h) => h.id === live.id - 1) ?? null : history.find((h) => h.settlement) ?? null;
  const why = explainBearMood(prev ? moodInputOf(prev) : null);
  const odds = describeMood(mood, config);

  if (!live) {
    const health = nextHealth(config, status);
    const last = round?.settlement;
    return (
      <section className="card flex flex-col gap-4 sm:flex-row sm:items-center">
        <BearArt mood={mood} beaten={last?.outcome === "win"} size={150} />
        <div className="flex-1 space-y-2">
          <h2 className="text-2xl font-bold">{round ? "The Bear is resting" : "A Bear prowls outside town"}</h2>
          <p className="text-dim">
            The next raid starts with the first hit. The Bear will have <b className="text-parch">{slay(health)} health</b>, guarding a hoard
            of <b className="text-parch">{slay(status.hoard)} $SLAY</b>.
          </p>
          <MoodLine odds={odds} reason={why.reason} />
        </div>
      </section>
    );
  }

  const health = BigInt(live.health);
  const damage = BigInt(live.total_early) + BigInt(live.total_late);
  const armor = (health * 12n) / 10n;
  const scale = Number(armor > damage ? armor : damage);
  const fill = Math.min(100, (Number(damage) / scale) * 100);
  const deadline = Number(BigInt(live.deadline) / 1_000_000n);
  const lateAt = lateStartsAtMs(config, live);
  const chance = winChanceBps(config, live);
  const outs = outcomes(config, live);
  const pool = lootPool(config, status, live);
  const steal = stealAmount(config, BigInt(status.treasury), BigInt(live.base_health), mood);
  const bonus = previewHit(config, live, now, ONE, null).bonusBps;
  const beaconAt = Number(roundTime(BigInt(live.target_drand_round))) * 1000;

  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <BearArt mood={mood} angry={phase === "ended"} size={150} />
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-bold">Raid #{live.id}</h2>
            <div className={`font-mono text-3xl ${phase === "ended" ? "text-blood" : now >= lateAt ? "text-ember" : ""}`}>
              {phase === "ended" ? "TIME'S UP" : clock(deadline - now)}
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm text-dim">
              <span>
                Damage <b className="text-parch">{slay(damage)}</b> / health <b className="text-parch">{slay(health)}</b>
              </span>
              <span>{live.participants} raiders</span>
            </div>
            <div className="relative h-6 overflow-hidden rounded-md border border-edge bg-night">
              <div className="h-full bg-gradient-to-r from-blood to-ember transition-all duration-700" style={{ width: `${fill}%` }} />
              <div className="absolute inset-y-0 border-l-2 border-parch" style={{ left: `${(Number(health) / scale) * 100}%` }} title="Health" />
              <div className="absolute inset-y-0 border-l-2 border-dashed border-sky-300" style={{ left: `${(Number(armor) / scale) * 100}%` }} title="Health with Armor" />
            </div>
            <div className="mt-1 flex justify-between text-xs text-dim">
              <span>solid line: health · dashed: health if the Bear draws Armor (+20%)</span>
            </div>
          </div>
          <MoodLine odds={odds} reason={why.reason} />
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Stat label="Win chance if it ended now" value={`${(chance / 100).toFixed(0)}%`} hint={outs.map((o) => `${TACTIC_ICON[o.tactic]} ${o.win ? "win" : "loss"}`).join(" · ")} good={chance >= 5000} />
        <Stat label="Loot if the town wins" value={`${slay(pool)} $SLAY`} hint={`the Bear's hoard ${slay(status.hoard)} + treasury reward`} good />
        <Stat label="If the Bear wins it steals" value={`≈ ${slay(steal)} $SLAY`} hint="from the town treasury, into its hoard" />
      </div>
      <p className="text-xs text-dim">
        {phase === "open" ? (
          <>
            Hits now deal ×{(Number(bonus) / 10_000).toFixed(2)} (early bonus, falling to ×1.00 at the deadline).{" "}
            {now >= lateAt ? "These are late hits: a Feint would halve them." : `Late hits start in ${clock(lateAt - now)}; a Feint would halve them.`}
          </>
        ) : (
          <>
            The deciding drand round #{live.target_drand_round} {now >= beaconAt ? "is out" : `comes out in ${clock(beaconAt - now)}`}. Settling
            checks its signature on-chain, then draws the Bear's tactic and the drops from it.
          </>
        )}
      </p>
    </section>
  );
}

function MoodLine({ odds, reason }: { odds: { tactic: number; name: string; chanceBps: number }[]; reason: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-dim">Tactic odds:</span>
        {odds.map((o, i) => (
          <span key={o.tactic} className={`rounded-full border px-2 py-0.5 ${i === 0 ? "border-ember text-ember" : "border-edge text-dim"}`}>
            {TACTIC_ICON[o.tactic]} {o.name} {pct(o.chanceBps)}
          </span>
        ))}
      </div>
      <p className="text-sm italic text-dim">“{reason}” The tactic is drawn from the drand beacon after the deadline. Nobody knows it before.</p>
    </div>
  );
}

function Stat({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-edge bg-night/50 p-3">
      <div className="text-xs uppercase tracking-wide text-dim">{label}</div>
      <div className={`text-lg font-bold ${good ? "text-moss" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-dim">{hint}</div>}
    </div>
  );
}

export function tacticLabel(t: number) {
  return `${TACTIC_ICON[t]} ${tacticName(t)}`;
}
