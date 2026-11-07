// Items are NEP-245 multi tokens. Weapons are counted in charges: one charge is spent per hit.
// These tables are fixed in code, identical in contracts/game/src/items.rs.

import { ONE } from "./config";

export type WeaponId = "club" | "sword" | "slayer";
export type MaterialId = "wood" | "iron";
export type RecipeId = WeaponId;

/** Damage multiplier of one hit, in basis points. */
export const WEAPON_MULT_BPS: Record<WeaponId, bigint> = {
  club: 12_500n,
  sword: 15_000n,
  slayer: 20_000n,
};

export interface Recipe {
  wood: bigint;
  iron: bigint;
  trophy: bigint;
  fee: bigint;
  charges: bigint;
}

/** Crafting is deterministic: inputs and a burned $SLAY fee in, weapon charges out. */
export const RECIPES: Record<RecipeId, Recipe> = {
  club: { wood: 2n, iron: 0n, trophy: 0n, fee: 10n * ONE, charges: 10n },
  sword: { wood: 2n, iron: 3n, trophy: 0n, fee: 50n * ONE, charges: 10n },
  slayer: { wood: 0n, iron: 5n, trophy: 1n, fee: 200n * ONE, charges: 10n },
};

/** What one drop gives, from a roll in [0, 100). */
export function dropForRoll(roll: number, roundId: number, drawIndex: number): { tokenId: string; qty: bigint } {
  if (roll < 60) return { tokenId: "wood", qty: 3n };
  if (roll < 95) return { tokenId: "iron", qty: 2n };
  return { tokenId: trophyId(roundId, drawIndex), qty: 1n };
}

export const trophyId = (roundId: number, drawIndex: number) => `trophy-${roundId}-${drawIndex}`;
export const isTrophy = (tokenId: string) => /^trophy-\d+-\d+$/.test(tokenId);
export const isWeapon = (tokenId: string): tokenId is WeaponId => tokenId in WEAPON_MULT_BPS;
export const isMaterial = (tokenId: string): tokenId is MaterialId => tokenId === "wood" || tokenId === "iron";

export const ITEM_NAMES: Record<string, string> = {
  wood: "Wood",
  iron: "Iron",
  club: "Club charge",
  sword: "Sword charge",
  slayer: "Bear-slayer charge",
};

export function itemName(tokenId: string): string {
  if (isTrophy(tokenId)) {
    const [, r, d] = tokenId.split("-");
    return `Bear trophy (round ${r}, drop ${d})`;
  }
  return ITEM_NAMES[tokenId] ?? tokenId;
}
