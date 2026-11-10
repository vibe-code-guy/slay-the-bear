// The offline town for the CLI: the SimTown from @slay/rules (the web app's offline mode) on a
// clock that moves only on `wait`, with villagers rolling seeded dice. Each command replays the
// session from its log (the seed, the start time and every join, wait and move), makes its own
// move and appends it, so a session lasts across commands and replays exactly.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIM_CONTRACT,
  SIM_PLAYER,
  SimTown,
  feedJson,
  participantsJson,
  rng,
  roundJson,
  roundsJson,
  type ActionResult,
  type FeedItemJson,
  type GameConfig,
  type ParticipantJson,
  type RoundJson,
  type Snapshot,
  type TownAction,
} from "@slay/rules";
import type { Session } from "./session";

type Entry = { at: number; op: "join" } | { at: number; op: "advance" } | { at: number; op: "act"; action: unknown };

interface SimState {
  version: 1;
  seed: number;
  roundSecs: number;
  startMs: number;
  nowMs: number;
  log: Entry[];
}

const ns = (ms: number) => BigInt(ms) * 1_000_000n;
// bigints (amounts) in the log as {"$n": "123"}
const toJson = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? { $n: x.toString() } : x), 2);
const fromJson = <T>(s: string) =>
  JSON.parse(s, (_, x) => (x && typeof x === "object" && typeof (x as { $n?: unknown }).$n === "string" ? BigInt((x as { $n: string }).$n) : x)) as T;

export class SimSession implements Session {
  readonly mode = "sim" as const;
  readonly contractId = SIM_CONTRACT;

  private constructor(
    private readonly file: string,
    private readonly state: SimState,
    readonly town: SimTown,
  ) {}

  static path(home: string) {
    return join(home, "sim.json");
  }

  static exists(home: string) {
    return existsSync(SimSession.path(home));
  }

  /** A new town; the player joins with a starter pouch. */
  static create(home: string, opts: { seed: number; roundSecs: number; startMs?: number }): SimSession {
    const startMs = opts.startMs ?? Date.now();
    const state: SimState = { version: 1, seed: opts.seed, roundSecs: opts.roundSecs, startMs, nowMs: startMs, log: [] };
    const s = new SimSession(SimSession.path(home), state, SimSession.town(state));
    s.town.join(ns(startMs));
    state.log.push({ at: startMs, op: "join" });
    return s;
  }

  /** The saved session, replayed; null if there is none. */
  static load(home: string): SimSession | null {
    const file = SimSession.path(home);
    if (!existsSync(file)) return null;
    const state = fromJson<SimState>(readFileSync(file, "utf8"));
    if (state.version !== 1) throw new Error(`${file} is from another version of the CLI; start over with \`slay sim new\``);
    const town = SimSession.town(state);
    for (const e of state.log) {
      const t = ns(e.at);
      if (e.op === "join") town.join(t);
      else if (e.op === "advance") town.advanceTo(t);
      else town.act(e.action as TownAction, t);
    }
    town.advanceTo(ns(state.nowMs));
    return new SimSession(file, state, town);
  }

  private static town(state: SimState) {
    return new SimTown({ roundSecs: BigInt(state.roundSecs), startNs: ns(state.startMs), random: rng(state.seed) });
  }

  get config(): GameConfig {
    return this.town.config;
  }

  get label() {
    return `offline town, seed ${this.state.seed}`;
  }

  get seed() {
    return this.state.seed;
  }

  me() {
    return SIM_PLAYER;
  }

  nowMs() {
    return this.state.nowMs;
  }

  async snapshot(): Promise<Snapshot> {
    return this.town.snapshot(ns(this.state.nowMs));
  }

  async act(a: TownAction): Promise<ActionResult> {
    const res = this.town.act(a, ns(this.state.nowMs));
    this.state.log.push({ at: this.state.nowMs, op: "act", action: a });
    return res;
  }

  async sleep(ms: number) {
    this.state.nowMs += Math.max(0, Math.round(ms));
    this.town.advanceTo(ns(this.state.nowMs));
    this.state.log.push({ at: this.state.nowMs, op: "advance" });
  }

  async feedSince(seq: number): Promise<FeedItemJson[]> {
    return feedJson(this.town.game, Number.MAX_SAFE_INTEGER)
      .filter((f) => f.seq > seq)
      .reverse();
  }

  async lastSeq() {
    return feedJson(this.town.game, 1)[0]?.seq ?? -1;
  }

  async round(id: number): Promise<RoundJson | null> {
    const r = this.town.game.rounds.get(id);
    return r ? roundJson(this.town.game, r) : null;
  }

  async participants(id: number): Promise<ParticipantJson[]> {
    const r = this.town.game.rounds.get(id);
    return r ? participantsJson(r) : [];
  }

  async rounds(beforeId: number, limit: number): Promise<RoundJson[]> {
    return roundsJson(this.town.game, beforeId, limit);
  }

  /** Writes the session atomically, so an interrupted command can't leave half a file. */
  close() {
    const dir = join(this.file, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, toJson(this.state));
    renameSync(tmp, this.file);
  }
}
