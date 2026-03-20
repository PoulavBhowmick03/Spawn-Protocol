"use client";

import { useSwarmData } from "@/hooks/useSwarmData";
import { formatAddress, governorName } from "@/lib/contracts";
import Link from "next/link";

const CANVAS_W = 960;
const CANVAS_H = 600;
const PARENT_X = CANVAS_W / 2;
const PARENT_Y = 110;
const PARENT_R = 52;
const CHILD_R = 38;
const CHILD_Y = 400;

function alignColor(score: number, active: boolean) {
  if (!active) return { fill: "#0f0f1a", stroke: "#2d3748", text: "#4b5563", glow: "none" };
  if (score >= 70) return { fill: "#071a10", stroke: "#22c55e", text: "#4ade80", glow: "url(#glow-green)" };
  if (score >= 40) return { fill: "#1c1207", stroke: "#eab308", text: "#facc15", glow: "url(#glow-yellow)" };
  return { fill: "#1a0808", stroke: "#ef4444", text: "#f87171", glow: "url(#glow-red)" };
}

// Cubic bezier path from parent bottom to child top
function bezierPath(x1: number, y1: number, x2: number, y2: number) {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export default function GraphPage() {
  const { children, loading, justVotedSet } = useSwarmData();

  const active = children.filter((c) => c.active);
  const allNodes = active; // only show active agents

  const childPositions = allNodes.map((_, i) => {
    const total = allNodes.length || 1;
    const spacing = Math.min(160, (CANVAS_W - 160) / total);
    const startX = CANVAS_W / 2 - ((total - 1) * spacing) / 2;
    // Slight vertical stagger for visual rhythm
    const stagger = total > 1 ? (i % 2 === 0 ? 0 : 18) : 0;
    return { x: startX + i * spacing, y: CHILD_Y + stagger };
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-green-400 tracking-tight">Agent Graph</h1>
          <p className="text-sm text-gray-500 mt-1">Parent-child swarm topology — live from onchain</p>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            {active.length} active
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="border border-gray-800 rounded-xl bg-[#07070f] overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          </div>
        ) : (
          <svg
            width="100%"
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            className="w-full"
            style={{ maxHeight: 600 }}
          >
            <defs>
              {/* Glows */}
              <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-parent" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              {/* Line gradients */}
              <linearGradient id="line-grad-green" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="line-grad-blue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="line-grad-gray" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#374151" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#374151" stopOpacity="0.1" />
              </linearGradient>
              {/* Radial bg glow behind parent */}
              <radialGradient id="bg-glow" cx="50%" cy="18%" r="30%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
              </radialGradient>

              <style>{`
                @keyframes dash { to { stroke-dashoffset: -20; } }
                @keyframes dashFast { to { stroke-dashoffset: -16; } }
                @keyframes pulse-ring { 0%,100% { opacity:0.2; r:${PARENT_R + 10}; } 50% { opacity:0.5; r:${PARENT_R + 18}; } }
                @keyframes pulse-child { 0%,100% { opacity:0.15; } 50% { opacity:0.4; } }
                @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
                .flow-line { animation: dash 2s linear infinite; }
                .flow-line-fast { animation: dashFast 0.8s linear infinite; }
                .pulse-ring { animation: pulse-child 2.5s ease-in-out infinite; }
                .parent-float { animation: float 4s ease-in-out infinite; }
              `}</style>
            </defs>

            {/* Dot grid background */}
            <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="#1a1a2e" />
            </pattern>
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#dots)" />
            {/* Radial glow around parent area */}
            <rect width={CANVAS_W} height={CANVAS_H} fill="url(#bg-glow)" />

            {/* Bezier connection lines */}
            {allNodes.map((child, i) => {
              const pos = childPositions[i];
              const isVoting = justVotedSet?.has(child.childAddr);
              const grad = isVoting ? "url(#line-grad-blue)" : child.active ? "url(#line-grad-green)" : "url(#line-grad-gray)";
              const path = bezierPath(PARENT_X, PARENT_Y + PARENT_R, pos.x, pos.y - CHILD_R);
              return (
                <path
                  key={`line-${child.childAddr}`}
                  d={path}
                  fill="none"
                  stroke={grad}
                  strokeWidth={isVoting ? 2 : 1.2}
                  strokeDasharray={isVoting ? "5 3" : "6 5"}
                  className={isVoting ? "flow-line-fast" : "flow-line"}
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              );
            })}

            {/* ───── PARENT NODE ───── */}
            <g className="parent-float">
              {/* Outer pulse rings */}
              <circle cx={PARENT_X} cy={PARENT_Y} r={PARENT_R + 22} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={0.12} className="pulse-ring" />
              <circle cx={PARENT_X} cy={PARENT_Y} r={PARENT_R + 12} fill="none" stroke="#22c55e" strokeWidth={0.8} opacity={0.2} className="pulse-ring" style={{ animationDelay: "0.6s" }} />
              {/* Main fill */}
              <circle cx={PARENT_X} cy={PARENT_Y} r={PARENT_R} fill="#050f09" stroke="#22c55e" strokeWidth={2} filter="url(#glow-parent)" />
              {/* Inner ring */}
              <circle cx={PARENT_X} cy={PARENT_Y} r={PARENT_R - 8} fill="none" stroke="#22c55e" strokeWidth={0.5} opacity={0.3} />
              {/* Labels */}
              <text x={PARENT_X} y={PARENT_Y - 10} textAnchor="middle" fill="#4ade80" fontSize={11} fontFamily="monospace" fontWeight="bold" letterSpacing="2">SPAWN</text>
              <text x={PARENT_X} y={PARENT_Y + 5} textAnchor="middle" fill="#4ade80" fontSize={11} fontFamily="monospace" fontWeight="bold" letterSpacing="2">PARENT</text>
              <text x={PARENT_X} y={PARENT_Y + 20} textAnchor="middle" fill="#166534" fontSize={8} fontFamily="monospace" letterSpacing="1">venice ai</text>
            </g>

            {/* ───── CHILD NODES ───── */}
            {allNodes.map((child, i) => {
              const pos = childPositions[i];
              const score = Number(child.alignmentScore);
              const colors = alignColor(score, child.active);
              const isVoting = justVotedSet?.has(child.childAddr);
              const label = child.ensLabel && child.ensLabel !== ""
                ? child.ensLabel.replace(".spawn.eth", "").replace(".eth", "")
                : formatAddress(child.childAddr);
              const dao = governorName(child.governance) ?? formatAddress(child.governance);
              const votes = Number(child.voteCount);

              return (
                <Link key={child.childAddr} href={`/agent/${child.id.toString()}`}>
                  <g style={{ cursor: "pointer" }}>
                    {/* Voting pulse ring */}
                    {isVoting && (
                      <circle cx={pos.x} cy={pos.y} r={CHILD_R + 16}
                        fill="none" stroke="#60a5fa" strokeWidth={1.5} opacity={0.5}
                        className="pulse-ring" filter="url(#glow-blue)"
                      />
                    )}
                    {/* Active outer ring */}
                    {child.active && !isVoting && (
                      <circle cx={pos.x} cy={pos.y} r={CHILD_R + 10}
                        fill="none" stroke={colors.stroke} strokeWidth={0.8} opacity={0.2}
                        className="pulse-ring" style={{ animationDelay: `${i * 0.3}s` }}
                      />
                    )}
                    {/* Main circle */}
                    <circle
                      cx={pos.x} cy={pos.y} r={CHILD_R}
                      fill={colors.fill}
                      stroke={isVoting ? "#60a5fa" : colors.stroke}
                      strokeWidth={isVoting ? 2.5 : 1.5}
                      opacity={child.active ? 1 : 0.45}
                      filter={child.active ? colors.glow : "none"}
                    />
                    {/* Inner ring decoration */}
                    <circle cx={pos.x} cy={pos.y} r={CHILD_R - 6}
                      fill="none" stroke={colors.stroke} strokeWidth={0.4}
                      opacity={child.active ? 0.25 : 0.1}
                    />

                    {/* Score or terminated mark */}
                    {child.active ? (
                      <text x={pos.x} y={pos.y + 5} textAnchor="middle"
                        fill={colors.text} fontSize={16} fontFamily="monospace" fontWeight="bold"
                        opacity={1}
                      >
                        {score}
                      </text>
                    ) : (
                      <text x={pos.x} y={pos.y + 6} textAnchor="middle"
                        fill="#4b5563" fontSize={18} fontFamily="monospace"
                      >✕</text>
                    )}

                    {/* ENS label — above node */}
                    <text x={pos.x} y={pos.y - CHILD_R - 10} textAnchor="middle"
                      fill={child.active ? colors.text : "#4b5563"}
                      fontSize={9} fontFamily="monospace" fontWeight="bold"
                      opacity={child.active ? 0.95 : 0.5}
                    >
                      {label.length > 14 ? label.slice(0, 14) + "…" : label}
                    </text>

                    {/* DAO chip — below node */}
                    <rect
                      x={pos.x - 30} y={pos.y + CHILD_R + 6}
                      width={60} height={14} rx={3}
                      fill={child.active ? colors.fill : "#0f0f1a"}
                      stroke={child.active ? colors.stroke : "#2d3748"}
                      strokeWidth={0.6} opacity={child.active ? 0.8 : 0.4}
                    />
                    <text x={pos.x} y={pos.y + CHILD_R + 16} textAnchor="middle"
                      fill={child.active ? colors.text : "#4b5563"}
                      fontSize={7} fontFamily="monospace"
                      opacity={child.active ? 0.85 : 0.4}
                    >
                      {dao.length > 10 ? dao.slice(0, 10) + "…" : dao}
                    </text>

                    {/* Vote count — below DAO chip */}
                    <text x={pos.x} y={pos.y + CHILD_R + 32} textAnchor="middle"
                      fill="#4b5563" fontSize={7} fontFamily="monospace"
                    >
                      {child.active
                        ? votes > 0 ? `${votes} vote${votes !== 1 ? "s" : ""}` : "no votes"
                        : "terminated"}
                    </text>

                    {/* Voting badge */}
                    {isVoting && (
                      <>
                        <rect x={pos.x - 20} y={pos.y - CHILD_R - 30} width={40} height={14} rx={4}
                          fill="#1e3a5f" stroke="#60a5fa" strokeWidth={0.8}
                        />
                        <text x={pos.x} y={pos.y - CHILD_R - 20} textAnchor="middle"
                          fill="#60a5fa" fontSize={7} fontFamily="monospace" fontWeight="bold"
                        >
                          ⚡ VOTING
                        </text>
                      </>
                    )}
                  </g>
                </Link>
              );
            })}

            {/* ───── EMPTY STATE ───── */}
            {allNodes.length === 0 && (
              <>
                {[0, 1, 2].map((i) => {
                  const spacing = 200;
                  const startX = CANVAS_W / 2 - spacing;
                  const x = startX + i * spacing;
                  const path = bezierPath(PARENT_X, PARENT_Y + PARENT_R, x, CHILD_Y - CHILD_R);
                  return (
                    <g key={i} opacity={0.18}>
                      <path d={path} fill="none" stroke="#374151" strokeWidth={1} strokeDasharray="5 5" />
                      <circle cx={x} cy={CHILD_Y} r={CHILD_R} fill="#0d0d14" stroke="#374151" strokeWidth={1} />
                      <text x={x} y={CHILD_Y + 5} textAnchor="middle" fill="#374151" fontSize={8} fontFamily="monospace">waiting</text>
                    </g>
                  );
                })}
                <text x={CANVAS_W / 2} y={CHILD_Y + 90} textAnchor="middle" fill="#2d3748" fontSize={13} fontFamily="monospace">
                  No agents spawned yet
                </text>
              </>
            )}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 mt-5 text-xs font-mono text-gray-500 px-1">
        {[
          { color: "bg-green-400", label: "Alignment ≥ 70" },
          { color: "bg-yellow-400", label: "Alignment 40–69" },
          { color: "bg-red-400", label: "Alignment < 40" },
          { color: "bg-blue-400", label: "Currently voting" },
          { color: "bg-gray-600", label: "Terminated" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${item.color}`} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
