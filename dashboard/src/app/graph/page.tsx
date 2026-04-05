"use client";

import Link from "next/link";
import { DashboardHeader, DashboardPageFrame, DashboardPanel, DashboardStatStrip } from "@/components/DashboardChrome";
import { useSwarmData } from "@/hooks/useSwarmData";
import { formatAddress, governorName, ensName } from "@/lib/contracts";

const CANVAS_W = 1120;
const CANVAS_H = 620;
const PARENT_X = CANVAS_W / 2;
const PARENT_Y = CANVAS_H / 2;
const PARENT_R = 52;
const CHILD_R = 34;
const SAFE_SIDE_PADDING = 112;
const SAFE_TOP_PADDING = 112;
const SAFE_BOTTOM_PADDING = 104;

function octagonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 180) * (22.5 + i * 45);
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

function nodeConfig(score: number, active: boolean, isVoting: boolean) {
  if (!active) {
    return {
      stroke: "#4a4f5e",
      fill: "#0a0a0f",
      text: "#4a4f5e",
      line: "#4a4f5e",
      lineOpacity: 0.15,
      strokeW: 1,
    };
  }
  if (isVoting) {
    return {
      stroke: "#60a5fa",
      fill: "#04090f",
      text: "#60a5fa",
      line: "#60a5fa",
      lineOpacity: 0.8,
      strokeW: 2,
    };
  }
  if (score >= 70) {
    return {
      stroke: "#00ff88",
      fill: "#030d07",
      text: "#00ff88",
      line: "#00ff88",
      lineOpacity: 0.45,
      strokeW: 1.5,
    };
  }
  if (score >= 40) {
    return {
      stroke: "#f5a623",
      fill: "#0c0800",
      text: "#f5a623",
      line: "#f5a623",
      lineOpacity: 0.4,
      strokeW: 1.5,
    };
  }
  return {
    stroke: "#ff3b3b",
    fill: "#0d0303",
    text: "#ff3b3b",
    line: "#ff3b3b",
    lineOpacity: 0.4,
    strokeW: 1.5,
  };
}

