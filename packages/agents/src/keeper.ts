// The keeper settles a round once its deadline has passed and the deciding drand round is
// out. Settling is open to anyone (and pays a small tip); the keeper only makes sure it happens
// when no player does it, so it first leaves the players a few seconds to spin the wheel
// themselves. It cannot pick the outcome: the contract checks the beacon.

import { teraToGas, type Account } from "near-api-js";
import { fetchBeacon, roundTime } from "@slay/rules";
import { errorCode, nsToMs, type GameClient } from "./client";

export interface TickLog {
  agent: string;
  message: string;
  tx?: string;
}

/** How long the keeper leaves a finished raid to the players (who earn the tip) after its beacon is out. */
export const KEEPER_GRACE_MS = 15_000;

export async function keeperTick(client: GameClient, keeper: Account, nowMs = Date.now(), graceMs = KEEPER_GRACE_MS): Promise<TickLog[]> {
  const status = await client.status();
  if (status.current_round === null) return [];
  const r = await client.round(status.current_round);
  if (!r || r.settlement) return [];
  if (nowMs < nsToMs(r.deadline)) return [];
  const target = BigInt(r.target_drand_round);
  const beaconAtMs = (Number(roundTime(target)) + 1) * 1000;
  if (nowMs < beaconAtMs) {
    return [{ agent: "keeper", message: `round ${r.id} is over; waiting for drand round ${target}` }];
  }
  if (nowMs < beaconAtMs + graceMs) {
    return [{ agent: "keeper", message: `round ${r.id}: drand round ${target} is out; leaving the spin to the players for a moment` }];
  }
  const beacon = await fetchBeacon(target);
  try {
    const res = await keeper.callFunctionRaw({
      contractId: client.contractId,
      methodName: "settle",
      args: { round_id: r.id, beacon_round: Number(target), signature: beacon.signature },
      gas: teraToGas(150),
    });
    return [{ agent: "keeper", message: `settled round ${r.id} with drand round ${target}`, tx: txHashOf(res) }];
  } catch (e) {
    const code = errorCode(e);
    if (code === "already_settled") return [];
    return [{ agent: "keeper", message: `could not settle round ${r.id}: ${code}` }];
  }
}

export function txHashOf(res: unknown): string | undefined {
  const r = res as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return r.transaction?.hash ?? r.transaction_outcome?.id;
}
