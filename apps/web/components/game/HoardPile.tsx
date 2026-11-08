// The Bear's hoard as a pile of coins at its feet: the more $SLAY it holds (from raids it won),
// the bigger the pile. Nothing when the hoard is empty.

/** Coins per row, from the bottom of the pile up. */
const ROWS = [7, 6, 5, 4, 3, 2, 1];

export function HoardPile({ hoardWhole }: { hoardWhole: number }) {
  if (hoardWhole <= 0) return null;
  // 4 coins for a handful of $SLAY, the whole pile (28) from about a million
  const n = Math.min(28, 4 + Math.round(Math.log10(hoardWhole + 1) * 4));
  const coins: { x: number; y: number; k: string }[] = [];
  let left = n;
  ROWS.forEach((count, r) => {
    const c = Math.min(count, left);
    left -= c;
    for (let i = 0; i < c; i++) coins.push({ x: 150 + (i - (c - 1) / 2) * 34 + (r % 2) * 5, y: 86 - r * 9, k: `${r}-${i}` });
  });
  const top = Math.min(...coins.map((c) => c.y));
  return (
    // stretched to the width under the Bear: coins are ellipses anyway
    <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
      <ellipse cx="150" cy="94" rx="140" ry="9" fill="#000" opacity="0.35" />
      {/* the mound under the coins */}
      <path d={`M14 94 Q150 ${top - 14} 286 94 Z`} fill="#92400e" opacity="0.9" />
      <path d={`M30 94 Q150 ${top - 6} 270 94 Z`} fill="#b45309" />
      {coins.map((c) => (
        <g key={c.k}>
          <ellipse cx={c.x} cy={c.y} rx="15" ry="5.5" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5" />
          <ellipse cx={c.x - 3} cy={c.y - 1.2} rx="7" ry="2" fill="#fde68a" opacity="0.8" />
        </g>
      ))}
      {/* a few coins on their edge, catching the light */}
      {n >= 10 && (
        <g className="hoard-glint">
          <ellipse cx="92" cy="80" rx="5" ry="10" fill="#fbbf24" stroke="#78350f" strokeWidth="1.5" />
          <ellipse cx="212" cy="82" rx="5" ry="10" fill="#fbbf24" stroke="#78350f" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
