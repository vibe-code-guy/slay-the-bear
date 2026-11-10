// What every command needs from a game, offline or live. The offline town (sim.ts) and the
// NEAR testnet game (live.ts) both provide it, so the commands are written once.
import { NS, roundTime, type ActionResult, type FeedItemJson, type GameConfig, type ParticipantJson, type RoundJson, type Snapshot, type TownAction } from "@slay/rules";

export type Mode = "sim" | "live";

export interface Session {
  readonly mode: Mode;
  readonly config: GameConfig;
  /** The game's contract (the offline town has a made-up one). */
  readonly contractId: string;
  /** One line about where this game runs, e.g. "offline town, seed 42". */
  readonly label: string;
  /** The player's account, if they have joined. */
  me(): string | null;
  /** The game's clock (ms). The offline clock moves only on `wait`. */
  nowMs(): number;
  snapshot(): Promise<Snapshot>;
  /** One move. Live, a settle fetches the deciding drand beacon first. */
  act(a: TownAction): Promise<ActionResult>;
  /** Lets time pass: the offline clock jumps, live waits for real. */
  sleep(ms: number): Promise<void>;
  /** The town feed after a sequence number, oldest first. */
  feedSince(seq: number): Promise<FeedItemJson[]>;
  /** The newest feed sequence number, -1 if none. */
  lastSeq(): Promise<number>;
  round(id: number): Promise<RoundJson | null>;
  participants(id: number): Promise<ParticipantJson[]>;
  /** Rounds before an id, newest first. */
  rounds(beforeId: number, limit: number): Promise<RoundJson[]>;
  /** Saves what has to outlive this command. */
  close(): void;
}

/** When drand publishes a round (ms), with the game's beacon timing. */
export function beaconAtMs(c: GameConfig, targetDrandRound: string | bigint): number {
  return Number((roundTime(BigInt(targetDrandRound), c.randomness.genesisTime, c.randomness.period) * NS) / 1_000_000n);
}

/** A failed move with a contract error code, for the commands to report. */
export class MoveError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    readonly hint?: string,
  ) {
    super(message ?? code);
  }
}
