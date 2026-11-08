"use client";
// The Tavern: who leads the town, the news, this raid's board, past raids (each one can be
// verified in the browser) and the town's ledger.
import { useState } from "react";
import type { ParticipantJson, RoundJson, StatusJson, FeedItemJson } from "@slay/rules";
import { PanelTabs } from "../Panel";
import { TopSlayers, type SlayerRow } from "../Progress";
import { Feed, RaidBoard } from "../../RaidBoard";
import { History } from "../../History";
import { TownStats } from "../../TownStats";
import type { Backend } from "@/lib/types";

type Tab = "slayers" | "raid" | "feed" | "past" | "ledger";

export function TavernPanel({
  backend,
  slayers,
  round,
  participants,
  pool,
  history,
  feed,
  status,
  now,
  account,
  initial = "slayers",
}: {
  backend: Backend;
  slayers: { rows: SlayerRow[]; raids: number };
  round: RoundJson | null;
  participants: ParticipantJson[];
  pool: bigint;
  history: RoundJson[];
  feed: FeedItemJson[];
  status: StatusJson;
  now: number;
  account: string | null;
  initial?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div>
      <PanelTabs<Tab>
        tabs={[
          { id: "slayers", label: "🏆 Top slayers" },
          { id: "raid", label: "⚔️ Raid board" },
          { id: "feed", label: "📜 Town feed" },
          { id: "past", label: "🎡 Past raids" },
          { id: "ledger", label: "🪙 Ledger" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="tavern-body">
        {tab === "slayers" && <TopSlayers rows={slayers.rows} raids={slayers.raids} account={account} />}
        {tab === "raid" &&
          (round ? (
            <RaidBoard round={round} participants={participants} pool={pool} account={account} mode={backend.mode} />
          ) : (
            <div className="card text-dim">No raid yet. Strike to start the first one.</div>
          ))}
        {tab === "feed" && <Feed feed={feed} now={now} account={account} />}
        {tab === "past" && <History history={history} backend={backend} account={account} />}
        {tab === "ledger" && <TownStats status={status} />}
      </div>
    </div>
  );
}
