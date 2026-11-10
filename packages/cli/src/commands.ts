// The commands, written once for both modes against a Session. Each returns the same facts
// twice: `json` for --json and `text` for people.
import {
  ERRORS,
  QUICKNET,
  RECIPES,
  WEAPON_MULT_BPS,
  describeConfig,
  isTrophy,
  isWeapon,
  phaseOf,
  previewHit,
  verifyRound,
  type RecipeId,
  type WeaponId,
} from "@slay/rules";
import { flagString, type Args } from "./args";
import { duration, iso, itemText, parseSlay, slayNum, slayText, who } from "./format";
import { rulesText } from "./help";
import { narrate, renderResult, renderStatus, resultModel, statusModel } from "./report";
import { beaconAtMs, type Session } from "./session";

export interface Out {
  ok: boolean;
  /** 0 by default when ok, 1 when not; 2 for usage errors */
  exitCode?: number;
  json: Record<string, unknown>;
  text: string[];
}

const MESSAGES: Record<string, string> = {
  ...ERRORS,
  nothing_to_settle: "No raid is waiting to be settled.",
  nothing_to_claim: "You have no loot to claim.",
  no_raid_on: "No raid is on.",
  not_joined: "You have not joined the game yet.",
  no_site: "No hosted site to make a guest account with.",
  no_listing: "There is no such listing.",
  no_round: "There is no such raid.",
};

const HINTS: Record<string, (m: string) => string> = {
  round_ended: (m) => `The raid is over: \`${m} settle\` it (after \`${m} wait end\` if its beacon is not out yet).`,
  beacon_not_out: (m) => `\`${m} wait end\`, then \`${m} settle\`.`,
  round_not_over: (m) => `The raid is still on; \`${m} wait end\` skips to its end.`,
  insufficient_balance: (m) => `See \`${m} me\`. Claim loot (\`${m} claim\`) or sell materials (\`${m} smith sell wood all\`).`,
  no_weapon_charge: (m) => `Buy club charges (\`${m} smith buy 5\`) or forge a weapon (\`${m} craft sword\`).`,
  bad_hit_amount: () => "Hit with 1 to 1,000 $SLAY.",
  need_wood: (m) => `Wood and iron drop from won raids (3 drops per win, by damage). See \`${m} me\`, or buy some at the \`${m} market\`.`,
  need_iron: (m) => `Wood and iron drop from won raids (3 drops per win, by damage). See \`${m} me\`, or buy some at the \`${m} market\`.`,
  need_trophy: (m) => `One drop in twenty is a Bear trophy; the villagers sell theirs at the \`${m} market\`.`,
  already_settled: (m) => `Someone settled it first: \`${m} status\` shows the result.`,
  nothing_to_settle: (m) => `See \`${m} status\`.`,
  nothing_to_claim: (m) => `Loot comes from won raids you hit in. See \`${m} raids\`.`,
  no_raid_on: (m) => `\`${m} hit <amount>\` wakes the Bear and opens a raid.`,
  not_joined: () => "`slay live join` (a free guest), or `slay live join --account <your.testnet>`.",
  "Join the town first.": () => "`slay live join`.",
  no_site: () =>
    "Pass the hosted site: `slay live join --site https://<site>`, or play as your own testnet account: `slay live join --account you.testnet` (its key in ~/.near-credentials/testnet).",
};

const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const msOf = (ns: string) => Number(BigInt(ns) / 1_000_000n);

export function fail(s: Session, code: string, verb: string, extra: { hint?: string; data?: Record<string, unknown> } = {}): Out {
  const m = `slay ${s.mode}`;
  const message = MESSAGES[code] ?? code;
  const hint = extra.hint ?? HINTS[code]?.(m);
  return {
    ok: false,
    json: { error: code, message, ...(hint ? { hint } : {}), ...(extra.data ?? {}) },
    text: [`Could not ${verb}: ${message}`, ...(hint ? [`Hint: ${hint}`] : [])],
  };
}

export function usage(s: Session | null, form: string, detail: string): Out {
  const line = `usage: slay ${s ? `${s.mode} ` : ""}${form}`;
  return { ok: false, exitCode: 2, json: { error: "usage", message: line, hint: detail }, text: [line, `  ${detail}`] };
}

const txLine = (s: Session, tx?: string) => (s.mode === "live" && tx ? [`Transaction: https://testnet.nearblocks.io/txns/${tx}`] : []);

