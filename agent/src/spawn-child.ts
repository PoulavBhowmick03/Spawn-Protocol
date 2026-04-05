/**
 * Standalone child agent launcher — runs as its own process.
 *
 * Usage: tsx src/spawn-child.ts <childAddr> <governanceAddr> <label>
 *
 * The parent agent spawns this as a separate process for each child,
 * making each child a genuinely independent reasoning loop.
 *
 * Each child gets its own wallet via CHILD_PRIVATE_KEY environment variable,
 * so every child signs transactions from a unique address.
 */

import { publicClient } from "./chain.js";
import { ParentTreasuryABI } from "./abis.js";
import { runChildLoop } from "./child.js";

const [childAddr, governanceAddr, label, treasuryAddr] = process.argv.slice(2);

if (!childAddr || !governanceAddr || !label) {
  console.error("Usage: tsx src/spawn-child.ts <childAddr> <governanceAddr> <label> [treasuryAddr]");
  process.exit(1);
}

// Child's unique private key and perspective, passed by the parent swarm
const childPrivateKey = process.env.CHILD_PRIVATE_KEY as `0x${string}` | undefined;
const childPerspective = process.env.CHILD_PERSPECTIVE || undefined;

function ipcLog(action: string, inputs: Record<string, any>, outputs: Record<string, any>, txHash?: string) {
  if (process.send) {
    process.send({ type: "log_child_action", childLabel: label, action, inputs, outputs, txHash });
  }
}

async function main() {
  let values = "Prioritize decentralization, support public goods, oppose inflation";

  // Try to read governance values from treasury
  if (treasuryAddr) {
    try {
      values = (await publicClient.readContract({
        address: treasuryAddr as `0x${string}`,
        abi: ParentTreasuryABI,
        functionName: "getGovernanceValues",
      })) as string;
    } catch {}
  }

  if (childPrivateKey) {
    console.log(`[ChildProcess:${label}] PID ${process.pid} starting with unique wallet...`);
  } else {
    console.log(`[ChildProcess:${label}] PID ${process.pid} starting (shared wallet)...`);
  }
  const targetDaoSlug = process.env.CHILD_TARGET_DAO_SLUG?.trim().toLowerCase() || "";
  if (targetDaoSlug) {
    console.log(`[ChildProcess:${label}] Registered DAO target: ${targetDaoSlug}`);
    ipcLog(
      "registered_dao_child_process_boot",
      { targetDaoSlug, childAddr, governanceAddr },
      { targeted: true }
    );
  }

  // Prepend perspective to governance values if provided
  const fullValues = childPerspective
    ? `${childPerspective}\n\nOwner's governance values: ${values}`
    : values;

  if (process.env.JUDGE_FLOW_RUN_ID && process.env.JUDGE_LINEAGE_SOURCE_CID) {
    ipcLog(
      "judge_lineage_loaded",
      {
        judgeRunId: process.env.JUDGE_FLOW_RUN_ID,
        judgeStep: "judge_lineage_loaded",
        proofChild: true,
        proofStatus: "lineage_loaded",
        lineageSourceCid: process.env.JUDGE_LINEAGE_SOURCE_CID,
        respawnedChild: label,
      },
      {
        judgeRunId: process.env.JUDGE_FLOW_RUN_ID,
        judgeStep: "judge_lineage_loaded",
        proofChild: true,
        proofStatus: "lineage_loaded",
        lineageSourceCid: process.env.JUDGE_LINEAGE_SOURCE_CID,
        respawnedChild: label,
      }
    );
  }

  await runChildLoop(
    childAddr as `0x${string}`,
    governanceAddr as `0x${string}`,
    fullValues,
    label,
    childPrivateKey
  );
}

main().catch((err) => {
  console.error(`[ChildProcess:${label}] Fatal:`, err);
  process.exit(1);
});
