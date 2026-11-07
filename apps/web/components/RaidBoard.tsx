"use client";
import { Tactic, type FeedItemJson, type ParticipantJson, type RoundJson } from "@slay/rules";
import { ago, isVillager, itemIcon, slay, TACTIC_ICON, tacticName, who } from "@/lib/format";
import { shares } from "@/lib/derive";
import { accountUrl } from "@/lib/env";

export function RaidBoard({ round, participants, pool, account, mode }: { round: RoundJson; participants: ParticipantJson[]; pool: bigint; account: string | null; mode: "live" | "sim" }) {
  const tactic = (round.settlement?.tactic ?? Tactic.None) as Tactic;
  const reward = round.settlement ? BigInt(round.settlement.reward) : pool;
  const est = shares(participants, tactic, reward);
  const rows = [...participants].sort((a, b) => Number(BigInt(b.early) + BigInt(b.late) - (BigInt(a.early) + BigInt(a.late))));
  return (
    <section className="card">
      <h3 className="mb-2 text-lg font-bold">Raid board · #{round.id}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-dim">Nobody has hit the Bear yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-dim">
              <tr>
                <th className="py-1">Raider</th>
                <th>Hits</th>
                <th className="text-right">Early dmg</th>
                <th className="text-right">Late dmg</th>
                <th className="text-right">{round.settlement ? (round.settlement.outcome === "win" ? "Loot" : "Loot") : "Share if won"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.account} className={`border-t border-edge/50 ${p.account === account ? "text-ember" : ""}`}>
                  <td className="py-1">
                    {mode === "live" ? (
                      <a href={accountUrl(p.account)} target="_blank" rel="noreferrer" className="hover:underline">
                        {who(p.account, account)}
                      </a>
                    ) : (
                      who(p.account, account)
                    )}
                    {isVillager(p.account) && <span className="ml-1 rounded bg-hide px-1 text-[10px] text-dim">NPC</span>}
                  </td>
                  <td>{p.hits}</td>
                  <td className="text-right font-mono">{slay(p.early)}</td>
                  <td className="text-right font-mono">{slay(p.late)}</td>
                  <td className="text-right font-mono">
                    {round.settlement?.outcome === "loss" ? "—" : slay(est.get(p.account) ?? 0n)}
                    {round.settlement?.outcome === "win" && (p.claimed ? " ✓" : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!round.settlement && rows.length > 0 && (
        <p className="mt-2 text-xs text-dim">Shares assume no Feint; a Feint halves late damage for the kill and the loot.</p>
      )}
    </section>
  );
}

const KIND_ICON: Record<string, string> = {
  hit: "⚔️",
  pouch: "👛",
  claim: "💰",
  craft: "🔨",
  list: "🏷️",
  buy: "🛒",
  smith_sell: "⚒️",
  smith_buy: "🪵",
  open: "🔔",
  smith_forge: "🔥",
  settle: "⚖️",
};

function line(f: FeedItemJson, me: string | null): string {
  const n = who(f.account, me);
  const detail = f.detail ?? "";
  switch (f.kind) {
    case "hit": {
      const weapon = detail.split(",").find((x) => x && x !== "late");
      return `${n} hit for ${slay(f.value)} damage (burned ${slay(f.amount)} $SLAY${weapon ? `, ${weapon}` : ""}${detail.includes("late") ? ", late" : ""})`;
    }
    case "pouch":
      return `${n} arrived in town with a starter pouch`;
    case "claim":
      return `${n} claimed ${slay(f.amount)} $SLAY of loot from raid #${f.round}`;
    case "craft":
      return `${n} forged ${f.value} ${detail} charges (fee ${slay(f.amount)} $SLAY burned)`;
    case "list":
      return `${n} listed ${f.value} ${itemIcon(detail)} ${detail} at ${slay(f.amount, 2)} $SLAY each`;
    case "buy":
      return `${n} bought ${f.value} ${itemIcon(detail)} ${detail} for ${slay(f.amount, 2)} $SLAY`;
    case "smith_sell":
      return `${n} bought ${f.value} club charges from the smith for ${slay(f.amount, 2)} $SLAY`;
    case "smith_buy":
      return `${n} sold ${f.value} ${detail} to the smith for ${slay(f.amount, 2)} $SLAY`;
    case "smith_forge":
      return `the smith forged ${f.value} club charges`;
    case "open":
      return `${n} rang the bell: raid #${f.round} begins, the Bear has ${slay(f.amount)} health and feels like ${TACTIC_ICON[Number(f.value)]} ${tacticName(Number(f.value))}`;
    case "settle":
      return detail === "win"
        ? `raid #${f.round} settled by ${n}: the town won ${slay(f.amount)} $SLAY; the Bear drew ${tacticName(Number(f.value))}`
        : `raid #${f.round} settled by ${n}: the Bear drew ${tacticName(Number(f.value))} and stole ${slay(f.amount)} $SLAY`;
    default:
      return `${n}: ${f.kind}`;
  }
}

export function Feed({ feed, now, account }: { feed: FeedItemJson[]; now: number; account: string | null }) {
  return (
    <section className="card">
      <h3 className="mb-2 text-lg font-bold">Town feed</h3>
      <p className="mb-2 text-xs text-dim">Read straight from the contract (get_feed); no indexer.</p>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
        {feed.map((f) => (
          <li key={f.seq} className="flex gap-2">
            <span aria-hidden>{KIND_ICON[f.kind] ?? "•"}</span>
            <span className="flex-1">{line(f, account)}</span>
            <span className="whitespace-nowrap text-xs text-dim">{ago(now - Number(BigInt(f.at) / 1_000_000n))}</span>
          </li>
        ))}
        {feed.length === 0 && <li className="text-dim">Quiet in town.</li>}
      </ul>
    </section>
  );
}
