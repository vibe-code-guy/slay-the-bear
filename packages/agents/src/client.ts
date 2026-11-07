// Typed reads of a Slay the Bear contract through any NEAR RPC provider. Used by the agents,
// the web app's server routes and the verifier scripts.

import type { Provider } from "near-api-js";
import {
  fromContractConfig,
  type ContractConfig,
  type FeedItemJson,
  type GameConfig,
  type IdsJson,
  type ListingJson,
  type ParticipantJson,
  type PlayerJson,
  type RoundJson,
  type StatusJson,
} from "@slay/rules";

export class GameClient {
  private configCache?: GameConfig;
  private idsCache?: IdsJson;

  constructor(
    readonly provider: Provider,
    readonly contractId: string,
  ) {}

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({ contractId: this.contractId, method, args })) as T;
  }

  async config(): Promise<GameConfig> {
    this.configCache ??= fromContractConfig(await this.view<ContractConfig>("get_config"));
    return this.configCache;
  }

  async ids(): Promise<IdsJson> {
    this.idsCache ??= await this.view<IdsJson>("get_ids");
    return this.idsCache;
  }

  status(): Promise<StatusJson> {
    return this.view<StatusJson>("get_status");
  }

  round(roundId: number): Promise<RoundJson | null> {
    return this.view<RoundJson | null>("get_round", { round_id: roundId });
  }

  /** Newest first. */
  rounds(beforeId?: number, limit = 10): Promise<RoundJson[]> {
    return this.view<RoundJson[]>("get_rounds", { before_id: beforeId ?? null, limit });
  }

  /** Every participant of a round, fetching pages of 100. */
  async participants(roundId: number): Promise<ParticipantJson[]> {
    const out: ParticipantJson[] = [];
    for (;;) {
      const page = await this.view<ParticipantJson[]>("get_round_participants", { round_id: roundId, from_index: out.length, limit: 100 });
      out.push(...page);
      if (page.length < 100) return out;
    }
  }

  participant(roundId: number, accountId: string): Promise<ParticipantJson | null> {
    return this.view<ParticipantJson | null>("get_participant", { round_id: roundId, account_id: accountId });
  }

  player(accountId: string): Promise<PlayerJson> {
    return this.view<PlayerJson>("get_player", { account_id: accountId });
  }

  listings(): Promise<ListingJson[]> {
    return this.view<ListingJson[]>("get_listings", { from_index: 0, limit: 100 });
  }

  feed(limit = 20): Promise<FeedItemJson[]> {
    return this.view<FeedItemJson[]>("get_feed", { limit });
  }
}

/** The contract's error code from a failed call, e.g. "round_ended", or the raw message. */
export function errorCode(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  return msg.match(/Smart contract panicked: ([a-z_]+)/)?.[1] ?? msg.slice(0, 200);
}

export const nsToMs = (ns: string | bigint) => Number(BigInt(ns) / 1_000_000n);
