// What a command shows: one model of the game for `--json` (agents) and the same facts as plain
// text (people). Every number comes from the contract's views and the published rules.
import {
  ONE,
  TACTIC_EFFECTS,
  Tactic,
  lateStartsAtMs,
  lootPool,
  lootShare,
  moodWeights,
  outcomes,
  phaseOf,
  previewHit,
  weight,
  winChanceBps,
  type FeedItemJson,
  type ParticipantJson,
  type RoundJson,
  type Snapshot,
} from "@slay/rules";
import { duration, iso, itemText, slayNum, slayText, tacticName, who } from "./format";
import { beaconAtMs, type Session } from "./session";

export interface ResultModel {
  outcome: "win" | "loss";
  tactic: string;
  effect: string;
  roll: number;
  beaconRound: string | null;
  damage: number;
  effectiveHealth: number;
  loot: number;
  stolen: number;
  drops: { to: string; item: string; qty: number }[];
  settledBy: string;
  tip: number;
  yourDamage: number | null;
  yourShare: number | null;
  yourShareClaimed: boolean;
}

export interface RaidModel {
  id: number;
  phase: "open" | "ended" | "settled";
  openedAt: string;
  deadline: string;
  secondsLeft: number;
  health: number;
  damage: number;
  early: number;
  late: number;
  raiders: number;
  mood: string;
  /** Chance (percent) the beacon draws each tactic. */
  moodOdds: Record<string, number>;
  /** For each tactic: would the town win if the raid ended with the damage dealt so far? */
  ifEndedNow: { tactic: string; chance: number; win: boolean; damage: number; health: number }[];
  winChance: number;
  /** Damage multiplier of a hit made now (1.5 at the open down to 1.0 at the deadline). */
  earlyBonus: number;
  /** Seconds until hits count as late (Feint halves late hits); null when the raid is not on. */
  lateInSeconds: number | null;
  /** $SLAY the raiders share if the town wins (the hoard plus a treasury reward). */
  loot: number;
  drandRound: string;
  /** Seconds until drand publishes the deciding round (0 once it is out). */
  beaconInSeconds: number;
  result: ResultModel | null;
}

export interface YouModel {
  account: string;
  balance: number;
  items: Record<string, number>;
  trophies: string[];
  /** Your part in the raid shown, if you hit in it. */
  raid: { id: number; hits: number; damage: number; hitsLeft: number } | null;
  claimable: { raid: number; share: number }[];
}

export interface StatusModel {
  mode: "sim" | "live";
  game: string;
  where: string;
  now: string;
  you: YouModel | null;
  raid: RaidModel | null;
  town: { hoard: number; treasury: number; burned: number; nextMood: string; bearWonLast: boolean; listings: number; clubPrice: number };
  next: string[];
}

const b = (v: string) => BigInt(v);
const msOf = (ns: string) => Number(b(ns) / 1_000_000n);

export function resultModel(r: RoundJson, mine: ParticipantJson | null, me: string | null): ResultModel | null {
  const s = r.settlement;
  if (!s) return null;
  const share = s.outcome === "win" && mine ? lootShare(weight(b(mine.early), b(mine.late), s.tactic as Tactic), b(s.total_weight), b(s.reward)) : null;
  return {
    outcome: s.outcome as "win" | "loss",
    tactic: tacticName(s.tactic),
    effect: TACTIC_EFFECTS[s.tactic as Tactic],
    roll: s.tactic_roll,
    beaconRound: s.beacon_round,
    damage: slayNum(s.total_weight),
    effectiveHealth: slayNum(s.effective_health),
    loot: s.outcome === "win" ? slayNum(s.reward) : 0,
    stolen: s.outcome === "loss" ? slayNum(s.steal) : 0,
    drops: s.drops.map((d) => ({ to: who(d.account, me), item: d.token_id, qty: Number(d.qty) })),
    settledBy: who(s.settler, me),
    tip: slayNum(s.tip),
    yourDamage: mine ? slayNum(b(mine.early) + b(mine.late)) : null,
    yourShare: share === null ? null : slayNum(share),
    yourShareClaimed: !!mine?.claimed,
  };
}

