// POST -> { logs }. Wakes the keeper (settles finished raids with the drand beacon) and the
// villager NPCs. Called by open pages every 20 s and by a scheduled job; throttled so many
// visitors still cause at most one tick every 15 s per server instance.
import { NextResponse } from "next/server";
import { GameClient, VILLAGERS, runTick, type Villager } from "@slay/agents";
import { GAME_ID, ROOT, accountFromEnv, provider } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let last = 0;
let running = false;
// one client per server instance, so the config and ids are read once rather than every tick
let client: GameClient | null = null;

function villagersFromEnv(): Villager[] {
  let keys: Record<string, string> = {};
  try {
    keys = JSON.parse(process.env.VILLAGER_KEYS ?? "{}") as Record<string, string>;
  } catch {
    return [];
  }
  return VILLAGERS.flatMap((v) => {
    const id = `${v.prefix}.${ROOT}`;
    const acc = accountFromEnv(id, keys[id]);
    return acc ? [{ name: v.name, personality: v.personality, account: acc }] : [];
  });
}

export async function POST() {
  if (!GAME_ID) return NextResponse.json({ logs: [], note: "no game configured" });
  if (running || Date.now() - last < 15_000) return NextResponse.json({ logs: [], throttled: true });
  running = true;
  last = Date.now();
  try {
    const keeper = accountFromEnv(process.env.KEEPER_ACCOUNT_ID, process.env.KEEPER_PRIVATE_KEY);
    client ??= new GameClient(provider, GAME_ID);
    const logs = await runTick({ client, keeper, villagers: villagersFromEnv(), openIfIdle: false });
    return NextResponse.json({ logs });
  } catch (e) {
    console.error("tick failed", e);
    return NextResponse.json({ logs: [], error: "tick failed" }, { status: 500 });
  } finally {
    running = false;
  }
}

