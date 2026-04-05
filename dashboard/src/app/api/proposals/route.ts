import { NextResponse } from "next/server";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { CONTRACTS, GOVERNORS } from "@/lib/contracts";
import { SpawnFactoryABI } from "@/lib/abis";
import { buildVoteSummaries, readAgentLogEntries } from "@/lib/agent-log-server";
import {
  buildMirrorLookup,
  getMirrorLookupKey,
  normalizeDaoSlug,
  readRegisteredDAOs,
} from "@/lib/dao-onboarding-server";

const CACHE_TTL = 20_000;
const MAX_PROPOSALS_PER_GOVERNOR = 40;
const CHILD_LOOKBACK = 60;

export const dynamic = "force-dynamic";

type ChildLookupEntry = {
  id: string;
  childAddr: `0x${string}`;
};

function parseLegacySource(desc: string): {
  sourceDaoName: string | null;
  sourceType: "tally" | "snapshot" | "boardroom" | "polymarket" | null;
} {
  const tallyMatch = desc.match(/\[(.+?)\s*[—–-]\s*Real Governance via Tally\]/);
  if (tallyMatch) {
    return { sourceDaoName: tallyMatch[1], sourceType: "tally" };
  }

  const snapshotMatch = desc.match(/\[(.+?)\s*[—–-]\s*Snapshot Governance\]/);
  if (snapshotMatch) {
    return { sourceDaoName: snapshotMatch[1], sourceType: "snapshot" };
  }

  const boardroomMatch = desc.match(/\[(.+?)\s*[—–-]\s*Real Governance via Boardroom\]/);
  if (boardroomMatch) {
    return { sourceDaoName: boardroomMatch[1], sourceType: "boardroom" };
  }

  const polymarketMatch = desc.match(/\[(.+?)\s*[—–-]\s*Prediction Market via Polymarket\]/);
  if (polymarketMatch) {
    return { sourceDaoName: polymarketMatch[1], sourceType: "polymarket" };
  }

  return { sourceDaoName: null, sourceType: null };
}

async function buildChildLookup(): Promise<Map<string, ChildLookupEntry>> {
  const lookup = new Map<string, ChildLookupEntry>();
  const activeChildren = (await serverClient.readContract({
    address: CONTRACTS.SpawnFactory.address as `0x${string}`,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  }).catch(() => [])) as any[];

  for (const child of activeChildren) {
    lookup.set(child.ensLabel.toLowerCase(), {
      id: String(child.id),
      childAddr: child.childAddr,
    });
  }

    const totalCount = Number(
      await serverClient
        .readContract({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          abi: SpawnFactoryABI,
          functionName: "childCount",
        })
        .catch(() => BigInt(0))
    );

  const start = Math.max(1, totalCount - CHILD_LOOKBACK);
  const ids = Array.from({ length: Math.max(0, totalCount - start + 1) }, (_, i) => BigInt(start + i));
  const recentChildren = await Promise.all(
    ids.map((id) =>
      serverClient
        .readContract({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          abi: SpawnFactoryABI,
          functionName: "getChild",
          args: [id],
        })
        .catch(() => null)
    )
  );

  for (const child of recentChildren) {
    if (!child) continue;
    lookup.set(String(child.ensLabel).toLowerCase(), {
      id: String(child.id),
      childAddr: child.childAddr,
    });
  }

  return lookup;
}

function getProposalVoters(
  proposalKey: string,
  voteSummaries: ReturnType<typeof buildVoteSummaries>["byProposal"],
  childLookup: Map<string, ChildLookupEntry>
) {
  return (voteSummaries.get(proposalKey) || []).map((vote) => {
    const child = childLookup.get(vote.childLabel.toLowerCase());
    return {
      childLabel: vote.childLabel,
      childId: child?.id ?? null,
      childAddr: child?.childAddr ?? "0x0000000000000000000000000000000000000000",
      support: vote.support,
      txHash: vote.txHash,
      timestamp: vote.timestamp,
    };
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const daoSlugFilter = url.searchParams.get("daoSlug");
    const normalizedFilter = daoSlugFilter ? normalizeDaoSlug(daoSlugFilter) : "";
    const cacheKey = normalizedFilter ? `proposals:${normalizedFilter}` : "proposals:all";
    const cached = getCached<any>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const [counts, logEntries, childLookup] = await Promise.all([
      Promise.all(
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
      ),
      readAgentLogEntries().catch(() => []),
      buildChildLookup(),
    ]);

    const voteSummaries = buildVoteSummaries(logEntries);
    const registeredDaos = readRegisteredDAOs();
    const registeredDaosBySlug = new Map(registeredDaos.map((dao) => [dao.slug, dao]));
    const registeredDaosBySourceRef = new Map<string, (typeof registeredDaos)[number]>(
      registeredDaos.map((dao) => [`${dao.source}:${dao.sourceRef}`, dao] as const)
    );
    const mirrorLookup = buildMirrorLookup();

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
              const mirror = mirrorLookup.get(getMirrorLookupKey(gov.address, p.id.toString()));
              const mirrorRegistrationKey =
                mirror &&
                mirror.sourceRef &&
                (mirror.source === "tally" || mirror.source === "snapshot")
                  ? `${mirror.source}:${mirror.sourceRef}`
                  : null;
              const matchedRegisteredDao =
                (mirror?.sourceDaoSlug
                  ? registeredDaosBySlug.get(mirror.sourceDaoSlug)
                  : undefined) ||
                (mirrorRegistrationKey
                  ? registeredDaosBySourceRef.get(mirrorRegistrationKey)
                  : undefined);
              if (normalizedFilter) {
                const effectiveDaoSlug = matchedRegisteredDao?.slug ?? mirror?.sourceDaoSlug;
                if (!effectiveDaoSlug || effectiveDaoSlug !== normalizedFilter) {
                  return null;
                }
              }

              const legacySource = parseLegacySource(p.description || "");
              const sourceDaoName =
                matchedRegisteredDao?.name ?? mirror?.sourceDaoName ?? legacySource.sourceDaoName;
              const sourceType =
                matchedRegisteredDao?.source ??
                (mirror?.source as typeof legacySource.sourceType) ??
                legacySource.sourceType;
              const proposalKey = mirror?.externalProposalKey || `${gov.slug}-${p.id.toString()}`;
              const voters = getProposalVoters(proposalKey, voteSummaries.byProposal, childLookup);

              return {
                id: p.id.toString(),
                description: p.description || "",
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
                sourceDaoId: matchedRegisteredDao?.id ?? mirror?.sourceDaoId ?? null,
                sourceDaoSlug: matchedRegisteredDao?.slug ?? mirror?.sourceDaoSlug ?? null,
                sourceDaoName,
                sourceType,
                sourceRef: matchedRegisteredDao?.sourceRef ?? mirror?.sourceRef ?? null,
                mirroredAt: mirror?.mirroredAt ?? null,
                tallySource: sourceType === "tally",
                voters,
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
        if (voter.support === 1) forVotes += 1;
        else if (voter.support === 0) againstVotes += 1;
        else abstainVotes += 1;
      }

      proposal.forVotes = String(forVotes);
      proposal.againstVotes = String(againstVotes);
      proposal.abstainVotes = String(abstainVotes);
    }

    allProposals.sort((a, b) => {
      const bTime = BigInt(b.startTime);
      const aTime = BigInt(a.startTime);
      if (bTime > aTime) return 1;
      if (bTime < aTime) return -1;
      return 0;
    });

    setCache(cacheKey, allProposals, CACHE_TTL);
    return NextResponse.json(allProposals);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch proposals" },
      { status: 500 }
    );
  }
}
