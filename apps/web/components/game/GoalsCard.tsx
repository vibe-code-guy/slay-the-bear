// Today's goals and your streak, in the controls column. Progress comes from the contract's views
// (see lib/goals.ts).
import type { Goal } from "@/lib/goals";
import { clock } from "@/lib/format";

export function GoalsCard({ goals, streak, msLeft, allDone }: { goals: Goal[]; streak: number; msLeft: number; allDone: boolean }) {
  if (goals.length === 0) return null;
  const done = goals.filter((g) => g.done).length;
  return (
    <div className={`goals rounded-xl border p-2 ${allDone ? "goals-done border-moss/70 bg-moss/10" : "border-edge bg-black/25"}`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <b className="text-[#fde68a]">⭐ Today&apos;s goals {done}/{goals.length}</b>
        <span className={`font-bold ${streak > 0 ? "text-orange-400" : "text-dim"}`} title="Days in a row with a raid">
          🔥 {streak} {streak === 1 ? "day" : "days"}
        </span>
      </div>
      <ul className="space-y-1">
        {goals.map((g) => (
          <li key={g.id} className="goal-row text-[11px] leading-tight">
            <div className="flex items-center gap-1.5">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${g.done ? "border-moss bg-moss text-white" : "border-edge"}`}>{g.done ? "✓" : ""}</span>
              <span className={`flex-1 truncate ${g.done ? "text-moss line-through decoration-moss/50" : ""}`}>
                {g.icon} {g.text}
              </span>
              <span className="font-mono text-dim">
                {g.progress.toLocaleString("en-US")}/{g.target.toLocaleString("en-US")}
              </span>
            </div>
            {!g.done && g.target > 1 && (
              <div className="ml-5 mt-0.5 h-1 overflow-hidden rounded bg-night">
                <div className="h-full bg-ember transition-[width] duration-700" style={{ width: `${(g.progress / g.target) * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-1 text-[10px] text-dim">{allDone ? "All done! Your hero wears the goal sash today." : `New goals in ${clock(msLeft)}`}</div>
    </div>
  );
}
