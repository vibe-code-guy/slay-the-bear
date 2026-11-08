"use client";
// The first raid, explained where it happens: a coach bubble points at the control to use next
// and moves on when you have used it (a real hit, a real spin, a real claim). It runs once per
// browser; "Skip" ends it.
import { useEffect, useState } from "react";

type StepId = "strike" | "timer" | "menu" | "wheel" | "claim";

interface Step {
  id: StepId;
  anchor: string;
  title: string;
  text: string;
  /** shows a "Got it" button; other steps move on when the player does the thing */
  manual?: boolean;
}

const STEPS: Step[] = [
  {
    id: "strike",
    anchor: "[data-tour=strike]",
    title: "Strike the Bear",
    text: "Hold the red button and let go. The longer you hold, the more $SLAY you burn and the harder you hit. Space works too.",
  },
  {
    id: "timer",
    anchor: "[data-tour=health]",
    title: "Beat its health in time",
    text: "Together the town must deal the Bear's health (the white line) before the timer ends. Early hits deal up to ×1.5 damage.",
    manual: true,
  },
  {
    id: "menu",
    anchor: "[data-tour=menu]",
    title: "Between raids",
    text: "Forge weapons from your loot, trade trophies at the market and climb the Tavern's leaderboard.",
    manual: true,
  },
  {
    id: "wheel",
    anchor: "[data-tour=spin]",
    title: "Time's up: spin the wheel",
    text: "drand's public randomness picks the Bear's tactic. The contract checks drand's signature itself, so nobody could know it early.",
  },
  {
    id: "claim",
    anchor: "[data-tour=claim]",
    title: "Claim your loot",
    text: "The town won! Your share of the loot is waiting. You can claim it any time.",
  },
];

const KEY = "slay-tutorial-v1";

export function Tutorial({
  joined,
  hits,
  phase,
  claimable,
  outcome,
  blocked,
}: {
  joined: boolean;
  /** your hits in the current (or latest) raid */
  hits: number;
  phase: "idle" | "open" | "ended" | "settled";
  claimable: boolean;
  /** outcome of the latest raid, once settled */
  outcome: "win" | "loss" | null;
  /** a panel or the title screen is in front */
  blocked: boolean;
}) {
  const [step, setStep] = useState<number | "done" | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [sawClaim, setSawClaim] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    setStep(saved === "done" ? "done" : Number(saved ?? 0) || 0);
  }, []);

  const save = (s: number | "done") => {
    setStep(s);
    localStorage.setItem(KEY, String(s));
  };

  // the player did the thing (or the raid moved on): next step
  useEffect(() => {
    if (typeof step !== "number") return;
    const id = STEPS[step]?.id;
    if (id === "strike" && hits > 0) save(1);
    else if ((id === "timer" || id === "menu") && phase === "ended") save(3);
    else if (id === "wheel" && phase === "settled") save(4);
    else if (id === "claim") {
      if (claimable) setSawClaim(true);
      else if (sawClaim || outcome === "loss") save("done");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hits, phase, claimable, outcome, sawClaim]);

  const cur = typeof step === "number" ? STEPS[step] : undefined;
  // the wheel step waits for the deadline, the claim step for loot to claim
  const showing: Step | undefined = !cur ? undefined : cur.id === "wheel" && phase !== "ended" ? undefined : cur.id === "claim" && !claimable ? undefined : cur;

  useEffect(() => {
    if (!joined || !showing || blocked) {
      setRect(null);
      return;
    }
    const find = () => {
      const el = document.querySelector(showing.anchor);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    const t = setInterval(find, 400);
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", find);
      window.removeEventListener("scroll", find, true);
    };
  }, [joined, showing, blocked]);

  if (!joined || !showing || !rect || blocked || step === "done") return null;

  // below the anchor if there is room, else above; inside the window
  const W = Math.min(300, window.innerWidth - 16);
  const below = rect.bottom + 150 < window.innerHeight;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, rect.left + rect.width / 2 - W / 2));
  const top = below ? rect.bottom + 12 : Math.max(8, rect.top - 12);
  const arrowX = Math.max(16, Math.min(W - 16, rect.left + rect.width / 2 - left));
  const index = STEPS.indexOf(showing);

  return (
    <>
      <div
        className="tour-ring pointer-events-none fixed z-[55] rounded-2xl"
        style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label={`Tutorial: ${showing.title}`}
        className="tour-pop fixed z-[56] rounded-2xl border-2 border-ember bg-[#2a1d12] p-3 text-sm text-parch shadow-2xl"
        style={{ left, top, width: W, transform: below ? undefined : "translateY(-100%)" }}
      >
        <span
          className={`absolute h-3 w-3 rotate-45 border-ember bg-[#2a1d12] ${below ? "-top-[7px] border-l-2 border-t-2" : "-bottom-[7px] border-b-2 border-r-2"}`}
          style={{ left: arrowX - 6 }}
          aria-hidden
        />
        <div className="mb-1 flex items-center justify-between gap-2">
          <b className="text-[#fde68a]">{showing.title}</b>
          <span className="text-[11px] text-dim">
            {index + 1} / {STEPS.length}
          </span>
        </div>
        <p className="leading-snug">{showing.text}</p>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" className="text-xs text-dim underline-offset-2 hover:underline" onClick={() => save("done")}>
            Skip tutorial
          </button>
          {showing.manual && (
            <button type="button" className="btn btn-primary px-3 py-1 text-xs" onClick={() => save(index + 1)}>
              Got it
            </button>
          )}
        </div>
      </div>
    </>
  );
}
