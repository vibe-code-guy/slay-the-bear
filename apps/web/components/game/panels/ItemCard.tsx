// An item as a card: art, name, count, a line on what it does, and an optional action.
import { ItemArt } from "../ItemArt";
import { GRADE_COLOR, type TrophyTraits } from "@/lib/trophy";

export function ItemCard({
  id,
  qty,
  title,
  blurb,
  randomness,
  traits,
  selected,
  locked,
  children,
  onClick,
  compact,
}: {
  id: string;
  qty?: string | number | bigint | null;
  title: string;
  blurb?: string;
  randomness?: string | null;
  traits?: TrophyTraits;
  selected?: boolean;
  locked?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  compact?: boolean;
}) {
  const grade = traits?.grade;
  const body = (
    <>
      <div className={`relative mx-auto ${compact ? "h-14 w-14" : "h-20 w-20"} ${locked ? "opacity-40 grayscale" : ""}`}>
        <ItemArt id={id} randomness={randomness} />
        {qty !== undefined && qty !== null && String(qty) !== "0" && (
          <span className="absolute -bottom-1 -right-2 rounded-full border border-night bg-ember px-1.5 text-[11px] font-black text-night">×{String(qty)}</span>
        )}
        {locked && <span className="absolute inset-0 flex items-center justify-center text-2xl">🔒</span>}
      </div>
      <div className="mt-1.5 text-center">
        <div className="truncate text-sm font-bold" style={grade ? { color: GRADE_COLOR[grade] } : undefined}>
          {title}
        </div>
        {blurb && <div className="mt-0.5 text-[11px] leading-snug text-dim">{blurb}</div>}
      </div>
      {children && <div className="mt-2 flex flex-wrap justify-center gap-1">{children}</div>}
    </>
  );
  const cls = `item-card flex flex-col rounded-xl border bg-black/30 p-2.5 text-left ${selected ? "border-ember shadow-[0_0_0_2px_rgba(245,158,11,0.35)]" : "border-edge"}`;
  return onClick ? (
    <button type="button" className={`${cls} hover:border-ember/70`} onClick={onClick} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SectionTitle({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-baseline justify-between gap-2 first:mt-0">
      <h3 className="text-base font-bold text-[#fde68a]">{children}</h3>
      {note && <span className="text-xs text-dim">{note}</span>}
    </div>
  );
}
