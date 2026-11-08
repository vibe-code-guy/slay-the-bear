"use client";
// A small canvas particle system for the raid: hit sparks, ground dust, coins that burst or fly
// to a target, and confetti (canvas-confetti) for a won raid. Positions are fractions of the
// scene, so effects line up with the SVG at any size.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Kind = "spark" | "dust" | "coin" | "shard";

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  tx?: number;
  ty?: number;
}

export interface ParticlesHandle {
  /** x, y in [0, 1] of the scene. */
  burst(x: number, y: number, kind: Kind, count?: number, power?: number): void;
  coinsTo(fromX: number, fromY: number, toX: number, toY: number, count?: number): void;
  confetti(): void;
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const Particles = forwardRef<ParticlesHandle>(function Particles(_, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const confettiCanvas = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);
  const running = useRef(false);
  const size = useRef({ w: 1, h: 1, dpr: 1 });
  const confettiFn = useRef<((o: object) => void) | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      size.current = { w, h, dpr };
      c.width = Math.max(1, Math.floor(w * dpr));
      c.height = Math.max(1, Math.floor(h * dpr));
    });
    ro.observe(c);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  const step = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const next: P[] = [];
    for (const p of parts.current) {
      p.life += 1;
      if (p.tx !== undefined && p.ty !== undefined) {
        // homing coins: accelerate towards the target
        const dx = p.tx * w - p.x;
        const dy = p.ty * h - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 12) continue;
        p.vx = p.vx * 0.9 + (dx / d) * 1.6;
        p.vy = p.vy * 0.9 + (dy / d) * 1.6;
      } else {
        p.vy += p.kind === "dust" ? 0.02 : 0.32;
        p.vx *= 0.985;
      }
      p.x += p.vx;
      p.y += p.vy;
      if (p.life > p.max) continue;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      if (p.kind === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
      } else if (p.kind === "coin") {
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * (0.55 + 0.45 * Math.abs(Math.sin(p.life / 4))), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(p.x - p.size / 3, p.y - p.size / 3, p.size / 2.5, p.size / 2.5);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "dust" ? 1 + p.life / 30 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      next.push(p);
    }
    ctx.globalAlpha = 1;
    parts.current = next;
    if (next.length > 0) raf.current = requestAnimationFrame(step);
    else running.current = false;
  };

  const kick = () => {
    if (!running.current) {
      running.current = true;
      raf.current = requestAnimationFrame(step);
    }
  };

  useImperativeHandle(ref, () => ({
    burst(x, y, kind, count = 18, power = 1) {
      const n = reduced() ? Math.ceil(count / 4) : count;
      const { w, h } = size.current;
      for (let i = 0; i < n; i++) {
        const a = kind === "dust" ? Math.PI + Math.random() * Math.PI : Math.random() * Math.PI * 2;
        const v = (kind === "dust" ? 1.2 : kind === "coin" ? 5 : 6.5) * power * (0.4 + Math.random());
        parts.current.push({
          kind,
          x: x * w,
          y: y * h,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - (kind === "coin" ? 4 : kind === "spark" ? 2 : 0),
          life: 0,
          max: kind === "dust" ? 50 : kind === "coin" ? 60 : 28 + Math.random() * 14,
          size: kind === "dust" ? 4 + Math.random() * 5 : kind === "coin" ? 4 + Math.random() * 2 : 2 + Math.random() * 2,
          color: kind === "dust" ? "rgba(160,120,80,0.6)" : kind === "shard" ? "#9ca3af" : ["#fde68a", "#f59e0b", "#fb923c", "#fff7ed"][i % 4]!,
        });
      }
      kick();
    },
    coinsTo(fx, fy, tx, ty, count = 16) {
      const { w, h } = size.current;
      const n = reduced() ? 4 : count;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        parts.current.push({
          kind: "coin",
          x: fx * w + (Math.random() - 0.5) * 20,
          y: fy * h,
          vx: Math.cos(a) * (3 + Math.random() * 4),
          vy: Math.sin(a) * (3 + Math.random() * 4),
          life: -i * 2,
          max: 160,
          size: 5,
          color: "#facc15",
          tx,
          ty,
        });
      }
      kick();
    },
    confetti() {
      if (reduced()) return;
      void (async () => {
        if (!confettiFn.current && confettiCanvas.current) {
          const mod = await import("canvas-confetti");
          confettiFn.current = mod.default.create(confettiCanvas.current, { resize: true, useWorker: false }) as unknown as (o: object) => void;
        }
        const fire = confettiFn.current;
        if (!fire) return;
        const colors = ["#f59e0b", "#22a35a", "#f3e7cf", "#dc2626", "#7dd3fc"];
        fire({ particleCount: 90, spread: 75, origin: { x: 0.5, y: 0.45 }, colors });
        setTimeout(() => fire({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors }), 250);
        setTimeout(() => fire({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors }), 400);
      })();
    },
  }));

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <canvas ref={confettiCanvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
    </>
  );
});
