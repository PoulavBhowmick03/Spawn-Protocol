import { publicClient, walletClient, account, celoPublicClient } from "./chain.js";
import { createWalletClientFromKey } from "./wallet-manager.js";
import { ChildGovernorABI, MockGovernorABI } from "./abis.js";
import { reasonAboutProposal, summarizeProposal, assessProposalRisk } from "./venice.js";
import { initLit, encryptRationale, decryptRationale, disconnectLit } from "./lit.js";
import { getDelegationsForChild, redeemVoteDelegation } from "./delegation.js";
import { toHex, type Hex, type Address } from "viem";
import type { DeployedAddresses, ProposalInfo } from "./types.js";
import { logChildAction } from "./logger.js";

// Add jitter to cycle interval so children don't all poll simultaneously
const CYCLE_INTERVAL_MS = 30_000 + Math.floor(Math.random() * 10_000); // 30-40s

// Lit Protocol: lazy-init on first use (module-level so childCycle can access it)
let litAvailable = false;
let litInitAttempted = false;
async function ensureLit(): Promise<boolean> {
  if (litInitAttempted) return litAvailable;
  litInitAttempted = true;
  try {
    await Promise.race([
      initLit(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Lit init timeout")), 15_000)),
    ]);
    litAvailable = true;
    console.log(`[Child] Lit Protocol initialized`);
  } catch (err: any) {
    console.log(`[Child] Lit init failed (${err?.message?.slice(0, 40)}), using hex fallback`);
    litAvailable = false;
  }
  return litAvailable;
}

export async function runChildLoop(
  childAddr: `0x${string}`,
  governanceAddr: `0x${string}`,
  governanceValues: string,
  childLabel: string,
  childPrivateKey?: `0x${string}`
) {
  // Select the right chain's publicClient based on CHILD_CHAIN env var
  // Use alternative RPC for children to avoid rate limiting the main RPC
  const chainName = process.env.CHILD_CHAIN || "base-sepolia";
  let readClient: any;
  if (chainName === "celo-sepolia") {
    readClient = celoPublicClient;
  } else {
    // Create a separate client with publicnode RPC to distribute load
    const { createPublicClient: createPC, http: httpTransport } = await import("viem");
    const { baseSepolia: baseChain } = await import("viem/chains");
    readClient = createPC({
      chain: baseChain,
      transport: httpTransport("https://base-sepolia-rpc.publicnode.com"),
    });
  }

  // Create child-specific wallet client if a private key was provided
  let childWalletClient: any;
  if (childPrivateKey) {
    childWalletClient = createWalletClientFromKey(childPrivateKey, chainName);
    const childAccount = childWalletClient.account;
    console.log(`[Child:${childLabel}] Using unique wallet: ${childAccount?.address} on ${chainName}`);
  } else {
    childWalletClient = walletClient;
    console.log(`[Child:${childLabel}] Using shared parent wallet: ${account.address}`);
  }

  console.log(`[Child:${childLabel}] Starting child agent loop...`);
  console.log(`[Child:${childLabel}] Contract: ${childAddr}`);
  console.log(`[Child:${childLabel}] Governance: ${governanceAddr}`);

  // Lit Protocol is lazy-initialized at module scope via ensureLit()

  const systemPrompt = `You are an autonomous governance agent named "${childLabel}".
You vote on DAO proposals according to your owner's values.
Be decisive and provide clear reasoning for your votes.
Your owner's governance values: ${governanceValues}`;

  // Stagger child startup to avoid RPC + Venice rate limiting
  const startDelay = Math.floor(Math.random() * 15000) + 5000; // 5-20s random delay
  console.log(`[Child:${childLabel}] Starting in ${(startDelay/1000).toFixed(0)}s (staggered to avoid rate limits)`);
  await sleep(startDelay);

  while (true) {
    try {
      const isActive = (await readClient.readContract({
        address: childAddr,
        abi: ChildGovernorABI,
        functionName: "active",
      })) as boolean;

      if (!isActive) {
        console.log(`[Child:${childLabel}] Deactivated. Exiting.`);
        break;
      }

      await childCycle(childAddr, governanceAddr, governanceValues, childLabel, systemPrompt, litAvailable, childWalletClient, readClient);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("exceeds the balance")) {
        console.error(`[Child:${childLabel}] OUT OF GAS — wallet needs funding. Waiting 60s before retry.`);
        await sleep(60_000);
      } else {
        console.error(`[Child:${childLabel}] Cycle error: ${msg.slice(0, 120)}`);
      }
    }
    await sleep(CYCLE_INTERVAL_MS);
  }
}

