import { publicClient, walletClient, account } from "./chain.js";
import { SpawnFactoryABI, ParentTreasuryABI, ChildGovernorABI, MockGovernorABI } from "./abis.js";
import { evaluateAlignment } from "./venice.js";
import { registerSubdomain } from "./ens.js";
import { registerAgent, updateAgentMetadata } from "./identity.js";
import { createVotingDelegation } from "./delegation.js";
import { logYieldStatus } from "./lido.js";
import { toHex } from "viem";
import type { DeployedAddresses, ChildInfo } from "./types.js";

const ALIGNMENT_THRESHOLD = 40;
const MISALIGNMENT_STRIKES_TO_KILL = 2;
const CYCLE_INTERVAL_MS = 60_000;

// Track misalignment strikes per child
const strikes = new Map<string, number>();

// Track ERC-8004 agentIds per child address for metadata updates
const childAgentIds = new Map<string, bigint>();

/**
 * Run post-spawn integrations (ENS, ERC-8004 identity, MetaMask delegation).
 * All wrapped in try/catch so failures don't break the core loop.
 */
async function runPostSpawnIntegrations(
  childLabel: string,
  childAddr: `0x${string}`,
  governanceAddr: `0x${string}`
): Promise<void> {
  // ENS subdomain registration
  try {
    const ensResult = await registerSubdomain(childLabel, childAddr);
    console.log(`[Parent] ENS subdomain registered: ${ensResult.name}`);
  } catch (err) {
    console.warn(`[Parent] ENS registration failed for ${childLabel}:`, err);
  }

  // ERC-8004 agent identity registration
  try {
    const agentResult = await registerAgent(
      `spawn://${childLabel}.spawn.eth`,
      {
        agentType: "child",
        assignedDAO: childLabel,
        governanceContract: governanceAddr,
        ensName: `${childLabel}.spawn.eth`,
        alignmentScore: 100, // Start with perfect alignment
        capabilities: ["vote", "reason", "encrypt-rationale"],
        createdAt: Date.now(),
      }
    );
    childAgentIds.set(childAddr.toLowerCase(), agentResult.agentId);
    console.log(`[Parent] ERC-8004 identity registered: agentId=${agentResult.agentId}`);
  } catch (err) {
    console.warn(`[Parent] ERC-8004 registration failed for ${childLabel}:`, err);
  }

  // MetaMask delegation (scoped voting authority)
  try {
    const delegationResult = await createVotingDelegation(
      governanceAddr,
      childAddr,
      100 // max 100 votes
    );
    console.log(`[Parent] Delegation created: hash=${delegationResult.delegationHash}`);
  } catch (err) {
    console.warn(`[Parent] Delegation creation failed for ${childLabel}:`, err);
  }
}

export async function runParentLoop(addresses: DeployedAddresses) {
  console.log("[Parent] Starting parent agent loop...");
  console.log("[Parent] Agent address:", account.address);

  while (true) {
    try {
      await parentCycle(addresses);
    } catch (err) {
      console.error("[Parent] Cycle error:", err);
    }
    await sleep(CYCLE_INTERVAL_MS);
  }
}

async function parentCycle(addresses: DeployedAddresses) {
  // 1. Read owner's governance values
  const values = (await publicClient.readContract({
    address: addresses.parentTreasury,
    abi: ParentTreasuryABI,
    functionName: "getGovernanceValues",
  })) as string;

  console.log("[Parent] Governance values:", values.slice(0, 80) + "...");

  // 2. Get active children
  const children = (await publicClient.readContract({
    address: addresses.spawnFactory,
    abi: SpawnFactoryABI,
    functionName: "getActiveChildren",
  })) as ChildInfo[];

  console.log(`[Parent] Active children: ${children.length}`);

  // 3. Evaluate each child's alignment
  for (const child of children) {
    try {
      await evaluateChild(child, values, addresses);
    } catch (err) {
      console.error(`[Parent] Error evaluating child ${child.id}:`, err);
    }
  }

  // 4. Log stETH yield status (self-sustaining treasury narrative)
  try {
    await logYieldStatus();
  } catch (err) {
    console.warn("[Parent] Yield status check failed:", err);
  }

  // 5. Check for unassigned proposals — spawn children if needed
  await checkForNewProposals(addresses, children);
}

