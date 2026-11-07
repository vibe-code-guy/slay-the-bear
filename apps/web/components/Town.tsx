"use client";
import { useEffect, useState } from "react";
import { BearPanel } from "./BearPanel";
import { ActionPanel } from "./ActionPanel";
import { Feed, RaidBoard } from "./RaidBoard";
import { Forge, Market, Pouch, Smith, TownStats } from "./Sidebar";
import { History } from "./History";
import { useGame, type Mode } from "@/lib/useGame";
import { phaseOf, lootPool } from "@/lib/derive";
import { GAME_ID, LIVE_AVAILABLE, accountUrl, txUrl } from "@/lib/env";
import { slay } from "@/lib/format";

export function Town() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("mode");
    setMode(q === "sim" || !LIVE_AVAILABLE ? "sim" : q === "live" ? "live" : ((localStorage.getItem("slay-mode") as Mode | null) ?? "live"));
  }, []);

  const choose = (m: Mode) => {
    localStorage.setItem("slay-mode", m);
    const u = new URL(window.location.href);
    u.searchParams.set("mode", m);
    window.history.replaceState(null, "", u);
    setMode(m);
  };

  if (!mode) return <p className="text-dim">Loading the town…</p>;
  return <TownView key={mode} mode={mode} choose={choose} />;
}

function TownView({ mode, choose }: { mode: Mode; choose: (m: Mode) => void }) {
  const g = useGame(mode);
  const { backend, snap, now } = g;
  const account = backend?.account() ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-edge text-sm">
          <button className={`px-3 py-1.5 ${mode === "live" ? "bg-ember text-night" : "bg-bark"}`} disabled={!LIVE_AVAILABLE} onClick={() => choose("live")}>
            Live on NEAR testnet
          </button>
          <button className={`px-3 py-1.5 ${mode === "sim" ? "bg-ember text-night" : "bg-bark"}`} onClick={() => choose("sim")}>
            Offline simulation
          </button>
        </div>
        {mode === "live" && (
          <span className="text-xs text-dim">
            Contract{" "}
            <a className="link" href={accountUrl(GAME_ID)} target="_blank" rel="noreferrer">
              {GAME_ID}
            </a>
          </span>
        )}
        {mode === "sim" && backend?.skip && snap && (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-dim">Skip ahead:</span>
            <button className="btn px-2 py-1 text-xs" onClick={() => g.skip(30)}>
              +30 s
            </button>
            <button className="btn px-2 py-1 text-xs" onClick={() => g.skip(120)}>
              +2 min
            </button>
            {snap.round && !snap.round.settlement && (
              <button className="btn px-2 py-1 text-xs" onClick={() => g.skip(Math.max(1, (Number(BigInt(snap.round!.deadline) / 1_000_000n) - now) / 1000 + 1))}>
                to the deadline
              </button>
            )}
          </span>
        )}
        {account && snap?.player && (
          <span className="ml-auto text-sm">
            <span className="text-dim">{mode === "live" ? "Playing as " : ""}</span>
            {mode === "live" ? (
              <a className="link" href={accountUrl(account)} target="_blank" rel="noreferrer">
                {account.split(".")[0]}
              </a>
            ) : (
              "you"
            )}{" "}
            · <b>{slay(snap.player.balance)}</b> $SLAY
          </span>
        )}
      </div>

      {!snap && !g.loadError && <p className="text-dim">Reading the contract…</p>}
      {g.loadError && !snap && (
        <div className="card text-blood">
          Could not load the game: {g.loadError}.{" "}
          {mode === "live" && (
            <button className="link" onClick={() => choose("sim")}>
              Try the offline simulation
            </button>
          )}
        </div>
      )}

      {backend && snap && (
        <>
          <Intro mode={mode} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <BearPanel config={backend.config} status={snap.status} round={snap.round} history={snap.history} phase={phaseOf(snap.round, now)} now={now} />
              {snap.claimable.length > 0 && (
                <div className="card flex flex-wrap items-center gap-2 border-moss/70">
                  <span className="font-bold text-moss">Loot waiting for you:</span>
                  {snap.claimable.map((c) => (
                    <button
                      key={c.roundId}
                      className="btn btn-primary text-sm"
                      disabled={!!g.pending}
                      onClick={() => void g.act({ method: "claim", roundId: c.roundId }, "Claim", `Claimed ${slay(c.share)} $SLAY from raid #${c.roundId}`)}
                    >
                      💰 {slay(c.share, 2)} $SLAY from raid #{c.roundId}
                    </button>
                  ))}
                </div>
              )}
              <ActionPanel
                mode={mode}
                config={backend.config}
                round={snap.round}
                participants={snap.participants}
                player={snap.player}
                me={snap.me}
                account={account}
                phase={phaseOf(snap.round, now)}
                now={now}
                pending={g.pending}
                act={g.act}
                join={g.join}
              />
              {snap.round && (
                <RaidBoard round={snap.round} participants={snap.participants} pool={lootPool(backend.config, snap.status, snap.round)} account={account} mode={mode} />
              )}
              <Feed feed={snap.feed} now={now} account={account} />
            </div>
            <div className="space-y-4">
              <Pouch player={snap.player} account={account} mode={mode} />
              <Forge player={snap.player} pending={g.pending} act={g.act} />
              <Smith config={backend.config} status={snap.status} player={snap.player} pending={g.pending} act={g.act} />
              <Market listings={snap.listings} player={snap.player} account={account} pending={g.pending} act={g.act} />
              <History history={snap.history} backend={backend} account={account} />
              <TownStats status={snap.status} />
            </div>
          </div>
        </>
      )}

      <div className="fixed bottom-4 right-4 z-30 flex w-80 flex-col gap-2">
        {g.toasts.map((t) => (
          <div key={t.id} className={`card py-2 text-sm shadow-lg ${t.kind === "error" ? "border-blood" : "border-moss"}`}>
            {t.text}
            {t.txHash && mode === "live" && (
              <>
                {" "}
                <a className="link" href={txUrl(t.txHash)} target="_blank" rel="noreferrer">
                  view tx
                </a>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Intro({ mode }: { mode: Mode }) {
  return (
    <p className="text-sm text-dim">
      <b className="text-parch">How to play:</b> join, then burn $SLAY to hit the Bear before the timer runs out. Early hits deal more
      damage. If the town&apos;s damage reaches the Bear&apos;s health, raiders split its hoard plus a treasury reward by damage, and
      three item drops. If not, the Bear steals from the treasury and grows its hoard for the next raid.{" "}
      {mode === "live" ? "Every move below is a NEAR testnet transaction." : "This simulation runs the same rules locally."}
    </p>
  );
}
