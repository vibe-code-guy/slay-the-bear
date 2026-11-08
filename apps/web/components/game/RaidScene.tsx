"use client";
// The raid as a scene: the town square, the Bear, the villagers and raiders, the HUD and the
// Wheel of Fate. It reacts to what the chain reports (new hits in the feed, a settlement) and
// exposes an imperative API for the player's own moves, which animate at once and settle when
// the transaction confirms. Every number it shows comes from the contract's views.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ONE, Tactic, TACTIC_EFFECTS, explainBearMood, isTrophy, itemName, moodInputOf, moodWeights, roundTime, type GameConfig, type RoundJson } from "@slay/rules";
import { Bear, type BearPose } from "./Bear";
import { Backdrop } from "./Backdrop";
import { Hero, heroKindOf, type HeroKind, type HeroLook } from "./Hero";
import { LootReveal, type LootItem } from "./LootReveal";
import { Particles, type ParticlesHandle } from "./Particles";
import { Wheel, type WheelStage } from "./Wheel";
import { isMuted, onMuteChange, play, setMuted, unlockAudio } from "@/lib/sfx";
import { clock, itemIcon, pct, slay, TACTIC_ICON, tacticName, who } from "@/lib/format";
import { lateStartsAtMs, lootPool, outcomes, phaseOf, previewHit, winChanceBps } from "@/lib/derive";
import { flyTo } from "@/lib/fly";
import { itemTitle } from "@/lib/items";
import { trophyTraits } from "@/lib/trophy";
import { claimableShare, type ActionResult, type Snapshot } from "@/lib/types";

export interface RevealState {
  roundId: number;
  stage: "spinning" | "landing" | "landed";
  roll: number | null;
  tactic: number | null;
  outcome: "win" | "loss" | null;
}

export interface SceneHandle {
  strike(amountWhole: number, weapon: string | null, predicted: bigint): { resolve(res: ActionResult): void };
  spin(roundId: number): { fail(): void };
  claimed(amount: bigint): void;
}

interface FloatNum {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "mine" | "other" | "miss" | "crit" | "loot";
  pending: boolean;
  size: number;
}

interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: "gold" | "red" | "green" | "plain";
}

const VILLAGER_SLOTS: Record<string, { x: number; b: number; s: number }> = {
  bjorn: { x: 0.25, b: 0.04, s: 0.25 },
  fern: { x: 0.13, b: 0.12, s: 0.23 },
  sid: { x: 0.87, b: 0.12, s: 0.23 },
  sara: { x: 0.75, b: 0.04, s: 0.25 },
};
const YOU_SLOT = { x: 0.37, b: 0.0, s: 0.29 };
const GUEST_SLOTS = [
  { x: 0.63, b: 0.0, s: 0.24 },
  { x: 0.05, b: 0.24, s: 0.2 },
  { x: 0.95, b: 0.24, s: 0.2 },
  { x: 0.19, b: 0.27, s: 0.18 },
  { x: 0.81, b: 0.27, s: 0.18 },
];
const IMPACT = { x: 0.5, y: 0.52 };
const BEAR_HEAD = { x: 0.5, y: 0.36 };

const nsMs = (v: string) => Number(BigInt(v) / 1_000_000n);
let nextId = 1;

