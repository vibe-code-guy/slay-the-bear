"use client";
// The loot chest after a won raid: the drops the beacon gave you and your share of the loot,
// exactly as the settlement reports them. A Bear trophy gets its own moment. When the chest
// closes, the items fly to your backpack. Click anywhere to skip.
import { useCallback, useEffect, useRef, useState } from "react";
import { isTrophy } from "@slay/rules";
import { Coin, ItemArt } from "./ItemArt";
import { GRADE_COLOR, trophyTraits } from "@/lib/trophy";
import { itemTitle } from "@/lib/items";
import { centerOf, flyTo } from "@/lib/fly";
import { slay } from "@/lib/format";
import { play } from "@/lib/sfx";

export interface LootItem {
  token_id: string;
  qty: bigint;
}

export function LootReveal({
  roundId,
  items,
  share,
  randomness,
  onClose,
}: {
  roundId: number;
  /** your drops from this raid, one entry per item */
  items: LootItem[];
  /** your share of the loot, waiting to be claimed; null if there is none */
  share: bigint | null;
  /** the raid's settlement randomness, for the trophies' looks */
  randomness: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const trophies = items.filter((i) => isTrophy(i.token_id));

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    // the items fly to the backpack in the HUD
    box.current?.querySelectorAll("[data-loot-art]").forEach((el) => {
      void flyTo("backpack", centerOf(el), { node: el.firstElementChild ?? undefined, size: 40 });
    });
    setLeaving(true);
    setTimeout(() => close.current(), 420);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => {
        setOpen(true);
        play("open", 0.6);
      }, 420),
      ...items.map((it, i) => setTimeout(() => play(isTrophy(it.token_id) ? "sparkle" : "coin", 1 + i * 0.06), 760 + i * 240)),
      setTimeout(leave, 2900 + items.length * 260 + trophies.length * 1600),
    ];
    return () => timers.forEach(clearTimeout);
    // once per chest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={box}
      className={`loot-veil absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center gap-[1.5cqh] px-2 ${leaving ? "loot-leave" : ""}`}
      onClick={leave}
      role="dialog"
      aria-label={`Your loot from raid ${roundId}`}
    >
      <div className="font-[family-name:var(--font-display)] text-[clamp(0.9rem,6cqh,2rem)] font-black text-[#fde68a] drop-shadow-[0_3px_0_#1b120a]">
        {trophies.length ? "A Bear trophy!" : "Your loot"}
      </div>

      <div className={`relative h-[24cqh] w-[34cqh] ${open ? "chest-open" : "chest-shake"}`}>
        <span className="loot-rays absolute inset-[-40%]" aria-hidden />
        <Chest />
      </div>

      <div className="flex max-w-full flex-wrap items-end justify-center gap-[2cqh]">
        {items.map((it, i) => {
          const trophy = isTrophy(it.token_id);
          const tr = trophy ? trophyTraits(it.token_id, randomness) : null;
          return (
            <div key={`${it.token_id}-${i}`} className="loot-pop flex flex-col items-center text-center" style={{ animationDelay: `${700 + i * 240}ms` }}>
              <div
                data-loot-art
                className={`relative ${trophy ? "loot-trophy h-[24cqh] w-[24cqh]" : "h-[13cqh] w-[13cqh]"} rounded-xl`}
                style={tr ? { ["--glow" as string]: GRADE_COLOR[tr.grade] } : undefined}
              >
                <ItemArt id={it.token_id} randomness={randomness} />
              </div>
              <div className={`mt-0.5 font-bold leading-tight ${trophy ? "text-[clamp(0.7rem,3.6cqh,1.1rem)]" : "text-[clamp(0.6rem,2.8cqh,0.85rem)] text-parch"}`} style={tr ? { color: GRADE_COLOR[tr.grade] } : undefined}>
                {tr ? tr.name : `${it.qty.toString()} ${itemTitle(it.token_id)}`}
              </div>
              {tr && <div className="text-[clamp(0.55rem,2.4cqh,0.75rem)] font-bold uppercase tracking-widest text-parch/80">one of one · {tr.grade}</div>}
            </div>
          );
        })}
      </div>

      {share !== null && share > 0n && (
        <div className="loot-pop flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[clamp(0.65rem,3cqh,0.95rem)] font-bold text-parch" style={{ animationDelay: `${800 + items.length * 240}ms` }}>
          <Coin className="h-[1.3em] w-[1.3em]" /> +{slay(share, 2)} $SLAY is yours to claim
        </div>
      )}
      <div className="text-[clamp(0.55rem,2.2cqh,0.75rem)] text-parch/70">Raid #{roundId} · from the drand beacon · click to close</div>
    </div>
  );
}

/** A wooden chest whose lid swings open (see .chest-open in globals.css). */
function Chest() {
  return (
    <svg viewBox="0 0 140 100" className="relative h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="chest-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a16207" />
          <stop offset="1" stopColor="#713f12" />
        </linearGradient>
        <radialGradient id="chest-glow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#fde68a" stopOpacity="0.95" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="70" cy="96" rx="58" ry="5" fill="#000" opacity="0.4" />
      {/* the light inside, seen once the lid is up */}
      <ellipse className="chest-light" cx="70" cy="46" rx="52" ry="22" fill="url(#chest-glow)" />
      {/* body */}
      <rect x="14" y="44" width="112" height="50" rx="6" fill="url(#chest-wood)" stroke="#422006" strokeWidth="3" />
      <path d="M14 60 H126 M14 78 H126" stroke="#422006" strokeWidth="2" opacity="0.5" />
      <rect x="30" y="44" width="10" height="50" fill="#9ca3af" stroke="#374151" strokeWidth="2" />
      <rect x="100" y="44" width="10" height="50" fill="#9ca3af" stroke="#374151" strokeWidth="2" />
      <rect x="62" y="50" width="16" height="18" rx="3" fill="#facc15" stroke="#854d0e" strokeWidth="2" />
      <circle cx="70" cy="58" r="2.6" fill="#422006" />
      {/* lid, hinged at its back edge */}
      <g className="chest-lid">
        <path d="M14 46 Q14 14 70 12 Q126 14 126 46 Z" fill="url(#chest-wood)" stroke="#422006" strokeWidth="3" />
        <path d="M30 44 Q31 18 40 15 L40 44 Z M110 44 Q109 18 100 15 L100 44 Z" fill="#9ca3af" stroke="#374151" strokeWidth="2" />
        <path d="M22 34 Q70 24 118 34" stroke="#fde68a" strokeWidth="2" fill="none" opacity="0.35" />
      </g>
    </svg>
  );
}
