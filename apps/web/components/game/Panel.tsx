"use client";
// A game panel over the town: a wood-framed window that opens from the HUD menu and closes with
// Esc, the ✕ or a click outside. Focus moves into the panel, and back where it was on close.
import { useEffect, useRef } from "react";

export function Panel({
  title,
  icon,
  onClose,
  children,
  wide,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      html.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-6">
      <div className="panel-fade absolute inset-0 bg-black/65 backdrop-blur-[2px]" onClick={() => close.current()} aria-hidden />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`panel-pop wood-frame relative flex max-h-[min(90dvh,860px)] w-full flex-col overflow-hidden rounded-2xl outline-none ${wide ? "max-w-5xl" : "max-w-2xl"}`}
      >
        <header className="flex items-center gap-3 border-b border-[#8b6b3d]/60 bg-gradient-to-b from-[#3d2b1b] to-[#2a1d12] px-4 py-2.5">
          <span className="text-2xl drop-shadow" aria-hidden>
            {icon}
          </span>
          <h2 className="flex-1 text-xl font-bold text-[#fde68a] drop-shadow">{title}</h2>
          <button type="button" className="rounded-full px-2 py-0.5 text-xl text-dim hover:bg-black/30 hover:text-parch" onClick={() => close.current()} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

/** Tabs inside a panel. */
export function PanelTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${t.id === active ? "bg-ember text-night" : "bg-black/30 text-dim hover:text-parch"}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
