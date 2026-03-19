import { publicClient, walletClient, account } from "./chain.js";
import { createWalletClientFromKey } from "./wallet-manager.js";
import { ChildGovernorABI, MockGovernorABI } from "./abis.js";
import { reasonAboutProposal, summarizeProposal, assessProposalRisk } from "./venice.js";
import { initLit, encryptRationale, decryptRationale, disconnectLit } from "./lit.js";
import { toHex, type Hex } from "viem";
import type { DeployedAddresses, ProposalInfo } from "./types.js";

const CYCLE_INTERVAL_MS = 30_000;

export async function runChildLoop(
  childAddr: `0x${string}`,
  governanceAddr: `0x${string}`,
  governanceValues: string,
  childLabel: string,
  childPrivateKey?: `0x${string}`
) {
  // Create child-specific wallet client if a private key was provided
  // Using 'any' to avoid viem's strict chain typing on generic WalletClient
  let childWalletClient: any;
  if (childPrivateKey) {
    childWalletClient = createWalletClientFromKey(childPrivateKey);
    const childAccount = childWalletClient.account;
    console.log(`[Child:${childLabel}] Using unique wallet: ${childAccount?.address}`);
  } else {
    childWalletClient = walletClient;
    console.log(`[Child:${childLabel}] Using shared parent wallet: ${account.address}`);
  }

  console.log(`[Child:${childLabel}] Starting child agent loop...`);
  console.log(`[Child:${childLabel}] Contract: ${childAddr}`);
  console.log(`[Child:${childLabel}] Governance: ${governanceAddr}`);

  // Lit Protocol disabled for swarm mode (blocks child startup for 30s+)
  // Rationale is hex-encoded instead — Lit integration available via demo.ts
  const litAvailable = false;

  const systemPrompt = `You are an autonomous governance agent named "${childLabel}".
You vote on DAO proposals according to your owner's values.
Be decisive and provide clear reasoning for your votes.
Your owner's governance values: ${governanceValues}`;

  while (true) {
    try {
      const isActive = (await publicClient.readContract({
        address: childAddr,
        abi: ChildGovernorABI,
        functionName: "active",
      })) as boolean;

      if (!isActive) {
        console.log(`[Child:${childLabel}] Deactivated. Exiting.`);
        break;
      }

      await childCycle(childAddr, governanceAddr, governanceValues, childLabel, systemPrompt, litAvailable, childWalletClient);
    } catch (err) {
      console.error(`[Child:${childLabel}] Cycle error:`, err);
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
  litAvailable: boolean = false,
  childWalletClient: any = walletClient
) {
  // 1. Get total proposal count
  const proposalCount = (await publicClient.readContract({
    address: governanceAddr,
    abi: MockGovernorABI,
    functionName: "proposalCount",
  })) as bigint;

  for (let i = 1n; i <= proposalCount; i++) {
    // 2. Check proposal state (1 = Active)
    const state = (await publicClient.readContract({
      address: governanceAddr,
      abi: MockGovernorABI,
      functionName: "state",
      args: [i],
    })) as number;

    if (state === 1) {
      // Active
      // Check if already voted
      const voteIndex = (await publicClient.readContract({
        address: childAddr,
        abi: ChildGovernorABI,
        functionName: "proposalToVoteIndex",
        args: [i],
      })) as bigint;

      if (voteIndex === 0n) {
        // Haven't voted yet
        const proposal = (await publicClient.readContract({
          address: governanceAddr,
          abi: MockGovernorABI,
          functionName: "getProposal",
          args: [i],
        })) as ProposalInfo;

        console.log(
          `[Child:${childLabel}] Evaluating proposal ${i}: ${proposal.description}`
        );

        // Venice reasoning — vote decision (summary + risk available but skipped in swarm for speed)
        const { decision, reasoning } = await reasonAboutProposal(
          proposal.description,
          governanceValues,
          systemPrompt
        );

        const support = decision === "FOR" ? 1 : decision === "AGAINST" ? 0 : 2;
        console.log(`[Child:${childLabel}] Decision: ${decision}`);
        console.log(`[Child:${childLabel}] Reasoning: ${reasoning.slice(0, 100)}...`);

        // 4. Encrypt rationale via Lit Protocol (time-locked to proposal end)
        let encryptedRationale: `0x${string}`;
        if (litAvailable) {
          try {
            const litResult = await encryptRationale(reasoning, proposal.endTime);
            // Store ciphertext + hash as hex-encoded JSON for later decryption
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
        }

        // 5. Cast vote onchain using child's own wallet
        const hash = await childWalletClient.writeContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "castVote",
          args: [i, support, encryptedRationale],
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log(
          `[Child:${childLabel}] Voted ${decision} on proposal ${i} (tx: ${receipt.transactionHash})`
        );
      }
    }

    // Check for proposals where voting ended — reveal rationale
    if (state >= 2) {
      // Defeated, Succeeded, or Executed
      const voteIndex = (await publicClient.readContract({
        address: childAddr,
        abi: ChildGovernorABI,
        functionName: "proposalToVoteIndex",
        args: [i],
      })) as bigint;

      if (voteIndex > 0n) {
        const history = (await publicClient.readContract({
          address: childAddr,
          abi: ChildGovernorABI,
          functionName: "getVotingHistory",
        })) as any[];

        const record = history[Number(voteIndex - 1n)];
        if (!record.revealed) {
          console.log(
            `[Child:${childLabel}] Revealing rationale for proposal ${i}`
          );

          // Decrypt rationale — try Lit Protocol first, fall back to raw hex
          let decryptedRationaleHex: `0x${string}` = record.encryptedRationale;

          if (litAvailable) {
            try {
              // Parse the stored encrypted data to check if it was Lit-encrypted
              const storedStr = Buffer.from(
                (record.encryptedRationale as string).slice(2),
                "hex"
              ).toString("utf-8");
              const stored = JSON.parse(storedStr);

              if (stored.litEncrypted) {
                // Fetch proposal end time for the decryption condition
                const proposalForReveal = (await publicClient.readContract({
                  address: governanceAddr,
                  abi: MockGovernorABI,
                  functionName: "getProposal",
                  args: [i],
                })) as ProposalInfo;

                const decryptedText = await decryptRationale(
                  stored.ciphertext,
                  stored.dataToEncryptHash,
                  proposalForReveal.endTime
                );
                decryptedRationaleHex = toHex(decryptedText);
                console.log(`[Child:${childLabel}] Rationale decrypted via Lit Protocol`);
              }
            } catch (litErr) {
              console.warn(
                `[Child:${childLabel}] Lit decryption failed, using raw rationale:`,
                litErr
              );
              // Keep decryptedRationaleHex as the original encryptedRationale (hex fallback)
            }
          }

          const hash = await childWalletClient.writeContract({
            address: childAddr,
            abi: ChildGovernorABI,
            functionName: "revealRationale",
            args: [i, decryptedRationaleHex],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`[Child:${childLabel}] Rationale revealed for proposal ${i}`);
        }
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { childCycle };
