"use client";
// The title screen, over the live town until you join: what the game is in one line, what is
// happening right now, and one button to start. Live, that button makes a free testnet guest;
// offline, it starts the simulation.
import { unlockAudio } from "@/lib/sfx";

export function TitleScreen({
  mode,
  liveAvailable,
  pending,
  status,
  onPlay,
  onSwitch,
}: {
  mode: "live" | "sim";
  liveAvailable: boolean;
  pending: string | null;
  /** one line about the town right now, e.g. "Raid #12 is on: 2:41 left" */
  status: string;
  onPlay: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="title-screen absolute inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(0.25rem,2cqh,1rem)] px-4 text-center">
      <div className="title-in">
        <div className="title-more text-[clamp(0.6rem,2.2cqh,0.9rem)] font-bold uppercase tracking-[0.35em] text-[#fde68a]/90">A memecoin town game on NEAR</div>
        <h1 className="title-logo font-[family-name:var(--font-display)] text-[clamp(2rem,13cqh,6rem)] font-black leading-none">Slay the Bear</h1>
        <svg viewBox="0 0 120 20" className="title-more mx-auto mt-1 h-[clamp(0.6rem,3cqh,1.2rem)]" aria-hidden>
          <path d="M8 16 Q30 2 54 10 M30 18 Q52 4 78 12 M54 18 Q78 4 112 8" stroke="#dc2626" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <p className="title-in max-w-xl text-[clamp(0.75rem,3.2cqh,1.15rem)] font-semibold text-parch drop-shadow [animation-delay:120ms]">
        Burn $SLAY to hit the Bear before the timer runs out. Beat it, and the town splits its hoard.
      </p>
      <p className="title-in rounded-full bg-black/50 px-3 py-1 text-[clamp(0.65rem,2.6cqh,0.9rem)] text-[#fde68a] [animation-delay:200ms]">{status}</p>
      <div className="title-in flex flex-wrap items-center justify-center gap-2 [animation-delay:280ms]">
        <button
          type="button"
          className="play-cta btn btn-primary px-6 py-3 text-[clamp(0.9rem,3.6cqh,1.25rem)] font-black"
          disabled={!!pending}
          onClick={() => {
            void unlockAudio();
            onPlay();
          }}
        >
          {pending ? (
            <span className="flex items-center gap-2">
              <span className="spinner" aria-hidden /> {pending}…
            </span>
          ) : mode === "live" ? (
            "⚔️ Play as a guest (free)"
          ) : (
            "⚔️ Start the simulation"
          )}
        </button>
        {(mode === "live" || liveAvailable) && (
          <button type="button" className="title-more btn bg-black/50 px-4 py-3 text-[clamp(0.75rem,3cqh,1rem)]" onClick={onSwitch} disabled={!!pending}>
            {mode === "live" ? "🧪 Practice offline" : "🌐 Play live on NEAR testnet"}
          </button>
        )}
      </div>
      <p className="title-in title-more max-w-md text-[clamp(0.6rem,2.3cqh,0.8rem)] text-parch/80 [animation-delay:360ms]">
        {mode === "live"
          ? "No wallet and no gas: a key made in your browser that can only play this game. Every move is a NEAR testnet transaction."
          : "The same rules in your browser with a local beacon. Nothing touches the network."}
      </p>
    </div>
  );
}