async function evaluateChild(
  child: ChildInfo,
  values: string,
  addresses: DeployedAddresses
) {
  const voteHistory = (await publicClient.readContract({
    address: child.childAddr,
    abi: ChildGovernorABI,
    functionName: "getVotingHistory",
  })) as any[];

  if (voteHistory.length === 0) {
    console.log(`[Parent] Child ${child.id} (${child.ensLabel}): no votes yet`);
    return;
  }

  const historyForEval = voteHistory.map((v: any) => ({
    proposalId: v.proposalId.toString(),
    support: Number(v.support),
  }));

  const score = await evaluateAlignment(values, historyForEval);
  console.log(
    `[Parent] Child ${child.id} (${child.ensLabel}): alignment=${score}`
  );

  // Update alignment score onchain
  const hash = await walletClient.writeContract({
    address: child.childAddr,
    abi: ChildGovernorABI,
    functionName: "updateAlignmentScore",
    args: [BigInt(score)],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  // Update ERC-8004 agent metadata with new alignment score
  try {
    const agentId = childAgentIds.get(child.childAddr.toLowerCase());
    if (agentId !== undefined) {
      await updateAgentMetadata(agentId, { alignmentScore: score });
      console.log(`[Parent] Updated ERC-8004 alignment for agent ${agentId}: ${score}`);
    }
  } catch (err) {
    console.warn(`[Parent] ERC-8004 metadata update failed for child ${child.id}:`, err);
  }

  // Track strikes
  const key = child.id.toString();
  if (score < ALIGNMENT_THRESHOLD) {
    const currentStrikes = (strikes.get(key) || 0) + 1;
    strikes.set(key, currentStrikes);
    console.log(
      `[Parent] Child ${child.id}: MISALIGNED (strike ${currentStrikes}/${MISALIGNMENT_STRIKES_TO_KILL})`
    );

    if (currentStrikes >= MISALIGNMENT_STRIKES_TO_KILL) {
      console.log(`[Parent] TERMINATING child ${child.id} (${child.ensLabel})`);
      const recallHash = await walletClient.writeContract({
        address: addresses.spawnFactory,
        abi: SpawnFactoryABI,
        functionName: "recallChild",
        args: [child.id],
      });
      await publicClient.waitForTransactionReceipt({ hash: recallHash });
      strikes.delete(key);

      // Respawn a replacement
      const newLabel = `${child.ensLabel}-v2`;
      console.log(`[Parent] Spawning replacement: ${newLabel}`);
      const spawnHash = await walletClient.writeContract({
        address: addresses.spawnFactory,
        abi: SpawnFactoryABI,
        functionName: "spawnChild",
        args: [
          newLabel,
          child.governance,
          child.budget,
          child.maxGasPerVote,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: spawnHash });

      // Run post-spawn integrations for the replacement child
      try {
        const updatedChildren = (await publicClient.readContract({
          address: addresses.spawnFactory,
          abi: SpawnFactoryABI,
          functionName: "getActiveChildren",
        })) as ChildInfo[];
        const newChild = updatedChildren.find((c) => c.ensLabel === newLabel);
        if (newChild) {
          await runPostSpawnIntegrations(newLabel, newChild.childAddr, child.governance);
        }
      } catch (err) {
        console.warn(`[Parent] Post-spawn integrations failed for respawn:`, err);
      }
    }
  } else {
    strikes.set(key, 0);
  }
}

async function checkForNewProposals(
  addresses: DeployedAddresses,
  currentChildren: ChildInfo[]
) {
  const proposalCount = (await publicClient.readContract({
    address: addresses.mockGovernor,
    abi: MockGovernorABI,
    functionName: "proposalCount",
  })) as bigint;

  // If there are proposals but no children, spawn one
  if (proposalCount > 0n && currentChildren.length === 0) {
    const childLabel = "governance-1";
    console.log("[Parent] No children but proposals exist, spawning child...");
    const hash = await walletClient.writeContract({
      address: addresses.spawnFactory,
      abi: SpawnFactoryABI,
      functionName: "spawnChild",
      args: [childLabel, addresses.mockGovernor, 0n, 200000n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Run post-spawn integrations (ENS, ERC-8004, delegation)
    try {
      const newChildren = (await publicClient.readContract({
        address: addresses.spawnFactory,
        abi: SpawnFactoryABI,
        functionName: "getActiveChildren",
      })) as ChildInfo[];
      const newChild = newChildren.find((c) => c.ensLabel === childLabel);
      if (newChild) {
        await runPostSpawnIntegrations(childLabel, newChild.childAddr, addresses.mockGovernor);
      }
    } catch (err) {
      console.warn(`[Parent] Post-spawn integrations failed:`, err);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { parentCycle };
