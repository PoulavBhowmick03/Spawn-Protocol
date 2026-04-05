"use client";

interface AlignmentBadgeProps {
  score: bigint | number;
  size?: "sm" | "md" | "lg";
}

export function AlignmentBadge({ score, size = "md" }: AlignmentBadgeProps) {
  const value = Number(score);

  const bgColor =
    value >= 70
      ? "bg-[#00ff88] text-black"
      : value >= 40
      ? "bg-[#f5a623] text-black"
      : "bg-[#ff3b3b] text-white";

  const sizeClass =
    size === "sm"
      ? "text-[10px] px-1.5 py-0.5"
      : size === "lg"
      ? "text-sm px-3 py-1"
      : "text-[11px] px-2 py-0.5";

  const label =
    value >= 70 ? "ALIGNED" : value >= 40 ? "DRIFTING" : "MISALIGNED";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-bold ${bgColor} ${sizeClass} uppercase tracking-wider`}
    >
      <span>{value}</span>
      <span className="opacity-70 font-normal">{label}</span>
    </span>
  );
}
