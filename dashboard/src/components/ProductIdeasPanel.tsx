const IDEAS = [
  {
    title: "DISAGREEMENT_MODE",
    summary: "Surface where the swarm split and why.",
    explanation:
      "You already track per-agent votes and rationale hashes. Turn that into a dedicated disagreement lens so users can inspect the exact proposals where the swarm fractured instead of only seeing the final tally.",
  },
  {
    title: "PROPOSAL_BRIEFS",
    summary: "Generate a shareable briefing page per proposal.",
    explanation:
      "The proposal feed already has description, vote totals, source attribution, and agent outputs. Package that into a one-click brief meant for DAO contributors, delegates, and researchers who need a clean link to circulate.",
  },
  {
    title: "WATCHLIST_ALERTS",
    summary: "Let users follow a DAO or proposal and get notified on votes, drift, or respawns.",
    explanation:
      "The current runtime already knows when proposals appear, children vote, or alignment drops. A lightweight watchlist layer would turn passive browsing into an ongoing reason to come back.",
  },
  {
    title: "COUNTERFACTUAL_VOTING",
    summary: "Replay the same proposal through alternate philosophies.",
    explanation:
      "You already have perspective prompts and a judge-flow style evaluation loop. Reusing that machinery for counterfactual runs would show how the same proposal lands under conservative, public-goods, treasury-maxi, or custom values.",
  },
  {
    title: "DAO_HEALTH_FEED",
    summary: "Show each onboarded DAO’s active proposals, turnout, and swarm sentiment over time.",
    explanation:
      "The registry, mirror index, and proposal APIs already give you the backbone. A health feed would make the onboarding feature feel like an actual monitoring product instead of a registration demo.",
  },
  {
    title: "PREMIUM_REASONING_LAYER",
    summary: "Gate full rationale history, exportable reports, and deep audit trails.",
    explanation:
      "You already store encrypted rationales, logs, and Filecoin artifacts. Once the interaction loop is stronger, this becomes the natural premium surface for power users, researchers, and DAO teams.",
  },
];

export function ProductIdeasPanel() {
  return (
    <div className="border border-white/[0.08] bg-[#0d0d14]">
      <div className="border-b border-white/[0.08] px-4 py-2.5">
        <div className="font-mono text-[10px] text-[#4a4f5e] uppercase tracking-widest">
          NEXT_LOOPS
        </div>
        <div className="mt-1 text-[11px] text-[#4a4f5e]">
          Near-term product directions that reuse the current swarm, registry, and proposal surfaces.
        </div>
      </div>
      <div className="grid gap-px bg-white/[0.08] md:grid-cols-2">
        {IDEAS.map((idea) => (
          <div key={idea.title} className="bg-[#0a0a0f] px-4 py-4">
            <div className="font-mono text-[11px] text-[#00ff88] uppercase tracking-widest">{idea.title}</div>
            <div className="mt-2 text-sm text-[#f5f5f0]">{idea.summary}</div>
            <div className="mt-2 text-[13px] leading-6 text-[#f5f5f0]/65">{idea.explanation}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