// ---------- reading ----------

export async function status(s: Session): Promise<Out> {
  const m = statusModel(s, await s.snapshot());
  return { ok: true, json: { status: m }, text: renderStatus(m) };
}

export async function me(s: Session): Promise<Out> {
  const m = statusModel(s, await s.snapshot());
  const y = m.you;
  if (!y) return fail(s, "not_joined", "show you");
  const weapons = (["club", "sword", "slayer"] as const).map((w) => `${w} ${y.items[w] ?? 0} (x${Number(WEAPON_MULT_BPS[w]) / 10_000})`);
  const text = [
    `You are ${y.account}`,
    `  $SLAY: ${n(y.balance)}`,
    `  Weapon charges (one per hit): ${weapons.join(", ")}`,
    `  Materials: wood ${y.items.wood ?? 0}, iron ${y.items.iron ?? 0}`,
    `  Bear trophies: ${y.trophies.join(", ") || "none"}`,
    `  Loot to claim: ${y.claimable.map((c) => `raid #${c.raid}: ${n(c.share)} $SLAY`).join(", ") || "none"}`,
    `  ${y.raid ? `Raid #${y.raid.id}: ${y.raid.hits} hit${y.raid.hits === 1 ? "" : "s"}, ${n(y.raid.damage)} damage (${y.raid.hitsLeft} hits left)` : "No hits in the current raid"}`,
  ];
  return { ok: true, json: { you: y, status: m }, text };
}

export async function feed(s: Session, a: Args): Promise<Out> {
  const k = Math.min(100, Math.max(1, Number(a.positional[0] ?? 15) || 15));
  const items = (await s.feedSince(-1)).slice(-k);
  const me = s.me();
  const events = items.map((e) => ({ at: iso(msOf(e.at)), kind: e.kind, account: e.account, round: e.round, text: narrate(e, me) }));
  return { ok: true, json: { events }, text: events.length ? events.map((e) => `${e.at}  ${e.text}`) : ["Nothing has happened in town yet."] };
}

export async function raids(s: Session): Promise<Out> {
  const snap = await s.snapshot();
  const me = s.me();
  const list = snap.history.map((r) => {
    const st = r.settlement;
    return {
      raid: r.id,
      state: st ? st.outcome : phaseOf(r, snap.nowMs),
      tactic: st ? resultModel(r, null, me)!.tactic : null,
      roll: st?.tactic_roll ?? null,
      damage: slayNum(st ? st.total_weight : (BigInt(r.total_early) + BigInt(r.total_late)).toString()),
      health: slayNum(st ? st.effective_health : r.health),
      raiders: r.participants,
      loot: st?.outcome === "win" ? slayNum(st.reward) : 0,
      stolen: st?.outcome === "loss" ? slayNum(st.steal) : 0,
      settledBy: st ? who(st.settler, me) : null,
    };
  });
  const text = list.length
    ? list.map((x) =>
        x.tactic
          ? `#${x.raid}: ${x.state === "win" ? "the town won" : "the Bear won"}, ${x.tactic} (roll ${x.roll}); ${n(x.damage)} damage vs ${n(x.health)} health, ${x.raiders} raider${x.raiders === 1 ? "" : "s"}; ${x.state === "win" ? `loot ${n(x.loot)}` : `stole ${n(x.stolen)}`} $SLAY; settled by ${x.settledBy}`
          : `#${x.raid}: ${x.state === "open" ? "on" : "time's up"}; ${n(x.damage)} damage of ${n(x.health)} health so far, ${x.raiders} raider${x.raiders === 1 ? "" : "s"}`,
      )
    : ["No raids yet."];
  return { ok: true, json: { raids: list }, text };
}

export async function rules(s: Session): Promise<Out> {
  return { ok: true, json: { rules: describeConfig(s.config) }, text: [`The rules of ${s.label}:`, ...rulesText(s.config)] };
}

