"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ONE } from "@slay/rules";
import { RaidScene, type RevealState, type SceneHandle } from "./game/RaidScene";
import { ControlBar } from "./game/ControlBar";
import { TopSlayers, useSlayers } from "./game/Progress";
import { Feed, RaidBoard } from "./RaidBoard";
import { Forge, Market, Pouch, Smith, TownStats } from "./Sidebar";
import { History } from "./History";
import { useGame, type Mode } from "@/lib/useGame";
import { lootPool, phaseOf, previewHit } from "@/lib/derive";
import { GAME_ID, LIVE_AVAILABLE, ROOT_ACCOUNT, accountUrl, txUrl } from "@/lib/env";
import { slay } from "@/lib/format";
import { explain } from "@/lib/types";

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

/** Wide but short windows put the controls beside the scene; the same query is in globals.css. */
const SIDE_LAYOUT = "(min-width: 640px) and (max-height: 800px)";
/** The scene never gets shorter than this, even if the page then has to scroll. */
const MIN_SCENE_PX = 220;

/**
 * Keeps the scene and the strike button on one screen: sets --scene-max-h on the play area to
 * the room left under the header, minus (when the controls sit below the scene) the part of
 * the control bar down to the strike button.
 */
function useFitToScreen(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const play = ref.current;
    if (!ready || !play) return;
    const side = window.matchMedia(SIDE_LAYOUT);
    const fit = () => {
      const top = play.getBoundingClientRect().top + window.scrollY;
      let room = window.innerHeight - top - 12;
      if (!side.matches) {
        const controls = play.querySelector<HTMLElement>(".controls, .controls-join");
        const action = play.querySelector<HTMLElement>(".controls-action") ?? controls;
        if (controls && action) {
          const gap = parseFloat(getComputedStyle(play).rowGap) || 0;
          // the card's own bottom padding, unless the whole card was measured
          const padding = action === controls ? 0 : parseFloat(getComputedStyle(controls).paddingBottom) || 0;
          room -= gap + (action.getBoundingClientRect().bottom - controls.getBoundingClientRect().top) + padding;
        }
      }
      const value = `${Math.max(MIN_SCENE_PX, Math.floor(room))}px`;
      if (play.style.getPropertyValue("--scene-max-h") !== value) play.style.setProperty("--scene-max-h", value);
    };
    fit();
    // re-fit when the window, the controls (a claim button, the spin button) or anything above
    // the play area changes size
    const ro = new ResizeObserver(fit);
    ro.observe(play);
    if (play.parentElement) ro.observe(play.parentElement.firstElementChild ?? play);
    const controls = play.querySelector(".play-controls");
    if (controls) ro.observe(controls);
    window.addEventListener("resize", fit);
    side.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      side.removeEventListener("change", fit);
    };
  }, [ready]);
  return ref;
}

function Tabs({ tabs }: { tabs: { id: string; label: string; body: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]!.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current.id}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${t.id === current.id ? "bg-ember text-night" : "bg-bark text-dim hover:text-parch"}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{current.body}</div>
    </div>
  );
}

