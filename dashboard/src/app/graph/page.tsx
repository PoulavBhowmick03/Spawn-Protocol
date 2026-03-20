"use client";

import { useSwarmData } from "@/hooks/useSwarmData";
import { formatAddress } from "@/lib/contracts";
import Link from "next/link";

const CANVAS_W = 900;
const CANVAS_H = 520;
const PARENT_X = CANVAS_W / 2;
const PARENT_Y = 90;
const PARENT_R = 44;
const CHILD_R = 32;
const CHILD_Y = 340;

function alignColor(score: number, active: boolean) {
  if (!active) return { fill: "#1a1a2e", stroke: "#374151", text: "#6b7280" };
  if (score >= 70) return { fill: "#052e16", stroke: "#22c55e", text: "#4ade80" };
  if (score >= 40) return { fill: "#422006", stroke: "#eab308", text: "#facc15" };
  return { fill: "#2d0a0a", stroke: "#ef4444", text: "#f87171" };
}

export default function GraphPage() {
  const { children, loading, justVotedSet } = useSwarmData();

  const active = children.filter((c) => c.active);
  const terminated = children.filter((c) => !c.active);
  const allNodes = [...active, ...terminated];

  // Position child nodes evenly across the canvas
  const childPositions = allNodes.map((child, i) => {
    const total = allNodes.length || 1;
    const spacing = Math.min(140, (CANVAS_W - 120) / total);
    const startX = CANVAS_W / 2 - ((total - 1) * spacing) / 2;
    return { x: startX + i * spacing, y: CHILD_Y };
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-green-400 tracking-tight">Agent Graph</h1>
          <p className="text-sm text-gray-500 mt-1">Parent-child swarm topology — live from onchain</p>
        </div>
        <div className="text-xs font-mono text-gray-600">
          {active.length} active · {terminated.length} terminated
        </div>
      </div>

      <div className="border border-gray-800 rounded-xl bg-[#0a0a0f] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          </div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="w-full"
            style={{ maxHeight: 520 }}
          >
            <defs>
              <filter id="glow-green">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-blue">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <style>{`
                @keyframes dash { to { stroke-dashoffset: -24; } }
                @keyframes nodeGlow { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
                .flow-line { animation: dash 1.2s linear infinite; }
                .node-pulse { animation: nodeGlow 2s ease-in-out infinite; }
              `}</style>
            </defs>

            {/* Connection lines */}
            {allNodes.map((child, i) => {
              const pos = childPositions[i];
              const isVoting = justVotedSet?.has(child.childAddr);
              return (
                <line
                  key={`line-${child.childAddr}`}
                  x1={PARENT_X} y1={PARENT_Y + PARENT_R}
                  x2={pos.x} y2={pos.y - CHILD_R}
                  stroke={isVoting ? "#60a5fa" : child.active ? "#1f4a2e" : "#1f2937"}
                  strokeWidth={isVoting ? 2 : 1}
                  strokeDasharray="6 4"
                  className="flow-line"
                  style={{ animationDuration: `${1.2 + i * 0.15}s` }}
                />
              );
            })}

            {/* Parent node */}
            <circle
              cx={PARENT_X} cy={PARENT_Y} r={PARENT_R + 6}
              fill="none" stroke="#22c55e" strokeWidth={1} opacity={0.2}
              className="node-pulse"
            />
            <circle
              cx={PARENT_X} cy={PARENT_Y} r={PARENT_R}
              fill="#052e16" stroke="#22c55e" strokeWidth={2}
              filter="url(#glow-green)"
            />
            <text x={PARENT_X} y={PARENT_Y - 6} textAnchor="middle" fill="#4ade80" fontSize={9} fontFamily="monospace" fontWeight="bold">
              SPAWN
            </text>
            <text x={PARENT_X} y={PARENT_Y + 6} textAnchor="middle" fill="#4ade80" fontSize={9} fontFamily="monospace" fontWeight="bold">
              PARENT
            </text>
            <text x={PARENT_X} y={PARENT_Y + 18} textAnchor="middle" fill="#166534" fontSize={7} fontFamily="monospace">
              Venice AI
            </text>

            {/* Child nodes */}
            {allNodes.map((child, i) => {
              const pos = childPositions[i];
              const score = Number(child.alignmentScore);
              const colors = alignColor(score, child.active);
              const isVoting = justVotedSet?.has(child.childAddr);
              const label = child.ensLabel && child.ensLabel !== "" ? child.ensLabel : formatAddress(child.childAddr);

              return (
                <Link key={child.childAddr} href={`/agent/${child.id.toString()}`}>
                  <g style={{ cursor: "pointer" }}>
                    {/* Voting pulse ring */}
                    {isVoting && (
                      <circle
                        cx={pos.x} cy={pos.y} r={CHILD_R + 12}
                        fill="none" stroke="#60a5fa" strokeWidth={2} opacity={0.6}
                        className="node-pulse"
                        filter="url(#glow-blue)"
                      />
                    )}
                    {/* Active pulse ring */}
                    {child.active && !isVoting && (
                      <circle
                        cx={pos.x} cy={pos.y} r={CHILD_R + 8}
                        fill="none" stroke={colors.stroke} strokeWidth={1} opacity={0.3}
                        className="node-pulse"
                      />
                    )}
                    {/* Main circle */}
                    <circle
                      cx={pos.x} cy={pos.y} r={CHILD_R}
                      fill={colors.fill} stroke={isVoting ? "#60a5fa" : colors.stroke}
                      strokeWidth={isVoting ? 2.5 : 1.5}
                      opacity={child.active ? 1 : 0.4}
                    />
                    {/* ENS label */}
                    <text x={pos.x} y={pos.y - 6} textAnchor="middle" fill={colors.text} fontSize={7.5} fontFamily="monospace" fontWeight="bold">
                      {label.slice(0, 12)}
                    </text>
                    {/* Alignment score */}
                    <text x={pos.x} y={pos.y + 6} textAnchor="middle" fill={colors.text} fontSize={10} fontFamily="monospace" fontWeight="bold">
                      {child.active ? score : "✕"}
                    </text>
                    <text x={pos.x} y={pos.y + 18} textAnchor="middle" fill={colors.stroke} fontSize={6.5} fontFamily="monospace" opacity={0.7}>
                      {child.active ? (Number(child.voteCount) > 0 ? `${child.voteCount} votes` : "no votes") : "terminated"}
                    </text>
                    {/* Bottom label */}
                    <text x={pos.x} y={pos.y + CHILD_R + 16} textAnchor="middle" fill="#4b5563" fontSize={7} fontFamily="monospace">
                      {formatAddress(child.childAddr)}
                    </text>
                  </g>
                </Link>
              );
            })}

            {/* Empty state */}
            {allNodes.length === 0 && (
              <>
                {[1, 2, 3].map((i) => {
                  const total = 3;
                  const spacing = 180;
                  const startX = CANVAS_W / 2 - ((total - 1) * spacing) / 2;
                  const x = startX + (i - 1) * spacing;
                  return (
                    <g key={i} opacity={0.2}>
                      <line x1={PARENT_X} y1={PARENT_Y + PARENT_R} x2={x} y2={CHILD_Y - CHILD_R}
                        stroke="#374151" strokeWidth={1} strokeDasharray="4 4" />
                      <circle cx={x} cy={CHILD_Y} r={CHILD_R} fill="#0d0d14" stroke="#374151" strokeWidth={1} />
                      <text x={x} y={CHILD_Y + 4} textAnchor="middle" fill="#374151" fontSize={8} fontFamily="monospace">waiting</text>
                    </g>
                  );
                })}
                <text x={CANVAS_W / 2} y={CHILD_Y + 80} textAnchor="middle" fill="#374151" fontSize={12} fontFamily="monospace">
                  No agents spawned yet
                </text>
              </>
            )}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-4 text-xs font-mono text-gray-500">
        {[
          { color: "bg-green-400", label: "Alignment >= 70" },
          { color: "bg-yellow-400", label: "Alignment 40-70" },
          { color: "bg-red-400", label: "Alignment < 40" },
          { color: "bg-blue-400", label: "Currently voting" },
          { color: "bg-gray-600", label: "Terminated" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${item.color}`} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
