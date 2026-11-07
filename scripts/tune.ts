// Compare parameter variants across all scenarios and seeds before fixing a config.
//   npx tsx scripts/tune.ts
import { SCENARIOS, SEASON_CONFIG, DEMO_CONFIG, cloneConfig, simulate, summarize, type GameConfig } from "../packages/rules/src/index";

const variants: [string, (c: GameConfig) => GameConfig][] = [
  ["effort cap 2.0x (old)", (c) => cloneConfig(c, { effortCapBps: 20_000n })],
  ["effort cap 1.5x", (c) => cloneConfig(c, { effortCapBps: 15_000n })],
  ["effort cap 1.2x", (c) => cloneConfig(c, { effortCapBps: 12_000n })],
  ["effort cap 1.0x", (c) => cloneConfig(c, { effortCapBps: 10_000n })],
];

for (const [preset, base, days] of [
  ["season", SEASON_CONFIG, 90],
  ["demo", DEMO_CONFIG, 3],
] as const) {
  console.log(`\n${preset} (${days} days), seeds 1-3: win % / longest Bear streak / final hoard`);
  for (const [name, make] of variants) {
    const cells = SCENARIOS.map((s) => {
      const runs = [1, 2, 3].map((seed) => summarize(simulate(make(base), s, days, seed)));
      const win = Math.round(runs.reduce((t, r) => t + r.winRate, 0) / runs.length);
      const streak = Math.max(...runs.map((r) => r.longestBearStreak));
      const hoard = Math.round(runs.reduce((t, r) => t + Number(r.hoard), 0) / runs.length);
      return `${s.name} ${win}%/${streak}/${hoard.toLocaleString("en-US")}`;
    });
    console.log(`  ${name.padEnd(22)} ${cells.join("  ")}`);
  }
}
