import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slay the Bear: a memecoin town game on NEAR",
  description:
    "Burn $SLAY to hit the Bear. If the town deals enough damage before the deadline, raiders split its hoard. Every move is a NEAR transaction; every roll comes from drand, verified on-chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-edge/70 bg-night/80 backdrop-blur sticky top-0 z-20">
          <nav className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3 text-sm">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <span aria-hidden>🐻</span>
              <span className="font-[family-name:var(--font-display)]">Slay the Bear</span>
            </Link>
            <Link href="/" className="text-dim hover:text-parch">
              Town
            </Link>
            <Link href="/verify" className="text-dim hover:text-parch">
              Verify
            </Link>
            <Link href="/rules" className="text-dim hover:text-parch">
              Rules
            </Link>
            <Link href="/fast-forward" className="text-dim hover:text-parch">
              Fast-forward
            </Link>
            <a href={REPO_URL} className="ml-auto text-dim hover:text-parch" target="_blank" rel="noreferrer">
              Source
            </a>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-dim">
          Testnet only. $SLAY has no value. Every move is a NEAR transaction to a contract with no owner and no admin methods;
          every random roll comes from the drand quicknet beacon and is checked on-chain.
        </footer>
      </body>
    </html>
  );
}