export async function verify(s: Session, a: Args): Promise<Out> {
  const snap = await s.snapshot();
  const id = a.positional[0] ? Number(a.positional[0]) : (snap.history.find((r) => r.settlement)?.id ?? null);
  if (!id) return fail(s, "not_settled", "verify", { hint: "No raid has been settled yet." });
  const r = await s.round(id);
  if (!r) return fail(s, "no_round", "verify");
  if (!r.settlement) return fail(s, "not_settled", "verify", { hint: `\`slay ${s.mode} wait end\`, then \`slay ${s.mode} settle\`.` });
  const parts = await s.participants(id);
  const want = Math.min(s.config.effortWindow, id - 1);
  const history = want > 0 ? await s.rounds(id, want) : [];
  const v = verifyRound(s.config, r, parts, history.length === want ? history : null);
  const me = s.me();
  const shares = v.shares.map((x) => ({ account: x.account, weight: slayNum(x.weight), share: slayNum(x.share) }));
  const text = [
    v.ok ? `Raid #${id} checks out: ${v.checks.length} of ${v.checks.length} checks pass.` : `Raid #${id}: ${v.checks.filter((c) => !c.ok).length} check(s) FAILED.`,
    ...v.checks.map((c) => `  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`),
    ...(shares.length ? ["  Loot shares:", ...shares.map((x) => `    ${who(x.account, me)}: weight ${n(x.weight)} -> ${n(x.share)} $SLAY`)] : []),
    s.mode === "sim"
      ? "  (Offline: the beacon is a local test key with drand's BLS scheme; the same checks run on the live game.)"
      : `  The beacon at the source: https://api.drand.sh/${QUICKNET.chainHash}/public/${r.settlement.beacon_round}`,
  ];
  return { ok: v.ok, json: { result: { raid: id, ok: v.ok, checks: v.checks, shares } }, text };
}

// ---------- moves ----------

export async function hit(s: Session, a: Args): Promise<Out> {
  const raw = a.positional[0];
  const amount = raw ? parseSlay(raw) : null;
  if (!amount) return usage(s, "hit <amount> [--weapon club|sword|slayer]", "how much $SLAY to burn, 1 to 1000, e.g. `hit 250`");
  const w = flagString(a, "weapon");
  const weapon = w && w !== "paws" && w !== "none" ? w : null;
  if (weapon && !isWeapon(weapon)) return usage(s, "hit <amount> [--weapon club|sword|slayer]", `${weapon} is not a weapon`);
  const before = await s.snapshot();
  const phase = phaseOf(before.round, before.nowMs);
  if (phase === "ended") return fail(s, "round_ended", "hit");
  const preview = previewHit(s.config, phase === "open" ? before.round : null, before.nowMs, amount, weapon);
  const res = await s.act({ method: "hit", amount, weapon });
  if (!res.ok) return fail(s, res.error ?? "", "hit", { data: { txHash: res.txHash ?? null } });
  const m = statusModel(s, await s.snapshot());
  const damage = res.damage ? BigInt(res.damage) : preview.damage;
  const late = res.late ?? preview.late;
  const mult = weapon ? Number(WEAPON_MULT_BPS[weapon as WeaponId]) / 10_000 : 1;
  const bonus = Number(preview.bonusBps) / 10_000;
  const opened = phase !== "open";
  const text = [
    `You hit the Bear for ${slayText(damage)} damage: ${slayText(amount)} $SLAY burned, x${bonus.toFixed(2)} early bonus${weapon ? `, ${weapon} x${mult}` : ""}${late ? " (a late hit: a Feint would halve it)" : ""}.`,
    ...(opened && m.raid ? [`Your hit woke the Bear: raid #${m.raid.id} is on for ${duration(m.raid.secondsLeft * 1000)}.`] : []),
    ...txLine(s, res.txHash),
    "",
    ...renderStatus(m),
  ];
  return {
    ok: true,
    json: { result: { raid: res.round ?? m.raid?.id ?? null, burned: slayNum(amount), damage: slayNum(damage), earlyBonus: bonus, weapon, weaponMultiplier: mult, late, openedRaid: opened, txHash: res.txHash ?? null }, status: m },
    text,
  };
}

