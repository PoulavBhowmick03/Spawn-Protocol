import { NextResponse } from "next/server";
import { serverClient, getCached, setCache } from "@/lib/server-client";
import { CONTRACTS, GOVERNORS } from "@/lib/contracts";
import { SpawnFactoryABI } from "@/lib/abis";
import type { Address } from "viem";

const CACHE_KEY = "timeline";
const CACHE_TTL = 10_000;

const DEPLOY_BLOCK = BigInt(39086990);
const CHUNK = BigInt(10000);
const MOCK_GOVERNOR_ADDRS = GOVERNORS.map((g) => g.address) as Address[];

export const dynamic = "force-dynamic";

async function getLogsInRange(params: any, from: bigint, to: bigint) {
  const chunks: Array<[bigint, bigint]> = [];
  let start = from;
  while (start <= to) {
    const end = start + CHUNK - BigInt(1) < to ? start + CHUNK - BigInt(1) : to;
    chunks.push([start, end]);
    start = end + BigInt(1);
  }
  const results = await Promise.all(
    chunks.map(([f, t]) => serverClient.getLogs({ ...params, fromBlock: f, toBlock: t }))
  );
  return results.flat();
}

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const currentBlock = await serverClient.getBlockNumber();

    // Fetch all child addresses first
    let childAddresses: Set<string>;
    try {
      const children = (await serverClient.readContract({
        address: CONTRACTS.SpawnFactory.address as `0x${string}`,
        abi: SpawnFactoryABI,
        functionName: "getActiveChildren",
      })) as any[];
      childAddresses = new Set(children.map((c: any) => (c.childAddr as string).toLowerCase()));
    } catch {
      childAddresses = new Set();
    }

    const [spawnedLogs, terminatedLogs, reallocatedLogs, valuesLogs, depositLogs] =
      await Promise.all([
        getLogsInRange({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          event: { type: "event", name: "ChildSpawned", inputs: [
            { name: "childId", type: "uint256", indexed: true },
            { name: "childAddr", type: "address", indexed: false },
            { name: "governance", type: "address", indexed: false },
            { name: "budget", type: "uint256", indexed: false },
          ]},
        }, DEPLOY_BLOCK, currentBlock),
        getLogsInRange({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          event: { type: "event", name: "ChildTerminated", inputs: [
            { name: "childId", type: "uint256", indexed: true },
            { name: "childAddr", type: "address", indexed: false },
            { name: "fundsReturned", type: "uint256", indexed: false },
          ]},
        }, DEPLOY_BLOCK, currentBlock),
        getLogsInRange({
          address: CONTRACTS.SpawnFactory.address as `0x${string}`,
          event: { type: "event", name: "FundsReallocated", inputs: [
            { name: "fromId", type: "uint256", indexed: true },
            { name: "toId", type: "uint256", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ]},
        }, DEPLOY_BLOCK, currentBlock),
        getLogsInRange({
          address: CONTRACTS.ParentTreasury.address as `0x${string}`,
          event: { type: "event", name: "ValuesUpdated", inputs: [
            { name: "values", type: "string", indexed: false },
          ]},
        }, DEPLOY_BLOCK, currentBlock),
        getLogsInRange({
          address: CONTRACTS.ParentTreasury.address as `0x${string}`,
          event: { type: "event", name: "Deposited", inputs: [
            { name: "from", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
          ]},
        }, DEPLOY_BLOCK, currentBlock),
      ]);

    // Add spawned child addresses
    for (const log of spawnedLogs as any[]) {
      const addr = (log.args?.childAddr as string)?.toLowerCase();
      if (addr) childAddresses.add(addr);
    }

    const [mockVoteLogs, childVoteLogs, alignmentLogs, revealedLogs] = await Promise.all([
      getLogsInRange({
        address: MOCK_GOVERNOR_ADDRS,
        event: { type: "event", name: "VoteCast", inputs: [
          { name: "proposalId", type: "uint256", indexed: true },
          { name: "voter", type: "address", indexed: true },
          { name: "support", type: "uint8", indexed: false },
          { name: "reason", type: "string", indexed: false },
        ]},
      }, DEPLOY_BLOCK, currentBlock).catch(() => [] as any[]),
      getLogsInRange({
        event: { type: "event", name: "VoteCast", inputs: [
          { name: "proposalId", type: "uint256", indexed: true },
          { name: "support", type: "uint8", indexed: false },
          { name: "encryptedRationale", type: "bytes", indexed: false },
        ]},
      }, DEPLOY_BLOCK, currentBlock).catch(() => [] as any[]),
      getLogsInRange({
        event: { type: "event", name: "AlignmentUpdated", inputs: [
          { name: "newScore", type: "uint256", indexed: false },
        ]},
      }, DEPLOY_BLOCK, currentBlock).catch(() => [] as any[]),
      getLogsInRange({
        event: { type: "event", name: "RationaleRevealed", inputs: [
          { name: "proposalId", type: "uint256", indexed: true },
          { name: "decryptedRationale", type: "bytes", indexed: false },
        ]},
      }, DEPLOY_BLOCK, currentBlock).catch(() => [] as any[]),
    ]);

    const childVoteLogsFiltered = (childVoteLogs as any[]).filter((log) => childAddresses.has((log.address as string)?.toLowerCase()));
    const voteCastLogs = [
      ...(mockVoteLogs as any[]).map((log: any) => ({ ...log, _source: "mock" })),
      ...childVoteLogsFiltered.map((log: any) => ({ ...log, _source: "child" })),
    ];
    const alignmentLogsFiltered = (alignmentLogs as any[]).filter((log) => childAddresses.has((log.address as string)?.toLowerCase()));
    const revealedLogsFiltered = (revealedLogs as any[]).filter((log) => childAddresses.has((log.address as string)?.toLowerCase()));

    // Fetch block timestamps for most recent 40 events
    const allEvents: any[] = [];
    const addEvent = (log: any, type: string, data: any) => {
      allEvents.push({
        id: `${type}-${log.transactionHash}-${log.logIndex}`,
        type,
        blockNumber: log.blockNumber?.toString() ?? "0",
        transactionHash: log.transactionHash ?? "0x",
        data,
      });
    };

    for (const log of spawnedLogs as any[]) addEvent(log, "ChildSpawned", { childId: log.args?.childId?.toString(), childAddr: log.args?.childAddr, governance: log.args?.governance, budget: log.args?.budget?.toString() });
    for (const log of terminatedLogs as any[]) addEvent(log, "ChildTerminated", { childId: log.args?.childId?.toString(), childAddr: log.args?.childAddr, fundsReturned: log.args?.fundsReturned?.toString() });
    for (const log of reallocatedLogs as any[]) addEvent(log, "FundsReallocated", { fromId: log.args?.fromId?.toString(), toId: log.args?.toId?.toString(), amount: log.args?.amount?.toString() });
    for (const log of valuesLogs as any[]) addEvent(log, "ValuesUpdated", { values: log.args?.values });
    for (const log of depositLogs as any[]) addEvent(log, "Deposited", { from: log.args?.from, amount: log.args?.amount?.toString() });
    for (const log of voteCastLogs as any[]) addEvent(log, "VoteCast", { childAddr: log._source === "mock" ? log.args?.voter : log.address, proposalId: log.args?.proposalId?.toString(), support: Number(log.args?.support ?? 0) });
    for (const log of alignmentLogsFiltered as any[]) addEvent(log, "AlignmentUpdated", { childAddr: log.address, newScore: log.args?.newScore?.toString() });
    for (const log of revealedLogsFiltered as any[]) addEvent(log, "RationaleRevealed", { childAddr: log.address, proposalId: log.args?.proposalId?.toString() });

    // Sort by block number desc
    allEvents.sort((a, b) => {
      const bn_a = BigInt(a.blockNumber);
      const bn_b = BigInt(b.blockNumber);
      if (bn_b > bn_a) return 1;
      if (bn_b < bn_a) return -1;
      return 0;
    });

    // Fetch timestamps for top 30 unique blocks
    const uniqueBlocks = [...new Set(allEvents.map((e) => e.blockNumber))].slice(0, 30);
    const timestamps = new Map<string, string>();
    await Promise.all(
      uniqueBlocks.map(async (bn) => {
        try {
          const block = await serverClient.getBlock({ blockNumber: BigInt(bn) });
          timestamps.set(bn, block.timestamp.toString());
        } catch {}
      })
    );

    for (const e of allEvents) {
      e.timestamp = timestamps.get(e.blockNumber) || null;
    }

    setCache(CACHE_KEY, allEvents, CACHE_TTL);
    return NextResponse.json(allEvents);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch timeline" }, { status: 500 });
  }
}
