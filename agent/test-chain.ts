import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { MockGovernorABI } from "./src/abis.js";

const pc = createPublicClient({ chain: baseSepolia, transport: http("https://base-sepolia-rpc.publicnode.com") });

const governors = [
  { name: "Uniswap", addr: "0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9" as const },
  { name: "Lido", addr: "0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC" as const },
  { name: "ENS", addr: "0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C" as const },
];

async function main() {
  const bn = await pc.getBlockNumber();
  const block = await pc.getBlock({ blockNumber: bn });
  const now = Number(block.timestamp);
  console.log(`Block: ${bn}, Time: ${new Date(now * 1000).toISOString()}\n`);

  // Check ProposalCreated events in last 2000 blocks
  console.log("=== RECENT PROPOSAL CREATIONS (last 2000 blocks) ===\n");
  for (const gov of governors) {
    try {
      const logs = await pc.getLogs({
        address: gov.addr,
        event: {
          type: "event", name: "ProposalCreated",
          inputs: [
            { name: "proposalId", type: "uint256", indexed: false },
            { name: "description", type: "string", indexed: false },
            { name: "startTime", type: "uint256", indexed: false },
            { name: "endTime", type: "uint256", indexed: false },
          ],
        },
        fromBlock: bn - 2000n,
        toBlock: "latest",
      });
      console.log(`${gov.name}: ${logs.length} proposals created`);
      for (const l of logs.slice(-3)) {
        const a = l.args as any;
        const endTime = Number(a.endTime);
        const active = endTime > now;
        console.log(`  #${a.proposalId}: "${(a.description as string).slice(0, 60)}..." ends ${new Date(endTime * 1000).toISOString()} ${active ? "ACTIVE" : "EXPIRED"} (block ${l.blockNumber})`);
      }
    } catch (e: any) {
      console.log(`${gov.name}: error - ${e.message?.slice(0, 100)}`);
    }
  }

  // Check if any proposals are currently active
  console.log("\n=== CURRENTLY ACTIVE PROPOSALS ===\n");
  for (const gov of governors) {
    const count = Number(await pc.readContract({ address: gov.addr, abi: MockGovernorABI, functionName: "proposalCount" }));
    let activeCount = 0;
    for (let i = count; i > Math.max(0, count - 10); i--) {
      const state = Number(await pc.readContract({ address: gov.addr, abi: MockGovernorABI, functionName: "state", args: [BigInt(i)] }));
      if (state === 1) {
        activeCount++;
        const info = await pc.readContract({ address: gov.addr, abi: MockGovernorABI, functionName: "getProposal", args: [BigInt(i)] }) as any;
        const endTime = Number(info.endTime);
        const secsLeft = endTime - now;
        console.log(`  ${gov.name} #${i}: ACTIVE (${secsLeft}s left) "${(info.description as string).slice(0, 50)}..."`);
      }
    }
    if (activeCount === 0) console.log(`  ${gov.name}: no active proposals`);
  }
}

main().catch(console.error);
