"use client";
// The Wheel of Fate: the Bear's tactic odds as a wheel. Segments are the real mood weights in
// the contract's order [None, Armor, Rage, Feint]; when a raid settles, the wheel stops exactly
// at the drand roll (roll / 10000 of a turn), so the animation shows the on-chain draw.
import { useEffect, useRef } from "react";
import { play } from "@/lib/sfx";

export type WheelStage = "idle" | "waiting" | "spinning" | "landing" | "landed";

const COLORS = ["#57534e", "#0369a1", "#b91c1c", "#6d28d9"];
const ICONS = ["😐", "🛡️", "😡", "🌀"];
const NAMES = ["None", "Armor", "Rage", "Feint"];
/** Labels sit 52 units out from the hub (the wheel is 200 units across). */
const LABEL_Y = 48;

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

export function Wheel({
  weights,
  favorite,
  stage,
  roll,
  onLanded,
  label,
}: {
  weights: number[];
  /** Index of the Bear's mood, shown under the pointer while the wheel rests. */
  favorite?: number;
  stage: WheelStage;
  roll: number | null;
  onLanded?: () => void;
  label?: string;
}) {
  const g = useRef<SVGGElement>(null);
  const labels = useRef<(SVGGElement | null)[]>([]);
  const rot = useRef<number | null>(null);
  const raf = useRef(0);
  const landedCb = useRef(onLanded);
  landedCb.current = onLanded;

  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const segs = weights.map((w, i) => {
    const a0 = (acc / total) * 360;
    acc += w;
    const a1 = (acc / total) * 360;
    return { i, a0, a1, mid: (a0 + a1) / 2, pct: Math.round((w / total) * 100) };
  });
  const segsRef = useRef(segs);
  segsRef.current = segs;

  const favMid = segs[favorite ?? 0]?.mid ?? 0;
  if (rot.current === null) rot.current = stage === "landed" && roll !== null ? -((roll / 10_000) * 360) : -favMid;

  // Labels ride with their segment but turn back by the wheel's angle, so they always read upright.
  const labelTransform = (deg: number, mid: number) => `rotate(${-(deg + mid)} 100 ${LABEL_Y})`;
  const set = (deg: number) => {
    rot.current = deg;
    g.current?.setAttribute("transform", `rotate(${deg} 100 100)`);
    for (const s of segsRef.current) labels.current[s.i]?.setAttribute("transform", labelTransform(deg, s.mid));
  };

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const target = roll === null ? null : -((roll / 10_000) * 360);
    if (stage === "landed" && target !== null) {
      set(target);
      return;
    }
    if (stage === "idle") {
      // at rest, the Bear's favourite sits under the pointer, its label upright
      set(-favMid);
      return;
    }
    if (stage === "spinning" || stage === "waiting") {
      let last = performance.now();
      let tickAt = rot.current ?? 0;
      const speed = stage === "spinning" ? 760 : 18;
      const loop = (t: number) => {
        const dt = (t - last) / 1000;
        last = t;
        const deg = (rot.current ?? 0) + speed * dt;
        set(deg);
        if (stage === "spinning" && deg - tickAt >= 30) {
          tickAt = deg;
          play("tick");
        }
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf.current);
    }
    if (stage === "landing" && target !== null) {
      const from = rot.current ?? 0;
      // land at least four turns ahead, on the angle that puts the roll under the pointer
      let to = target;
      while (to < from + 4 * 360) to += 360;
      const start = performance.now();
      const dur = 4200;
      let lastTick = from;
      const loop = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 4);
        const deg = from + (to - from) * e;
        set(deg);
        if (deg - lastTick >= 30) {
          lastTick = deg;
          play("tick", 0.9 + 0.3 * (1 - k));
        }
        if (k < 1) raf.current = requestAnimationFrame(loop);
        else landedCb.current?.();
      };
      raf.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf.current);
    }
    return undefined;
  }, [stage, roll, favMid]);

  const hit = roll === null ? null : segs.find((s) => (roll / 10_000) * 360 >= s.a0 && (roll / 10_000) * 360 < s.a1) ?? segs[segs.length - 1]!;

  return (
    <div className="relative h-full w-full select-none">
      <svg viewBox="0 0 200 222" className="h-full w-full overflow-visible" role="img" aria-label="Wheel of Fate: the Bear's tactic odds">
        <defs>
          <radialGradient id="wheel-shine" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="#1b140e" stroke="#c08a3e" strokeWidth="5" />
        <g ref={g} transform={`rotate(${rot.current} 100 100)`}>
          {segs.map((s) => (
            <path key={s.i} d={arc(100, 100, 90, s.a0, s.a1)} fill={COLORS[s.i]} stroke="#1b140e" strokeWidth="2" />
          ))}
          {segs.map((s) =>
            s.a1 - s.a0 > 14 ? (
              <g key={s.i} transform={`rotate(${s.mid} 100 100)`}>
                <g
                  ref={(el) => {
                    labels.current[s.i] = el;
                  }}
                  transform={labelTransform(rot.current ?? 0, s.mid)}
                >
                  <text x="100" y={LABEL_Y - 1} textAnchor="middle" fontSize={s.a1 - s.a0 > 100 ? 20 : 15}>
                    {ICONS[s.i]}
                  </text>
                  <text x="100" y={LABEL_Y + 12} textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff" stroke="#1b140e" strokeWidth="2.5" paintOrder="stroke">
                    {s.pct}%
                  </text>
                </g>
              </g>
            ) : null,
          )}
          {Array.from({ length: 24 }, (_, i) => (
            <circle key={i} cx={100 + 94 * Math.sin((i * 15 * Math.PI) / 180)} cy={100 - 94 * Math.cos((i * 15 * Math.PI) / 180)} r="2.2" fill="#fde68a" />
          ))}
        </g>
        <circle cx="100" cy="100" r="90" fill="url(#wheel-shine)" pointerEvents="none" />
        <circle cx="100" cy="100" r="22" fill="#2a1f15" stroke="#c08a3e" strokeWidth="3" />
        <text x="100" y="107" textAnchor="middle" fontSize="20">
          {stage === "landed" && hit ? ICONS[hit.i] : "🎲"}
        </text>
        <path d="M88 -6 L112 -6 L100 16 Z" fill="#f59e0b" stroke="#1b140e" strokeWidth="2" />
        {label && (
          <text x="100" y="216" textAnchor="middle" fontSize="11" fill="#f3e7cf" fontWeight="700">
            {label}
          </text>
        )}
      </svg>
      {stage === "landed" && hit && (
        <span className="sr-only">
          The wheel stopped on {NAMES[hit.i]} at roll {roll}.
        </span>
      )}
    </div>
  );
}

export const TACTIC_COLORS = COLORS;