function TownView({ mode, choose }: { mode: Mode; choose: (m: Mode) => void }) {
  const g = useGame(mode);
  const { backend, snap, now } = g;
  const account = backend?.account() ?? null;
  const scene = useRef<SceneHandle>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [weapon, setWeaponState] = useState<string | null>(null);
  const [charging, setCharging] = useState<number | null>(null);

  useEffect(() => setWeaponState(localStorage.getItem("slay-weapon") || null), []);
  const setWeapon = (w: string | null) => {
    setWeaponState(w);
    localStorage.setItem("slay-weapon", w ?? "");
  };

  const strike = useCallback(
    async (amountWhole: number, w: string | null) => {
      if (!backend || !snap) return;
      const amount = BigInt(amountWhole) * ONE;
      const open = phaseOf(snap.round, now) === "open" ? snap.round : null;
      const predicted = previewHit(backend.config, open, now, amount, w).damage;
      const h = scene.current?.strike(amountWhole, w, predicted);
      const res = await g.act({ method: "hit", amount, weapon: w }, "Hit", "");
      h?.resolve(res);
    },
    [backend, snap, now, g],
  );

  const spin = useCallback(
    async (roundId: number) => {
      const h = scene.current?.spin(roundId);
      const res = await g.act({ method: "settle", roundId }, "Settle", "");
      // if someone else settled first, the wheel keeps spinning until their result shows up
      if (!res.ok && res.error !== "already_settled") h?.fail();
    },
    [g],
  );

  const claim = useCallback(
    async (roundId: number, share: bigint) => {
      const res = await g.act({ method: "claim", roundId }, "Claim", "");
      if (res.ok) scene.current?.claimed(res.amount ? BigInt(res.amount) : share);
    },
    [g],
  );

  const slayers = useSlayers(
    backend ?? ({ rounds: async () => [], participants: async () => [] } as never),
    snap?.history ?? [],
  );
  const play = useFitToScreen(!!(backend && snap));

  return (
    <div className="space-y-4 short:space-y-2">
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

      {!snap && !g.loadError && (
        <div className="card flex aspect-[2.15/1] items-center justify-center text-dim">Reading the contract…</div>
      )}
      {g.loadError && !snap && (
        <div className="card text-blood">
          Could not load the game: {explain(g.loadError)}.{" "}
          {mode === "live" && (
            <button className="link" onClick={() => choose("sim")}>
              Try the offline simulation
            </button>
          )}
        </div>
      )}

      {backend && snap && (
        <>
          <div ref={play} className="play">
          <div className="play-scene">
          <RaidScene
            ref={scene}
            mode={mode}
            config={backend.config}
            snap={snap}
            now={now}
            account={account}
            villagerSuffix={mode === "live" ? ROOT_ACCOUNT : backend.contractId}
            weapon={weapon}
            charging={charging}
            onReveal={setReveal}
          />
          </div>
          <div className="play-controls">
          <ControlBar
            mode={mode}
            config={backend.config}
            round={snap.round}
            phase={phaseOf(snap.round, now)}
            now={now}
            player={snap.player}
            me={snap.me}
            account={account}
            claimable={snap.claimable}
            pending={g.pending}
            reveal={reveal}
            myRow={slayers.rows.find((r) => r.account === account)}
            weapon={weapon}
            setWeapon={setWeapon}
            onCharge={setCharging}
            onJoin={() => void g.join()}
            onPouch={() => void g.act({ method: "claim_pouch" }, "Claim pouch", "1,000 $SLAY claimed")}
            onStrike={(a, w) => void strike(a, w)}
            onSpin={(id) => void spin(id)}
            onClaim={(id, share) => void claim(id, share)}
          />
          </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Tabs
                tabs={[
                  {
                    id: "board",
                    label: "⚔️ Raid board",
                    body: snap.round ? (
                      <RaidBoard round={snap.round} participants={snap.participants} pool={lootPool(backend.config, snap.status, snap.round)} account={account} mode={mode} />
                    ) : (
                      <div className="card text-dim">No raid yet. Strike to start the first one.</div>
                    ),
                  },
                  { id: "feed", label: "📜 Town feed", body: <Feed feed={snap.feed} now={now} account={account} /> },
                  { id: "past", label: "🎡 Past raids", body: <History history={snap.history} backend={backend} account={account} /> },
                ]}
              />
            </div>
            <div className="space-y-4">
              <TopSlayers rows={slayers.rows} raids={slayers.raids} account={account} />
              <Tabs
                tabs={[
                  {
                    id: "pouch",
                    label: "👛 Pouch",
                    body: snap.player ? <Pouch player={snap.player} account={account} mode={mode} /> : <div className="card text-dim">Join to get a pouch.</div>,
                  },
                  { id: "forge", label: "🔨 Forge", body: <Forge player={snap.player} pending={g.pending} act={g.act} /> },
                  { id: "smith", label: "⚒️ Smith", body: <Smith config={backend.config} status={snap.status} player={snap.player} pending={g.pending} act={g.act} /> },
                  { id: "market", label: "🏷️ Market", body: <Market listings={snap.listings} player={snap.player} account={account} pending={g.pending} act={g.act} /> },
                ]}
              />
              <TownStats status={snap.status} />
            </div>
          </div>
        </>
      )}

      {/* bottom right; on short screens only as wide as the controls column, over its level card;
          on phones held sideways bottom left, over the scene rather than the strike controls */}
      <div
        className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-2 sm:left-auto sm:w-80 short:sm:w-64 short:lg:w-72 tiny:sm:left-4 tiny:sm:right-auto tiny:sm:w-60 tiny:sm:text-xs"
        aria-live="polite"
      >
        {g.toasts.map((t) => (
          <div key={t.id} className={`card py-2 text-sm shadow-lg ${t.kind === "error" ? "border-blood" : t.kind === "info" ? "border-edge" : "border-moss"}`}>
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
