import type { CSSProperties, ReactNode } from "react";

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

type Stat = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  helper?: ReactNode;
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-[#f5f5f0]",
  green: "text-[#00ff88]",
  amber: "text-[#f5a623]",
  red: "text-[#ff3b3b]",
  blue: "text-blue-400",
};

export function DashboardPageFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-h-screen pb-8 ${className}`.trim()}>{children}</div>;
}

export function DashboardHeader({
  title,
  subtitle,
  status = "LIVE",
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  status?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="border-b border-white/[0.08] px-4 py-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="font-mono text-sm font-bold text-[#f5f5f0] uppercase tracking-widest">
            {title}
          </h1>
          {subtitle ? (
            <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">{subtitle}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {right}
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4a4f5e] uppercase">{status}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardStatStrip({
  stats,
  columns,
}: {
  stats: Stat[];
  columns?: number;
}) {
  const style = {
    gridTemplateColumns: `repeat(${columns ?? stats.length}, minmax(0, 1fr))`,
  } satisfies CSSProperties;

  return (
    <div className="border-b border-white/[0.08] grid" style={style}>
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`${index < stats.length - 1 ? "border-r border-white/[0.08]" : ""} px-6 py-4`}
        >
          <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest mb-1">
            {stat.label}
          </div>
          <div className={`font-mono text-3xl font-bold leading-none ${TONE_CLASS[stat.tone ?? "neutral"]}`}>
            {stat.value}
          </div>
          {stat.helper ? (
            <div className="mt-1 font-mono text-[10px] text-[#4a4f5e] uppercase">{stat.helper}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DashboardPanel({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-white/[0.08] bg-[#0d0d14] ${className}`.trim()}>
      {(title || right) && (
        <div className="border-b border-white/[0.08] px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
                {title}
              </div>
            ) : null}
            {subtitle ? <div className="mt-1 text-[11px] text-[#4a4f5e]">{subtitle}</div> : null}
          </div>
          {right ? <div className="flex items-center gap-2 flex-shrink-0">{right}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