/** Same item to the same raider adds up: "9 Wood → Bjorn (3 drops)" instead of three lines. */
function groupDrops(drops: { account: string; token_id: string; qty: string }[]) {
  const out = new Map<string, { account: string; token_id: string; qty: bigint; n: number }>();
  for (const d of drops) {
    const k = `${d.account}|${d.token_id}`;
    const g = out.get(k);
    if (g) {
      g.qty += BigInt(d.qty);
      g.n += 1;
    } else out.set(k, { account: d.account, token_id: d.token_id, qty: BigInt(d.qty), n: 1 });
  }
  return [...out.values()];
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

// Flavour text only: what NPCs do is decided by the rules in packages/rules/src/npc.ts.
const BATTLE_CRIES: Record<"bjorn" | "fern" | "sid" | "sara", string> = {
  bjorn: "For the town! Early hits pay ×1.5!",
  fern: "Right behind you, Bjorn!",
  sid: "Now. Finishing it.",
  sara: "Now it's worth it!",
};
const OUCH = ["OUCH!", "Grrr… that stung!", "You'll pay for that!", "Was that a sword?!"];
const TAUNTS: Record<number, string[]> = {
  0: ["Just me and my hoard.", "Who's next?", "I could do this all day."],
  1: ["My armor is thicker than your courage.", "Is that a club or a twig?", "Clang! Try harder."],
  2: ["I'm hungry for your treasury!", "Hit me, if you dare!", "Every coin you keep, I'll take."],
  3: ["Wait for the end… I dare you.", "Late hits? I love late hits.", "Patience is a weakness."],
};

export const RaidScene = forwardRef<SceneHandle, {
  mode: "live" | "sim";
  config: GameConfig;
  snap: Snapshot;
  now: number;
  account: string | null;
  /** Villagers are `<name>.<villagerSuffix>`: the root account live, the sim contract offline. */
  villagerSuffix: string;
  weapon: string | null;
  charging: number | null;
  onReveal: (r: RevealState | null) => void;
  /** gear each raider has earned (from levels and trophies), by account */
  looks?: Map<string, HeroLook>;
  /** drawn over the scene, e.g. the title screen */
  overlay?: React.ReactNode;
}>(function RaidScene({ mode, config, snap, now, account, villagerSuffix, weapon, charging, onReveal, looks, overlay }, ref) {
  const particles = useRef<ParticlesHandle>(null);
  const [nums, setNums] = useState<FloatNum[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lunges, setLunges] = useState<Record<string, number>>({});
  const [cheer, setCheer] = useState<"win" | "loss" | null>(null);
  const [hitKey, setHitKey] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [roarUntil, setRoarUntil] = useState(0);
  const [reveal, setRevealState] = useState<RevealState | null>(null);
  const [muted, setMutedState] = useState(false);
  const [holdWheel, setHoldWheel] = useState(false);
  const [holdCard, setHoldCard] = useState(false);
  const [says, setSays] = useState<Record<string, { id: number; text: string }>>({});
  const [loot, setLoot] = useState<{ roundId: number; items: LootItem[]; share: bigint | null; randomness: string } | null>(null);
  /** what happens once your loot chest closes (or right away if there is none) */
  const afterLoot = useRef<(() => void) | null>(null);
  const sceneBox = useRef<HTMLDivElement>(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const accountRef = useRef(account);
  accountRef.current = account;
  const seenSeq = useRef<number | null>(null);
  const prev = useRef<{ id: number; settled: boolean } | null>(null);
  const prevPhase = useRef<{ id: number | null; phase: string } | null>(null);
  const lastDrum = useRef(0);
  const revealRef = useRef<RevealState | null>(null);
  revealRef.current = reveal;

  useEffect(() => {
    setMutedState(isMuted());
    return onMuteChange(setMutedState);
  }, []);

  const setReveal = useCallback(
    (r: RevealState | null) => {
      setRevealState(r);
      onReveal(r);
    },
    [onReveal],
  );

  const round = snap.round;
  const phase = phaseOf(round, now);
  const live = round && (phase === "open" || phase === "ended") ? round : null;
  const settled = round?.settlement ?? null;
  const settledAgoMs = settled ? now - nsMs(settled.settled_at) : Infinity;

  // ---------- who stands in the square ----------
  const heroes = useMemo(() => {
    const parts = live ? snap.participants : [];
    const dmg = new Map(parts.map((p) => [p.account, BigInt(p.early) + BigInt(p.late)]));
    const list: { account: string; kind: HeroKind; x: number; b: number; s: number; damage: bigint | null }[] = [];
    for (const [prefix, slot] of Object.entries(VILLAGER_SLOTS)) {
      const id = `${prefix}.${villagerSuffix}`;
      list.push({ account: id, kind: prefix as HeroKind, ...slot, damage: dmg.get(id) ?? null });
    }
    if (account) list.push({ account, kind: "you", ...YOU_SLOT, damage: dmg.get(account) ?? null });
    const guests = parts
      .filter((p) => p.account !== account && heroKindOf(p.account, account) === "guest")
      .sort((a, b) => Number(BigInt(b.early) + BigInt(b.late) - (BigInt(a.early) + BigInt(a.late))))
      .slice(0, GUEST_SLOTS.length);
    guests.forEach((g, i) => list.push({ account: g.account, kind: "guest", ...GUEST_SLOTS[i]!, damage: BigInt(g.early) + BigInt(g.late) }));
    return list;
  }, [live, snap.participants, account, villagerSuffix]);
  const hiddenGuests = live ? Math.max(0, snap.participants.filter((p) => p.account !== account && heroKindOf(p.account, account) === "guest").length - GUEST_SLOTS.length) : 0;

  const slotOf = useCallback(
    (acc: string) => {
      const h = heroes.find((x) => x.account === acc);
      return h ? { x: h.x, y: 1 - h.b - h.s * 0.6 } : null;
    },
    [heroes],
  );
  const slotOfRef = useRef(slotOf);
  slotOfRef.current = slotOf;

  /** A point of the scene (fractions of its size) on the screen, for things that fly to the HUD. */
  const onScreen = useCallback((x: number, y: number) => {
    const r = sceneBox.current?.getBoundingClientRect();
    return r ? { x: r.left + x * r.width, y: r.top + y * r.height } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }, []);

  // ---------- effects ----------
  const pushNum = useCallback((n: Omit<FloatNum, "id">, ttl = 1700) => {
    const id = nextId++;
    setNums((xs) => [...xs.slice(-14), { ...n, id }]);
    if (ttl > 0) setTimeout(() => setNums((xs) => xs.filter((x) => x.id !== id)), ttl);
    return id;
  }, []);

  const flash = useCallback((text: string, tone: Banner["tone"], sub?: string, ms = 2600) => {
    const id = nextId++;
    setBanner({ id, text, sub, tone });
    setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), ms);
  }, []);

  const impact = useCallback((damage: bigint, big: boolean, volume = 1) => {
    setHitKey((k) => k + 1);
    particles.current?.burst(IMPACT.x + (Math.random() - 0.5) * 0.06, IMPACT.y + (Math.random() - 0.5) * 0.08, "spark", big ? 30 : 16, big ? 1.4 : 1);
    if (volume > 0.5) play(big ? "crit" : "hit", 0.9 + Math.random() * 0.2);
    if (big) setShakeKey((k) => k + 1);
    if (damage >= 300n * ONE) setRoarUntil(Date.now() + 900);
  }, []);

  const lunge = useCallback((acc: string) => setLunges((l) => ({ ...l, [acc]: (l[acc] ?? 0) + 1 })), []);

  /** A speech bubble over the Bear ("bear") or a raider (their account). */
  const say = useCallback((who: string, text: string, ms = 3200) => {
    const id = nextId++;
    setSays((s) => ({ ...s, [who]: { id, text } }));
    setTimeout(
      () =>
        setSays((s) => {
          if (s[who]?.id !== id) return s;
          const { [who]: _, ...rest } = s;
          return rest;
        }),
      ms,
    );
  }, []);

  // ---------- react to the chain ----------
  useEffect(() => {
    // new feed items since the last snapshot
    const maxSeq = snap.feed.reduce((m, f) => Math.max(m, f.seq), -1);
    if (seenSeq.current === null) seenSeq.current = maxSeq;
    else if (maxSeq > seenSeq.current) {
      const fresh = snap.feed.filter((f) => f.seq > seenSeq.current!).sort((a, b) => a.seq - b.seq);
      seenSeq.current = maxSeq;
      fresh.forEach((f, i) => {
        setTimeout(() => {
          if (f.kind === "hit" && f.account !== account) {
            lunge(f.account);
            const kind = heroKindOf(f.account, account);
            if (kind !== "guest" && kind !== "you") say(f.account, BATTLE_CRIES[kind], 2200);
            setTimeout(() => {
              const dmg = BigInt(f.value);
              impact(dmg, !!f.detail && f.detail !== "late", 0.7);
              pushNum({ x: BEAR_HEAD.x + (Math.random() - 0.5) * 0.18, y: BEAR_HEAD.y, text: `-${slay(dmg)}`, tone: "other", pending: false, size: Math.min(1.6, 0.9 + Number(dmg / ONE) / 600) });
              if (dmg >= 250n * ONE && Math.random() < 0.5) say("bear", pick(OUCH), 2200);
            }, 220);
          } else if (f.kind === "open") {
            play("bell");
            flash(`Raid #${f.round} begins!`, "gold", `${who(f.account, account)} rang the bell`);
            setRoarUntil(Date.now() + 1100);
            setTimeout(() => play("roar"), 350);
            const before = snap.history.find((h) => h.id === (f.round ?? 0) - 1) ?? null;
            setTimeout(() => say("bear", explainBearMood(before ? moodInputOf(before) : null).reason, 6000), 2600);
          } else if (f.kind === "claim" && f.account !== account) {
            const s = slotOf(f.account);
            if (s) particles.current?.burst(s.x, s.y, "coin", 10, 0.7);
          } else if ((f.kind === "craft" || f.kind === "list") && f.account !== account && f.detail) {
            // a villager (or another player) forging or selling: they say so, and sparks fly
            const s = slotOf(f.account);
            if (s) {
              const what = isTrophy(f.detail) ? "a Bear trophy" : `${f.value} ${itemTitle(f.detail).toLowerCase()} charges`;
              say(f.account, f.kind === "craft" ? `🔨 Forged ${what}!` : `🏷️ Selling ${isTrophy(f.detail) ? "a Bear trophy" : itemTitle(f.detail).toLowerCase()} at the market!`, 4200);
              particles.current?.burst(s.x, s.y, "spark", 14, 0.8);
              if (f.kind === "craft") play("clank", 0.9);
            }
          } else if (f.kind === "smith_forge") {
            particles.current?.burst(0.9, 0.85, "spark", 14, 0.8);
          }
        }, i * 260);
      });
    }

    // round transitions: settlement, a new raid
    const cur = round ? { id: round.id, settled: !!round.settlement } : null;
    const p = prev.current;
    if (cur && p && cur.id === p.id) {
      if (!p.settled && cur.settled && round?.settlement && revealRef.current?.stage !== "spinning") {
        const s = round.settlement;
        setReveal({ roundId: round.id, stage: "landing", roll: s.tactic_roll, tactic: s.tactic, outcome: s.outcome });
      }
    }
    if (cur && p && cur.id !== p.id && !cur.settled) {
      setReveal(null);
      setCheer(null);
    }
    if (cur && !p && round?.settlement && settledAgoMs < 180_000) {
      const s = round.settlement;
      setReveal({ roundId: round.id, stage: "landed", roll: s.tactic_roll, tactic: s.tactic, outcome: s.outcome });
    }
    prev.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // the deadline passing, seen on the clock rather than in a snapshot
  useEffect(() => {
    const p = prevPhase.current;
    if (p && p.id === (round?.id ?? null) && p.phase === "open" && phase === "ended") {
      flash("TIME'S UP!", "red", "The Wheel of Fate will pick the Bear's tactic", 2400);
      setRoarUntil(Date.now() + 1200);
      play("roar");
      // the wheel rolls to the middle once the banner has gone, so the two never overlap
      setHoldWheel(true);
      setTimeout(() => setHoldWheel(false), 2300);
    }
    prevPhase.current = { id: round?.id ?? null, phase };
  }, [phase, round?.id, flash]);

  // the Bear taunts a quiet raid now and then
  useEffect(() => {
    if (phase !== "open" || !live) return;
    const t = setInterval(() => {
      if (Math.random() < 0.35) say("bear", pick(TAUNTS[live.mood] ?? TAUNTS[0]!), 3500);
    }, 11_000);
    return () => clearInterval(t);
  }, [phase, live?.id, live?.mood, say]); // eslint-disable-line react-hooks/exhaustive-deps

  // a spin the player started lands as soon as the settlement shows up
  useEffect(() => {
    if (reveal?.stage === "spinning" && round?.id === reveal.roundId && round.settlement) {
      const s = round.settlement;
      setReveal({ roundId: round.id, stage: "landing", roll: s.tactic_roll, tactic: s.tactic, outcome: s.outcome });
    }
  }, [reveal, round, setReveal]);

  // drums in the last ten seconds
  useEffect(() => {
    if (phase !== "open" || !live) return;
    const left = Math.ceil((nsMs(live.deadline) - now) / 1000);
    if (left <= 10 && left > 0 && left !== lastDrum.current) {
      lastDrum.current = left;
      play("drum", left <= 3 ? 1.25 : 1);
    }
  }, [now, phase, live]);

  const onLanded = useCallback(() => {
    const r = revealRef.current;
    if (!r || r.stage !== "landing") return;
    setReveal({ ...r, stage: "landed" });
    // the result card follows the banner (3.6 s) instead of sitting under it
    setHoldCard(true);
    if (r.outcome === "win") {
      flash("VICTORY!", "green", `The wheel picked ${tacticName(r.tactic ?? 0)} and the Bear still fell`, 3600);
      particles.current?.confetti();
      play("fanfare");
      setCheer("win");

      // after the banner (3.6 s): your loot chest, if the beacon gave you anything, then the rest
      const s = snapRef.current;
      const me = accountRef.current;
      const st = s.round?.id === r.roundId ? s.round.settlement : null;
      const mine: LootItem[] =
        me && st
          ? groupDrops(st.drops.filter((d) => d.account === me))
              .sort((a, b) => Number(isTrophy(a.token_id)) - Number(isTrophy(b.token_id)))
              .map((d) => ({ token_id: d.token_id, qty: d.qty }))
          : [];
      const share = me && s.round?.id === r.roundId ? claimableShare(s.round, s.me) : null;
      const theirTrophies = st ? st.drops.filter((d) => isTrophy(d.token_id) && d.account !== me) : [];
      afterLoot.current = () => {
        setHoldCard(false);
        say("bear", "Ugh… I'll be back, with a bigger hoard.", 4500);
        // a trophy that dropped to someone else: they say so, with sparks
        theirTrophies.forEach((d, i) =>
          setTimeout(() => {
            const slot = slotOfRef.current(d.account);
            if (!slot || !st) return;
            say(d.account, `🏆 A Bear trophy! ${trophyTraits(d.token_id, st.randomness).name}!`, 5200);
            particles.current?.burst(slot.x, slot.y, "spark", 26, 1.1);
            play("sparkle", 0.85);
          }, 700 + i * 900),
        );
      };
      setTimeout(() => {
        if (st && (mine.length > 0 || (share ?? 0n) > 0n)) setLoot({ roundId: r.roundId, items: mine, share, randomness: st.randomness });
        else {
          afterLoot.current?.();
          afterLoot.current = null;
        }
      }, 3700);
    } else {
      setTimeout(() => setHoldCard(false), 3500);
      flash("THE BEAR WINS", "red", `The wheel picked ${tacticName(r.tactic ?? 0)}. It raids the treasury`, 3600);
      play("lose");
      setTimeout(() => play("roar"), 500);
      particles.current?.coinsTo(0.08, 0.12, 0.6, 0.6, 22);
      setCheer("loss");
      setTimeout(() => say("bear", "Delicious treasury! Come back when you're stronger.", 4500), 3800);
    }
  }, [flash, setReveal, say]);

  useImperativeHandle(
    ref,
    () => ({
      strike(amountWhole, w, predicted) {
        void unlockAudio();
        play("swing");
        if (account) lunge(account);
        const big = !!w || predicted >= 250n * ONE;
        const id = pushNum({ x: BEAR_HEAD.x + 0.07, y: BEAR_HEAD.y - 0.04, text: `~${slay(predicted)}`, tone: "mine", pending: true, size: 1.2 }, 0);
        setTimeout(() => {
          impact(predicted, big);
          if (predicted >= 250n * ONE && Math.random() < 0.6) say("bear", pick(OUCH), 2200);
        }, 200);
        const drop = () => setTimeout(() => setNums((xs) => xs.filter((x) => x.id !== id)), 1700);
        const timeout = setTimeout(drop, 15_000);
        return {
          resolve(res) {
            clearTimeout(timeout);
            if (res.ok) {
              const d = res.damage ? BigInt(res.damage) : predicted;
              setNums((xs) => xs.map((x) => (x.id === id ? { ...x, text: `-${slay(d)}`, pending: false, tone: big ? "crit" : "mine", size: Math.min(1.9, 1.1 + Number(d / ONE) / 500) } : x)));
            } else {
              play("miss");
              particles.current?.burst(IMPACT.x, IMPACT.y, "shard", 10, 0.6);
              setNums((xs) => xs.map((x) => (x.id === id ? { ...x, text: "MISS", pending: false, tone: "miss" } : x)));
            }
            drop();
          },
        };
      },
      spin(roundId) {
        void unlockAudio();
        play("bell", 0.8);
        setReveal({ roundId, stage: "spinning", roll: null, tactic: null, outcome: null });
        return {
          fail() {
            if (revealRef.current?.stage === "spinning") setReveal(null);
          },
        };
      },
      claimed(amount) {
        play("coin");
        setTimeout(() => play("coin", 1.2), 160);
        particles.current?.coinsTo(0.5, 0.55, YOU_SLOT.x, 1 - YOU_SLOT.s * 0.5, 26);
        pushNum({ x: YOU_SLOT.x, y: 0.62, text: `+${slay(amount)} $SLAY`, tone: "loot", pending: false, size: 1.3 }, 2200);
        // then from your hero to the coin counter in the HUD
        setTimeout(() => {
          void flyTo("coins", onScreen(YOU_SLOT.x, 1 - YOU_SLOT.b - YOU_SLOT.s * 0.55), { count: Math.min(14, 4 + Number(amount / ONE) / 40), size: 20 }).then(() => play("coin", 1.4));
        }, 650);
      },
    }),
    [account, impact, lunge, pushNum, setReveal, say, onScreen],
  );

  // ---------- derived view ----------
  const showOutcome = reveal ? reveal.stage === "landed" : settledAgoMs < 180_000;
  const outcome = settled && showOutcome ? settled.outcome : null;
  const pose: BearPose =
    reveal && reveal.stage !== "landed"
      ? "angry"
      : phase === "ended"
        ? "angry"
        : live
          ? "idle"
          : outcome === "win"
            ? "defeated"
            : outcome === "loss"
              ? "gloat"
              : "sleep";
  const roaring = Date.now() < roarUntil;
  const shownMood = live ? live.mood : outcome && settled ? settled.tactic : snap.status.next_mood;
  // the wheel shows the odds of the raid it is deciding: the settled round's mood while it lands
  const revealing = !!reveal && !!round && reveal.roundId === round.id;
  const wheelMood = live ? live.mood : round && (revealing || (settled && showOutcome)) ? round.mood : snap.status.next_mood;
  const weights = moodWeights(wheelMood as Tactic, config.moodBps).map(Number);
  const suspense = !!reveal && reveal.stage !== "landed";

  const wheelStage: WheelStage = reveal ? reveal.stage : phase === "ended" ? "waiting" : settled && showOutcome ? "landed" : "idle";
  const wheelRoll = reveal?.roll ?? (settled && showOutcome ? settled.tactic_roll : null);
  const wheelCentered = !!reveal && reveal.stage !== "landed" ? true : phase === "ended" && !holdWheel;

  const deadline = live ? nsMs(live.deadline) : 0;
  const opened = live ? nsMs(live.opened_at) : 0;
  const lateAt = live ? lateStartsAtMs(config, live) : 0;
  const dusk = live ? Math.min(1, Math.max(0, (now - opened) / Math.max(1, deadline - opened))) : 0;
  const late = live && phase === "open" && now >= lateAt;
  const sky = outcome === "win" ? "win" : outcome === "loss" ? "loss" : live ? (late ? "late" : "raid") : "calm";

  const health = live ? BigInt(live.health) : 0n;
  const damage = live ? BigInt(live.total_early) + BigInt(live.total_late) : 0n;
  const armor = (health * 12n) / 10n;
  const scale = armor > damage ? armor : damage;
  const fill = live && scale > 0n ? Number((damage * 1000n) / scale) / 10 : 0;
  const healthAt = live && scale > 0n ? Number((health * 1000n) / scale) / 10 : 100;
  const chance = live ? winChanceBps(config, live) : 0;
  const outs = live ? outcomes(config, live) : [];
  const pool = live ? lootPool(config, snap.status, live) : 0n;
  const bonus = live && phase === "open" ? Number(previewHit(config, live, now, ONE, null).bonusBps) / 10_000 : 1;
  const beaconAt = live ? Number(roundTime(BigInt(live.target_drand_round))) * 1000 + 1500 : 0;
  const prevRound = live ? snap.history.find((h) => h.id === live.id - 1) ?? null : snap.history.find((h) => h.settlement) ?? null;
  const moodWhy = explainBearMood(prevRound ? moodInputOf(prevRound) : null).reason;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-edge bg-night shadow-2xl" aria-label="The raid">
      {/* scene-box (globals.css): the shape for the screen, capped to the room the page measured */}
      <div ref={sceneBox} key={shakeKey} className={`scene-box relative [container-type:size] ${shakeKey ? "scene-shake" : ""}`}>
        <Backdrop dusk={dusk} mood={sky} />

        {/* the Bear */}
        <div className="absolute bottom-[3%] left-1/2 h-[70%] -translate-x-1/2" style={{ aspectRatio: "320 / 340" }}>
          <div key={hitKey} className={`h-full w-full ${hitKey ? "bear-hit" : ""}`}>
            <Bear pose={pose} mood={shownMood} roaring={roaring} />
          </div>
        </div>

        {/* townsfolk */}
        {heroes.map((h) => {
          const left = h.x < 0.5;
          const k = lunges[h.account] ?? 0;
          return (
            <div
              key={h.account || h.kind}
              className="absolute -translate-x-1/2"
              style={{ left: `${h.x * 100}%`, bottom: `${h.b * 100}%`, height: `${h.s * 100}%`, aspectRatio: "100 / 130", zIndex: Math.round((1 - h.b) * 10) }}
            >
              {/* keys: a new one replays the lunge; kinds in front, so they can't clash with the bubble's */}
              <div key={`lunge-${k}`} className={`h-full w-full ${k ? (left ? "hero-lunge-r" : "hero-lunge-l") : cheer === "win" ? "hero-cheer" : cheer === "loss" ? "hero-cower" : "hero-idle"}`}>
                <div className="h-full w-full" style={{ transform: left ? undefined : "scaleX(-1)" }}>
                  <Hero kind={h.kind} account={h.account} weapon={h.kind === "you" ? weapon : undefined} look={looks?.get(h.account)} />
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-1.5 text-[9px] leading-4 text-parch @xl:text-[11px]">
                {h.kind === "you" ? "you" : who(h.account, account).replace(/^guest /, "")}
                {h.damage !== null && h.damage > 0n && <span className="ml-1 text-ember">{slay(h.damage)}</span>}
              </div>
              {h.kind === "you" && charging !== null && (
                <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-ember px-2 text-xs font-black text-night shadow">
                  {charging} $SLAY
                </div>
              )}
              {says[h.account] && !banner && (
                <div
                  key={`say-${says[h.account]!.id}`}
                  // raiders near the edge speak inwards, so the bubble stays inside the scene
                  className={`bubble-pop pointer-events-none absolute -top-1 z-20 w-max max-w-[11rem] -translate-y-full rounded-xl bg-parch px-2 py-1 text-[10px] font-semibold leading-tight text-night shadow-lg @xl:text-xs ${
                    h.x < 0.2 ? "left-0" : h.x > 0.8 ? "right-0" : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  {says[h.account]!.text}
                  <span className={`absolute -bottom-1.5 h-3 w-3 rotate-45 bg-parch ${h.x < 0.2 ? "left-4" : h.x > 0.8 ? "right-4" : "left-1/2 -translate-x-1/2"}`} />
                </div>
              )}
            </div>
          );
        })}
        {hiddenGuests > 0 && <div className="absolute bottom-[2%] right-[2%] rounded bg-black/55 px-2 text-xs text-parch">+{hiddenGuests} more raiders</div>}

        {says.bear && !wheelCentered && !banner && (
          <div
            key={`bear-say-${says.bear.id}`}
            className="bubble-pop pointer-events-none absolute left-[57%] top-[38%] z-20 max-w-[26%] rounded-2xl border-2 border-night bg-parch px-2 py-1 text-[10px] font-bold leading-snug text-night shadow-xl @xl:left-[60%] @xl:top-[31%] @xl:max-w-[24%] @xl:px-3 @xl:py-1.5 @xl:text-sm"
          >
            {says.bear.text}
            <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-night bg-parch" />
          </div>
        )}

        {/* floating numbers */}
        {nums.map((n) => (
          <div
            key={n.id}
            className={`pointer-events-none absolute -translate-x-1/2 font-black ${n.pending ? "num-pending" : "num-float"}`}
            style={{
              left: `${n.x * 100}%`,
              top: `${n.y * 100}%`,
              fontSize: `clamp(14px, ${2.2 * n.size}cqw, ${44 * n.size}px)`,
              color: n.tone === "miss" ? "#9ca3af" : n.tone === "other" ? "#fef3c7" : n.tone === "loot" ? "#facc15" : n.tone === "crit" ? "#fde047" : "#fb923c",
              WebkitTextStroke: "1.5px #1b120a",
              textShadow: "0 3px 0 #1b120a",
              fontFamily: "Impact, 'Arial Black', sans-serif",
            }}
          >
            {n.text}
            {n.tone === "crit" && <span className="ml-1 text-[0.5em] align-top">CRIT</span>}
          </div>
        ))}

        <Particles ref={particles} />

        {/* HUD: top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 @xl:p-3">
          <div className="rounded-xl bg-black/55 px-3 py-1.5 backdrop-blur-sm">
            <div className="font-[family-name:var(--font-display)] text-sm font-bold @xl:text-lg">{live ? `Raid #${live.id}` : round ? `After raid #${round.id}` : "Quiet town"}</div>
            <div className="whitespace-nowrap text-[10px] text-dim @xl:text-xs" title={moodWhy}>
              {live
                ? `Mood ${TACTIC_ICON[live.mood]} ${tacticName(live.mood)}`
                : suspense
                  ? "The wheel decides…"
                  : settled && showOutcome
                    ? `Drew ${TACTIC_ICON[settled.tactic]} ${tacticName(settled.tactic)} · roll ${settled.tactic_roll}`
                    : `Next mood ${TACTIC_ICON[snap.status.next_mood]} ${tacticName(snap.status.next_mood)}`}
              <span className="hidden @xl:inline"> · {mode === "live" ? "NEAR testnet" : "simulation"}</span>
            </div>
          </div>
          {live && (
            <div className="flex flex-col items-center">
              <div className={`rounded-xl px-3 py-1 font-mono text-xl font-black shadow @xl:text-3xl ${phase === "ended" ? "bg-blood text-white" : late ? "timer-late bg-black/60 text-ember" : "bg-black/60 text-parch"}`}>
                {phase === "ended" ? "0:00" : clock(deadline - now)}
              </div>
              {phase === "open" && (
                <div className="mt-1 hidden w-40 @xl:block" title="Early hits deal more damage">
                  <div className="h-1.5 overflow-hidden rounded bg-black/60">
                    <div className={`h-full ${late ? "bg-blood" : "bg-ember"}`} style={{ width: `${((bonus - 1) / ((Number(config.earlyBonusMaxBps) - 10_000) / 10_000)) * 100}%` }} />
                  </div>
                  <div className="mt-0.5 text-center text-[10px] text-parch/90">{late ? "late hits: a Feint would halve them" : `early bonus ×${bonus.toFixed(2)}`}</div>
                </div>
              )}
            </div>
          )}
          <div className="rounded-xl bg-black/55 px-2 py-1.5 text-right backdrop-blur-sm @xl:px-3">
            <div className="whitespace-nowrap text-sm font-bold text-moss @xl:text-base">
              💰 {suspense ? "?" : live ? slay(pool) : slay(snap.status.hoard)}
              <span className="hidden @xl:inline"> $SLAY</span>
            </div>
            <div className="whitespace-nowrap text-[10px] text-dim @xl:text-xs">
              <span className="@xl:hidden">{suspense ? "loot?" : live ? "loot" : "hoard"}</span>
              <span className="hidden @xl:inline">{suspense ? "the wheel decides" : live ? "loot if the town wins" : "in the Bear's hoard"}</span>
            </div>
          </div>
        </div>

        {/* health bar */}
        {live && (
          // below the timer and its early-bonus bar, however short the scene is
          <div data-tour="health" className="pointer-events-none absolute left-1/2 top-[max(21cqh,3.5rem)] w-[64%] -translate-x-1/2 @xl:top-[max(17cqh,4.9rem)] @xl:w-[44%]">
            <div className="mb-0.5 flex justify-between text-[10px] font-bold text-parch drop-shadow @xl:text-xs">
              <span>
                ⚔️ {slay(damage)} / ❤️ {slay(health)}
              </span>
              <span className={chance >= 5000 ? "text-moss" : "text-ember"}>win chance {Math.round(chance / 100)}%</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full border border-black/60 bg-black/60 @xl:h-4">
              <div className="absolute inset-y-0 left-0 bg-white/80 transition-[width] delay-300 duration-1000" style={{ width: `${fill}%` }} />
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blood to-ember transition-[width] duration-300" style={{ width: `${fill}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-parch" style={{ left: `${healthAt}%` }} />
              <div className="absolute inset-y-0 right-0 w-0.5 bg-sky-300" />
            </div>
            <div className="mt-0.5 flex justify-center gap-1 text-[9px] @xl:text-[11px]">
              {outs.map((o) => (
                <span key={o.tactic} className={`rounded px-1 ${o.win ? "bg-moss/80 text-white" : "bg-black/60 text-dim"}`}>
                  {TACTIC_ICON[o.tactic]} {o.win ? "win" : "lose"}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Wheel of Fate. Placed in container units (the scene is a size container), so moving
            between the corner and the middle animates left/top/height instead of jumping.
            The wheel is 200 × 222, so its width is 0.9 × its height. */}
        <div
          className={`absolute z-20 aspect-[200/222] transition-all duration-700 ease-out ${
            wheelCentered
              ? "left-[calc(50cqw_-_27.93cqh)] top-[21.5cqh] h-[62cqh]"
              : "left-[calc(98.5cqw_-_19.82cqh)] top-[40cqh] h-[22cqh] @xl:left-[calc(98.5cqw_-_23.42cqh)] @xl:top-[24cqh] @xl:h-[26cqh]"
          }`}
        >
          <Wheel
            weights={weights}
            favorite={wheelMood}
            stage={wheelStage}
            roll={wheelRoll}
            onLanded={onLanded}
            label={
              wheelCentered
                ? reveal?.stage === "spinning"
                  ? "checking drand's signature on NEAR…"
                  : reveal?.stage === "landing"
                    ? `roll ${reveal.roll} of 10,000`
                    : now < beaconAt
                      ? `drand round ${live?.target_drand_round} in ${clock(beaconAt - now)}`
                      : `drand round ${live?.target_drand_round} is out`
                : wheelStage === "landed" && wheelRoll !== null
                  ? `rolled ${wheelRoll}: ${tacticName(settled?.tactic ?? 0)}`
                  : "Wheel of Fate"
            }
          />
        </div>

        {/* result card */}
        {!live && settled && showOutcome && !holdCard && (
          <div className="card-in absolute left-[2%] top-[24%] z-10 w-[48%] rounded-xl border border-edge bg-black/70 p-2 text-[10px] backdrop-blur-sm @xl:w-[min(42%,280px)] @xl:p-3 @xl:text-xs">
            <div className={`font-[family-name:var(--font-display)] text-xs font-bold @xl:text-base ${settled.outcome === "win" ? "text-moss" : "text-blood"}`}>
              {settled.outcome === "win" ? `Raid #${round!.id}: the town won` : `Raid #${round!.id}: the Bear won`}
            </div>
            <div className="mt-1 text-parch">
              {TACTIC_ICON[settled.tactic]} {tacticName(settled.tactic)} (roll {settled.tactic_roll})
              <span className="hidden text-dim @xl:inline">: {TACTIC_EFFECTS[settled.tactic as Tactic]}</span>
            </div>
            <div className="mt-1 text-dim">
              {slay(settled.total_weight)} damage vs {slay(settled.effective_health)} health ·{" "}
              {settled.outcome === "win" ? `${slay(settled.reward)} $SLAY loot` : `${slay(settled.steal)} $SLAY stolen`}
            </div>
            {settled.drops.length > 0 && (
              <div className="mt-1 hidden text-dim @xl:block">
                Drops:{" "}
                {groupDrops(settled.drops)
                  .map((d) => `${itemIcon(d.token_id)} ${d.qty} ${itemName(d.token_id)} → ${who(d.account, account)}${d.n > 1 ? ` (${d.n} drops)` : ""}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        )}

        {/* idle hint */}
        {!live && !suspense && !(settled && showOutcome) && (
          <div className="absolute left-1/2 top-[22%] -translate-x-1/2 rounded-xl bg-black/55 px-3 py-1.5 text-center text-xs text-parch backdrop-blur-sm @xl:text-sm">
            The Bear sleeps on a hoard of {slay(snap.status.hoard)} $SLAY. Strike to wake it.
            <div className="text-[10px] text-dim @xl:text-xs">
              Next mood: {TACTIC_ICON[snap.status.next_mood]} {tacticName(snap.status.next_mood)} ({pct(config.moodBps)})
            </div>
          </div>
        )}

        {/* your loot chest after a won raid */}
        {loot && (
          <LootReveal
            key={`loot-${loot.roundId}`}
            {...loot}
            onClose={() => {
              setLoot(null);
              afterLoot.current?.();
              afterLoot.current = null;
            }}
          />
        )}

        {/* banner */}
        {banner && (
          <div key={`banner-${banner.id}`} className="banner-pop pointer-events-none absolute inset-x-0 top-[40%] z-30 bg-gradient-to-r from-transparent via-black/70 to-transparent py-1.5 text-center @xl:top-[33%] @xl:py-3">
            <div
              // sized by the scene's height, so a banner never fills a small scene
              className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,11cqh,3.75rem)] font-black leading-tight tracking-wide"
              style={{
                color: banner.tone === "green" ? "#4ade80" : banner.tone === "red" ? "#f87171" : banner.tone === "gold" ? "#fbbf24" : "#f3e7cf",
                WebkitTextStroke: "2px #1b120a",
                textShadow: "0 4px 0 #1b120a, 0 0 24px rgba(0,0,0,0.6)",
              }}
            >
              {banner.text}
            </div>
            {banner.sub && <div className="mt-0.5 px-2 text-[clamp(0.625rem,3cqh,1rem)] font-bold text-parch drop-shadow @xl:mt-1">{banner.sub}</div>}
          </div>
        )}

        <button
          type="button"
          className="absolute bottom-2 right-2 z-30 rounded-full bg-black/60 px-2 py-1 text-sm"
          aria-label={muted ? "Turn sound on" : "Mute"}
          onClick={() => {
            void unlockAudio();
            setMuted(!muted);
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>

        {overlay}
      </div>
    </section>
  );
});

export type { RoundJson };
