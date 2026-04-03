import { NextResponse } from "next/server";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { GOVERNORS } from "@/lib/contracts";
import { buildVoteSummaries, readAgentLogEntries } from "@/lib/agent-log-server";

const CACHE_KEY = "proposals";
const CACHE_TTL = 20_000;
const MAX_PROPOSALS_PER_GOVERNOR = 40;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    // Fetch proposal counts from all governors
    const counts = await Promise.all(
      GOVERNORS.map(async (gov) => {
        try {
          const count = await serverClient.readContract({
            address: gov.address,
            abi: gov.abi,
            functionName: "proposalCount",
          });
          return { gov, count: Number(count) };
        } catch {
          return { gov, count: 0 };
        }
      })
    );

    const logEntries = await readAgentLogEntries().catch(() => []);
    const voteSummaries = buildVoteSummaries(logEntries);

    function getProposalVoters(daoSlug: string, proposalId: string) {
      // Historical log summaries used "<dao>-dao-<proposalId>" for ENS/Lido/Uniswap
      // while the proposals API uses governor slugs like "ens", "lido", and "uniswap".
      // Accept both so proposal cards stay populated across old and new log snapshots.
      return (
        voteSummaries.byProposal.get(`${daoSlug}-${proposalId}`) ||
        voteSummaries.byProposal.get(`${daoSlug}-dao-${proposalId}`) ||
        []
      );
    }

    // Fetch recent proposals from all governors instead of replaying the full archive
    const allProposals: any[] = [];
    await Promise.all(
      counts.map(async ({ gov, count }) => {
        if (count === 0) return;
        const start = Math.max(1, count - MAX_PROPOSALS_PER_GOVERNOR + 1);
        const ids = Array.from({ length: count - start + 1 }, (_, i) => BigInt(start + i));
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const [rawProposal, state] = await Promise.all([
                serverClient.readContract({
                  address: gov.address,
                  abi: gov.abi,
                  functionName: "getProposal",
                  args: [id],
                }),
                serverClient.readContract({
                  address: gov.address,
                  abi: gov.abi,
                  functionName: "state",
                  args: [id],
                }),
              ]);
              const p = rawProposal as any;
              const desc = p.description || "";
              const tallyMatch = desc.match(/\[(.+?)\s*[—–-]\s*Real Governance via Tally\]/);
              return {
                id: p.id.toString(),
                description: desc,
                startTime: p.startTime.toString(),
                endTime: p.endTime.toString(),
                forVotes: p.forVotes.toString(),
                againstVotes: p.againstVotes.toString(),
                abstainVotes: p.abstainVotes.toString(),
                executed: p.executed,
                state: Number(state),
                daoName: gov.name,
                daoSlug: gov.slug,
                governorAddress: gov.address,
                daoColor: gov.color,
                daoBorderColor: gov.borderColor,
                sourceDaoName: tallyMatch ? tallyMatch[1] : null,
                tallySource: !!tallyMatch,
                voters: getProposalVoters(gov.slug, p.id.toString()).map(
                  (vote) => ({
                    childLabel: vote.childLabel,
                    childAddr: "0x0000000000000000000000000000000000000000",
                    support: vote.support,
                  })
                ),
                uid: `${gov.slug}-${p.id.toString()}`,
              };
            } catch {
              return null;
            }
          })
        );
        allProposals.push(...results.filter(Boolean));
      })
    );

    for (const proposal of allProposals) {
      const totalVotes =
        Number(proposal.forVotes) +
        Number(proposal.againstVotes) +
        Number(proposal.abstainVotes);
      if (totalVotes > 0 || proposal.voters.length === 0) {
        continue;
      }

      let forVotes = 0;
      let againstVotes = 0;
      let abstainVotes = 0;
      for (const voter of proposal.voters) {
        if (voter.support === 1) {
          forVotes += 1;
        } else if (voter.support === 0) {
          againstVotes += 1;
        } else {
          abstainVotes += 1;
        }
      }

      proposal.forVotes = String(forVotes);
      proposal.againstVotes = String(againstVotes);
      proposal.abstainVotes = String(abstainVotes);
    }

    // Sort newest first
    allProposals.sort((a, b) => {
      const bTime = BigInt(b.startTime);
      const aTime = BigInt(a.startTime);
      if (bTime > aTime) return 1;
      if (bTime < aTime) return -1;
      return 0;
    });

    setCache(CACHE_KEY, allProposals, CACHE_TTL);
    return NextResponse.json(allProposals);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch proposals" }, { status: 500 });
  }
}
