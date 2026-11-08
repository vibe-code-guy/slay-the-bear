// What each item is for, in one line, for item cards. The numbers are the contract's (see
// packages/rules/src/items.ts); they are fixed when the game is deployed.
import { RECIPES, WEAPON_MULT_BPS, isTrophy, isWeapon, itemName, type WeaponId } from "@slay/rules";
import { slay } from "./format";

export type ItemKind = "material" | "weapon" | "trophy";

export function itemKind(id: string): ItemKind {
  return isTrophy(id) ? "trophy" : isWeapon(id) ? "weapon" : "material";
}

export function itemTitle(id: string, trophyName?: string): string {
  if (isTrophy(id)) return trophyName ?? "Bear trophy";
  return { wood: "Wood", iron: "Iron", club: "Club", sword: "Sword", slayer: "Bear-slayer" }[id] ?? itemName(id);
}

export function itemBlurb(id: string): string {
  if (isTrophy(id)) return "One of one. 5% of drops. Forge it into the Bear-slayer, or sell it to another player.";
  if (isWeapon(id)) {
    const r = RECIPES[id as WeaponId];
    const mult = Number(WEAPON_MULT_BPS[id as WeaponId]) / 10_000;
    const inputs = [r.wood ? `${r.wood} wood` : "", r.iron ? `${r.iron} iron` : "", r.trophy ? "1 trophy" : "", `${slay(r.fee)} $SLAY`].filter(Boolean).join(" + ");
    return `×${mult} damage for one hit. The forge makes ${r.charges} from ${inputs}.`;
  }
  if (id === "wood") return "60% of drops, 3 at a time. Forge clubs and swords, or sell it to the smith.";
  if (id === "iron") return "35% of drops, 2 at a time. For swords and the Bear-slayer.";
  return itemName(id);
}

/** Damage multiplier of a weapon, as a number (×1.25…), or 1 for bare paws. */
export const multOf = (w: string | null) => (w && isWeapon(w) ? Number(WEAPON_MULT_BPS[w as WeaponId]) / 10_000 : 1);
