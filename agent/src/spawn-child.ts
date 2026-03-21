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
import { loadDelegationsFromFile } from "./delegation.js";

// Load persisted delegations so this child process can use DelegationManager path
loadDelegationsFromFile();

const [childAddr, governanceAddr, label, treasuryAddr] = process.argv.slice(2);

if (!childAddr || !governanceAddr || !label) {
  console.error("Usage: tsx src/spawn-child.ts <childAddr> <governanceAddr> <label> [treasuryAddr]");
  process.exit(1);
}

// Child's unique private key and perspective, passed by the parent swarm
const childPrivateKey = process.env.CHILD_PRIVATE_KEY as `0x${string}` | undefined;
const childPerspective = process.env.CHILD_PERSPECTIVE || undefined;

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

  // Prepend perspective to governance values if provided
  const fullValues = childPerspective
    ? `${childPerspective}\n\nOwner's governance values: ${values}`
    : values;

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
