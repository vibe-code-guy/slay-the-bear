// Townsfolk in SVG: the four villager NPCs, the player and other guests. Each has a look and a
// weapon; CSS classes animate the lunge when they hit, the cheer on a win and the cower on a loss.
export type HeroKind = "bjorn" | "fern" | "sid" | "sara" | "you" | "guest";

const GUEST_COLORS = ["#0f766e", "#9d174d", "#4338ca", "#a16207", "#475569", "#15803d", "#b45309", "#6d28d9"];

export function heroKindOf(account: string, me: string | null): HeroKind {
  if (me && account === me) return "you";
  const first = account.split(".")[0] ?? "";
  if (first === "bjorn" || first === "fern" || first === "sid" || first === "sara") return first;
  return "guest";
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/**
 * Gear a hero has earned, worked out from chain data anyone can read: the level (damage over
 * recent raids) and whether they hold a Bear trophy. Cosmetic only.
 */
export interface HeroLook {
  /** 0 plain, 1 leather pads (level 3), 2 chainmail (level 5), 3 plate and a cape (level 7) */
  tier: 0 | 1 | 2 | 3;
  crown: boolean;
  trophy: boolean;
  /** all of today's goals done (lib/goals.ts) */
  sash?: boolean;
}

export function lookOf(level: number, holdsTrophy: boolean, sash = false): HeroLook {
  return { tier: level >= 7 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0, crown: level >= 10, trophy: holdsTrophy, sash };
}

/** What each level of gear looks like, for the backpack and the help panel. */
export const GEAR_STEPS: { level: number; name: string }[] = [
  { level: 3, name: "leather pads" },
  { level: 5, name: "chainmail" },
  { level: 7, name: "plate and a cape" },
  { level: 10, name: "a crown" },
];

export function Hero({ kind, account = "", weapon, look }: { kind: HeroKind; account?: string; weapon?: string | null; look?: HeroLook }) {
  const outfit =
    kind === "bjorn" ? "#7f1d1d" : kind === "fern" ? "#3f6212" : kind === "sid" ? "#14532d" : kind === "sara" ? "#6b21a8" : kind === "you" ? "#1d4ed8" : GUEST_COLORS[hash(account) % GUEST_COLORS.length]!;
  const skin = kind === "sid" ? "#d6a77a" : kind === "sara" ? "#8d5524" : kind === "guest" ? ["#f1c27d", "#c68642", "#e0ac69", "#8d5524"][hash(account) % 4]! : "#f1c27d";
  const held = kind === "you" ? (weapon ?? "paws") : kind === "guest" ? "club" : kind;

  return (
    <svg viewBox="0 0 100 130" className="h-full w-full overflow-visible" aria-hidden>
      <ellipse cx="50" cy="124" rx="26" ry="5" fill="#000" opacity="0.35" />
      {/* cape (level 7) */}
      {look && look.tier >= 3 && <path d="M30 60 Q50 54 70 60 L84 116 Q50 126 16 116 Z" fill="#991b1b" stroke="#450a0a" strokeWidth="1.5" className="hero-cape" />}
      {/* legs */}
      <rect x="38" y="96" width="9" height="24" rx="3" fill="#2b1d12" />
      <rect x="53" y="96" width="9" height="24" rx="3" fill="#2b1d12" />
      {/* body */}
      <path d="M31 62 L69 62 L77 104 L23 104 Z" fill={outfit} />
      {/* chainmail (level 5) or plate (level 7) */}
      {look && look.tier >= 2 && (
        <g>
          <path d="M33 63 L67 63 L72 90 L28 90 Z" fill={look.tier >= 3 ? "#cbd5e1" : "#9ca3af"} stroke="#374151" strokeWidth="1.2" />
          {look.tier >= 3 ? (
            <path d="M50 64 L50 89 M36 74 Q50 80 64 74" stroke="#64748b" strokeWidth="1.6" fill="none" />
          ) : (
            <path d="M32 70 H68 M31 76 H69 M30 82 H70" stroke="#6b7280" strokeWidth="1.4" strokeDasharray="2 2" />
          )}
        </g>
      )}
      <rect x="25" y="88" width="50" height="6" fill="#3b2617" />
      <rect x="46" y="88" width="8" height="6" fill="#fbbf24" />
      {/* leather pads (level 3) */}
      {look && look.tier >= 1 && (
        <g fill={look.tier >= 3 ? "#e2e8f0" : "#92400e"} stroke={look.tier >= 3 ? "#475569" : "#451a03"} strokeWidth="1.2">
          <ellipse cx="31" cy="64" rx="9" ry="5" />
          <ellipse cx="69" cy="64" rx="9" ry="5" />
        </g>
      )}
      {/* the goal sash: today's three goals done */}
      {look?.sash && (
        <g>
          <path d="M33 62 L42 61 L73 97 L65 101 Z" fill="#15803d" stroke="#14532d" strokeWidth="1.2" />
          <path d="M37 64 L68 99" stroke="#facc15" strokeWidth="1" strokeDasharray="3 2" />
          <circle cx="55" cy="81" r="3.6" fill="#facc15" stroke="#a16207" strokeWidth="1" className="ia-glow" />
        </g>
      )}
      {/* a Bear trophy on a cord */}
      {look?.trophy && (
        <g>
          <path d="M41 61 Q50 72 59 61" stroke="#78350f" strokeWidth="1.3" fill="none" />
          <path d="M47 68 Q50 80 53 68 Z" fill="#f5ecd7" stroke="#78350f" strokeWidth="1" className="ia-glow" />
        </g>
      )}
      {/* back arm */}
      <rect x="22" y="64" width="10" height="30" rx="5" fill={outfit} transform="rotate(14 27 64)" />
      {/* head */}
      <circle cx="50" cy="42" r="18" fill={skin} />
      <circle cx="44" cy="42" r="2" fill="#1b120a" />
      <circle cx="56" cy="42" r="2" fill="#1b120a" />
      <path d="M45 50 Q50 54 55 50" stroke="#1b120a" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {kind === "bjorn" && (
        <g>
          <path d="M33 46 Q50 76 67 46 Q62 60 50 62 Q38 60 33 46 Z" fill="#c2410c" />
          <path d="M31 36 Q50 14 69 36 Z" fill="#9ca3af" stroke="#4b5563" strokeWidth="1.5" />
          <path d="M32 33 Q22 26 24 14 Q30 24 36 29 Z M68 33 Q78 26 76 14 Q70 24 64 29 Z" fill="#f3e7cf" />
        </g>
      )}
      {kind === "fern" && (
        <g>
          <ellipse cx="50" cy="28" rx="30" ry="6" fill="#ca8a04" />
          <path d="M37 28 Q50 10 63 28 Z" fill="#eab308" />
          <path d="M64 40 Q72 52 66 66" stroke="#92400e" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {kind === "sid" && <path d="M28 46 Q28 18 50 18 Q72 18 72 46 L66 46 Q64 28 50 28 Q36 28 34 46 Z" fill="#14532d" />}
      {kind === "sara" && <path d="M31 40 Q34 20 50 20 Q66 20 69 40 Q60 30 50 30 Q40 30 31 40 Z" fill="#a855f7" />}
      {kind === "you" && <path d="M33 38 Q36 22 50 22 Q64 22 67 38 Q58 30 50 31 Q42 30 33 38 Z" fill="#78350f" />}
      {kind === "guest" && <path d="M32 36 Q50 16 68 36 L72 38 L28 38 Z" fill={GUEST_COLORS[(hash(account) + 3) % GUEST_COLORS.length]} />}
      {/* crown (level 10) */}
      {look?.crown && (
        <path d="M37 24 L40 11 L46 19 L50 7 L54 19 L60 11 L63 24 Z" fill="#facc15" stroke="#a16207" strokeWidth="1.5" className="hero-crown" />
      )}

      {/* front arm with the weapon */}
      <g className="hero-weapon">
        <rect x="66" y="62" width="10" height="28" rx="5" fill={outfit} transform="rotate(-24 71 62)" />
        <circle cx="80" cy="84" r="5" fill={skin} />
        {held === "bjorn" && (
          <g>
            <rect x="78" y="44" width="5" height="50" rx="2" fill="#78350f" />
            <path d="M83 46 Q100 50 98 64 Q92 58 83 60 Z" fill="#d1d5db" stroke="#4b5563" strokeWidth="1.5" />
          </g>
        )}
        {held === "fern" && (
          <g stroke="#a3a3a3" strokeWidth="3" strokeLinecap="round">
            <path d="M80 98 L80 34" stroke="#92400e" strokeWidth="4" />
            <path d="M72 40 L72 30 M80 40 L80 26 M88 40 L88 30 M72 40 L88 40" />
          </g>
        )}
        {held === "sid" && (
          <g fill="none" strokeLinecap="round">
            <path d="M84 40 Q100 66 84 94" stroke="#78350f" strokeWidth="4" />
            <path d="M84 40 L84 94" stroke="#f3e7cf" strokeWidth="1.2" />
          </g>
        )}
        {held === "sara" && (
          <g>
            <rect x="78" y="40" width="4" height="56" rx="2" fill="#78350f" />
            <rect x="73" y="28" width="14" height="16" rx="3" fill="#fde68a" stroke="#92400e" strokeWidth="2" className="hero-lantern" />
          </g>
        )}
        {held === "club" && <path d="M77 92 L84 50 Q90 40 96 48 L86 92 Z" fill="#92400e" stroke="#451a03" strokeWidth="1.5" />}
        {held === "sword" && (
          <g>
            <path d="M79 88 L81 34 L85 30 L87 34 L85 88 Z" fill="#e5e7eb" stroke="#6b7280" strokeWidth="1.2" />
            <rect x="74" y="86" width="18" height="4" rx="2" fill="#a16207" />
          </g>
        )}
        {held === "slayer" && (
          <g>
            <rect x="79" y="36" width="5" height="58" rx="2" fill="#451a03" />
            <path d="M84 36 Q106 40 104 60 Q96 52 84 54 Z M79 36 Q58 40 60 60 Q68 52 79 54 Z" fill="#fca5a5" stroke="#7f1d1d" strokeWidth="1.5" />
          </g>
        )}
      </g>
    </svg>
  );
}
