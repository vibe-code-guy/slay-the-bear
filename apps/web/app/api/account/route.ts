// POST { publicKey } -> { accountId }. Creates a guest account under the root account whose
// only key is the one the browser generated, limited to the game contract.
import { NextResponse } from "next/server";
import { RELAYER_READY, allow, clientIp, createGuest } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!RELAYER_READY) {
    return NextResponse.json(
      { error: "This copy of the site has no relayer, so it cannot create guests. Watch the live town here, play the offline simulation, or set RELAYER_ACCOUNT_ID and RELAYER_PRIVATE_KEY (see docs/DEPLOY.md)." },
      { status: 503 },
    );
  }
  const ip = clientIp(req);
  if (!allow(`acct:${ip}`, 10, 60 * 60_000) || !allow("acct:all", 400, 24 * 60 * 60_000)) {
    return NextResponse.json({ error: "Too many new accounts from here. Try again later." }, { status: 429 });
  }
  let publicKey: unknown;
  try {
    publicKey = ((await req.json()) as { publicKey?: unknown }).publicKey;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof publicKey !== "string" || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(publicKey)) {
    return NextResponse.json({ error: "publicKey must be an ed25519 key" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createGuest(publicKey));
  } catch (e) {
    console.error("account creation failed", e);
    return NextResponse.json({ error: "Could not create the account. Try again in a minute." }, { status: 502 });
  }
}
