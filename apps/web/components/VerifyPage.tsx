"use client";
import { useEffect, useMemo, useState } from "react";
import { Account, JsonRpcProvider } from "near-api-js";
import { GameClient } from "@slay/agents";
import type { GameConfig } from "@slay/rules";
import { VerifyRound, type VerifySource } from "./VerifyRound";
import { GAME_ID, LIVE_AVAILABLE, REPO_URL, RPC_URL, accountUrl } from "@/lib/env";

interface Facts {
  codeHash: string;
  keys: number;
  lastRound: number;
}

export function VerifyPage() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [roundId, setRoundId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const provider = useMemo(() => new JsonRpcProvider({ url: RPC_URL }), []);
  const client = useMemo(() => new GameClient(provider, GAME_ID), [provider]);

  useEffect(() => {
    if (!LIVE_AVAILABLE) return;
    (async () => {
      try {
        const [cfg, acc, keys, status] = await Promise.all([
          client.config(),
          provider.viewAccount({ accountId: GAME_ID }) as unknown as Promise<{ code_hash: string }>,
          new Account(GAME_ID, provider).getAccessKeyList(),
          client.status(),
        ]);
        setConfig(cfg);
        const last = status.current_round !== null ? status.current_round - 1 : status.next_round_id - 1;
        setFacts({ codeHash: acc.code_hash, keys: keys.keys.length, lastRound: last });
        const q = Number(new URLSearchParams(window.location.search).get("round"));
        const pick = Number.isInteger(q) && q > 0 ? q : last > 0 ? last : null;
        setRoundId(pick);
        setInput(pick ? String(pick) : "");
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    })();
  }, [client, provider]);

  const source: VerifySource | null = useMemo(
    () =>
      config
        ? {
            mode: "live",
            config,
            round: (id) => client.round(id),
            participants: (id) => client.participants(id),
            rounds: (before, limit) => client.rounds(before, limit),
          }
        : null,
    [client, config],
  );

  if (!LIVE_AVAILABLE) return <p className="text-dim">No live game is configured for this site. Open the Town in simulation mode and use “Verify” on a past raid.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">Verify a raid</h1>
      <p className="text-dim">
        This page recomputes a settled raid in your browser from public data only: the contract&apos;s views and the drand beacon. It
        uses the same rules package the contract was tested against. If any number the contract stored differs from what the rules
        give, a check turns red.
      </p>
      {err && <p className="text-blood">{err}</p>}
      {facts && (
        <section className="card space-y-1 text-sm">
          <h2 className="text-lg font-bold">The contract</h2>
          <p>
            <a className="link" href={accountUrl(GAME_ID)} target="_blank" rel="noreferrer">
              {GAME_ID}
            </a>{" "}
            runs code hash <code className="break-all">{facts.codeHash}</code>.
          </p>
          <p className={facts.keys === 0 ? "text-moss" : "text-ember"}>
            {facts.keys === 0
              ? "✓ The account has no access keys: nobody can upgrade, pause, mint or withdraw. The code and config are final."
              : `⚠ The account still has ${facts.keys} access key(s): this is a development instance that its deployer could still change.`}
          </p>
          <p className="text-dim">
            To check the code hash, rebuild the contract from{" "}
            <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
              the source
            </a>{" "}
            and compare (see docs/FAIRNESS.md).
          </p>
        </section>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(input);
          if (Number.isInteger(n) && n > 0) {
            setRoundId(n);
            window.history.replaceState(null, "", `/verify?round=${n}`);
          }
        }}
      >
        <label className="text-sm text-dim" htmlFor="round">
          Raid #
        </label>
        <input id="round" className="input w-24" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn">Verify</button>
        {facts && <span className="text-xs text-dim">latest settled: #{facts.lastRound}</span>}
      </form>
      {source && roundId && (
        <section className="card">
          <VerifyRound source={source} roundId={roundId} />
        </section>
      )}
      {facts && facts.lastRound === 0 && <p className="text-dim">No raid has been settled yet.</p>}
    </div>
  );
}
