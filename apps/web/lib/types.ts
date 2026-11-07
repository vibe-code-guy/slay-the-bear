import {
  lootShare,
  weight,
  type FeedItemJson,
  type GameConfig,
  type IdsJson,
  type ListingJson,
  type ParticipantJson,
  type PlayerJson,
  type RoundJson,
  type StatusJson,
  type Tactic,
} from "@slay/rules";

/** Everything the town screen shows, in the contract's own view format. */
export interface Snapshot {
  status: StatusJson;
  /** The round in progress, or else the latest one. */
  round: RoundJson | null;
  participants: ParticipantJson[];
  /** Last rounds, newest first. */
  history: RoundJson[];
  feed: FeedItemJson[];
  listings: ListingJson[];
  player: PlayerJson | null;
  me: ParticipantJson | null;
  /** Won raids where the player still has loot to claim. */
  claimable: { roundId: number; share: bigint }[];
  nowMs: number;
}

/** A raider's unclaimed share of a won round. */
export function claimableShare(r: RoundJson, p: ParticipantJson | null): bigint | null {
  const s = r.settlement;
  if (!s || s.outcome !== "win" || !p || p.claimed) return null;
  return lootShare(weight(BigInt(p.early), BigInt(p.late), s.tactic as Tactic), BigInt(s.total_weight), BigInt(s.reward));
}

export type Action =
  | { method: "claim_pouch" }
  | { method: "open_round" }
  | { method: "hit"; amount: bigint; weapon: string | null }
  | { method: "settle"; roundId: number }
  | { method: "claim"; roundId: number }
  | { method: "craft"; recipe: string; trophy: string | null }
  | { method: "buy_from_smith"; qty: bigint }
  | { method: "sell_to_smith"; token: string; qty: bigint }
  | { method: "list"; token: string; qty: bigint; price: bigint }
  | { method: "buy"; listingId: number; qty: bigint }
  | { method: "cancel"; listingId: number };

export interface ActionResult {
  ok: boolean;
  error?: string;
  txHash?: string;
}

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
  /** Simulation only: jump the clock forward. */
  skip?(seconds: number): void;
}

/** Contract method and JSON args for an action (settle args are added by the backend). */
export function toCall(a: Action): { method: string; args: Record<string, unknown> } {
  switch (a.method) {
    case "hit":
      return { method: "hit", args: a.weapon ? { amount: a.amount.toString(), weapon: a.weapon } : { amount: a.amount.toString() } };
    case "settle":
      return { method: "settle", args: { round_id: a.roundId } };
    case "claim":
      return { method: "claim", args: { round_id: a.roundId } };
    case "craft":
      return { method: "craft", args: a.trophy ? { recipe_id: a.recipe, trophy_id: a.trophy } : { recipe_id: a.recipe } };
    case "buy_from_smith":
      return { method: "buy_from_smith", args: { qty: a.qty.toString() } };
    case "sell_to_smith":
      return { method: "sell_to_smith", args: { token_id: a.token, qty: a.qty.toString() } };
    case "list":
      return { method: "list", args: { token_id: a.token, qty: a.qty.toString(), price: a.price.toString() } };
    case "buy":
      return { method: "buy", args: { listing_id: a.listingId, qty: a.qty.toString() } };
    case "cancel":
      return { method: "cancel", args: { listing_id: a.listingId } };
    default:
      return { method: a.method, args: {} };
  }
}

/** Player-facing explanations of the contract's error codes. */
export const ERRORS: Record<string, string> = {
  pouch_already_claimed: "You already claimed your starter pouch.",
  pouch_cap_reached: "Today's starter pouches are gone. Come back tomorrow.",
  reserve_empty: "The pouch chest is empty.",
  bad_hit_amount: "A hit must burn between the minimum and maximum hit size.",
  insufficient_balance: "Not enough $SLAY.",
  not_a_weapon: "That is not a weapon.",
  no_weapon_charge: "You have no charges of that weapon.",
  round_ended: "Time is up for this raid. Settle it to start the next one.",
  round_full: "This raid is full.",
  too_many_hits: "You have hit as often as one raider may this round.",
  not_settled: "The raid is not settled yet.",
  round_lost: "The Bear won that raid; there is no loot.",
  not_a_raider: "You did not hit the Bear in that raid.",
  already_claimed: "You already claimed your loot.",
  need_wood: "Not enough wood.",
  need_iron: "Not enough iron.",
  need_trophy: "You need a Bear trophy for that.",
  round_not_over: "The raid is still on.",
  already_settled: "Someone already settled this raid.",
  wrong_beacon_round: "That is not the deciding drand round.",
  bad_beacon: "The drand signature did not verify.",
  smith_out_of_stock: "The smith is out of clubs.",
  smith_out_of_money: "The smith cannot afford that right now.",
  round_in_progress: "A raid is already on.",
  special_account: "NPC accounts cannot do that.",
  own_listing: "That is your own listing.",
  insufficient_items: "You do not have enough of that item.",
};

export const explain = (code?: string) => (code ? (ERRORS[code] ?? code) : "Something went wrong.");