export default function GraphPage() {
  const { children, loading, justVotedSet } = useSwarmData();

  const active = children.filter((child) => child.active);
  const allNodes = active;
  const offlineCount = children.filter((child) => !child.active).length;

  const maxRingRadius = Math.min(
    CANVAS_W / 2 - SAFE_SIDE_PADDING,
    PARENT_Y - SAFE_TOP_PADDING,
    CANVAS_H - PARENT_Y - SAFE_BOTTOM_PADDING,
  );

  const nodePositions = allNodes.map((_, index) => {
    const total = allNodes.length || 1;
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    const desiredRadius =
      total <= 5 ? 170 : total <= 8 ? 188 : total <= 12 ? 202 : total <= 16 ? 214 : 224;
    const dist = Math.min(desiredRadius, maxRingRadius);
    return {
      x: PARENT_X + dist * Math.cos(angle),
      y: PARENT_Y + dist * Math.sin(angle),
    };
  });

  const alignedCount = active.filter((child) => Number(child.alignmentScore) >= 70).length;
  const driftingCount = active.filter((child) => {
    const score = Number(child.alignmentScore);
    return score >= 40 && score < 70;
  }).length;
  const misalignedCount = active.filter((child) => Number(child.alignmentScore) < 40).length;
  const votingCount = active.filter((child) => justVotedSet?.has(child.childAddr)).length;

  return (
    <DashboardPageFrame>
      <DashboardHeader
        title="NETWORK_TOPOLOGY"
        subtitle="LIVE NODE GRAPH + REAL-TIME STREAM"
      />

      <DashboardStatStrip
        stats={[
          { label: "ALIGNED", value: loading ? "—" : alignedCount, tone: "green" },
          { label: "DRIFTING", value: loading ? "—" : driftingCount, tone: "amber" },
          { label: "MISALIGNED", value: loading ? "—" : misalignedCount, tone: "red" },
          { label: "VOTING", value: loading ? "—" : votingCount, tone: "blue" },
          { label: "OFFLINE", value: loading ? "—" : offlineCount, tone: "neutral" },
        ]}
      />

      <div className="p-4 space-y-4">
        <DashboardPanel
          title="TOPOLOGY_CANVAS"
          subtitle="Shared-governor topology framed inside the standard dashboard shell."
        >
          <div className="bg-[#070710] overflow-x-auto overflow-y-hidden px-3 py-3">
            {loading ? (
              <div className="flex items-center justify-center h-[620px] min-w-[1040px]">
                <span className="font-mono text-[11px] text-[#4a4f5e] uppercase tracking-widest animate-pulse">
                  LOADING_NODES…
                </span>
              </div>
            ) : (
              <div className="min-w-[1040px]">
                <svg
                  width="100%"
                  height="620"
                  viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                  className="block w-full min-w-[1040px]"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <style>{`
                      @keyframes dash-flow { to { stroke-dashoffset: -20; } }
                      @keyframes dash-vote { to { stroke-dashoffset: -12; } }
                      .flow { animation: dash-flow 3s linear infinite; }
                      .voting { animation: dash-vote 0.6s linear infinite; }
                    `}</style>
                    <pattern id="sp-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,255,136,0.04)" strokeWidth="0.5" />
                    </pattern>
                  </defs>

                  <rect width={CANVAS_W} height={CANVAS_H} fill="#070710" />
                  <rect width={CANVAS_W} height={CANVAS_H} fill="url(#sp-grid)" />

                  {allNodes.map((child, index) => {
                    const pos = nodePositions[index];
                    const score = Number(child.alignmentScore);
                    const isVoting = !!justVotedSet?.has(child.childAddr);
                    const cfg = nodeConfig(score, child.active, isVoting);

                    return (
                      <line
                        key={`line-${child.childAddr}`}
                        x1={PARENT_X}
                        y1={PARENT_Y}
                        x2={pos.x}
                        y2={pos.y}
                        stroke={cfg.line}
                        strokeWidth={isVoting ? 1.5 : child.active ? 1 : 0.6}
                        strokeOpacity={cfg.lineOpacity}
                        strokeDasharray={child.active ? "6 4" : "3 6"}
                        className={isVoting ? "voting" : child.active ? "flow" : ""}
                      />
                    );
                  })}

                  <g>
                    <polygon
                      points={octagonPoints(PARENT_X, PARENT_Y, PARENT_R + 10)}
                      fill="none"
                      stroke="#00ff88"
                      strokeWidth={0.6}
                      strokeOpacity={0.2}
                      strokeDasharray="4 3"
                    />
                    <polygon
                      points={octagonPoints(PARENT_X, PARENT_Y, PARENT_R)}
                      fill="#030d07"
                      stroke="#00ff88"
                      strokeWidth={2}
                    />
                    <polygon
                      points={octagonPoints(PARENT_X, PARENT_Y, PARENT_R - 8)}
                      fill="none"
                      stroke="#00ff88"
                      strokeWidth={0.5}
                      strokeOpacity={0.25}
                    />
                    <text
                      x={PARENT_X}
                      y={PARENT_Y - 8}
                      textAnchor="middle"
                      fill="#00ff88"
                      fontSize={10}
                      fontFamily="monospace"
                      fontWeight="bold"
                      letterSpacing="2"
                    >
                      SPAWN_01
                    </text>
                    <text
                      x={PARENT_X}
                      y={PARENT_Y + 8}
                      textAnchor="middle"
                      fill="#00ff88"
                      fontSize={7.5}
                      fontFamily="monospace"
                      opacity={0.5}
                      letterSpacing="1"
                    >
                      MASTER_NODE
                    </text>
                  </g>

                  {allNodes.map((child, index) => {
                    const pos = nodePositions[index];
                    const score = Number(child.alignmentScore);
                    const isVoting = !!justVotedSet?.has(child.childAddr);
                    const cfg = nodeConfig(score, child.active, isVoting);
                    const label = (
                      ensName(child.ensLabel) ??
                      child.ensLabel?.replace(".spawn.eth", "").replace(".eth", "") ??
                      formatAddress(child.childAddr)
                    ).slice(0, 14);
                    const dao = (governorName(child.governance) ?? formatAddress(child.governance)).slice(0, 10);

                    return (
                      <Link key={child.childAddr} href={`/agent/${child.id.toString()}`}>
                        <g style={{ cursor: "pointer" }} opacity={child.active ? 1 : 0.4}>
                          {isVoting && (
                            <polygon
                              points={octagonPoints(pos.x, pos.y, CHILD_R + 12)}
                              fill="none"
                              stroke="#60a5fa"
                              strokeWidth={0.8}
                              strokeOpacity={0.35}
                              strokeDasharray="4 3"
                              className="voting"
                            />
                          )}

                          <polygon
                            points={octagonPoints(pos.x, pos.y, CHILD_R)}
                            fill={cfg.fill}
                            stroke={cfg.stroke}
                            strokeWidth={cfg.strokeW}
                          />

                          {child.active ? (
                            <text
                              x={pos.x}
                              y={pos.y + 5}
                              textAnchor="middle"
                              fill={cfg.text}
                              fontSize={14}
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {score}
                            </text>
                          ) : (
                            <text
                              x={pos.x}
                              y={pos.y + 6}
                              textAnchor="middle"
                              fill="#4a4f5e"
                              fontSize={16}
                              fontFamily="monospace"
                            >
                              ✕
                            </text>
                          )}

                          <text
                            x={pos.x}
                            y={pos.y - CHILD_R - 10}
                            textAnchor="middle"
                            fill={cfg.text}
                            fontSize={7.5}
                            fontFamily="monospace"
                            fontWeight="bold"
                            opacity={child.active ? 0.95 : 0.4}
                          >
                            {label}
                          </text>

                          <text
                            x={pos.x}
                            y={pos.y + CHILD_R + 16}
                            textAnchor="middle"
                            fill={cfg.text}
                            fontSize={6.5}
                            fontFamily="monospace"
                            opacity={child.active ? 0.6 : 0.3}
                          >
                            {dao}
                          </text>

                          {isVoting && (
                            <>
                              <rect
                                x={pos.x - 24}
                                y={pos.y - CHILD_R - 26}
                                width={48}
                                height={13}
                                fill="#04090f"
                                stroke="#60a5fa"
                                strokeWidth={0.8}
                              />
                              <text
                                x={pos.x}
                                y={pos.y - CHILD_R - 17}
                                textAnchor="middle"
                                fill="#60a5fa"
                                fontSize={7}
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                ⚡ VOTING
                              </text>
                            </>
                          )}
                        </g>
                      </Link>
                    );
                  })}

                  {allNodes.length === 0 && (
                    <>
                      {[0, 1, 2, 3, 4, 5].map((index) => {
                        const angle = (2 * Math.PI * index) / 6 - Math.PI / 2;
                        const x = PARENT_X + Math.min(190, maxRingRadius) * Math.cos(angle);
                        const y = PARENT_Y + Math.min(190, maxRingRadius) * Math.sin(angle);
                        return (
                          <g key={index} opacity={0.1}>
                            <line
                              x1={PARENT_X}
                              y1={PARENT_Y}
                              x2={x}
                              y2={y}
                              stroke="#4a4f5e"
                              strokeWidth={0.8}
                              strokeDasharray="4 5"
                            />
                            <polygon
                              points={octagonPoints(x, y, CHILD_R)}
                              fill="#0d0d14"
                              stroke="#4a4f5e"
                              strokeWidth={0.8}
                            />
                          </g>
                        );
                      })}
                      <text
                        x={PARENT_X}
                        y={PARENT_Y + 290}
                        textAnchor="middle"
                        fill="#4a4f5e"
                        fontSize={11}
                        fontFamily="monospace"
                        letterSpacing="2"
                      >
                        NO_AGENTS_SPAWNED
                      </text>
                    </>
                  )}

                  <g>
                    <rect x={14} y={14} width={132} height={84} fill="#070710" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
                    {[
                      { color: "#00ff88", label: "ALIGNED" },
                      { color: "#f5a623", label: "DRIFTING" },
                      { color: "#ff3b3b", label: "MISALIGNED" },
                      { color: "#60a5fa", label: "VOTING" },
                    ].map(({ color, label }, index) => (
                      <g key={label} transform={`translate(22, ${29 + index * 17})`}>
                        <polygon points={octagonPoints(0, 0, 5)} fill="none" stroke={color} strokeWidth={1.2} />
                        <text x={13} y={4} fill={color} fontSize={8} fontFamily="monospace" opacity={0.9}>
                          {label}
                        </text>
                      </g>
                    ))}
                  </g>

                  <g>
                    <rect x={CANVAS_W - 52} y={14} width={22} height={20} fill="#070710" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
                    <text x={CANVAS_W - 41} y={28} textAnchor="middle" fill="#4a4f5e" fontSize={14} fontFamily="monospace">
                      +
                    </text>
                    <rect x={CANVAS_W - 52} y={38} width={22} height={20} fill="#070710" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
                    <text x={CANVAS_W - 41} y={52} textAnchor="middle" fill="#4a4f5e" fontSize={14} fontFamily="monospace">
                      −
                    </text>
                    <rect x={CANVAS_W - 62} y={62} width={32} height={14} fill="#070710" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
                    <text x={CANVAS_W - 46} y={72} textAnchor="middle" fill="#4a4f5e" fontSize={7} fontFamily="monospace">
                      RESET
                    </text>
                  </g>
                </svg>
              </div>
            )}
          </div>
        </DashboardPanel>

        {active.length > 0 && (
          <DashboardPanel
            title="REAL_TIME_NODE_STREAM"
            right={
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">{active.length} NODES</span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#0a0a0f]">
                    <th className="px-4 py-1.5 text-left font-mono text-[10px] text-[#4a4f5e] uppercase w-10" />
                    <th className="px-4 py-1.5 text-left font-mono text-[10px] text-[#4a4f5e] uppercase">AGENT_ID</th>
                    <th className="px-4 py-1.5 text-left font-mono text-[10px] text-[#4a4f5e] uppercase">DAO_AFFILIATION</th>
                    <th className="px-4 py-1.5 text-right font-mono text-[10px] text-[#4a4f5e] uppercase">ALIGNMENT_SC</th>
                    <th className="px-4 py-1.5 text-right font-mono text-[10px] text-[#4a4f5e] uppercase">VOTES</th>
                    <th className="px-4 py-1.5 text-right font-mono text-[10px] text-[#4a4f5e] uppercase">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((child, index) => {
                    const score = Number(child.alignmentScore);
                    const isVoting = !!justVotedSet?.has(child.childAddr);
                    const scoreColor = isVoting
                      ? "text-blue-400"
                      : score >= 70
                      ? "text-[#00ff88]"
                      : score >= 40
                      ? "text-[#f5a623]"
                      : "text-[#ff3b3b]";
                    const dotColor = isVoting
                      ? "bg-blue-400"
                      : score >= 70
                      ? "bg-[#00ff88]"
                      : score >= 40
                      ? "bg-[#f5a623]"
                      : "bg-[#ff3b3b]";
                    const statusLabel = isVoting
                      ? "VOTING"
                      : score >= 70
                      ? "ALIGNED"
                      : score >= 40
                      ? "DRIFTING"
                      : "MISALIGNED";
                    const label =
                      ensName(child.ensLabel) ??
                      child.ensLabel?.replace(".spawn.eth", "").replace(".eth", "") ??
                      formatAddress(child.childAddr);
                    const dao = governorName(child.governance) ?? formatAddress(child.governance);

                    return (
                      <tr
                        key={child.childAddr}
                        className={`border-b border-white/[0.08] hover:bg-white/[0.02] transition-colors ${
                          index % 2 === 0 ? "bg-[#0a0a0f]" : "bg-[#0d0d14]"
                        } ${isVoting ? "border-l-2 border-l-blue-400" : ""}`}
                      >
                        <td className="px-4 py-1.5">
                          <span className={`w-2 h-2 rounded-full inline-block ${dotColor} ${isVoting ? "animate-pulse" : ""}`} />
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[11px] text-[#00ff88]">
                          <Link href={`/agent/${child.id.toString()}`} className="hover:text-white transition-colors">
                            {label}
                          </Link>
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[11px] text-[#4a4f5e]">{dao}</td>
                        <td className={`px-4 py-1.5 text-right font-mono text-[11px] font-bold ${scoreColor}`}>
                          {score}
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-[11px] text-[#f5f5f0]/60">
                          {child.voteCount.toString()}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <span className={`font-mono text-[9px] uppercase px-2 py-0.5 border ${scoreColor} border-current/30 bg-current/5`}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        )}
      </div>
    </DashboardPageFrame>
  );
}
