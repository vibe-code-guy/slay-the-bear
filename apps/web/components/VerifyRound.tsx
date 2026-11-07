"use client";
import { useEffect, useState } from "react";
import { QUICKNET, verifyRound, type GameConfig, type RoundVerification, type RoundJson } from "@slay/rules";
import { slay, who } from "@/lib/format";

export interface VerifySource {
  mode: "live" | "sim";
  config: GameConfig;
  round(id: number): Promise<RoundJson | null>;
  participants(id: number): Promise<import("@slay/rules").ParticipantJson[]>;
  rounds(beforeId: number, limit: number): Promise<RoundJson[]>;
}

export function VerifyRound({ source, roundId, account }: { source: VerifySource; roundId: number; account?: string | null }) {
  const [res, setRes] = useState<RoundVerification | null>(null);
  const [round, setRound] = useState<RoundJson | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    setRes(null);
    setErr(null);
    (async () => {
      try {
        const r = await source.round(roundId);
        if (!r) throw new Error(`round ${roundId} does not exist`);
        const parts = await source.participants(roundId);
        const want = Math.min(source.config.effortWindow, roundId - 1);
        const history = want > 0 ? await source.rounds(roundId, want) : [];
        const v = verifyRound(source.config, r, parts, history.length === want ? history : null);
        if (!off) {
          setRound(r);
          setRes(v);
        }
      } catch (e) {
        if (!off) setErr(String((e as Error).message ?? e));
      }
    })();
    return () => {
      off = true;
    };
  }, [source, roundId]);

  if (err) return <p className="text-blood">{err}</p>;
  if (!res || !round) return <p className="text-dim">Recomputing raid #{roundId} from public data…</p>;
  const sig = round.settlement?.beacon_signature;
  return (
    <div className="space-y-3">
      <p className={`text-lg font-bold ${res.ok ? "text-moss" : "text-blood"}`}>
        {res.ok ? `✓ Raid #${roundId} checks out: ${res.checks.length} of ${res.checks.length} checks pass.` : `✗ ${res.checks.filter((c) => !c.ok).length} check(s) failed for raid #${roundId}.`}
      </p>
      <ul className="space-y-1.5 text-sm">
        {res.checks.map((c) => (
          <li key={c.name} className="flex gap-2">
            <span className={c.ok ? "text-moss" : "text-blood"}>{c.ok ? "✓" : "✗"}</span>
            <span>
              <b>{c.name}.</b> <span className="break-all text-dim">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {res.shares.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-dim">Loot shares ({res.shares.length} raiders)</summary>
          <ul className="mt-1 space-y-0.5">
            {res.shares.map((s) => (
              <li key={s.account}>
                {who(s.account, account)}: weight {slay(s.weight)} → {slay(s.share, 4)} $SLAY
              </li>
            ))}
          </ul>
        </details>
      )}
      {source.mode === "live" && sig && round.settlement?.beacon_round && (
        <p className="text-xs text-dim">
          Check the beacon at the source:{" "}
          <a className="link" target="_blank" rel="noreferrer" href={`https://api.drand.sh/${QUICKNET.chainHash}/public/${round.settlement.beacon_round}`}>
            api.drand.sh/…/public/{round.settlement.beacon_round}
          </a>
          . Its signature must equal {sig.slice(0, 16)}…
        </p>
      )}
      {source.mode === "sim" && <p className="text-xs text-dim">Simulation: the beacon is a local test key with the same BLS scheme as drand.</p>}
    </div>
  );
}
