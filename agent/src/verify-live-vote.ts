import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { publicClient, account, walletClient, sendTxAndWait } from "./chain.js";
import { MockGovernorABI, SpawnFactoryABI, ChildGovernorABI } from "./abis.js";

const FACTORY = "0x8Ccd24213E765d636605a1F820336cd9E1c8A9C8" as const;
const GOVERNOR = "0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C" as const;
const VERIFY_MAX_GAS_PER_VOTE = 500000n;
const TEMP_CHILD_KEY =
  "0x59c6995e998f97a5a0044976f6a5c8f1e2e6c0dbf8e93d6d5ef7e31e8f39f6b1" as const;

async function sendChildTxAndWait(childWallet: any, params: any, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const hash = await childWallet.writeContract(params);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt?.status === "reverted" || receipt?.status === 0 || receipt?.status === 0n) {
        throw new Error(`${params?.functionName || "child transaction"} reverted onchain (${hash})`);
      }
      return receipt;
    } catch (err: any) {
      const msg = err?.details || err?.message || "";
      const retryable =
        msg.includes("nonce") ||
        msg.includes("underpriced") ||
        msg.includes("already known") ||
        msg.includes("rate limit") ||
        msg.includes("timeout") ||
        msg.includes("429");
      if (!retryable || attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 3000 + attempt * 3000));
    }
  }
  throw new Error("child tx retries exhausted");
}

async function fundChildIfNeeded(childAddress: `0x${string}`, minimumWei = 5_000_000_000_000n) {
  const existingBalance = await publicClient.getBalance({ address: childAddress });
  if (existingBalance >= minimumWei) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const hash = await walletClient.sendTransaction({
        account,
        to: childAddress,
        value: 10_000_000_000_000n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt?.status === "reverted" || receipt?.status === 0 || receipt?.status === 0n) {
        throw new Error(`funding reverted onchain (${hash})`);
      }
      return hash;
    } catch (err: any) {
      const msg = err?.details || err?.message || "";
      const retryable =
        msg.includes("nonce") ||
        msg.includes("underpriced") ||
        msg.includes("already known") ||
        msg.includes("rate limit") ||
        msg.includes("timeout") ||
        msg.includes("429");
      if (!retryable || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 + attempt * 3000));
    }
  }

  return null;
}

async function main() {
  const verificationClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
  });
  const childAccount = privateKeyToAccount(TEMP_CHILD_KEY);
  const childWallet = createWalletClient({
    account: childAccount,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
  });

  const ts = Date.now();
  const label = `main-verify-${String(ts).slice(-8)}`;
  const description = `Main verification proposal ${ts} - real vote forwarding check`;

  let childId: bigint | undefined;

  try {
    const fundHash = await fundChildIfNeeded(childAccount.address);

    const createReceipt = await sendTxAndWait({
      address: GOVERNOR,
      abi: MockGovernorABI,
      functionName: "createProposal",
      args: [description],
    });
    const proposalLogs = parseEventLogs({
      abi: MockGovernorABI,
      logs: createReceipt.logs,
      eventName: "ProposalCreated",
    });
    if (proposalLogs.length === 0) throw new Error("ProposalCreated event missing");
    const proposalId = proposalLogs[0].args.proposalId;

    const spawnReceipt = await sendTxAndWait({
      address: FACTORY,
      abi: SpawnFactoryABI,
      functionName: "spawnChildWithOperator",
      args: [label, GOVERNOR, 0n, VERIFY_MAX_GAS_PER_VOTE, childAccount.address],
    });
    const spawnLogs = parseEventLogs({
      abi: SpawnFactoryABI,
      logs: spawnReceipt.logs,
      eventName: "ChildSpawned",
    });
    if (spawnLogs.length === 0) throw new Error("ChildSpawned event missing");

    childId = spawnLogs[0].args.childId;
    const childAddr = spawnLogs[0].args.childAddr;

    const voteReceipt = await sendChildTxAndWait(childWallet, {
      account: childAccount,
      address: childAddr,
      abi: ChildGovernorABI,
      functionName: "castVote",
      args: [proposalId, 1, "0x766572696669636174696f6e"],
      gas: VERIFY_MAX_GAS_PER_VOTE,
    });

    let proposal: any;
    let hasVoted = false;
    let voteIndex = 0n;
    let operator = "";
    for (let attempt = 0; attempt < 15; attempt++) {
      [proposal, hasVoted, voteIndex, operator] = await Promise.all([
        verificationClient.readContract({
          address: GOVERNOR,
          abi: MockGovernorABI,
          functionName: "getProposal",
          args: [proposalId],
        }) as Promise<any>,
        verificationClient.readContract({
          address: GOVERNOR,
          abi: MockGovernorABI,
          functionName: "hasVoted",
          args: [proposalId, childAddr],
        }) as Promise<boolean>,
        verificationClient.readContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "proposalToVoteIndex",
          args: [proposalId],
        }) as Promise<bigint>,
        verificationClient.readContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "operator",
        }) as Promise<string>,
      ]);

      if (hasVoted && voteIndex > 0n) break;
      await new Promise((r) => setTimeout(r, 2_000));
    }

    if (!hasVoted || voteIndex === 0n) {
      throw new Error("vote state did not propagate after castVote");
    }

    const recallReceipt = await sendTxAndWait({
      address: FACTORY,
      abi: SpawnFactoryABI,
      functionName: "recallChild",
      args: [childId],
    });

    console.log(
      JSON.stringify(
        {
          proposalId: proposalId.toString(),
          childId: childId.toString(),
          childAddr,
          operator,
          governorForVotes: proposal.forVotes.toString(),
          governorAgainstVotes: proposal.againstVotes.toString(),
          governorAbstainVotes: proposal.abstainVotes.toString(),
          hasVoted,
          proposalToVoteIndex: voteIndex.toString(),
          txs: {
            fund: fundHash,
            createProposal: createReceipt.transactionHash,
            spawnChild: spawnReceipt.transactionHash,
            castVote: voteReceipt.transactionHash,
            recallChild: recallReceipt.transactionHash,
          },
        },
        null,
        2
      )
    );
  } catch (err) {
    if (childId !== undefined) {
      try {
        await sendTxAndWait({
          address: FACTORY,
          abi: SpawnFactoryABI,
          functionName: "recallChild",
          args: [childId],
        });
      } catch {}
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
