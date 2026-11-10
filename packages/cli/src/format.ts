// Plain ASCII formatting, so the output reads the same in any terminal (and to any agent).
import { ONE, TACTIC_NAMES, type Tactic } from "@slay/rules";

/** Base units as a number of $SLAY, rounded to 4 decimals (for JSON). */
export function slayNum(v: bigint | string): number {
  const x = typeof v === "bigint" ? v : BigInt(v);
  return Number(x / 10n ** 14n) / 10_000;
}

/** Base units as "1,234.56". */
export function slayText(v: bigint | string, decimals = 2): string {
  return slayNum(v).toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** "12" or "12.5" whole $SLAY as base units; null when invalid. */
export function parseSlay(input: string): bigint | null {
  const m = input.trim().match(/^(\d{1,12})(?:\.(\d{1,6}))?$/);
  if (!m) return null;
  return BigInt(m[1]!) * ONE + BigInt((m[2] ?? "").padEnd(6, "0")) * 10n ** 12n;
}

/** 299_000 ms as "4m 59s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return r ? `${m}m ${r}s` : `${m}m`;
  return `${r}s`;
}

export const tacticName = (t: number) => TACTIC_NAMES[t as Tactic] ?? "?";

export const pct = (bps: number) => `${Math.round(bps) / 100}%`;

export const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const VILLAGERS: Record<string, string> = {
  bjorn: "Bjorn the Brave",
  fern: "Fern the Follower",
  sid: "Sid the Sniper",
  sara: "Sara the Saver",
  keeper: "the keeper",
  smith: "the smith",
};

/** A short name: "you", villagers by name, "guest p-1a2b3c4d", others as given. */
export function who(account: string, me: string | null): string {
  if (me && account === me) return "you";
  const first = account.split(".")[0] ?? account;
  if (VILLAGERS[first] && account.endsWith("slaythebear.testnet")) return VILLAGERS[first]!;
  if (/^p-[a-z0-9]{8}\./.test(account)) return `guest ${first}`;
  return account;
}

export const isVillager = (account: string) => ["bjorn", "fern", "sid", "sara"].includes(account.split(".")[0] ?? "");

export function itemText(token: string, qty: string | bigint | number): string {
  const n = String(qty);
  if (token.startsWith("trophy-")) return `a Bear trophy (${token})`;
  if (token === "slayer") return `${n} Bear-slayer charge${n === "1" ? "" : "s"}`;
  if (token === "club" || token === "sword") return `${n} ${token} charge${n === "1" ? "" : "s"}`;
  return `${n} ${token}`;
}