export async function wait(s: Session, a: Args): Promise<Out> {
  const arg = a.positional[0];
  const max = s.mode === "sim" ? 3600 : 900;
  let ms: number;
  let why = "";
  if (arg === "end") {
    const snap = await s.snapshot();
    const r = snap.round;
    if (!r || r.settlement) return fail(s, "no_raid_on", "wait for the end of the raid");
    const target = Math.max(msOf(r.deadline), beaconAtMs(s.config, r.target_drand_round)) + 1000;
    ms = Math.max(0, target - snap.nowMs);
    why = `until drand round ${r.target_drand_round} is out`;
  } else {
    const secs = Number(arg);
    if (!arg || !Number.isFinite(secs) || secs <= 0 || secs > max) return usage(s, "wait <seconds|end>", `1 to ${max} seconds, or \`end\` (until the raid's beacon is out)`);
    ms = secs * 1000;
  }
  const seq = await s.lastSeq();
  await s.sleep(ms);
  const events = await s.feedSince(seq);
  const m = statusModel(s, await s.snapshot());
  const me = s.me();
  const said = events.map((e) => ({ at: iso(msOf(e.at)), kind: e.kind, account: e.account, round: e.round, text: narrate(e, me) }));
  const text = [
    `${duration(ms)} passed${why ? ` (${why})` : ""}.`,
    ...(said.length ? ["What happened:", ...said.map((e) => `  ${e.text}`)] : ["Nothing happened in town."]),
    "",
    ...renderStatus(m),
  ];
  return { ok: true, json: { result: { waitedSeconds: ms / 1000, events: said }, status: m }, text };
}

export async function settle(s: Session, a: Args): Promise<Out> {
  const snap = await s.snapshot();
  const id = a.positional[0] ? Number(a.positional[0]) : (snap.status.current_round ?? null);
  if (!id) return fail(s, "nothing_to_settle", "settle");
  const res = await s.act({ method: "settle", roundId: id });
  const r = await s.round(id);
  if (!res.ok) {
    const code = res.error ?? "";
    if (code === "beacon_not_out" && r) {
      const left = Math.max(1, Math.ceil((beaconAtMs(s.config, r.target_drand_round) - s.nowMs()) / 1000));
      return fail(s, code, "settle", { hint: `drand round ${r.target_drand_round} is out in ${left}s: \`slay ${s.mode} wait end\`, then settle.` });
    }
    if (code === "round_not_over" && r) {
      return fail(s, code, "settle", { hint: `Raid #${id} has ${duration(msOf(r.deadline) - s.nowMs())} left: \`slay ${s.mode} wait end\` skips to its end.` });
    }
    return fail(s, code, "settle", { data: { txHash: res.txHash ?? null } });
  }
  const parts = await s.participants(id);
  const x = resultModel(r!, parts.find((p) => p.account === s.me()) ?? null, s.me())!;
  const m = statusModel(s, await s.snapshot());
  // the status shows this raid's result, unless a new raid has already started (live)
  const shown = m.raid?.id === id && m.raid.phase === "settled";
  const text = [
    `The Wheel of Fate spins on drand round ${x.beaconRound}${s.mode === "sim" ? " (the offline town's test beacon)" : ""}... You earned the ${n(x.tip)} $SLAY tip for settling.`,
    ...txLine(s, res.txHash),
    "",
    ...(shown ? [] : [...renderResult(x, id), ""]),
    ...renderStatus(m),
  ];
  return { ok: true, json: { result: { raid: id, ...x, txHash: res.txHash ?? null }, status: m }, text };
}

export async function claim(s: Session, a: Args): Promise<Out> {
  const snap = await s.snapshot();
  const ids = a.positional[0] ? [Number(a.positional[0])] : snap.claimable.map((c) => c.roundId);
  if (!ids.length) return fail(s, "nothing_to_claim", "claim");
  const claimed: { raid: number; amount: number; txHash: string | null }[] = [];
  const failed: { raid: number; error: string }[] = [];
  for (const id of ids) {
    const res = await s.act({ method: "claim", roundId: id });
    const expected = snap.claimable.find((c) => c.roundId === id)?.share ?? 0n;
    if (res.ok) claimed.push({ raid: id, amount: slayNum(res.amount ?? expected), txHash: res.txHash ?? null });
    else failed.push({ raid: id, error: res.error ?? "" });
  }
  if (!claimed.length) return fail(s, failed[0]!.error, "claim");
  const m = statusModel(s, await s.snapshot());
  const text = [
    ...claimed.map((c) => `Claimed ${n(c.amount)} $SLAY of loot from raid #${c.raid}.`),
    ...failed.map((f) => `Could not claim raid #${f.raid}: ${MESSAGES[f.error] ?? f.error}`),
    ...claimed.flatMap((c) => txLine(s, c.txHash ?? undefined)),
    `You now hold ${n(m.you?.balance ?? 0)} $SLAY.`,
    "NEXT:",
    ...m.next.map((x) => `  ${x}`),
  ];
  return { ok: true, json: { result: { claimed, failed }, status: m }, text };
}

