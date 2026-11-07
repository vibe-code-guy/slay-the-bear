import { ONE, TACTIC_NAMES, Tactic } from "@slay/rules";

/** $SLAY base units to a readable number: "1,234" or "1,234.5". */
export function slay(v: string | bigint, decimals = 0): string {
  const x = typeof v === "bigint" ? v : BigInt(v);
  const neg = x < 0n;
  const a = neg ? -x : x;
  const whole = (a / ONE).toLocaleString("en-US");
  if (decimals === 0) return (neg ? "-" : "") + whole;
  const frac = ((a % ONE) * 10n ** BigInt(decimals)) / ONE;
  const f = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + (f ? `${whole}.${f}` : whole);
}

/** "12.5" whole $SLAY from a user's input, as base units; null when invalid. */
export function parseSlay(input: string): bigint | null {
  const m = input.trim().match(/^(\d{1,12})(?:\.(\d{0,6}))?$/);
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(6, "0");
  return BigInt(m[1]!) * ONE + (BigInt(frac) * ONE) / 1_000_000n;
}

export const VILLAGER_NAMES: Record<string, string> = {
  bjorn: "Bjorn the Brave",
  fern: "Fern the Follower",
  sid: "Sid the Sniper",
  sara: "Sara the Saver",
  keeper: "the Keeper",
};

/** A short display name: villagers by name, guests as "guest p-1a2b", others as given. */
export function who(account: string, me?: string | null): string {
  if (me && account === me) return "you";
  const first = account.split(".")[0] ?? account;
  if (VILLAGER_NAMES[first] && account.split(".").length >= 3) return VILLAGER_NAMES[first]!;
  if (/^(treasury|pouches|bear|smith|loot|market)\./.test(account)) {
    return { treasury: "the treasury", pouches: "the pouch chest", bear: "the Bear", smith: "the smith", loot: "the loot chest", market: "the market" }[first]!;
  }
  if (first.startsWith("p-")) return `guest ${first.slice(2, 8)}`;
  return account.length > 24 ? `${account.slice(0, 21)}…` : account;
}

export function isVillager(account: string): boolean {
  const first = account.split(".")[0] ?? "";
  return first in VILLAGER_NAMES && first !== "keeper";
}

export function clock(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export const TACTIC_ICON: Record<number, string> = { 0: "😐", 1: "🛡️", 2: "😡", 3: "🌀" };
export const tacticName = (t: number) => TACTIC_NAMES[t as Tactic] ?? "?";
export const pct = (bps: number | bigint) => `${Number(bps) / 100}%`;

export const ITEM_ICON: Record<string, string> = { wood: "🪵", iron: "⛓️", club: "🏏", sword: "🗡️", slayer: "🪓" };
export const itemIcon = (t: string) => ITEM_ICON[t] ?? (t.startsWith("trophy-") ? "🏆" : "📦");
