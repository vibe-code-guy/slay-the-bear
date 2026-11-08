// The town square behind the raid. The sky darkens as the deadline nears; a won raid brings a
// dawn glow, a lost one a red night.
export function Backdrop({ dusk, mood }: { dusk: number; mood: "calm" | "raid" | "late" | "win" | "loss" }) {
  const sky =
    mood === "win"
      ? ["#3b2a52", "#a8577a", "#f6b85c"]
      : mood === "loss"
        ? ["#140606", "#3d0b0b", "#7f1d1d"]
        : mood === "calm"
          ? ["#101626", "#25304d", "#5b4b6b"]
          : [mix("#2a1d4a", "#0d0a1a", dusk), mix("#6b3350", "#2a1230", dusk), mix("#d9822b", "#7a2e1c", dusk)];
  return (
    <svg viewBox="0 0 1200 560" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="0.6" stopColor={sky[1]} />
          <stop offset="1" stopColor={sky[2]} />
        </linearGradient>
        <radialGradient id="bd-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#fef3c7" />
          <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bd-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a1c" />
          <stop offset="1" stopColor="#1c140d" />
        </linearGradient>
      </defs>
      <rect width="1200" height="560" fill="url(#bd-sky)" style={{ transition: "all 1s" }} />
      <g fill="#fdf6e3">
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="bd-twinkle" style={{ animationDelay: `${(i % 7) * 0.6}s`, opacity: mood === "win" ? 0.2 : 0.8 }} />
        ))}
      </g>
      <circle cx="120" cy="160" r="50" fill="url(#bd-moon)" opacity={mood === "win" ? 0.25 : 0.9} />
      <circle cx="136" cy="150" r="30" fill={sky[0]} opacity={mood === "win" ? 0.25 : 0.85} />

      {/* far hills */}
      <path d="M0 330 Q150 260 300 310 T600 300 T900 290 T1200 300 L1200 420 L0 420 Z" fill="#1d1428" opacity="0.8" />
      <path d="M0 360 Q200 310 380 350 T760 340 T1200 350 L1200 440 L0 440 Z" fill="#160f1c" />

      {/* town houses */}
      <g fill="#120c09">
        {HOUSES.map(([x, w, h], i) => (
          <g key={i}>
            <rect x={x} y={440 - h} width={w} height={h} />
            <path d={`M${x - 8} ${440 - h} L${x + w / 2} ${440 - h - w * 0.55} L${x + w + 8} ${440 - h} Z`} />
          </g>
        ))}
      </g>
      <g fill="#fbbf24">
        {HOUSES.map(([x, w, h], i) =>
          i % 2 === 0 ? (
            <rect key={i} x={x + w / 2 - 6} y={440 - h + 18} width="12" height="14" className="bd-window" style={{ animationDelay: `${i * 0.7}s` }} />
          ) : null,
        )}
      </g>
      {/* torches */}
      {[150, 1050].map((x) => (
        <g key={x}>
          <rect x={x - 4} y="400" width="8" height="80" fill="#3b2617" />
          <ellipse cx={x} cy="392" rx="12" ry="18" fill="#f59e0b" className="bd-flame" />
          <ellipse cx={x} cy="396" rx="6" ry="10" fill="#fde68a" className="bd-flame" />
        </g>
      ))}

      {/* plaza */}
      <path d="M0 450 Q600 420 1200 450 L1200 560 L0 560 Z" fill="url(#bd-ground)" />
      <g stroke="#4a3626" strokeWidth="2" fill="none" opacity="0.6">
        <path d="M0 480 Q600 455 1200 480" />
        <path d="M0 515 Q600 492 1200 515" />
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d={`M${40 + i * 75} ${468 - Math.abs(i - 7.5) * 1.5} l-10 30`} />
        ))}
      </g>
    </svg>
  );
}

const STARS: [number, number, number][] = [
  [60, 40, 1.6], [180, 90, 1.2], [300, 30, 1.8], [420, 70, 1.1], [520, 22, 1.4], [640, 60, 1.7],
  [760, 28, 1.2], [880, 80, 1.5], [940, 20, 1.1], [1130, 50, 1.6], [240, 150, 1], [700, 140, 1.2],
];
const HOUSES: [number, number, number][] = [
  [20, 70, 70], [110, 60, 95], [190, 80, 60], [290, 55, 85], [860, 70, 90], [950, 60, 65], [1030, 85, 100], [1135, 60, 70],
];

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * Math.min(1, Math.max(0, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
