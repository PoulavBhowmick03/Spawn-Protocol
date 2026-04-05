"use client";

import { useState } from "react";

const SNAPSHOT_EXAMPLE = `curl -s -X POST http://localhost:8787/dao/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Uniswap",
    "source": "snapshot",
    "sourceRef": "uniswapgovernance.eth",
    "philosophy": "neutral"
  }'`;

const TALLY_EXAMPLE = `curl -s -X POST http://localhost:8787/dao/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Arbitrum",
    "source": "tally",
    "sourceRef": "2206072050315953936",
    "philosophy": "progressive"
  }'`;

const ONBOARD_SH = `# Interactive shell script (wraps the curl above)
bash <(curl -s http://localhost:3000/onboard.sh)`;

type Tab = "snapshot" | "tally" | "script";

export function CurlSnippet() {
  const [tab, setTab] = useState<Tab>("snapshot");
  const [copied, setCopied] = useState(false);

  const snippet =
    tab === "snapshot" ? SNAPSHOT_EXAMPLE : tab === "tally" ? TALLY_EXAMPLE : ONBOARD_SH;

  function copy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="bg-[#070710]">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2">
        <div className="flex gap-0">
          {(["snapshot", "tally", "script"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                tab === t
                  ? "text-[#00ff88] border-[#00ff88]"
                  : "text-[#4a4f5e] border-transparent hover:text-[#f5f5f0]"
              }`}
            >
              {t === "script" ? "ONBOARD.SH" : t.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest hover:text-[#f5f5f0] transition-colors"
        >
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </div>

      {/* Code block */}
      <pre className="overflow-x-auto px-4 py-4 text-[11px] font-mono leading-relaxed text-[#f5f5f0]/60">
        <code>{snippet}</code>
      </pre>

      {/* Footer */}
      <div className="border-t border-white/[0.08] px-4 py-2">
        <p className="font-mono text-[10px] text-[#4a4f5e] uppercase">
          CONTROL_SERVER LISTENS ON PORT 8787 — SET SPAWN_CONTROL_URL TO OVERRIDE
        </p>
      </div>
    </div>
  );
}
