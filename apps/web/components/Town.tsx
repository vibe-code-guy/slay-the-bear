"use client";
// The town: the HUD and game menu, the raid scene with the controls beside or under it, and the
// panels the menu opens (backpack, forge, market, smith, trophies, tavern, how to play). A title
// screen sits over the scene until you join; a short tutorial walks you through your first raid.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ONE, RECIPES, type RecipeId } from "@slay/rules";
import { RaidScene, type RevealState, type SceneHandle } from "./game/RaidScene";
import { ControlBar } from "./game/ControlBar";
import { HudBar, MENU, type PanelId } from "./game/HudBar";
import { Panel } from "./game/Panel";
import { TitleScreen } from "./game/TitleScreen";
import { Tutorial } from "./game/Tutorial";
import { badgesOf, levelOf, useSlayers } from "./game/Progress";
import { lookOf, type HeroLook } from "./game/Hero";
import { BackpackPanel } from "./game/panels/BackpackPanel";
import { ForgePanel } from "./game/panels/ForgePanel";
import { MarketPanel } from "./game/panels/MarketPanel";
import { SmithPanel } from "./game/panels/SmithPanel";
import { TrophyHall } from "./game/panels/TrophyHall";
import { TavernPanel } from "./game/panels/TavernPanel";
import { HowToPlay } from "./game/panels/HowToPlay";
import { useGame, type Mode } from "@/lib/useGame";
import { useGoals } from "@/lib/goals";
import { useTrophies } from "@/lib/useTrophies";
import { lootPool, phaseOf, previewHit } from "@/lib/derive";
import { GAME_ID, LIVE_AVAILABLE, ROOT_ACCOUNT, accountUrl, txUrl } from "@/lib/env";
import { clock, slay } from "@/lib/format";
import { centerOf, flyTo } from "@/lib/fly";
import { play as sound } from "@/lib/sfx";
import { explain } from "@/lib/types";
import { useNewItems } from "@/lib/useNewItems";
import { usePrizes } from "@/lib/usePrizes";

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
        const controls = play.querySelector<HTMLElement>(".controls");
        const action = play.querySelector<HTMLElement>(".controls-action");
        if (controls && action) {
          const gap = parseFloat(getComputedStyle(play).rowGap) || 0;
          const padding = parseFloat(getComputedStyle(controls).paddingBottom) || 0;
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

function TownView({ mode, choose }: { mode: Mode; choose: (m: Mode) => void }) {
  const g = useGame(mode);
  const { backend, snap, now } = g;
  const account = backend?.account() ?? null;
  const scene = useRef<SceneHandle>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [weapon, setWeaponState] = useState<string | null>(null);
  const [charging, setCharging] = useState<number | null>(null);
  const [panel, setPanelState] = useState<PanelId | null>(null);
  /** the item to sell when the backpack opens the market */
  const [sellPick, setSellPick] = useState<string | null>(null);

  useEffect(() => setWeaponState(localStorage.getItem("slay-weapon") || null), []);
  const setWeapon = (w: string | null) => {
    setWeaponState(w);
    localStorage.setItem("slay-weapon", w ?? "");
  };
  const setPanel = useCallback((p: PanelId | null) => {
    if (p) sound("open");
    setPanelState(p);
  }, []);

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

  // raids you claimed in this tab: the settled raids cached for levels and goals still have
  // their participants as they were read, before the claim
  const [claimedHere, setClaimedHere] = useState<ReadonlySet<number>>(new Set());
  const claim = useCallback(
    async (roundId: number, share: bigint) => {
      const res = await g.act({ method: "claim", roundId }, "Claim", "");
      if (res.ok) {
        scene.current?.claimed(res.amount ? BigInt(res.amount) : share);
        setClaimedHere((s) => new Set(s).add(roundId));
      }
    },
    [g],
  );

  const slayers = useSlayers(
    backend ?? ({ rounds: async () => [], participants: async () => [] } as never),
    snap?.history ?? [],
    !!snap,
  );
  const myRow = slayers.rows.find((r) => r.account === account);
  // your level, once the settled raids are read (so the scene can tell a level-up from a page load)
  const myLevel = account && slayers.loaded ? levelOf(Number((myRow?.damage ?? 0n) / ONE)).level : null;
  const trophies = useTrophies(backend, snap?.history ?? [], snap?.listings ?? [], panel === "trophies", snap?.player?.trophies ?? [], account);

  // goals count today's settled raids and the one in progress
  const goalRounds = useMemo(() => {
    const list = slayers.rounds.map((x) =>
      account && claimedHere.has(x.round.id) ? { round: x.round, parts: x.parts.map((p) => (p.account === account ? { ...p, claimed: true } : p)) } : x,
    );
    if (snap?.round && !snap.round.settlement && !list.some((x) => x.round.id === snap.round!.id)) list.push({ round: snap.round, parts: snap.participants });
    return list;
  }, [slayers.rounds, snap?.round, snap?.participants, claimedHere, account]);
  const goals = useGoals(account, goalRounds, now);
  const badges = useMemo(() => badgesOf(myRow, snap?.player ?? null), [myRow, snap?.player]);
  // no spoilers: what a raid's result earned you is announced once the scene has revealed it
  const [sceneBusy, setSceneBusy] = useState(false);
  usePrizes(account, slayers.loaded && !!snap?.player && !sceneBusy, goals, badges, Math.floor(now / 86_400_000), g.notify);

  // the gear every raider has earned: from their level, and whether a trophy dropped to them
  const looks = useMemo(() => {
    const m = new Map<string, HeroLook>();
    const holders = new Set(trophies.list.filter((t) => t.where.kind !== "forged").map((t) => (t.where.kind === "held" ? t.where.owner : t.droppedTo)));
    for (const r of slayers.rows) m.set(r.account, lookOf(levelOf(Number(r.damage / ONE)).level, holders.has(r.account)));
    if (account) {
      const mine = lookOf(levelOf(Number((myRow?.damage ?? 0n) / ONE)).level, (snap?.player?.trophies.length ?? 0) > 0, goals.allDone);
      m.set(account, mine);
    }
    return m;
  }, [slayers.rows, trophies.list, account, myRow, snap?.player?.trophies.length, goals.allDone]);

  const fit = useFitToScreen(!!(backend && snap));
  const phase = phaseOf(snap?.round ?? null, now);
  const player = snap?.player ?? null;
  const fresh = useNewItems(account, player, panel === "backpack", mode === "live");

  // the starter pouch landing: coins fly from the town square to your counter
  const hadPouch = useRef<boolean | null>(null);
  useEffect(() => {
    if (!player) return;
    if (hadPouch.current === false && player.pouch_claimed) {
      const box = document.querySelector(".scene-box");
      setTimeout(() => void flyTo("coins", centerOf(box), { count: 12, size: 22, spread: 120 }).then(() => sound("coin", 1.3)), 300);
    }
    hadPouch.current = player.pouch_claimed;
  }, [player]);

  // a red dot on the forge when something can be forged now
  const craftable = useMemo(() => {
    if (!player) return 0;
    const have = (t: string) => BigInt(player.items.find(([x]) => x === t)?.[1] ?? "0");
    return (Object.keys(RECIPES) as RecipeId[]).filter((id) => {
      const r = RECIPES[id];
      return have("wood") >= r.wood && have("iron") >= r.iron && BigInt(player.balance) >= r.fee && (r.trophy === 0n || player.trophies.length > 0);
    }).length;
  }, [player]);

  const status = useMemo(() => {
    if (!snap || !backend) return "";
    const r = snap.round;
    if (r && phase === "open") return `Raid #${r.id} is on: ${clock(Number(BigInt(r.deadline) / 1_000_000n) - now)} left, ${slay(lootPool(backend.config, snap.status, r))} $SLAY of loot`;
    if (r && phase === "ended") return `Raid #${r.id} is over: the Wheel of Fate is about to spin`;
    return BigInt(snap.status.hoard) > 0n
      ? `The Bear sleeps on a hoard of ${slay(snap.status.hoard)} $SLAY. Be the one to wake it.`
      : "The Bear is asleep. Be the one to wake it.";
  }, [snap, backend, phase, now]);

  const simControls =
    mode === "sim" && backend?.skip && snap ? (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-dim max-lg:hidden" aria-hidden>
          ⏩
        </span>
        <button className="btn px-2 py-1 text-xs" onClick={() => g.skip(30)} aria-label="+30 s" title="Skip 30 seconds">
          +30s
        </button>
        <button className="btn px-2 py-1 text-xs max-lg:hidden" onClick={() => g.skip(120)} aria-label="+2 min" title="Skip 2 minutes">
          +2m
        </button>
        {snap.round && !snap.round.settlement && (
          <button
            className="btn px-2 py-1 text-xs"
            onClick={() => g.skip(Math.max(1, (Number(BigInt(snap.round!.deadline) / 1_000_000n) - now) / 1000 + 1))}
            aria-label="to the deadline"
            title="Skip to the end of the raid"
          >
            ⏭<span className="max-lg:hidden"> end</span>
          </button>
        )}
      </span>
    ) : null;

  const menu = MENU.find((m) => m.id === panel);

  return (
    <div className="space-y-4 short:space-y-2">
      <HudBar
        mode={mode}
        liveAvailable={LIVE_AVAILABLE}
        choose={choose}
        account={account}
        balance={player ? BigInt(player.balance) : null}
        damage={myRow?.damage ?? 0n}
        dots={{ backpack: fresh, forge: craftable, trophies: player?.trophies.length ?? 0 }}
        onOpen={(p) => {
          setSellPick(null);
          setPanel(p);
        }}
        sim={simControls}
        contractUrl={mode === "live" ? accountUrl(GAME_ID) : null}
        accountUrl={mode === "live" && account ? accountUrl(account) : null}
        look={account ? looks.get(account) : undefined}
      />

      {!snap && !g.loadError && (
        <div className="card flex aspect-[2.15/1] max-h-[calc(100dvh-8rem)] w-full items-center justify-center text-dim">
          <span className="flex items-center gap-2">
            <span className="spinner" aria-hidden /> Reading the contract…
          </span>
        </div>
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
        <div ref={fit} className="play">
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
              looks={looks}
              myLevel={myLevel}
              onBusy={setSceneBusy}
              overlay={
                !account ? (
                  <TitleScreen
                    mode={mode}
                    liveAvailable={LIVE_AVAILABLE}
                    pending={g.pending}
                    status={status}
                    onPlay={() =>
                      void g.join().then(() =>
                        // the starter pouch: coins fly from the square to your counter once the HUD shows it
                        setTimeout(() => void flyTo("coins", centerOf(document.querySelector(".scene-box")), { count: 12, size: 22, spread: 120 }).then(() => sound("coin", 1.3)), 500),
                      )
                    }
                    onSwitch={() => choose(mode === "live" ? "sim" : "live")}
                  />
                ) : null
              }
            />
          </div>
          <div className="play-controls">
            <ControlBar
              mode={mode}
              config={backend.config}
              round={snap.round}
              phase={phase}
              now={now}
              player={player}
              me={snap.me}
              account={account}
              claimable={snap.claimable}
              pending={g.pending}
              reveal={reveal}
              weapon={weapon}
              setWeapon={setWeapon}
              goals={goals}
              onOpen={setPanel}
              onCharge={setCharging}
              onPouch={() => void g.act({ method: "claim_pouch" }, "Claim pouch", "1,000 $SLAY claimed")}
              onStrike={(a, w) => void strike(a, w)}
              onSpin={(id) => void spin(id)}
              onClaim={(id, share) => void claim(id, share)}
            />
          </div>
        </div>
      )}

      {panel && menu && backend && snap && (
        <Panel title={menu.label} icon={menu.icon} onClose={() => setPanel(null)} wide={panel === "trophies" || panel === "tavern" || panel === "backpack" || panel === "market"}>
          {panel === "backpack" && (
            <BackpackPanel
              player={player}
              account={account}
              accountHref={mode === "live" && account ? accountUrl(account) : null}
              mode={mode}
              myRow={myRow}
              weapon={weapon}
              setWeapon={setWeapon}
              randomness={trophies.randomness}
              open={(p, token) => {
                setSellPick(token ?? null);
                setPanel(p);
              }}
              look={account ? looks.get(account) : undefined}
            />
          )}
          {panel === "forge" && <ForgePanel player={player} pending={g.pending} act={g.act} randomness={trophies.randomness} />}
          {panel === "market" && (
            <MarketPanel listings={snap.listings} player={player} account={account} pending={g.pending} act={g.act} randomness={trophies.randomness} initialPick={sellPick} />
          )}
          {panel === "smith" && <SmithPanel config={backend.config} status={snap.status} player={player} pending={g.pending} act={g.act} />}
          {panel === "trophies" && (
            <TrophyHall
              trophies={trophies.list}
              account={account}
              balance={player ? BigInt(player.balance) : null}
              pending={g.pending}
              act={g.act}
              now={now}
              verifyHref={(r) => (mode === "live" ? `/verify?round=${r}` : null)}
            />
          )}
          {panel === "tavern" && (
            <TavernPanel
              backend={backend}
              slayers={slayers}
              round={snap.round}
              participants={snap.participants}
              pool={snap.round ? lootPool(backend.config, snap.status, snap.round) : 0n}
              history={snap.history}
              feed={snap.feed}
              status={snap.status}
              now={now}
              account={account}
            />
          )}
          {panel === "help" && <HowToPlay config={backend.config} />}
        </Panel>
      )}

      <Tutorial
        joined={!!account && !!player?.pouch_claimed}
        hits={snap?.me?.hits ?? 0}
        phase={phase}
        claimable={(snap?.claimable.length ?? 0) > 0}
        outcome={snap?.round?.settlement?.outcome ?? null}
        blocked={!!panel}
      />

      {/* bottom right; on short screens only as wide as the controls column, over its goals;
          on phones held sideways bottom left, over the scene rather than the strike controls */}
      <div
        className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-2 sm:left-auto sm:w-80 short:sm:w-64 short:lg:w-72 tiny:sm:left-4 tiny:sm:right-auto tiny:sm:w-60 tiny:sm:text-xs"
        aria-live="polite"
      >
        {g.toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in card py-2 text-sm shadow-lg ${t.kind === "error" ? "border-blood" : t.kind === "info" ? "border-edge" : t.kind === "prize" ? "prize-toast border-ember font-semibold text-[#fde68a]" : "border-moss"}`}
          >
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