export async function craft(s: Session, a: Args): Promise<Out> {
  const recipe = a.positional[0] as RecipeId | undefined;
  if (!recipe || !(recipe in RECIPES)) return usage(s, "craft <club|sword|slayer> [--trophy <id>]", "which weapon to forge (10 charges)");
  const snap = await s.snapshot();
  const rec = RECIPES[recipe];
  const trophy = rec.trophy > 0n ? (flagString(a, "trophy") ?? snap.player?.trophies[0] ?? null) : null;
  const res = await s.act({ method: "craft", recipe, trophy });
  if (!res.ok) return fail(s, res.error ?? "", `forge a ${recipe}`);
  const inputs = [rec.wood ? `${rec.wood} wood` : null, rec.iron ? `${rec.iron} iron` : null, trophy ? `the trophy ${trophy}` : null, `${slayText(rec.fee)} $SLAY`].filter(Boolean);
  const mult = Number(WEAPON_MULT_BPS[recipe]) / 10_000;
  const m = statusModel(s, await s.snapshot());
  const text = [
    `Forged ${rec.charges} ${recipe} charges from ${inputs.join(", ")} (all burned). Each hit with it deals x${mult}: \`slay ${s.mode} hit 250 --weapon ${recipe}\`.`,
    ...txLine(s, res.txHash),
  ];
  return { ok: true, json: { result: { recipe, charges: Number(rec.charges), multiplier: mult, trophy, txHash: res.txHash ?? null }, status: m }, text };
}

export async function smith(s: Session, a: Args): Promise<Out> {
  const snap = await s.snapshot();
  const st = snap.status;
  const sub = a.positional[0];
  if (!sub) {
    const shop = {
      clubPrice: slayNum(st.club_price),
      clubsInStock: Number(st.smith_clubs),
      buysWoodAt: slayNum(st.wood_price),
      buysIronAt: slayNum(st.iron_price),
      wood: Number(st.smith_wood),
      iron: Number(st.smith_iron),
      purse: slayNum(st.smith_balance),
      pricesUpAfterBearWin: st.bear_won_last,
    };
    const text = [
      `The smith sells club charges (x1.25 damage) at ${n(shop.clubPrice)} $SLAY each, ${shop.clubsInStock} in stock${shop.pricesUpAfterBearWin ? " (20% up: the Bear won the last raid)" : ""}.`,
      `It buys wood at ${n(shop.buysWoodAt)} and iron at ${n(shop.buysIronAt)} $SLAY each (less as its stock grows). It holds ${shop.wood} wood, ${shop.iron} iron and ${n(shop.purse)} $SLAY.`,
      `  slay ${s.mode} smith buy <n>              buy club charges (half of what you pay is burned)`,
      `  slay ${s.mode} smith sell <wood|iron> <n|all>`,
    ];
    return { ok: true, json: { smith: shop }, text };
  }
  if (sub === "buy") {
    const qty = Number(a.positional[1]);
    if (!Number.isInteger(qty) || qty < 1) return usage(s, "smith buy <n>", "how many club charges");
    const cost = BigInt(st.club_price) * BigInt(qty);
    const res = await s.act({ method: "buy_from_smith", qty: BigInt(qty) });
    if (!res.ok) return fail(s, res.error ?? "", "buy from the smith");
    const m = statusModel(s, await s.snapshot());
    const text = [`Bought ${itemText("club", qty)} for ${slayText(cost)} $SLAY. Hit with ${qty === 1 ? "it" : "them"}: \`slay ${s.mode} hit 250 --weapon club\`.`, ...txLine(s, res.txHash)];
    return { ok: true, json: { result: { bought: qty, cost: slayNum(cost), txHash: res.txHash ?? null }, status: m }, text };
  }
  if (sub === "sell") {
    const token = a.positional[1];
    if (token !== "wood" && token !== "iron") return usage(s, "smith sell <wood|iron> <n|all>", "the smith buys wood and iron");
    const have = BigInt(snap.player?.items.find(([t]) => t === token)?.[1] ?? "0");
    const qty = a.positional[2] === "all" ? have : BigInt(Number.isInteger(Number(a.positional[2])) ? Number(a.positional[2]) : 0);
    if (qty < 1n) return fail(s, "insufficient_items", `sell ${token}`, { hint: `You have ${have} ${token}.` });
    const paid = BigInt(token === "wood" ? st.wood_price : st.iron_price) * qty;
    const res = await s.act({ method: "sell_to_smith", token, qty });
    if (!res.ok) return fail(s, res.error ?? "", `sell ${token}`);
    const m = statusModel(s, await s.snapshot());
    const text = [`Sold ${qty} ${token} to the smith for ${slayText(paid)} $SLAY.`, ...txLine(s, res.txHash)];
    return { ok: true, json: { result: { sold: Number(qty), item: token, paid: slayNum(paid), txHash: res.txHash ?? null }, status: m }, text };
  }
  return usage(s, "smith [buy <n> | sell <wood|iron> <n|all>]", `unknown: ${sub}`);
}

