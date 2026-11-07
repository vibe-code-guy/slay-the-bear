import {
  DEMO_CONFIG,
  PERSONALITIES,
  RECIPES,
  TACTIC_EFFECTS,
  TACTIC_NAMES,
  Tactic,
  WEAPON_MULT_BPS,
  describeConfig,
  itemName,
  type RecipeId,
  type WeaponId,
} from "@slay/rules";
import { REPO_URL } from "@/lib/env";

export const metadata = { title: "Rules · Slay the Bear" };

const slay = (v: bigint) => (v / 10n ** 18n).toString();

export default function Rules() {
  const cfg = describeConfig(DEMO_CONFIG);
  return (
    <article className="mx-auto max-w-3xl space-y-6 leading-relaxed">
      <h1 className="text-3xl font-bold">The rules</h1>
      <p>
        Slay the Bear is one NEAR contract. It holds the $SLAY token (NEP-141), the items (NEP-245) and the rules below. Its config was
        fixed when it was deployed, and its account has no keys, so nobody can change any of this. The same rules run in TypeScript in
        this site, the simulator and the verifier; a shared set of test vectors checks that both implementations agree to the last
        base unit.
      </p>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">A raid</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>The first hit wakes the Bear and opens a raid. The open fixes the Bear&apos;s health, its mood and the drand round that will decide the raid.</li>
          <li>Players burn $SLAY to hit. Damage = $SLAY burned × weapon × early bonus (1.5× at the open, falling to 1× at the deadline).</li>
          <li>At the deadline the raid closes. Anyone settles it with the deciding drand beacon and earns a 5 $SLAY tip. The contract checks the beacon&apos;s BLS signature itself.</li>
          <li>The beacon draws the Bear&apos;s tactic: its mood has a 55% chance, each other tactic 15%. Then: if the town&apos;s damage (adjusted by the tactic) reaches the Bear&apos;s health, the town wins.</li>
          <li>On a win, raiders split the Bear&apos;s hoard plus a treasury reward by damage, and the beacon picks 3 item drops weighted by damage. On a loss, the Bear steals from the treasury into its hoard, which makes the next raid&apos;s jackpot bigger.</li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">The Bear&apos;s tactics</h2>
        <ul className="space-y-1">
          {[Tactic.None, Tactic.Armor, Tactic.Rage, Tactic.Feint].map((t) => (
            <li key={t}>
              <b>{TACTIC_NAMES[t]}</b>: {TACTIC_EFFECTS[t]}
            </li>
          ))}
        </ul>
        <p className="text-sm text-dim">
          The mood is set at the open from the last raid: Armor at the first raid; Feint if 35% or more of the last raid&apos;s damage came
          late; Rage after a Bear win; Armor after a narrow town win (under 125% of its health); Rage after an easy one. The tactic itself is
          drawn from the beacon after the deadline, so nobody, the deployer included, knows it while hits are allowed.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">Items</h2>
        <ul className="space-y-1">
          {(Object.keys(WEAPON_MULT_BPS) as WeaponId[]).map((w) => {
            const r = RECIPES[w as RecipeId];
            return (
              <li key={w}>
                <b>{itemName(w)}</b> ×{Number(WEAPON_MULT_BPS[w]) / 10_000} damage: {r.charges.toString()} charges from{" "}
                {[r.wood ? `${r.wood} wood` : "", r.iron ? `${r.iron} iron` : "", r.trophy ? "1 Bear trophy" : "", `${slay(r.fee)} $SLAY (burned)`]
                  .filter(Boolean)
                  .join(" + ")}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-dim">
          Each drop is 3 wood (60%), 2 iron (35%) or a unique Bear trophy (5%). The smith sells club charges at a price that rises as its
          stock falls (and 20% more right after a Bear win), buys wood and iron, and forges clubs from its wood at each raid&apos;s open when
          its stock is below half. Players trade any item on the market; 2% of each sale is burned.
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-bold">Villagers</h2>
        <p className="text-sm text-dim">
          Four NPC villagers keep a quiet town alive. They are ordinary player accounts run by a script in packages/agents: they claim a
          pouch like anyone and can only make the moves any player can. Each follows one rule:
        </p>
        <ul className="space-y-1">
          {Object.entries(PERSONALITIES).map(([k, v]) => (
            <li key={k}>
              <b className="capitalize">{k}</b>: {v}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 text-xl font-bold">Numbers (demo config)</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
          {Object.entries(cfg).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-dim">
          The live town uses 5-minute raids. Formulas: packages/rules/src/math.ts and contracts/game/src/rules.rs in{" "}
          <a className="link" href={REPO_URL}>
            the source
          </a>
          .
        </p>
      </section>
    </article>
  );
}
