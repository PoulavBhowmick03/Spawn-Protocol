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

  const snippet = tab === "snapshot" ? SNAPSHOT_EXAMPLE : tab === "tally" ? TALLY_EXAMPLE : ONBOARD_SH;

  function copy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d0d14]">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <div className="flex gap-1">
          {(["snapshot", "tally", "script"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                tab === t
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {t === "script" ? "onboard.sh" : t}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="text-[10px] font-mono text-gray-600 transition-colors hover:text-gray-300"
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs font-mono leading-relaxed text-gray-400">
        {snippet}
      </pre>
      <p className="border-t border-gray-800 px-4 py-2 text-[10px] font-mono text-gray-700">
        Control server listens on port 8787 by default · set SPAWN_CONTROL_URL to override
      </p>
    </div>
  );
}