export async function market(s: Session): Promise<Out> {
  const snap = await s.snapshot();
  const me = s.me();
  const list = snap.listings.map((l) => ({ listing: l.id, item: l.token_id, qty: Number(l.qty), price: slayNum(l.price), seller: who(l.seller, me) }));
  const text = list.length
    ? [
        "For sale (2% of every sale is burned):",
        ...list.map((l) => `  #${l.listing}: ${itemText(l.item, l.qty)} at ${n(l.price)} $SLAY each, by ${l.seller}`),
        `  slay ${s.mode} buy <listing> [qty]    slay ${s.mode} sell <item> <qty> <price>`,
      ]
    : ["Nothing is for sale.", `  slay ${s.mode} sell <item> <qty> <price>   puts something of yours up`];
  return { ok: true, json: { listings: list }, text };
}

export async function sell(s: Session, a: Args): Promise<Out> {
  const [token, qtyRaw, priceRaw] = a.positional;
  const price = priceRaw ? parseSlay(priceRaw) : null;
  const qty = token && isTrophy(token) ? 1n : BigInt(Number.isInteger(Number(qtyRaw)) ? Number(qtyRaw) : 0);
  if (!token || qty < 1n || !price) return usage(s, "sell <item> <qty> <price>", "e.g. `sell wood 3 5` (3 wood at 5 $SLAY each) or `sell trophy-23-0 1 300`");
  const res = await s.act({ method: "list", token, qty, price });
  if (!res.ok) return fail(s, res.error ?? "", `sell ${token}`);
  const m = statusModel(s, await s.snapshot());
  const text = [
    `Put ${itemText(token, qty)} up for sale at ${slayText(price)} $SLAY each${res.listingId ? ` (listing #${res.listingId})` : ""}. The contract holds it until it sells or you cancel.`,
    ...txLine(s, res.txHash),
  ];
  return { ok: true, json: { result: { item: token, qty: Number(qty), price: slayNum(price), listing: res.listingId ?? null, txHash: res.txHash ?? null }, status: m }, text };
}

export async function buy(s: Session, a: Args): Promise<Out> {
  const id = Number(a.positional[0]);
  const qty = BigInt(Number.isInteger(Number(a.positional[1] ?? 1)) ? Number(a.positional[1] ?? 1) : 0);
  if (!Number.isInteger(id) || qty < 1n) return usage(s, "buy <listing> [qty]", "a listing number from `market`");
  const snap = await s.snapshot();
  const l = snap.listings.find((x) => x.id === id);
  if (!l) return fail(s, "no_listing", "buy", { hint: `See \`slay ${s.mode} market\`.` });
  const res = await s.act({ method: "buy", listingId: id, qty });
  if (!res.ok) return fail(s, res.error ?? "", "buy");
  const m = statusModel(s, await s.snapshot());
  const cost = BigInt(l.price) * qty;
  const text = [`Bought ${itemText(l.token_id, qty)} for ${slayText(cost)} $SLAY from ${who(l.seller, s.me())}.`, ...txLine(s, res.txHash)];
  return { ok: true, json: { result: { listing: id, item: l.token_id, qty: Number(qty), cost: slayNum(cost), txHash: res.txHash ?? null }, status: m }, text };
}

export async function cancel(s: Session, a: Args): Promise<Out> {
  const id = Number(a.positional[0]);
  if (!Number.isInteger(id)) return usage(s, "cancel <listing>", "one of your listing numbers from `market`");
  const res = await s.act({ method: "cancel", listingId: id });
  if (!res.ok) return fail(s, res.error ?? "", "cancel");
  const m = statusModel(s, await s.snapshot());
  return { ok: true, json: { result: { listing: id, txHash: res.txHash ?? null }, status: m }, text: [`Took listing #${id} back.`, ...txLine(s, res.txHash)] };
}
