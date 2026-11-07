"use client";
import { useMemo, useState } from "react";
import type { RoundJson } from "@slay/rules";
import { slay, TACTIC_ICON, tacticName } from "@/lib/format";
import type { Backend } from "@/lib/types";
import { VerifyRound, type VerifySource } from "./VerifyRound";

export function History({ history, backend, account }: { history: RoundJson[]; backend: Backend; account: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const source: VerifySource = useMemo(
    () => ({
      mode: backend.mode,
      config: backend.config,
      round: async (id) => (await backend.rounds(id + 1, 1))[0] ?? null,
      participants: (id) => backend.participants(id),
      rounds: (before, limit) => backend.rounds(before, limit),
    }),
    [backend],
  );
  const settled = history.filter((r) => r.settlement);
  return (
    <section className="card">
      <h3 className="mb-2 text-lg font-bold">Past raids</h3>
      <ul className="space-y-1 text-sm">
        {settled.map((r) => {
          const s = r.settlement!;
          return (
            <li key={r.id}>
              <div className="flex items-center justify-between gap-2">
                <span>
                  #{r.id} {s.outcome === "win" ? "🎉 won" : "🐻 lost"} · {TACTIC_ICON[s.tactic]} {tacticName(s.tactic)} · {r.participants} raiders ·{" "}
                  {s.outcome === "win" ? `+${slay(s.reward)} loot` : `−${slay(s.steal)} stolen`}
                </span>
                <button className="btn px-2 py-0.5 text-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? "Hide" : "Verify"}
                </button>
              </div>
              {open === r.id && (
                <div className="mt-2 rounded-lg border border-edge bg-night/60 p-3">
                  <VerifyRound source={source} roundId={r.id} account={account} />
                  {backend.mode === "live" && (
                    <a className="link mt-2 inline-block text-xs" href={`/verify?round=${r.id}`}>
                      Open the full verifier
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {settled.length === 0 && <li className="text-dim">No raids settled yet.</li>}
      </ul>
    </section>
  );
}
