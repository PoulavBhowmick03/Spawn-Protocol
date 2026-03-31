import { NextResponse } from "next/server";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { GOVERNORS, CONTRACTS } from "@/lib/contracts";
import { SpawnFactoryABI, ChildGovernorABI } from "@/lib/abis";

const CACHE_KEY = "proposals";
const CACHE_TTL = 10_000; // 10s cache

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

    // Fetch all proposals from all governors
    const allProposals: any[] = [];
    await Promise.all(
      counts.map(async ({ gov, count }) => {
        if (count === 0) return;
        const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
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
                voters: [] as any[],
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

    // Fetch child vote histories
    try {
      const rawChildren = await serverClient.readContract({
        address: CONTRACTS.SpawnFactory.address as `0x${string}`,
        abi: SpawnFactoryABI,
        functionName: "getActiveChildren",
      });

      const proposalMap = new Map<string, any>();
      for (const p of allProposals) {
        p.voters = [];
        proposalMap.set(`${p.governorAddress.toLowerCase()}-${p.id}`, p);
      }

      const childHistories = await Promise.all(
        (rawChildren as any[]).map(async (child) => {
          try {
            const history = await serverClient.readContract({
              address: child.childAddr,
              abi: ChildGovernorABI,
              functionName: "getVotingHistory",
            });
            return { child, history };
          } catch {
            return { child, history: [] as any[] };
          }
        })
      );

      for (const { child, history } of childHistories) {
        const govAddr = child.governance.toLowerCase();
        for (const vote of history as any[]) {
          const matching = proposalMap.get(`${govAddr}-${vote.proposalId.toString()}`);
          if (matching) {
            matching.voters.push({
              childLabel: child.ensLabel || "unknown",
              childAddr: child.childAddr,
              support: vote.support,
            });
          }
        }
      }
    } catch {}

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
