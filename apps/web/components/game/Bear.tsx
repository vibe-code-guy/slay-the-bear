// The Bear, drawn in SVG. Its look follows the raid: asleep between raids, wearing its mood
// during one (helmet for Armor, red eyes and steam for Rage, a sly swirl for Feint), angry at
// the deadline, knocked out after a town win, gloating over a sack of coins after a Bear win.
export type BearPose = "sleep" | "idle" | "angry" | "defeated" | "gloat";

export function Bear({ pose, mood, roaring }: { pose: BearPose; mood: number; roaring?: boolean }) {
  const awake = pose === "idle" || pose === "angry";
  const rage = awake && (mood === 2 || pose === "angry");
  const armor = mood === 1 && pose !== "sleep";
  const feint = awake && mood === 3;
  const iris = rage ? "#ef4444" : feint ? "#7c3aed" : "#1b120a";
  const raised = pose === "angry" || roaring;

  return (
    <svg viewBox="0 0 320 340" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="bear-fur" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor={pose === "defeated" ? "#8a6a52" : "#9a6436"} />
          <stop offset="1" stopColor={pose === "defeated" ? "#4d3a2c" : "#5a3519"} />
        </radialGradient>
        <radialGradient id="bear-belly" cx="0.45" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#e2bb8a" />
          <stop offset="1" stopColor="#b98a5c" />
        </radialGradient>
        <linearGradient id="bear-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e5e7eb" />
          <stop offset="0.5" stopColor="#9ca3af" />
          <stop offset="1" stopColor="#4b5563" />
        </linearGradient>
        <radialGradient id="bear-swirl" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.6" stopColor="#a78bfa" stopOpacity="0" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0.45" />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="324" rx="120" ry="13" fill="#000" opacity="0.38" />

      <g className={pose === "defeated" ? "bear-down" : "bear-breathe"}>
        {/* legs */}
        <ellipse cx="108" cy="292" rx="42" ry="34" fill="url(#bear-fur)" />
        <ellipse cx="212" cy="292" rx="42" ry="34" fill="url(#bear-fur)" />
        <ellipse cx="104" cy="308" rx="24" ry="10" fill="#c89b6d" />
        <ellipse cx="216" cy="308" rx="24" ry="10" fill="#c89b6d" />

        {/* body */}
        <ellipse cx="160" cy="220" rx="108" ry="92" fill="url(#bear-fur)" />
        <ellipse cx="160" cy="238" rx="64" ry="58" fill="url(#bear-belly)" />
        {armor && <path d="M100 178 Q160 150 220 178 L212 236 Q160 256 108 236 Z" fill="url(#bear-metal)" stroke="#374151" strokeWidth="3" opacity="0.95" />}

        {/* arms */}
        <g className={raised ? "bear-arm-up-l" : "bear-arm-l"}>
          <ellipse cx="62" cy="222" rx="30" ry="56" fill="url(#bear-fur)" transform="rotate(18 62 222)" />
          <path d="M40 266 l6 14 l6 -14 M54 270 l6 14 l6 -14 M68 268 l6 13 l5 -14" fill="#f3e7cf" />
          {armor && <ellipse cx="74" cy="178" rx="26" ry="16" fill="url(#bear-metal)" stroke="#374151" strokeWidth="2" />}
        </g>
        <g className={raised ? "bear-arm-up-r" : "bear-arm-r"}>
          <ellipse cx="258" cy="222" rx="30" ry="56" fill="url(#bear-fur)" transform="rotate(-18 258 222)" />
          <path d="M241 268 l6 14 l6 -14 M255 270 l6 14 l6 -14 M268 266 l6 14 l6 -14" fill="#f3e7cf" />
          {armor && <ellipse cx="246" cy="178" rx="26" ry="16" fill="url(#bear-metal)" stroke="#374151" strokeWidth="2" />}
        </g>

        {/* head */}
        <g className={roaring ? "bear-head-roar" : ""}>
          {feint && <circle cx="160" cy="104" r="118" fill="url(#bear-swirl)" className="bear-swirl" />}
          <circle cx="90" cy="56" r="29" fill="url(#bear-fur)" />
          <circle cx="230" cy="56" r="29" fill="url(#bear-fur)" />
          <circle cx="90" cy="56" r="14" fill="#3b2617" />
          <circle cx="230" cy="56" r="14" fill="#3b2617" />
          <ellipse cx="160" cy="108" rx="91" ry="79" fill="url(#bear-fur)" />
          <ellipse cx="160" cy="142" rx="45" ry="32" fill="url(#bear-belly)" />
          <ellipse cx="160" cy="125" rx="17" ry="11" fill="#1b120a" />
          <ellipse cx="154" cy="121" rx="5" ry="3" fill="#fff" opacity="0.5" />

          {/* eyes */}
          {pose === "sleep" && (
            <path d="M108 100 Q124 110 140 100 M180 100 Q196 110 212 100" stroke="#1b120a" strokeWidth="5" fill="none" strokeLinecap="round" />
          )}
          {pose === "defeated" && (
            <path d="M112 88 l24 22 M136 88 l-24 22 M184 88 l24 22 M208 88 l-24 22" stroke="#1b120a" strokeWidth="6" strokeLinecap="round" />
          )}
          {pose === "gloat" && (
            <path d="M108 104 Q124 88 140 104 M180 104 Q196 88 212 104" stroke="#1b120a" strokeWidth="6" fill="none" strokeLinecap="round" />
          )}
          {awake && (
            <g className="bear-blink">
              <ellipse cx="124" cy="98" rx="14" ry="15" fill="#fffaf0" />
              <ellipse cx="196" cy="98" rx="14" ry="15" fill="#fffaf0" />
              <circle cx={feint ? 119 : 127} cy="101" r="8" fill={iris} />
              <circle cx={feint ? 191 : 193} cy="101" r="8" fill={iris} />
              <circle cx={feint ? 117 : 125} cy="98" r="2.5" fill="#fff" />
              <circle cx={feint ? 189 : 191} cy="98" r="2.5" fill="#fff" />
            </g>
          )}

          {/* brows */}
          {awake && (
            <path
              d={rage ? "M100 72 L144 88 M220 72 L176 88" : feint ? "M102 80 L142 84 M178 76 Q198 62 218 74" : "M104 80 L142 82 M178 82 L216 80"}
              stroke="#1b120a"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
          )}

          {/* mouth */}
          {roaring || pose === "angry" ? (
            <g>
              <ellipse cx="160" cy="164" rx="26" ry="18" fill="#5b1010" />
              <path d="M140 152 l6 12 l6 -12 M168 152 l6 12 l6 -12" fill="#f3e7cf" />
              <ellipse cx="160" cy="174" rx="12" ry="5" fill="#be3a3a" />
            </g>
          ) : pose === "gloat" ? (
            <g>
              <path d="M128 156 Q160 196 192 156 Z" fill="#5b1010" />
              <path d="M136 157 l6 9 l6 -9 M172 157 l6 9 l6 -9" fill="#f3e7cf" />
            </g>
          ) : pose === "defeated" ? (
            <g>
              <path d="M140 162 Q160 152 180 162" stroke="#1b120a" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M162 160 q8 18 -2 22 q-10 -2 -6 -18" fill="#e57373" />
            </g>
          ) : pose === "sleep" ? (
            <ellipse cx="160" cy="162" rx="8" ry="6" fill="#3b2617" />
          ) : (
            <g>
              <path d="M138 158 Q160 174 182 158" stroke="#1b120a" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M146 160 l5 10 l5 -10 M164 160 l5 10 l5 -10" fill="#f3e7cf" />
            </g>
          )}

          {/* Armor: helmet */}
          {armor && (
            <g>
              <path d="M70 96 Q160 -14 250 96 L242 110 Q160 34 78 110 Z" fill="url(#bear-metal)" stroke="#374151" strokeWidth="3" />
              <rect x="153" y="38" width="14" height="66" rx="4" fill="url(#bear-metal)" stroke="#374151" strokeWidth="2" />
              {[96, 124, 196, 224].map((x) => (
                <circle key={x} cx={x} cy={x < 160 ? 82 - (x - 96) * 0.3 : 82 - (224 - x) * 0.3} r="3.5" fill="#d1d5db" stroke="#4b5563" />
              ))}
            </g>
          )}

          {/* Rage: steam */}
          {rage && pose !== "angry" && (
            <g fill="#f3e7cf" opacity="0.8">
              <circle cx="70" cy="30" r="9" className="bear-steam" />
              <circle cx="250" cy="30" r="9" className="bear-steam bear-steam-2" />
            </g>
          )}
          {rage && <path d="M216 74 l8 -6 m-4 -4 l6 8 m2 -10 l4 10" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />}
        </g>

        {/* gloat: sack of stolen coins */}
        {pose === "gloat" && (
          <g className="bear-sack">
            <path d="M232 268 Q226 236 250 230 L274 230 Q298 236 292 268 Q292 300 262 302 Q232 300 232 268 Z" fill="#a16207" stroke="#713f12" strokeWidth="3" />
            <path d="M246 230 L278 230 L270 220 L254 220 Z" fill="#854d0e" />
            <text x="262" y="280" textAnchor="middle" fontSize="30" fontWeight="900" fill="#fde047">$</text>
          </g>
        )}
      </g>

      {pose === "sleep" && (
        <g fontFamily="Georgia, serif" fontWeight="bold" fill="#f3e7cf">
          <text x="262" y="96" fontSize="30" className="bear-zzz">Z</text>
          <text x="286" y="70" fontSize="23" className="bear-zzz bear-zzz-2">z</text>
          <text x="304" y="48" fontSize="17" className="bear-zzz bear-zzz-3">z</text>
        </g>
      )}
      {pose === "defeated" && (
        <g className="bear-stars" fill="#fde047">
          {[0, 120, 240].map((a) => (
            <path
              key={a}
              transform={`rotate(${a} 160 40) translate(160 -6)`}
              d="M0 -10 L3 -3 L10 -3 L4 2 L6 10 L0 5 L-6 10 L-4 2 L-10 -3 L-3 -3 Z"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