export function statusModel(s: Session, snap: Snapshot): StatusModel {
  const c = s.config;
  const now = snap.nowMs;
  const me = s.me();
  const r = snap.round;
  const phase = phaseOf(r, now);
  const m = `slay ${s.mode}`;
  let raid: RaidModel | null = null;

  if (r && phase !== "idle") {
    const deadlineMs = msOf(r.deadline);
    const weights = moodWeights(r.mood as Tactic, c.moodBps);
    const st = r.settlement;
    raid = {
      id: r.id,
      phase,
      openedAt: iso(msOf(r.opened_at)),
      deadline: iso(deadlineMs),
      secondsLeft: phase === "open" ? Math.ceil((deadlineMs - now) / 1000) : 0,
      health: slayNum(r.health),
      damage: slayNum(b(r.total_early) + b(r.total_late)),
      early: slayNum(r.total_early),
      late: slayNum(r.total_late),
      raiders: r.participants,
      mood: tacticName(r.mood),
      moodOdds: Object.fromEntries([0, 1, 2, 3].map((t) => [tacticName(t), Number(weights[t]) / 100])),
      ifEndedNow: outcomes(c, r).map((o) => ({ tactic: tacticName(o.tactic), chance: o.chanceBps / 100, win: o.win, damage: slayNum(o.weight), health: slayNum(o.health) })),
      winChance: winChanceBps(c, r) / 100,
      earlyBonus: phase === "open" ? Number(previewHit(c, r, now, ONE, null).bonusBps) / 10_000 : 1,
      lateInSeconds: phase === "open" ? Math.max(0, Math.ceil((lateStartsAtMs(c, r) - now) / 1000)) : null,
      loot: st ? (st.outcome === "win" ? slayNum(st.reward) : 0) : slayNum(lootPool(c, snap.status, r)),
      drandRound: r.target_drand_round,
      beaconInSeconds: Math.max(0, Math.ceil((beaconAtMs(c, r.target_drand_round) - now) / 1000)),
      result: resultModel(r, snap.me, me),
    };
  }

  let you: YouModel | null = null;
  if (me && snap.player) {
    const p = snap.player;
    you = {
      account: me,
      balance: slayNum(p.balance),
      items: Object.fromEntries(p.items.map(([t, q]) => [t, Number(q)])),
      trophies: p.trophies,
      raid: snap.me && r ? { id: r.id, hits: snap.me.hits, damage: slayNum(b(snap.me.early) + b(snap.me.late)), hitsLeft: c.maxHitsPerAccount - snap.me.hits } : null,
      claimable: snap.claimable.map((x) => ({ raid: x.roundId, share: slayNum(x.share) })),
    };
  }

  const next: string[] = [];
  if (!you) {
    next.push(s.mode === "live" ? `${m} join   (a free guest account; or --account <your.testnet>)` : `${m} new   (start a town)`);
  } else {
    const total = snap.claimable.reduce((t, x) => t + x.share, 0n);
    if (total > 0n) next.push(`${m} claim   (collect ${slayText(total)} $SLAY of loot)`);
    const top = Math.min(Number(c.maxHit / ONE), Math.floor(you.balance));
    const hit = top >= Number(c.minHit / ONE) ? `${m} hit <${Number(c.minHit / ONE)}-${top}>` : null;
    if (!raid || raid.phase === "settled") {
      if (hit) next.push(`${hit}   (wake the Bear: the first hit opens a ${Number(c.roundSecs) / 60}-minute raid)`);
      next.push(s.mode === "sim" ? `${m} wait 20   (if nobody hits, a villager rings the bell)` : `${m} wait 30   (watch the town)`);
    } else if (raid.phase === "open") {
      if (hit) next.push(`${hit}   (strike now: x${raid.earlyBonus.toFixed(2)} early bonus)`);
      next.push(`${m} wait 30   (let time pass; the villagers act)`);
      next.push(`${m} wait end   (skip to the end of the raid)`);
    } else if (raid.beaconInSeconds > 0) {
      next.push(`${m} wait end   (drand round ${raid.drandRound} is out in ${raid.beaconInSeconds}s)`);
    } else {
      next.push(`${m} settle   (spin the Wheel of Fate with drand round ${raid.drandRound}; earns the ${slayText(c.settleTip)} $SLAY tip)`);
    }
    if (raid?.phase === "settled") next.push(`${m} verify ${raid.id}   (recompute the raid from public data)`);
    if (!hit && total === 0n) next.push(`${m} me   (you are out of $SLAY: sell materials with \`${m} smith sell wood all\`)`);
  }

  const st = snap.status;
  return {
    mode: s.mode,
    game: s.contractId,
    where: s.label,
    now: iso(now),
    you,
    raid,
    town: {
      hoard: slayNum(st.hoard),
      treasury: slayNum(st.treasury),
      burned: slayNum(st.burned),
      nextMood: tacticName(st.next_mood),
      bearWonLast: st.bear_won_last,
      listings: st.listings,
      clubPrice: slayNum(st.club_price),
    },
    next,
  };
}

