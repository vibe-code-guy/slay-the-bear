// POST { signedDelegate: base64 borsh } -> { ok, txHash, error }. Relays a guest's signed
// delegate action and pays its gas. It only relays zero-deposit calls to allowed game methods
// from guest accounts; the relayer cannot change what the guest signed.
import { NextResponse } from "next/server";
import { RELAYER_READY, allow, checkDelegate, clientIp, decodeDelegate, relay } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!RELAYER_READY) return NextResponse.json({ ok: false, error: "This copy of the site has no relayer." }, { status: 503 });
  if (!allow(`relay-ip:${clientIp(req)}`, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "Slow down a little." }, { status: 429 });
  }
  let body: { signedDelegate?: unknown };
  try {
    body = (await req.json()) as { signedDelegate?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (typeof body.signedDelegate !== "string") return NextResponse.json({ ok: false, error: "signedDelegate missing" }, { status: 400 });
  let d;
  try {
    d = decodeDelegate(body.signedDelegate);
    checkDelegate(d);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
  if (!allow(`relay-acct:${d.delegateAction.senderId}`, 40, 60_000)) {
    return NextResponse.json({ ok: false, error: "Slow down a little." }, { status: 429 });
  }
  try {
    return NextResponse.json(await relay(d));
  } catch (e) {
    console.error("relay failed", e);
    const msg = String((e as Error).message ?? e);
    return NextResponse.json({ ok: false, error: /nonce/i.test(msg) ? "Busy, try again." : "The relayer could not send that." }, { status: 502 });
  }
}
