"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Swarm", icon: "⬡" },
  { href: "/graph", label: "Graph", icon: "◎" },
  { href: "/proposals", label: "Proposals", icon: "◈" },
  { href: "/leaderboard", label: "Leaderboard", icon: "▲" },
  { href: "/timeline", label: "Timeline", icon: "≡" },
  { href: "/judge-flow", label: "Judge Flow", icon: "◇" },
  { href: "/receipt", label: "Receipts", icon: "▣" },
  { href: "/logs", label: "Exec Log", icon: "◉" },
  { href: "/settings", label: "Settings", icon: "⚙" },
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
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-mono text-sm ${
              isActive
                ? "bg-green-400/10 text-green-400 border border-green-400/20"
                : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent"
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
            {isActive && (
              <span className="ml-auto w-1 h-1 rounded-full bg-green-400" />
            )}
          </Link>
        );
      })}
    </>
  );

  const logo = (
    <div className="px-5 py-5 border-b border-gray-800/60">
      <div className="font-mono text-xs text-gray-600 mb-1 tracking-widest uppercase">
        PL Genesis Hackathon 2026
      </div>
      <h1 className="font-mono text-lg font-bold text-green-400 tracking-tight leading-none">
        SPAWN
        <br />
        <span className="text-green-600">PROTOCOL</span>
      </h1>
      <div className="mt-2 h-px bg-gradient-to-r from-green-500/50 to-transparent" />
    </div>
  );

  const footer = (
    <div className="px-5 py-4 border-t border-gray-800/60">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-ping" style={{ animationDuration: "2s" }} />
        <span className="font-mono text-xs text-gray-500">Base Sepolia</span>
      </div>
      <a
        href="https://sepolia.basescan.org/address/0xfeb8d54149b1a303ab88135834220b85091d93a1"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-gray-700 hover:text-gray-400 transition-colors"
      >
        SpawnFactory ↗
      </a>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-56 bg-[#07070f] border-r border-gray-800/60 flex-col z-50">
        {logo}
        <nav className="flex-1 px-3 py-4 space-y-1">{navLinks}</nav>
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#07070f] border-b border-gray-800/60 flex items-center justify-between px-4 z-50">
        <h1 className="font-mono text-sm font-bold text-green-400 tracking-tight">
          SPAWN <span className="text-green-600">PROTOCOL</span>
        </h1>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex flex-col gap-1.5 p-2 -mr-2"
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-gray-400 transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`block w-5 h-0.5 bg-gray-400 transition-all ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block w-5 h-0.5 bg-gray-400 transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed top-14 right-0 bottom-0 w-64 bg-[#07070f] border-l border-gray-800/60 z-50 transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="px-3 py-4 space-y-1">{navLinks}</nav>
        {footer}
      </div>
    </>
  );
}
