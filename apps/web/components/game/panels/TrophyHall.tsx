"use client";
// The Trophy Hall: every one-of-one Bear trophy so far, its look, and where it is now. A
// trophy's look comes from the drand randomness of the raid that dropped it, so anyone can
// re-derive it; the detail view shows how.
import { useMemo, useState } from "react";
import { Coin, TrophyArt } from "../ItemArt";
import { PanelTabs } from "../Panel";
import { SectionTitle } from "./ItemCard";
import { GRADE_COLOR, TROPHY_KINDS, ELEMENTS, trophyTraits } from "@/lib/trophy";
import type { TrophyInfo } from "@/lib/useTrophies";
import { ago, slay, who } from "@/lib/format";
import type { Action, ActionResult } from "@/lib/types";

type Act = (a: Action, label: string, success?: string) => Promise<ActionResult>;
type Filter = "all" | "mine" | "sale";

export function TrophyHall({
  trophies,
  account,
  balance,
  pending,
  act,
  now,
  verifyHref,
}: {
  trophies: TrophyInfo[];
  account: string | null;
  balance: bigint | null;
  pending: string | null;
  act: Act;
  now: number;
  verifyHref: (round: number) => string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = trophies.filter((t) => (filter === "mine" ? t.where.kind === "held" && t.where.owner === account : filter === "sale" ? t.where.kind === "listed" : true));
  const detail = trophies.find((t) => t.id === open) ?? null;
  // example looks for an empty hall: clearly labelled, they are not tokens
  const examples = useMemo(() => [11, 23, 37, 41, 58, 64].map((i) => trophyTraits(`trophy-${i}-${i % 3}`, null)), []);

  if (detail) return <TrophyDetail t={detail} account={account} back={() => setOpen(null)} verifyHref={verifyHref(detail.round)} now={now} />;

  return (
    <div>
      <p className="text-sm text-dim">
        Each Bear trophy is a one-of-one NEP-245 token, dropped by a won raid (5% of drops). Its look is drawn from that raid&apos;s drand beacon, so nobody could
        choose it, and you can re-derive it. Forge one into the ×2 Bear-slayer, or trade it.
      </p>
      <div className="mt-3">
        <PanelTabs<Filter>
          tabs={[
            { id: "all", label: `All (${trophies.length})` },
            { id: "mine", label: "Yours" },
            { id: "sale", label: "For sale" },
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>
      {trophies.length === 0 ? (
        <>
          <p className="rounded-xl border border-edge bg-black/30 p-3 text-sm">
            No trophy has dropped yet. Win raids: every won raid draws 3 drops for its raiders, weighted by damage, and each drop is a trophy with a 5% chance.
          </p>
          <SectionTitle note="Examples, not real tokens">What they can look like</SectionTitle>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {examples.map((t) => (
              <div key={t.id} className="text-center text-[11px]">
                <TrophyArt traits={t} />
                <div className="mt-0.5 font-bold" style={{ color: GRADE_COLOR[t.grade] }}>
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : shown.length === 0 ? (
        <p className="text-sm text-dim">{filter === "mine" ? "You hold no trophy yet." : "No trophy is for sale."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((t) => (
            <div key={t.id} className="trophy-card flex flex-col rounded-xl border border-edge bg-black/35 p-2 text-center">
              <button type="button" className="block" onClick={() => setOpen(t.id)} aria-label={`${t.traits.name}: details`} data-trophy={t.id}>
                <TrophyArt traits={t.traits} />
              </button>
              <div className="mt-1 truncate text-sm font-bold" style={{ color: GRADE_COLOR[t.traits.grade] }}>
                {t.traits.name}
              </div>
              <div className="text-[11px] text-dim">
                Raid #{t.round} · drop {t.draw} · {ago(now - t.at)}
              </div>
              <div className="mt-1 text-[11px]">
                <Where t={t} account={account} />
              </div>
              {t.where.kind === "listed" && t.where.seller !== account && (
                <button
                  type="button"
                  className="btn btn-primary mx-auto mt-1 flex items-center gap-1 px-2 py-1 text-xs"
                  disabled={!account || (balance ?? 0n) < BigInt(t.where.price) || !!pending}
                  onClick={() => t.where.kind === "listed" && void act({ method: "buy", listingId: t.where.listingId, qty: 1n }, "Buy", `Bought ${t.traits.name}`)}
                >
                  Buy <Coin className="h-3.5 w-3.5" /> {slay(t.where.price, 2)}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Where({ t, account }: { t: TrophyInfo; account: string | null }) {
  const w = t.where;
  if (w.kind === "held") return <span className={w.owner === account ? "font-bold text-moss" : ""}>Held by {who(w.owner, account)}</span>;
  if (w.kind === "listed") return <span className="text-ember">For sale by {who(w.seller, account)}</span>;
  if (w.kind === "forged") return <span className="text-dim">Forged into a Bear-slayer</span>;
  if (w.kind === "traded") return <span className="text-dim">Traded on (first won by {who(t.droppedTo, account)})</span>;
  return <span className="text-dim">Won by {who(t.droppedTo, account)}</span>;
}

function TrophyDetail({ t, account, back, verifyHref, now }: { t: TrophyInfo; account: string | null; back: () => void; verifyHref: string | null; now: number }) {
  const tr = t.traits;
  return (
    <div>
      <button type="button" className="mb-2 text-sm text-dim hover:text-parch" onClick={back}>
        ← All trophies
      </button>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="trophy-spin mx-auto w-full max-w-[15rem]">
          <TrophyArt traits={tr} />
        </div>
        <div className="space-y-2 text-sm">
          <h3 className="text-2xl font-bold" style={{ color: GRADE_COLOR[tr.grade] }}>
            {tr.name}
          </h3>
          <div className="text-dim">
            <code>{t.id}</code> · raid #{t.round}, drop {t.draw} · {ago(now - t.at)}
          </div>
          <div>
            <Where t={t} account={account} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-edge bg-black/30 p-3">
            <dt className="text-dim">Kind</dt>
            <dd>
              {tr.kind} <span className="text-dim">(one of {TROPHY_KINDS.length})</span>
            </dd>
            <dt className="text-dim">Element</dt>
            <dd>
              {tr.element.name} <span className="text-dim">(one of {ELEMENTS.length})</span>
            </dd>
            <dt className="text-dim">Grade</dt>
            <dd>
              {tr.grade} <span className="text-dim">(bronze 50%, silver 30%, gold 15%, mythic 5%)</span>
            </dd>
            <dt className="text-dim">Marks</dt>
            <dd>
              {tr.marks} {tr.pattern}
            </dd>
          </dl>
          <p className="text-xs text-dim">
            {tr.source === "drand" ? (
              <>
                The look is read from <code>sha256(randomness ‖ &quot;slay-trophy&quot; ‖ raid ‖ drop)</code> = <code className="break-all">{tr.seed.slice(0, 24)}…</code>, where
                randomness is raid #{t.round}&apos;s on-chain settlement randomness (sha256 of drand&apos;s signature). It is cosmetic: on-chain, all trophies are equal.
              </>
            ) : (
              "This raid's randomness is still loading."
            )}
          </p>
          {verifyHref && (
            <a className="link text-xs" href={verifyHref}>
              Verify raid #{t.round} and its drops
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
