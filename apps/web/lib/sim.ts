"use client";
// Simulation mode: the offline town from @slay/rules (packages/rules/src/town.ts), the same rules
// engine the contract was tested against with a local test beacon, four villagers and a keeper,
// on the real clock. Nothing touches the network. The screen renders the engine's views in the
// contract's exact JSON format, so what you see here is what the chain would show.

import { SimTown, idsJson, participantsJson, playerJson, roundsJson } from "@slay/rules";
import type { Backend } from "./types";

export function createSimBackend(roundSecs = 300n): Backend {
  let offsetMs = 0;
  const nowNs = () => BigInt(Date.now() + offsetMs) * 1_000_000n;
  const town = new SimTown({ roundSecs, startNs: nowNs() });
  const game = town.game;

  return {
    mode: "sim",
    contractId: town.contractId,
    config: town.config,
    ids: idsJson(game),
    account: () => (town.joined ? town.player : null),

    async join() {
      return town.join(nowNs());
    },

    async snapshot() {
      return town.snapshot(nowNs());
    },

    async act(a) {
      return town.act(a, nowNs());
    },

    async participants(roundId: number) {
      const r = game.rounds.get(roundId);
      return r ? participantsJson(r) : [];
    },

    async rounds(beforeId: number, limit: number) {
      return roundsJson(game, beforeId, limit);
    },

    async player(account: string) {
      return playerJson(game, account);
    },

    async itemSupply(tokenId: string) {
      return game.itemSupply.get(tokenId) ?? null;
    },

    skip(seconds: number) {
      offsetMs += seconds * 1000;
    },
  };
}