async function childCycle(
  childAddr: `0x${string}`,
  governanceAddr: `0x${string}`,
  governanceValues: string,
  childLabel: string,
  systemPrompt: string,
  _litUnused: boolean = false, // litAvailable is now module-level via ensureLit()
  childWalletClient: any = walletClient,
  readClient: any = publicClient
) {
  // 1. Get total proposal count
  const proposalCount = (await readClient.readContract({
    address: governanceAddr,
    abi: MockGovernorABI,
    functionName: "proposalCount",
  })) as bigint;

  // ── PASS 1: Vote on active proposals (scan backwards, break early) ──
  let consecutiveInactive = 0;
  for (let i = proposalCount; i >= 1n; i--) {
    const state = (await readClient.readContract({
      address: governanceAddr,
      abi: MockGovernorABI,
      functionName: "state",
      args: [i],
    })) as number;

    if (state !== 1) {
      consecutiveInactive++;
      if (consecutiveInactive >= 5) break;
      continue;
    }
    consecutiveInactive = 0;

    // Active — check if already voted
    const voteIndex = (await readClient.readContract({
      address: childAddr,
      abi: ChildGovernorABI,
      functionName: "proposalToVoteIndex",
      args: [i],
    })) as bigint;

    if (voteIndex === 0n) {
      // Haven't voted yet
      const proposal = (await readClient.readContract({
        address: governanceAddr,
        abi: MockGovernorABI,
        functionName: "getProposal",
        args: [i],
      })) as ProposalInfo;

      console.log(
        `[Child:${childLabel}] Evaluating proposal ${i}: ${proposal.description}`
      );

      // Venice reasoning step 1: Summarize proposal
      try {
        const summary = await summarizeProposal(proposal.description);
        console.log(`[Child:${childLabel}] Venice Summary: ${summary.slice(0, 120)}...`);
      } catch {}

      // Venice reasoning step 2: Risk assessment
      try {
        const risk = await assessProposalRisk(proposal.description, governanceValues);
        console.log(`[Child:${childLabel}] Venice Risk: ${risk.riskLevel} — ${risk.factors.slice(0, 80)}`);
      } catch {}

      // Venice reasoning step 3: Vote decision (critical — wrapped in try/catch)
      let decision: "FOR" | "AGAINST" | "ABSTAIN" = "ABSTAIN";
      let reasoning = "Venice reasoning unavailable — defaulting to ABSTAIN";
      try {
        const result = await reasonAboutProposal(
          proposal.description,
          governanceValues,
          systemPrompt
        );
        decision = result.decision;
        reasoning = result.reasoning;
      } catch (veniceErr: any) {
        console.error(`[Child:${childLabel}] Venice reasoning failed: ${veniceErr?.message?.slice(0, 80)}`);
        console.log(`[Child:${childLabel}] Skipping vote on proposal ${i} — will retry next cycle`);
        continue; // Skip this proposal, try again next cycle
      }

      const support = decision === "FOR" ? 1 : decision === "AGAINST" ? 0 : 2;
      console.log(`[Child:${childLabel}] Decision: ${decision}`);
      console.log(`[Child:${childLabel}] Reasoning: ${reasoning.slice(0, 100)}...`);

      // Venice private→public proof: hash reasoning onchain BEFORE vote
      const { keccak256: k256, toBytes } = await import("viem");
      const reasoningHash = k256(toBytes(reasoning));
      console.log(`[Child:${childLabel}] Reasoning hash: ${reasoningHash.slice(0, 18)}...`);

      // Encrypt rationale via Lit Protocol (time-locked to proposal end)
      let encryptedRationale: `0x${string}`;
      await ensureLit(); // lazy-init Lit on first vote
      if (litAvailable) {
        try {
          const litResult = await encryptRationale(reasoning, proposal.endTime);
          encryptedRationale = toHex(JSON.stringify({
            ciphertext: litResult.ciphertext,
            dataToEncryptHash: litResult.dataToEncryptHash,
            litEncrypted: true,
          }));
          console.log(`[Child:${childLabel}] Rationale encrypted via Lit Protocol`);
        } catch (litErr) {
          console.warn(`[Child:${childLabel}] Lit encryption failed, using hex fallback:`, litErr);
          encryptedRationale = toHex(reasoning);
        }
      } else {
        encryptedRationale = toHex(reasoning);
        console.log(`[Child:${childLabel}] Rationale hex-encoded (Lit unavailable — disabled for swarm mode)`);
      }

      // Cast vote onchain — try delegation redemption first, fall back to direct call
      let hash: `0x${string}`;
      const childAccount = childWalletClient.account;
      const childAddress = childAccount?.address as Address | undefined;

      // Try to vote via DelegationManager redemption (ERC-7715 enforced onchain)
      let usedDelegation = false;
      if (childAddress) {
        const delegations = getDelegationsForChild(childAddress);
        const matchingDelegation = delegations.find(
          (d) => d.governanceContract.toLowerCase() === governanceAddr.toLowerCase()
        );

        if (matchingDelegation) {
          try {
            hash = await redeemVoteDelegation(
              childWalletClient,
              readClient,
              matchingDelegation,
              childAddr as Address,
              i,
              support,
              encryptedRationale
            );
            usedDelegation = true;
            console.log(`[Child:${childLabel}] Voted via DelegationManager redemption`);
          } catch (delegationErr: any) {
            console.log(
              `[Child:${childLabel}] Delegation redemption failed: ${delegationErr?.message?.slice(0, 80)}`,
              `\n  Falling back to direct writeContract`
            );
          }
        }
      }

      // Fallback: direct writeContract call using child's own wallet
      if (!usedDelegation) {
        hash = await childWalletClient.writeContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "castVote",
          args: [i, support, encryptedRationale],
        });
      }

      const receipt = await readClient.waitForTransactionReceipt({ hash: hash! });
      console.log(
        `[Child:${childLabel}] Voted ${decision} on proposal ${i} (tx: ${receipt.transactionHash})${usedDelegation ? " [via delegation]" : ""}`
      );
      try { logChildAction(childLabel, "cast_vote", { proposalId: Number(i), decision, litEncrypted: litAvailable }, { txHash: receipt.transactionHash, reasoningHash: reasoningHash.slice(0, 18) }, receipt.transactionHash); } catch {}
    }
  }

  // ── PASS 2: Reveal rationale for finished proposals we voted on ──
  // Check our voting history and reveal any unrevealed votes
  try {
    const history = (await readClient.readContract({
      address: childAddr,
      abi: ChildGovernorABI,
      functionName: "getVotingHistory",
    })) as any[];

    for (const record of history) {
      if (record.revealed) continue; // already revealed

      const proposalId = record.proposalId;

      // Check if this proposal's voting has ended (state >= 2)
      try {
        const state = (await readClient.readContract({
          address: governanceAddr,
          abi: MockGovernorABI,
          functionName: "state",
          args: [proposalId],
        })) as number;

        if (state < 2) continue; // still active, can't reveal yet

        console.log(`[Child:${childLabel}] Revealing rationale for proposal ${proposalId}`);

        // Decrypt rationale — try Lit Protocol first, fall back to raw hex
        let decryptedRationaleHex: `0x${string}` = record.encryptedRationale;

        if (litAvailable) {
          try {
            const storedStr = Buffer.from(
              (record.encryptedRationale as string).slice(2),
              "hex"
            ).toString("utf-8");
            const stored = JSON.parse(storedStr);

            if (stored.litEncrypted) {
              const proposalForReveal = (await readClient.readContract({
                address: governanceAddr,
                abi: MockGovernorABI,
                functionName: "getProposal",
                args: [proposalId],
              })) as ProposalInfo;

              const decryptedText = await decryptRationale(
                stored.ciphertext,
                stored.dataToEncryptHash,
                proposalForReveal.endTime
              );
              decryptedRationaleHex = toHex(decryptedText);
              console.log(`[Child:${childLabel}] Rationale decrypted via Lit Protocol`);
            }
          } catch {
            // Keep as raw hex fallback
          }
        }

        if (!litAvailable) {
          console.log(`[Child:${childLabel}] Revealing hex-encoded rationale (Lit unavailable — no decryption needed)`);
        }

        const hash = await childWalletClient.writeContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "revealRationale",
          args: [proposalId, decryptedRationaleHex],
        });
        await readClient.waitForTransactionReceipt({ hash });
        console.log(`[Child:${childLabel}] Rationale revealed for proposal ${proposalId} (tx: ${hash})`);
        try { logChildAction(childLabel, "reveal_rationale", { proposalId: Number(proposalId) }, { txHash: hash }, hash); } catch {}
      } catch (revealErr: any) {
        // Non-fatal — will retry next cycle
        console.log(`[Child:${childLabel}] Reveal failed for proposal ${proposalId}: ${revealErr?.message?.slice(0, 40)}`);
      }
    }
  } catch {}
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { childCycle };
