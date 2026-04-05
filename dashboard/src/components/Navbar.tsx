"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "SWARM", icon: "⬡" },
  { href: "/graph", label: "NETWORK", icon: "◎" },
  { href: "/proposals", label: "GOVERNANCE", icon: "◈" },
  { href: "/daos", label: "DAOS", icon: "◭" },
  { href: "/timeline", label: "LEDGER", icon: "≡" },
  { href: "/judge-flow", label: "JUDGE_FLOW", icon: "◇" },
  { href: "/receipt", label: "RECEIPTS", icon: "▣" },
  { href: "/logs", label: "EXEC_LOG", icon: "◉" },
  { href: "/settings", label: "SYSTEM_OS", icon: "⚙" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors border-l-2 ${
              isActive
                ? "text-[#00ff88] border-[#00ff88] bg-white/[0.03]"
                : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0] hover:bg-white/[0.02]"
            }`}
          >
            <span className="text-sm leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-[200px] bg-[#070710] border-r border-white/[0.08] flex-col z-50">
        {/* Wordmark */}
        <div className="px-4 py-3 border-b border-white/[0.08]">
          <span className="font-mono text-[11px] text-[#00ff88] uppercase tracking-[0.25em] font-bold leading-none">
            SPAWN_PROTOCOL
          </span>
        </div>

        {/* Agent identity */}
        <div className="px-4 py-3 border-b border-white/[0.08]">
          <div className="text-[11px] font-mono font-bold text-[#f5f5f0]">SPAWN_01</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-mono text-[#00ff88] uppercase tracking-wider">
              STATUS: OPTIMAL
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-1 overflow-y-auto">{navLinks}</nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] space-y-3">
          <button className="w-full border border-[#00ff88]/60 text-[#00ff88] text-[10px] font-mono uppercase tracking-widest py-2 hover:bg-[#00ff88]/10 hover:border-[#00ff88] transition-colors">
            INITIATE_SYNC
          </button>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse flex-shrink-0" />
            <a
              href="https://sepolia.basescan.org/address/0xfeb8d54149b1a303ab88135834220b85091d93a1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-[#4a4f5e] uppercase hover:text-[#f5f5f0] transition-colors"
            >
              BASE_SEPOLIA ↗
            </a>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-12 bg-[#070710] border-b border-white/[0.08] flex items-center justify-between px-4 z-50">
        <span className="font-mono text-[11px] text-[#00ff88] uppercase tracking-[0.2em] font-bold">
          SPAWN_PROTOCOL
        </span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex flex-col gap-1.5 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-[#4a4f5e] transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-5 h-0.5 bg-[#4a4f5e] transition-all ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block w-5 h-0.5 bg-[#4a4f5e] transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed top-12 right-0 bottom-0 w-56 bg-[#070710] border-l border-white/[0.08] z-50 flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex-1 py-1">{navLinks}</nav>
        <div className="p-4 border-t border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
            <span className="text-[10px] font-mono text-[#4a4f5e] uppercase">BASE_SEPOLIA</span>
          </div>
        </div>
      </div>
    </>
  );
}
