// Plays every scenario with the real rules engine and NPC rules, and writes CSV files plus an
// HTML chart to sim-out/. Usage: npm run simulate [-- --days 60 --seed 1]

import { mkdirSync, writeFileSync } from "node:fs";
import { DEMO_CONFIG, ONE, SEASON_CONFIG, SCENARIOS, simulate, summarize, type RoundStat, type SimResult } from "../packages/rules/src/index";

const args = process.argv.slice(2);
const arg = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const days = arg("days", 60);
const seed = arg("seed", 1);
const demoDays = arg("demo-days", 2);

const out = new URL("../sim-out/", import.meta.url);
mkdirSync(out, { recursive: true });

const slay = (v: bigint) => (v / ONE).toString();
const csv = (rows: RoundStat[]) =>
  [
    "round,day,outcome,tactic,health,damage,raiders,reward,steal,player_supply,treasury,hoard,burned,total_supply,players",
    ...rows.map((r) =>
      [r.round, r.day, r.outcome, r.tactic, slay(r.health), slay(r.damage), r.raiders, slay(r.reward), slay(r.steal), slay(r.playerSupply), slay(r.treasury), slay(r.hoard), slay(r.burned), slay(r.totalSupply), r.players].join(","),
    ),
  ].join("\n") + "\n";

function svgChart(res: SimResult, title: string): string {
  const w = 760;
  const h = 220;
  const rows = res.rounds;
  const series: [string, string, (r: RoundStat) => bigint][] = [
    ["player supply", "#2563eb", (r) => r.playerSupply],
    ["Bear hoard", "#dc2626", (r) => r.hoard],
    ["burned", "#6b7280", (r) => r.burned],
  ];
  const maxV = rows.reduce((m, r) => series.reduce((mm, [, , f]) => (f(r) > mm ? f(r) : mm), m), 1n);
  const x = (i: number) => (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * (w - 40)) + 30;
  const y = (v: bigint) => h - 20 - Number((v * 1000n) / maxV) * ((h - 40) / 1000);
  const lines = series
    .map(([name, color, f]) => {
      const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(f(r)).toFixed(1)}`).join(" ");
      return `<polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}"><title>${name}</title></polyline>`;
    })
    .join("");
  const marks = rows
    .map((r, i) => `<rect x="${(x(i) - 1).toFixed(1)}" y="${h - 14}" width="2" height="8" fill="${r.outcome === "win" ? "#16a34a" : "#dc2626"}"/>`)
    .join("");
  const legend = series.map(([n, c], i) => `<text x="${40 + i * 140}" y="14" fill="${c}" font-size="12">${n}</text>`).join("");
  return `<h3>${title}</h3><svg width="${w}" height="${h}" style="background:#fafafa;border:1px solid #ddd">${legend}${lines}${marks}<text x="30" y="${h - 1}" font-size="10" fill="#555">green = town won, red = Bear won (max ${slay(maxV)} $SLAY)</text></svg>`;
}

const sections: string[] = [];
const table: ReturnType<typeof summarize>[] = [];
for (const [label, config, d] of [
  ["season (1 raid a day)", SEASON_CONFIG, days],
  ["demo (10-minute raids)", DEMO_CONFIG, demoDays],
] as const) {
  for (const s of SCENARIOS) {
    const res = simulate(config, s, d, seed);
    const name = `${label.split(" ")[0]}-${s.name}`;
    writeFileSync(new URL(`${name}.csv`, out), csv(res.rounds));
    const sum = summarize(res);
    table.push({ ...sum, scenario: name });
    sections.push(svgChart(res, `${label}: ${s.name} (${d} days). ${s.description}`));
  }
}

console.table(
  table.map((t) => ({
    scenario: t.scenario,
    rounds: t.rounds,
    "win %": t.winRate,
    "longest Bear streak": t.longestBearStreak,
    "biggest jackpot": t.biggestJackpot.toString(),
    "player supply": t.playerSupply.toString(),
    treasury: t.treasury.toString(),
    hoard: t.hoard.toString(),
    burned: t.burned.toString(),
    players: t.players,
  })),
);

writeFileSync(
  new URL("report.html", out),
  `<!doctype html><meta charset="utf-8"><title>Slay the Bear simulation</title><body style="font-family:system-ui;margin:24px"><h1>Slay the Bear: simulation (seed ${seed})</h1>${sections.join("\n")}</body>`,
);
console.log(`wrote sim-out/*.csv and sim-out/report.html`);
