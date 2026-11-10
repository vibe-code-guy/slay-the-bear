import type { GameConfig, IdsJson, ParticipantJson, PlayerJson, RoundJson } from "@slay/rules";
import type { ActionResult, Snapshot, TownAction } from "@slay/rules";

// The moves, their results, the snapshot and the error messages are shared with the CLI and
// live in @slay/rules (packages/rules/src/town.ts).
export { claimableShare, contractCall as toCall, ERRORS, explain, type ActionResult, type Snapshot } from "@slay/rules";
export type Action = TownAction;

export interface Backend {
  mode: "live" | "sim";
  contractId: string;
  config: GameConfig;
  ids: IdsJson;
  /** The player's account, if they have joined. */
  account(): string | null;
  /** Creates a guest account (live) or a local player (sim). */
  join(): Promise<ActionResult>;
  snapshot(): Promise<Snapshot>;
  act(a: Action): Promise<ActionResult>;
  /** For the verifier: all raiders of a round, and rounds before an id (newest first). */
  participants(roundId: number): Promise<ParticipantJson[]>;
  rounds(beforeId: number, limit: number): Promise<RoundJson[]>;
  /** Any account's balance, items and trophies (get_player). */
  player(account: string): Promise<PlayerJson>;
  /** Supply of an item (mt_supply): 0 once a trophy is forged into a Bear-slayer. */
  itemSupply(tokenId: string): Promise<bigint | null>;
  /** Simulation only: jump the clock forward. */
  skip?(seconds: number): void;
}
