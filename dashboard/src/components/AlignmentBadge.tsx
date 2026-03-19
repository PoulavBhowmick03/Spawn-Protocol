"use client";

interface AlignmentBadgeProps {
  score: bigint | number;
  size?: "sm" | "md" | "lg";
}

export function AlignmentBadge({ score, size = "md" }: AlignmentBadgeProps) {
  const value = Number(score);

  const color =
    value >= 70
      ? "text-green-400 border-green-400 bg-green-400/10"
      : value >= 40
      ? "text-yellow-400 border-yellow-400 bg-yellow-400/10"
      : "text-red-400 border-red-400 bg-red-400/10";

  const sizeClass =
    size === "sm"
      ? "text-xs px-1.5 py-0.5"
      : size === "lg"
      ? "text-lg px-3 py-1"
      : "text-sm px-2 py-0.5";

  const label =
    value >= 70 ? "Aligned" : value >= 40 ? "Drifting" : "Misaligned";

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded font-mono font-bold ${color} ${sizeClass}`}
    >
      <span>{value}</span>
      <span className="opacity-70 font-normal text-xs">{label}</span>
    </span>
  );
}
