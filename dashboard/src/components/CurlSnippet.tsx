"use client";

import { useState } from "react";

const PROD_APP_URL = "https://spawn-protocol.vercel.app";
const PROD_CONTROL_URL = "https://spawn-protocol-production.up.railway.app";

type Tab = "snapshot" | "tally" | "script";

export function CurlSnippet() {
  const [tab, setTab] = useState<Tab>("snapshot");
  const [copied, setCopied] = useState(false);
  const baseUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : PROD_APP_URL;

  const SNAPSHOT_EXAMPLE = `curl -sS -X POST ${baseUrl}/api/daos/register?wait=true \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Uniswap",
    "source": "snapshot",
    "sourceRef": "uniswapgovernance.eth",
    "philosophy": "neutral"
  }' | jq`;

  const TALLY_EXAMPLE = `curl -sS -X POST ${baseUrl}/api/daos/register?wait=true \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Arbitrum",
    "source": "tally",
    "sourceRef": "2206072050315953936",
    "philosophy": "progressive"
  }' | jq`;

  const ONBOARD_SH = `# Interactive shell script (served by the dashboard)
bash <(curl -s ${baseUrl}/onboard.sh)`;

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
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-[#4a4f5e] uppercase">
            USE THE DASHBOARD PROXY FOR REGISTRATION — WAIT MODE RETURNS MIRROR / SPAWN STATUS INLINE
          </p>
          <p className="font-mono text-[10px] text-[#4a4f5e] uppercase break-all">
            DASHBOARD: {baseUrl} · CONTROL_SERVER: {PROD_CONTROL_URL}
          </p>
        </div>
      </div>
    </div>
  );
}
