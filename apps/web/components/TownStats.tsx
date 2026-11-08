// The town's ledger: where every $SLAY is, straight from the contract's status view.
import type { StatusJson } from "@slay/rules";
import { slay } from "@/lib/format";

export function TownStats({ status }: { status: StatusJson }) {
  const rows: [string, string][] = [
    ["Total supply", status.total_supply],
    ["Burned so far", status.burned],
    ["Town treasury", status.treasury],
    ["The Bear's hoard", status.hoard],
    ["Held by players", status.player_supply],
    ["Starter pouches left", status.reserve],
  ];
  return (
    <section className="card">
      <h3 className="mb-2 text-lg font-bold">Town ledger</h3>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-dim">{k}</dt>
            <dd className="text-right font-mono">{slay(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-dim">
        $SLAY is minted once at launch. Every hit, craft fee and half of each smith sale is burned. Only the rules move the
        treasury, the hoard and the pouch chest; their accounts cannot sign anything.
      </p>
    </section>
  );
}