const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function renderResult(x: ResultModel, id: number): string[] {
  const L = [`RAID #${id}: SETTLED - ${x.outcome === "win" ? "the town WON" : "the Bear WON"}`];
  L.push(`  The beacon${x.beaconRound ? ` (drand round ${x.beaconRound})` : ""} drew ${x.tactic}, roll ${x.roll} of 10000: ${x.effect}`);
  L.push(`  ${n(x.damage)} damage against ${n(x.effectiveHealth)} health. ${x.outcome === "win" ? `Loot: ${n(x.loot)} $SLAY, shared by damage.` : `The Bear stole ${n(x.stolen)} $SLAY from the treasury into its hoard.`}`);
  if (x.drops.length) L.push(`  Drops: ${x.drops.map((d) => `${itemText(d.item, d.qty)} -> ${d.to}`).join(", ")}`);
  if (x.yourShare !== null) L.push(`  Your share: ${n(x.yourShare)} $SLAY (${x.yourShareClaimed ? "claimed" : "not claimed yet"})`);
  else if (x.yourDamage !== null) L.push(`  You dealt ${n(x.yourDamage)} damage.`);
  L.push(`  Settled by ${x.settledBy}${x.tip ? ` (tip ${n(x.tip)} $SLAY)` : ""}.`);
  return L;
}

