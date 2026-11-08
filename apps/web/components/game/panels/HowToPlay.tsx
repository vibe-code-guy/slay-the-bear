// How to play, in one screen: a raid in four steps, the Bear's tactics, gear, and why nobody
// can rig it. The full numbers are on /rules.
import { TACTIC_EFFECTS, Tactic, type GameConfig } from "@slay/rules";
import { GEAR_STEPS } from "../Hero";
import { ItemArt } from "../ItemArt";
import { SectionTitle } from "./ItemCard";
import { TACTIC_ICON, pct, slay, tacticName } from "@/lib/format";

export function HowToPlay({ config }: { config: GameConfig }) {
  const mins = Number(config.roundSecs) / 60;
  const steps = [
    { icon: "🔔", title: "Wake the Bear", text: `The first strike opens a ${mins}-minute raid. The open fixes the Bear's health, its mood and the drand round that will decide the raid.` },
    {
      icon: "⚔️",
      title: "Strike",
      text: `Hold to charge, let go to hit: you burn ${slay(config.minHit)} to ${slay(config.maxHit)} $SLAY. Damage = $SLAY × weapon × early bonus (×1.5 at the open, ×1 at the deadline).`,
    },
    { icon: "🎡", title: "Spin the wheel", text: "After the deadline anyone settles the raid with drand's beacon and earns a 5 $SLAY tip. The beacon picks the Bear's tactic." },
    { icon: "💰", title: "Loot or lose", text: "Win: raiders split the hoard and a treasury reward by damage, and 3 items drop. Lose: the Bear steals from the treasury and the next jackpot grows." },
  ];
  return (
    <div className="text-sm">
      <SectionTitle>A raid in four steps</SectionTitle>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-edge bg-black/30 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/15 text-2xl">{s.icon}</span>
            <span>
              <b className="text-[#fde68a]">
                {i + 1}. {s.title}
              </b>
              <span className="mt-0.5 block text-dim">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <SectionTitle note={`its mood ${pct(config.moodBps)}, each other ${pct((10_000n - config.moodBps) / 3n)}`}>The Bear&apos;s tactics</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        {[Tactic.None, Tactic.Armor, Tactic.Rage, Tactic.Feint].map((t) => (
          <div key={t} className="flex items-center gap-2 rounded-xl border border-edge bg-black/30 p-2">
            <span className="text-2xl">{TACTIC_ICON[t]}</span>
            <span>
              <b>{tacticName(t)}</b> <span className="text-dim">{TACTIC_EFFECTS[t]}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-dim">
        The mood is set at the open from how the last raid went. The tactic itself is drawn from drand after the deadline, so nobody knows it while hits are allowed.
      </p>

      <SectionTitle>Gear and progress</SectionTitle>
      <div className="flex flex-wrap gap-3">
        {(["club", "sword", "slayer"] as const).map((w) => (
          <div key={w} className="flex items-center gap-2">
            <span className="h-10 w-10">
              <ItemArt id={w} />
            </span>
            <span className="text-xs">
              <b className="capitalize">{w === "slayer" ? "Bear-slayer" : w}</b>
              <span className="block text-dim">×{w === "club" ? "1.25" : w === "sword" ? "1.5" : "2"} damage</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-dim">
        Forge weapons from the wood and iron that won raids drop, or buy clubs from the smith. One drop in twenty is a one-of-one Bear trophy: forge it into a
        Bear-slayer or sell it. The villagers do the same with their own loot: they forge weapons when their charges run out and put trophies up at the market,
        where you can buy them. Your level comes from your damage over recent raids, and your hero gains gear as it rises:{" "}
        {GEAR_STEPS.map((g) => `${g.name} at level ${g.level}`).join(", ")}. Finish all three of the day&apos;s goals and your hero wears the goal sash until midnight UTC.
      </p>

      <SectionTitle>Why nobody can rig a raid</SectionTitle>
      <ul className="list-disc space-y-1 pl-5 text-dim">
        <li>Every move is a NEAR transaction to one contract with no owner and no admin methods. Its rules and numbers were fixed when it was deployed.</li>
        <li>Every random roll (the tactic and the drops) comes from the drand beacon, and the contract checks drand&apos;s BLS signature itself.</li>
        <li>Anyone can recompute any raid in the browser from the contract&apos;s views and drand: open a past raid in the Tavern and press Verify.</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-3">
        <a className="link" href="/rules">
          All the numbers
        </a>
        <a className="link" href="/verify">
          The verifier
        </a>
      </div>
    </div>
  );
}
