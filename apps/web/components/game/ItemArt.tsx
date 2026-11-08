// Art for every item in the game, drawn in SVG to match the town: the NEP-245 materials and
// weapons, the $SLAY coin, and the generative Bear trophies (see lib/trophy.ts).
import { useId } from "react";
import { GRADE_COLOR, trophyTraits, type TrophyTraits } from "@/lib/trophy";

export function ItemArt({ id, className = "h-full w-full", randomness }: { id: string; className?: string; randomness?: string | null }) {
  const u = useId().replace(/:/g, "");
  if (id.startsWith("trophy-")) return <TrophyArt traits={trophyTraits(id, randomness)} className={className} />;
  const draw = ART[id] ?? ART.unknown!;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {draw(u)}
    </svg>
  );
}

export function Coin({ className = "h-5 w-5" }: { className?: string }) {
  const u = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <radialGradient id={`c${u}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fef08a" />
          <stop offset="0.55" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#92400e" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#c${u})`} stroke="#78350f" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fde68a" strokeWidth="1" opacity="0.7" />
      {/* a claw mark */}
      <path d="M11 22 Q13 15 12 9 M16 23 Q18 15 17 9 M21 22 Q23 15 22 9" stroke="#7c2d12" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Gradients for one icon; ids are unique per icon so hidden copies never break the others. */
const defs = (u: string) => (
  <defs>
    <linearGradient id={`${u}steel`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#f8fafc" />
      <stop offset="0.45" stopColor="#cbd5e1" />
      <stop offset="1" stopColor="#64748b" />
    </linearGradient>
    <linearGradient id={`${u}iron`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#e2e8f0" />
      <stop offset="1" stopColor="#475569" />
    </linearGradient>
    <linearGradient id={`${u}wood`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#a16207" />
      <stop offset="1" stopColor="#713f12" />
    </linearGradient>
    <radialGradient id={`${u}rune`} cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stopColor="#fecaca" />
      <stop offset="1" stopColor="#dc2626" />
    </radialGradient>
  </defs>
);

const ART: Record<string, (u: string) => React.ReactNode> = {
  wood: (u) => (
    <g>
      {defs(u)}
      <ellipse cx="32" cy="54" rx="22" ry="4" fill="#000" opacity="0.3" />
      {[
        [14, 40],
        [32, 44],
        [50, 40],
        [23, 26],
        [41, 26],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="10" fill={`url(#${u}wood)`} stroke="#422006" strokeWidth="1.5" />
          <circle cx={x} cy={y} r="6.5" fill="#d6a35c" />
          <circle cx={x} cy={y} r="3.5" fill="none" stroke="#a16207" strokeWidth="1" />
          <circle cx={x} cy={y} r="1" fill="#a16207" />
        </g>
      ))}
      <path d="M6 36 Q32 30 58 36" stroke="#b45309" strokeWidth="2.5" fill="none" />
    </g>
  ),
  iron: (u) => (
    <g>
      {defs(u)}
      <ellipse cx="32" cy="54" rx="22" ry="4" fill="#000" opacity="0.3" />
      <path d="M10 48 L16 36 L44 36 L50 48 Z" fill={`url(#${u}iron)`} stroke="#1e293b" strokeWidth="1.5" />
      <path d="M18 34 L24 22 L52 22 L58 34 Z" fill={`url(#${u}iron)`} stroke="#1e293b" strokeWidth="1.5" />
      <path d="M17 38 L42 38" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
      <path d="M25 24 L50 24" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
      <path d="M48 14 l2 4 l4 1 l-4 1 l-2 4 l-2 -4 l-4 -1 l4 -1 Z" fill="#fff" opacity="0.9" />
    </g>
  ),
  club: (u) => (
    <g>
      {defs(u)}
      <ellipse cx="32" cy="56" rx="18" ry="3.5" fill="#000" opacity="0.3" />
      <path d="M20 56 L36 16 Q42 6 50 12 Q56 18 48 26 L26 58 Z" fill={`url(#${u}wood)`} stroke="#422006" strokeWidth="1.8" />
      <circle cx="42" cy="18" r="2.2" fill="#422006" />
      <circle cx="38" cy="28" r="1.8" fill="#422006" />
      <path d="M20 56 L26 58 L29 52 L23 50 Z" fill="#78350f" />
      <path d="M38 14 Q44 10 48 14" stroke="#fde68a" strokeWidth="1.5" fill="none" opacity="0.6" />
    </g>
  ),
  sword: (u) => (
    <g>
      {defs(u)}
      <ellipse cx="32" cy="58" rx="12" ry="2.5" fill="#000" opacity="0.3" />
      <path d="M29 42 L29 10 L32 4 L35 10 L35 42 Z" fill={`url(#${u}steel)`} stroke="#334155" strokeWidth="1.3" />
      <path d="M32 8 L32 40" stroke="#94a3b8" strokeWidth="1.2" />
      <rect x="20" y="41" width="24" height="5" rx="2.5" fill="#ca8a04" stroke="#713f12" strokeWidth="1.2" />
      <rect x="29.5" y="46" width="5" height="9" rx="1.5" fill="#7c2d12" />
      <circle cx="32" cy="57.5" r="3" fill="#ca8a04" stroke="#713f12" strokeWidth="1" />
    </g>
  ),
  slayer: (u) => (
    <g>
      {defs(u)}
      <ellipse cx="32" cy="58" rx="14" ry="3" fill="#000" opacity="0.3" />
      <rect x="29.5" y="10" width="5" height="48" rx="2" fill="#451a03" />
      <path d="M34 12 Q58 14 56 34 Q48 28 34 30 Z" fill={`url(#${u}steel)`} stroke="#7f1d1d" strokeWidth="1.6" />
      <path d="M30 12 Q6 14 8 34 Q16 28 30 30 Z" fill={`url(#${u}steel)`} stroke="#7f1d1d" strokeWidth="1.6" />
      <path d="M44 18 l3 3 l-3 3 l-3 -3 Z M20 18 l3 3 l-3 3 l-3 -3 Z" fill={`url(#${u}rune)`} className="ia-glow" />
      <circle cx="32" cy="9" r="3.5" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1" className="ia-glow" />
    </g>
  ),
  paws: () => (
    <g>
      <ellipse cx="32" cy="56" rx="16" ry="3" fill="#000" opacity="0.3" />
      <path d="M16 30 Q16 18 26 18 L40 18 Q50 18 50 30 L50 40 Q50 52 36 52 L28 52 Q16 52 16 40 Z" fill="#f1c27d" stroke="#92400e" strokeWidth="1.8" />
      <path d="M24 18 L24 30 M32 18 L32 30 M40 18 L40 30" stroke="#92400e" strokeWidth="1.6" />
      <path d="M16 34 Q10 32 10 38 Q12 44 20 42" fill="#f1c27d" stroke="#92400e" strokeWidth="1.8" />
      <path d="M8 12 l4 4 M20 6 l1 5 M56 12 l-4 4" stroke="#fde68a" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  ),
  unknown: () => (
    <g>
      <rect x="14" y="16" width="36" height="34" rx="4" fill="#a16207" stroke="#422006" strokeWidth="2" />
      <path d="M14 28 H50 M32 16 V50" stroke="#422006" strokeWidth="2" />
    </g>
  ),
};

/** A generative trophy: one look per token, drawn from its traits. */
export function TrophyArt({ traits, className = "h-full w-full" }: { traits: TrophyTraits; className?: string }) {
  const u = useId().replace(/:/g, "");
  const { element: e, grade } = traits;
  const frame = GRADE_COLOR[grade];
  const bone = mixHex("#f5ecd7", e.light, 0.35);
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`${traits.name}, ${grade} grade`}>
      <defs>
        <radialGradient id={`bg${u}`} cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor={e.main} stopOpacity="0.85" />
          <stop offset="0.55" stopColor={e.dark} />
          <stop offset="1" stopColor="#050302" />
        </radialGradient>
        <linearGradient id={`fr${u}`} x1="0" y1="0" x2="1" y2="1">
          {grade === "Mythic" ? (
            <>
              <stop offset="0" stopColor="#f472b6" />
              <stop offset="0.5" stopColor="#facc15" />
              <stop offset="1" stopColor="#60a5fa" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={mixHex(frame, "#ffffff", 0.45)} />
              <stop offset="1" stopColor={mixHex(frame, "#000000", 0.35)} />
            </>
          )}
        </linearGradient>
        <linearGradient id={`bo${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mixHex(bone, "#ffffff", 0.4)} />
          <stop offset="1" stopColor={mixHex(bone, e.dark, 0.35)} />
        </linearGradient>
        <clipPath id={`cl${u}`}>
          <rect x="6" y="6" width="108" height="108" rx="14" />
        </clipPath>
      </defs>
      <rect x="3" y="3" width="114" height="114" rx="16" fill={`url(#fr${u})`} />
      <g clipPath={`url(#cl${u})`}>
        <rect x="6" y="6" width="108" height="108" fill={`url(#bg${u})`} />
        {/* rays */}
        <g opacity="0.18" stroke={e.light} strokeWidth="5">
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M60 58 L${60 + 90 * Math.cos((i / 10) * Math.PI * 2)} ${58 + 90 * Math.sin((i / 10) * Math.PI * 2)}`} />
          ))}
        </g>
        <ellipse cx="60" cy="98" rx="34" ry="7" fill="#000" opacity="0.45" />
        <g transform={`rotate(${traits.tilt.toFixed(1)} 60 60)`}>
          <Shape kind={traits.kind} fill={`url(#bo${u})`} stroke={e.dark} />
          <Pattern traits={traits} />
        </g>
        {grade === "Mythic" && (
          <g fill="#fff">
            {[
              [24, 26, 0],
              [94, 34, 0.7],
              [86, 90, 1.4],
              [30, 86, 2.1],
            ].map(([x, y, d], i) => (
              <path key={i} className="ia-twinkle" style={{ animationDelay: `${d}s` }} d={`M${x} ${y! - 5} l1.4 3.6 l3.6 1.4 l-3.6 1.4 l-1.4 3.6 l-1.4 -3.6 l-3.6 -1.4 l3.6 -1.4 Z`} />
            ))}
          </g>
        )}
      </g>
      <text x="60" y="113" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0b0805" opacity="0.75" letterSpacing="1">
        {grade.toUpperCase()}
      </text>
    </svg>
  );
}

function Shape({ kind, fill, stroke }: { kind: TrophyTraits["kind"]; fill: string; stroke: string }) {
  const s = { fill, stroke, strokeWidth: 2.5, strokeLinejoin: "round" as const };
  switch (kind) {
    case "Claw":
      return (
        <g>
          <path d="M34 88 Q22 58 40 26 Q38 60 48 88 Z" {...s} />
          <path d="M54 90 Q48 52 66 20 Q62 56 68 90 Z" {...s} />
          <path d="M74 88 Q74 56 94 32 Q84 62 86 88 Z" {...s} />
          <rect x="28" y="84" width="64" height="12" rx="6" fill="#5a3519" stroke={stroke} strokeWidth="2.5" />
        </g>
      );
    case "Fang":
      return (
        <g>
          <path d="M44 24 Q86 24 82 58 Q78 86 58 100 Q64 72 48 52 Q38 40 44 24 Z" {...s} />
          <path d="M40 22 Q62 14 86 26 L84 34 Q62 26 44 32 Z" fill="#7f1d1d" stroke={stroke} strokeWidth="2" />
        </g>
      );
    case "Pelt":
      return (
        <g>
          <circle cx="34" cy="34" r="12" {...s} />
          <circle cx="86" cy="34" r="12" {...s} />
          <path d="M22 58 Q22 28 60 28 Q98 28 98 58 Q98 88 60 96 Q22 88 22 58 Z" {...s} />
          <ellipse cx="46" cy="54" rx="7" ry="5" fill="#120b06" />
          <ellipse cx="74" cy="54" rx="7" ry="5" fill="#120b06" />
          <ellipse cx="60" cy="74" rx="14" ry="10" fill="#5a3519" opacity="0.6" />
          <ellipse cx="60" cy="70" rx="6" ry="4" fill="#120b06" />
        </g>
      );
    case "Paw":
      return (
        <g>
          <path d="M36 70 Q36 52 60 52 Q84 52 84 70 Q84 92 60 92 Q36 92 36 70 Z" {...s} />
          <ellipse cx="32" cy="46" rx="9" ry="12" transform="rotate(-24 32 46)" {...s} />
          <ellipse cx="50" cy="32" rx="9" ry="12" transform="rotate(-8 50 32)" {...s} />
          <ellipse cx="70" cy="32" rx="9" ry="12" transform="rotate(8 70 32)" {...s} />
          <ellipse cx="88" cy="46" rx="9" ry="12" transform="rotate(24 88 46)" {...s} />
        </g>
      );
    case "Skull":
      return (
        <g>
          <path d="M26 54 Q26 22 60 22 Q94 22 94 54 Q94 70 82 76 L82 90 L38 90 L38 76 Q26 70 26 54 Z" {...s} />
          <ellipse cx="45" cy="54" rx="9" ry="8" fill="#120b06" />
          <ellipse cx="75" cy="54" rx="9" ry="8" fill="#120b06" />
          <path d="M56 68 L60 62 L64 68 Z" fill="#120b06" />
          <path d="M44 82 v8 M52 82 v8 M60 82 v8 M68 82 v8 M76 82 v8" stroke={stroke} strokeWidth="2" />
        </g>
      );
  }
}

function Pattern({ traits }: { traits: TrophyTraits }) {
  const c = traits.element.main;
  const n = traits.marks;
  const seed = traits.seed;
  const at = (i: number) => {
    const a = parseInt(seed.slice(12 + i * 4, 14 + i * 4), 16) / 255;
    const b = parseInt(seed.slice(14 + i * 4, 16 + i * 4), 16) / 255;
    return [36 + a * 48, 34 + b * 48] as const;
  };
  if (traits.pattern === "stripes") {
    return (
      <g stroke={c} strokeWidth="3.2" strokeLinecap="round" opacity="0.9">
        {Array.from({ length: n }, (_, i) => {
          const [x, y] = at(i);
          return <path key={i} d={`M${x - 7} ${y - 4} l14 8`} />;
        })}
      </g>
    );
  }
  if (traits.pattern === "gems") {
    return (
      <g>
        {Array.from({ length: n }, (_, i) => {
          const [x, y] = at(i);
          return <path key={i} d={`M${x} ${y - 5} l4 5 l-4 5 l-4 -5 Z`} fill={c} stroke="#fff" strokeWidth="1" className="ia-glow" />;
        })}
      </g>
    );
  }
  return (
    <g stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.95" className="ia-glow">
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = at(i);
        const glyph = ["M-4 -4 L4 4 M4 -4 L-4 4", "M0 -5 L0 5 M-4 -2 L4 -2", "M-4 4 L0 -5 L4 4", "M-4 -4 L4 -4 L-4 4 L4 4"][(i + n) % 4];
        return <path key={i} transform={`translate(${x} ${y})`} d={glyph} />;
      })}
    </g>
  );
}

/** Linear mix of two #rrggbb colours. */
function mixHex(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