export function renderStatus(m: StatusModel): string[] {
  const L = [`Slay the Bear - ${m.where} - ${m.now}`];
  const r = m.raid;
  const outs = (x: RaidModel) => x.ifEndedNow.map((o) => `${o.tactic} ${o.win ? "WIN" : "lose"}`).join(", ");
  if (!r) {
    L.push(`NO RAID YET. The Bear sleeps on a hoard of ${n(m.town.hoard)} $SLAY. Its next mood: ${m.town.nextMood}.`);
  } else if (r.phase === "open") {
    const others = Object.entries(r.moodOdds).find(([t]) => t !== r.mood)?.[1] ?? 0;
    L.push(`RAID #${r.id}: ON, ${duration(r.secondsLeft * 1000)} left`);
    L.push(`  The Bear: ${n(r.health)} health, mood ${r.mood} (the beacon draws ${r.mood} ${r.moodOdds[r.mood]}%, each other tactic ${others}%)`);
    L.push(`  Damage so far: ${n(r.damage)} from ${r.raiders} raider${r.raiders === 1 ? "" : "s"}${r.late ? ` (${n(r.late)} of it late)` : ""}`);
    L.push(`  If it ended now: ${outs(r)} -> win chance ${r.winChance}%`);
    L.push(`  A hit now deals x${r.earlyBonus.toFixed(2)} (early bonus). ${r.lateInSeconds ? `Hits count as late in ${duration(r.lateInSeconds * 1000)}.` : "Hits are late now: a Feint halves them."}`);
    L.push(`  Loot if the town wins: ${n(r.loot)} $SLAY, shared by damage`);
  } else if (r.phase === "ended") {
    L.push(`RAID #${r.id}: TIME'S UP. ${n(r.damage)} damage against ${n(r.health)} health.`);
    L.push(`  If the beacon draws: ${outs(r)} -> win chance ${r.winChance}%`);
    L.push(
      r.beaconInSeconds > 0
        ? `  The deciding drand round ${r.drandRound} is out in ${duration(r.beaconInSeconds * 1000)}.`
        : `  The deciding drand round ${r.drandRound} is out: anyone can settle the raid now and earn the tip.`,
    );
  } else if (r.result) {
    L.push(...renderResult(r.result, r.id));
  }
  if (m.you) {
    const y = m.you;
    const items = Object.entries(y.items).map(([t, q]) => itemText(t, q));
    const raidLine = y.raid ? `raid #${y.raid.id}: ${y.raid.hits} hit${y.raid.hits === 1 ? "" : "s"}, ${n(y.raid.damage)} damage` : "no hits in this raid";
    L.push(`YOU: ${n(y.balance)} $SLAY | ${raidLine} | items: ${items.join(", ") || "none"} | trophies: ${y.trophies.join(", ") || "none"}`);
    if (y.claimable.length) L.push(`  Loot to claim: ${y.claimable.map((c) => `raid #${c.raid}: ${n(c.share)} $SLAY`).join(", ")}`);
  } else {
    L.push("YOU: not in town yet");
  }
  L.push(`TOWN: the Bear's hoard ${n(m.town.hoard)} $SLAY | next mood ${m.town.nextMood} | ${m.town.listings} listing${m.town.listings === 1 ? "" : "s"} at the market`);
  L.push("NEXT:", ...m.next.map((x) => `  ${x}`));
  return L;
}

/** One line of the town feed in words. */
export function narrate(f: FeedItemJson, me: string | null): string {
  const w = who(f.account, me);
  const d = f.detail ?? "";
  switch (f.kind) {
    case "hit": {
      const weapon = d.split(",").find((x) => x && x !== "late");
      return `${w} hit raid #${f.round} for ${slayText(f.value)} damage (${slayText(f.amount)} $SLAY burned${weapon ? `, ${weapon}` : ""}${d.includes("late") ? ", late" : ""})`;
    }
    case "pouch":
      return `${w} arrived in town with a starter pouch`;
    case "claim":
      return `${w} claimed ${slayText(f.amount)} $SLAY of loot from raid #${f.round}`;
    case "craft":
      return `${w} forged ${f.value} ${d} charges (fee ${slayText(f.amount)} $SLAY burned)`;
    case "list":
      return `${w} put ${itemText(d, f.value)} up for sale at ${slayText(f.amount)} $SLAY each`;
    case "buy":
      return `${w} bought ${itemText(d, f.value)} for ${slayText(f.amount)} $SLAY`;
    case "smith_sell":
      return `${w} bought ${f.value} club charges from the smith for ${slayText(f.amount)} $SLAY`;
    case "smith_buy":
      return `${w} sold ${f.value} ${d} to the smith for ${slayText(f.amount)} $SLAY`;
    case "smith_forge":
      return `the smith forged ${f.value} club charges`;
    case "open":
      return `${w} rang the bell: raid #${f.round} begins; the Bear has ${slayText(f.amount)} health and feels like ${tacticName(Number(f.value))}`;
    case "settle":
      return d === "win"
        ? `raid #${f.round} settled by ${w}: the beacon drew ${tacticName(Number(f.value))} and the town won ${slayText(f.amount)} $SLAY of loot`
        : `raid #${f.round} settled by ${w}: the beacon drew ${tacticName(Number(f.value))} and the Bear stole ${slayText(f.amount)} $SLAY`;
    default:
      return `${w}: ${f.kind}`;
  }
}
