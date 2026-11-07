// A small hand-drawn Bear. Its look follows its mood; it slumps when beaten.
export function BearArt({ mood, beaten, angry, size = 180 }: { mood: number; beaten?: boolean; angry?: boolean; size?: number }) {
  const fur = beaten ? "#5b4636" : "#7a4f2c";
  const eye = mood === 2 || angry ? "#ef4444" : "#1b120a";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="The Bear">
      <circle cx="45" cy="48" r="26" fill={fur} />
      <circle cx="155" cy="48" r="26" fill={fur} />
      <circle cx="45" cy="48" r="12" fill="#3b2617" />
      <circle cx="155" cy="48" r="12" fill="#3b2617" />
      <ellipse cx="100" cy="110" rx="78" ry="72" fill={fur} />
      {mood === 1 && !beaten && (
        <path d="M30 78 Q100 20 170 78 L165 92 Q100 50 35 92 Z" fill="#9ca3af" stroke="#6b7280" strokeWidth="3" />
      )}
      <ellipse cx="100" cy="140" rx="38" ry="28" fill="#c89b6d" />
      <ellipse cx="100" cy="126" rx="14" ry="10" fill="#1b120a" />
      {beaten ? (
        <>
          <path d="M62 96 l16 16 M78 96 l-16 16" stroke="#1b120a" strokeWidth="6" strokeLinecap="round" />
          <path d="M122 96 l16 16 M138 96 l-16 16" stroke="#1b120a" strokeWidth="6" strokeLinecap="round" />
          <path d="M84 158 Q100 148 116 158" stroke="#1b120a" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="70" cy="102" r="9" fill={eye} />
          <circle cx="130" cy="102" r="9" fill={eye} />
          <path
            d={mood === 2 || angry ? "M56 84 L84 94 M144 84 L116 94" : "M58 88 L82 90 M142 88 L118 90"}
            stroke="#1b120a"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path d="M82 152 Q100 166 118 152" stroke="#1b120a" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M90 152 l4 9 l4 -9 M102 152 l4 9 l4 -9" fill="#f3e7cf" />
        </>
      )}
      {mood === 3 && !beaten && (
        <path d="M150 150 q20 -10 10 -30 q-10 -15 -25 -5" stroke="#a78bfa" strokeWidth="5" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
