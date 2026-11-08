"use client";
// Hold to charge, release to strike. The charge sets how much $SLAY the strike burns, from the
// minimum hit up to the player's chosen cap. Works with mouse, touch and the space bar.
import { useCallback, useEffect, useRef, useState } from "react";
import { play, unlockAudio } from "@/lib/sfx";

const CHARGE_MS = 1300;

export function amountFor(charge: number, minWhole: number, topWhole: number): number {
  if (topWhole <= minWhole) return Math.max(minWhole, topWhole);
  return Math.round(minWhole + (topWhole - minWhole) * Math.pow(Math.min(1, Math.max(0, charge)), 1.6));
}

export function StrikeButton({
  disabled,
  minWhole,
  topWhole,
  label,
  onCharge,
  onStrike,
}: {
  disabled: boolean;
  minWhole: number;
  topWhole: number;
  label: string;
  onCharge: (amountWhole: number | null) => void;
  onStrike: (amountWhole: number) => void;
}) {
  const [charge, setCharge] = useState(0);
  const [charging, setCharging] = useState(false);
  const start = useRef(0);
  const raf = useRef(0);
  const lastBlip = useRef(0);
  const active = useRef(false);

  const loop = useCallback(
    (t: number) => {
      if (!active.current) return;
      const c = Math.min(1, (t - start.current) / CHARGE_MS);
      setCharge(c);
      onCharge(amountFor(c, minWhole, topWhole));
      if (t - lastBlip.current > 110) {
        lastBlip.current = t;
        play("charge", 1 + c * 1.6);
      }
      raf.current = requestAnimationFrame(loop);
    },
    [minWhole, topWhole, onCharge],
  );

  const begin = () => {
    if (disabled || active.current) return;
    void unlockAudio();
    active.current = true;
    start.current = performance.now();
    lastBlip.current = 0;
    setCharging(true);
    raf.current = requestAnimationFrame(loop);
  };

  const release = (strike: boolean) => {
    if (!active.current) return;
    active.current = false;
    cancelAnimationFrame(raf.current);
    const c = Math.min(1, (performance.now() - start.current) / CHARGE_MS);
    setCharging(false);
    setCharge(0);
    onCharge(null);
    if (strike) onStrike(amountFor(c, minWhole, topWhole));
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Space anywhere on the page charges too, unless focus is on something Space already drives
  // (a text field, another button, a link).
  const keys = useRef({ begin, release });
  keys.current = { begin, release };
  useEffect(() => {
    const busy = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, button, a, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || busy(e.target)) return;
      e.preventDefault();
      keys.current.begin();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== " " || busy(e.target)) return;
      e.preventDefault();
      keys.current.release(true);
    };
    const blur = () => keys.current.release(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${label}. Hold to charge, release to strike. Space bar works too.`}
      className={`strike-btn group relative h-32 w-32 shrink-0 touch-none select-none rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ember/70 disabled:opacity-40 ${charging ? "strike-charging" : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={() => release(true)}
      onPointerCancel={() => release(false)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          release(true);
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#3a2d21" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={charge > 0.85 ? "#fde68a" : "#f59e0b"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - charge)}
        />
      </svg>
      <span
        className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-800 text-white shadow-[inset_0_-6px_0_rgba(0,0,0,0.25),0_6px_18px_rgba(220,38,38,0.45)] transition-transform group-active:scale-95"
        style={{ transform: charging ? `scale(${1 + charge * 0.08})` : undefined }}
      >
        <span className="text-2xl leading-none">⚔️</span>
        <span className="mt-1 text-xs font-black tracking-wider">{charging ? `${Math.round(charge * 100)}%` : "HOLD"}</span>
      </span>
    </button>
  );
}
