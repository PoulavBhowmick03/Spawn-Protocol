/**
 * Standalone child agent launcher — runs as its own process.
 *
 * Usage: tsx src/spawn-child.ts <childAddr> <governanceAddr> <label>
 *
 * The parent agent spawns this as a separate process for each child,
 * making each child a genuinely independent reasoning loop.
 */

import { publicClient } from "./chain.js";
import { ParentTreasuryABI } from "./abis.js";
import { runChildLoop } from "./child.js";

const [childAddr, governanceAddr, label, treasuryAddr] = process.argv.slice(2);

if (!childAddr || !governanceAddr || !label) {
  console.error("Usage: tsx src/spawn-child.ts <childAddr> <governanceAddr> <label> [treasuryAddr]");
  process.exit(1);
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

  console.log(`[ChildProcess:${label}] PID ${process.pid} starting...`);
  await runChildLoop(
    childAddr as `0x${string}`,
    governanceAddr as `0x${string}`,
    values,
    label
  );
}

main().catch((err) => {
  console.error(`[ChildProcess:${label}] Fatal:`, err);
  process.exit(1);
});
