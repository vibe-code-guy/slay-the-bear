"use client";
// Development only: the loot chest with a trophy in it, at a few scene sizes, for checking the
// art and layout without waiting for a 5% drop. Not part of the production build.
import { notFound } from "next/navigation";
import { useState } from "react";
import { LootReveal } from "@/components/game/LootReveal";

// a sample settlement randomness (32 bytes, hex); any value gives some trophy look
const RANDOMNESS = "5d6d945412152abe" + "77".repeat(24);

export default function Page() {
  const [n, setN] = useState(0);
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="space-y-4">
      <button className="btn" onClick={() => setN((x) => x + 1)}>
        Open again
      </button>
      {[
        [930, 480],
        [526, 285],
        [349, 233],
      ].map(([w, h]) => (
        <div key={`${w}-${n}`} className="relative overflow-hidden rounded-2xl border border-edge bg-night [container-type:size]" style={{ width: w, height: h }}>
          <LootReveal
            roundId={23}
            items={[
              { token_id: "wood", qty: 3n },
              { token_id: "iron", qty: 2n },
              { token_id: "trophy-23-0", qty: 1n },
            ]}
            share={322_950_000_000_000_000_000n}
            randomness={RANDOMNESS}
            onClose={() => undefined}
          />
        </div>
      ))}
    </div>
  );
}
