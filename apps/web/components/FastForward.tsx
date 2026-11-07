"use client";
import { useState } from "react";
import { DEMO_CONFIG, ONE, SCENARIOS, SEASON_CONFIG, simulate, summarize, type RoundStat } from "@slay/rules";
import { TACTIC_ICON } from "@/lib/format";

type Result = { stats: RoundStat[]; summary: ReturnType<typeof summarize> };

export function FastForward() {
  const [scenario, setScenario] = useState(SCENARIOS[0]!.name);
  const [preset, setPreset] = useState<"season" | "demo">("season");
  const [days, setDays] = useState(90);
  const [seed, setSeed] = useState(1);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const sc = SCENARIOS.find((s) => s.name === scenario)!;
      const out = simulate(preset === "season" ? SEASON_CONFIG : DEMO_CONFIG, sc, days, seed);
      setRes({ stats: out.rounds, summary: summarize(out) });
      setBusy(false);
    }, 20);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Fast-forward a season</h1>
      <p className="max-w-3xl text-dim">
        Plays the real rules engine with simulated players: weeks of raids in a second. This is how the launch numbers were chosen.
        Each simulated player follows one of the villager personalities. Every round is settled with a local BLS beacon.
      </p>
      <div className="card flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-dim">Town</span>
          <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}: {s.description}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-dim">Raids</span>
          <select className="input" value={preset} onChange={(e) => setPreset(e.target.value as "season" | "demo")}>
            <option value="season">one a day (season)</option>
            <option value="demo">every 10 minutes (demo)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-dim">Days</span>
          <input className="input w-20" type="number" min={1} max={preset === "season" ? 365 : 7} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-dim">Seed</span>
          <input className="input w-20" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? "Simulating…" : "Run"}
        </button>
      </div>

      {res && (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Raids", res.summary.rounds],
                ["Town wins", `${res.summary.winRate}%`],
                ["Longest Bear streak", res.summary.longestBearStreak],
                ["Biggest jackpot", `${res.summary.biggestJackpot.toLocaleString("en-US")} $SLAY`],
                ["Burned", `${res.summary.burned.toLocaleString("en-US")} $SLAY`],
                ["Players", res.summary.players],
              ] as [string, string | number][]
            ).map(([k, v]) => (
              <div key={k} className="card">
                <div className="text-xs uppercase text-dim">{k}</div>
                <div className="text-lg font-bold">{v}</div>
              </div>
            ))}
          </div>
          <Chart
            title="Bear health vs town damage"
            series={[
              { name: "health", color: "#dc2626", values: res.stats.map((s) => Number(s.health / ONE)) },
              { name: "damage", color: "#f59e0b", values: res.stats.map((s) => Number(s.damage / ONE)) },
            ]}
          />
          <Chart
            title="Hoard and burned supply"
            series={[
              { name: "Bear's hoard", color: "#a78bfa", values: res.stats.map((s) => Number(s.hoard / ONE)) },
              { name: "burned", color: "#22a35a", values: res.stats.map((s) => Number(s.burned / ONE)) },
            ]}
          />
          <section className="card">
            <h3 className="mb-2 font-bold">Raid by raid</h3>
            <div className="flex flex-wrap gap-0.5">
              {res.stats.map((s) => (
                <span
                  key={s.round}
                  title={`#${s.round}: ${s.outcome}, tactic ${s.tactic}, ${s.raiders} raiders`}
                  className={`inline-block h-4 w-4 rounded-sm text-[9px] leading-4 ${s.outcome === "win" ? "bg-moss" : "bg-blood"}`}
                >
                  {s.raiders > 0 ? "" : "·"}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-dim">Green: town win. Red: Bear win. Hover for details. Tactics: {Object.values(TACTIC_ICON).join(" ")}</p>
          </section>
        </>
      )}
    </div>
  );
}

function Chart({ title, series }: { title: string; series: { name: string; color: string; values: number[] }[] }) {
  const W = 900;
  const H = 220;
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (n - 1)) * W).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`).join(" ");
  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-baseline gap-4">
        <h3 className="font-bold">{title}</h3>
        {series.map((s) => (
          <span key={s.name} className="text-xs" style={{ color: s.color }}>
            ● {s.name}
          </span>
        ))}
        <span className="ml-auto text-xs text-dim">max {Math.round(max).toLocaleString("en-US")} $SLAY</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" preserveAspectRatio="none">
        {series.map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </section>
  );
}
