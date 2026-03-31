import { NextResponse } from "next/server";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { CONTRACTS } from "@/lib/contracts";
import { SpawnFactoryABI, ChildGovernorABI } from "@/lib/abis";

const CACHE_KEY = "swarm";
const CACHE_TTL = 10_000;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const activeRaw = (await serverClient.readContract({
      address: CONTRACTS.SpawnFactory.address as `0x${string}`,
      abi: SpawnFactoryABI,
      functionName: "getActiveChildren",
    })) as any[];

    const activeEnriched = await Promise.all(
      activeRaw.map(async (child) => {
        let alignmentScore = "0", voteCount = "0", lastVoteTimestamp = "0";
        let forVotes = 0, againstVotes = 0, abstainVotes = 0;
        try {
          const [score, cnt, history] = await Promise.all([
            serverClient.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }),
            serverClient.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVoteCount" }),
            serverClient.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVotingHistory" }),
          ]);
          alignmentScore = (score as bigint).toString();
          voteCount = (cnt as bigint).toString();
          if ((history as any[]).length > 0) lastVoteTimestamp = (history as any[])[(history as any[]).length - 1].timestamp.toString();
          for (const v of history as any[]) {
            if (v.support === 1) forVotes++;
            else if (v.support === 0) againstVotes++;
            else abstainVotes++;
          }
        } catch {}
        return {
          id: child.id.toString(),
          childAddr: child.childAddr,
          governance: child.governance,
          budget: child.budget.toString(),
          maxGasPerVote: child.maxGasPerVote.toString(),
          ensLabel: child.ensLabel,
          active: true,
          alignmentScore,
          voteCount,
          lastVoteTimestamp,
          forVotes,
          againstVotes,
          abstainVotes,
        };
      })
    );

    // Terminated children (last 60)
    const totalCount = Number(await serverClient.readContract({
      address: CONTRACTS.SpawnFactory.address as `0x${string}`,
      abi: SpawnFactoryABI,
      functionName: "childCount",
    }));

    const activeIds = new Set(activeRaw.map((c: any) => Number(c.id)));
    const terminatedStart = Math.max(1, totalCount - 60);
    const terminatedIds: number[] = [];
    for (let i = terminatedStart; i <= totalCount; i++) {
      if (!activeIds.has(i)) terminatedIds.push(i);
    }

    const rawTerminated = await Promise.all(
      terminatedIds.map((id) =>
        serverClient.readContract({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          abi: SpawnFactoryABI,
          functionName: "getChild",
          args: [BigInt(id)],
        }).catch(() => null)
      )
    );

    const terminatedEnriched = await Promise.all(
      rawTerminated.filter((c): c is NonNullable<typeof c> => !!c && !activeIds.has(Number((c as any).id))).map(async (child: any) => {
        let alignmentScore = "0", voteCount = "0";
        try {
          const [score, cnt] = await Promise.all([
            serverClient.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "alignmentScore" }),
            serverClient.readContract({ address: child.childAddr, abi: ChildGovernorABI, functionName: "getVoteCount" }),
          ]);
          alignmentScore = (score as bigint).toString();
          voteCount = (cnt as bigint).toString();
        } catch {}
        return {
          id: child.id.toString(),
          childAddr: child.childAddr,
          governance: child.governance,
          budget: child.budget.toString(),
          maxGasPerVote: child.maxGasPerVote.toString(),
          ensLabel: child.ensLabel,
          active: child.active,
          alignmentScore,
          voteCount,
          lastVoteTimestamp: "0",
          forVotes: 0,
          againstVotes: 0,
          abstainVotes: 0,
        };
      })
    );

    const result = [...activeEnriched, ...terminatedEnriched];
    setCache(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch swarm" }, { status: 500 });
  }
}
