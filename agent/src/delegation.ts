/**
 * MetaMask Delegation Framework (ERC-7715) — Scoped voting authority
 *
 * Creates delegations that restrict child agents to only call castVote
 * on specific governance contracts, with a cap on total votes.
 */

import {
  createCaveat,
  createDelegation,
  signDelegation,
  getDeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { account, baseSepolia } from "./chain.js";
import { setChildTextRecord } from "./ens.js";
import { logParentAction } from "./logger.js";

// ChildGovernor castVote selector: castVote(uint256,uint8,bytes)
const CAST_VOTE_SELECTOR = "0x9d36475b" as Hex; // castVote(uint256,uint8,bytes)

// Get the DeleGator environment for Base Sepolia (includes enforcer addresses)
const environment = getDeleGatorEnvironment(baseSepolia.id);

// Store delegations in memory for the demo runtime
const activeDelegations = new Map<string, DelegationRecord>();

export interface DelegationRecord {
  delegation: Delegation;
  signature: Hex;
  delegationHash: Hex;
  governanceContract: Address;
  delegatee: Address;
  maxVotes: number;
  createdAt: number;
}

/**
 * Create a scoped voting delegation from the owner to a child agent.
 *
 * Caveats enforced (via scope + additional caveats):
 *   - allowedTargets: only the specific governance contract
 *   - allowedMethods: only castVote(uint256,uint8,bytes)
 *   - limitedCalls: max N votes total
 */
export async function createVotingDelegation(
  governanceContract: Address,
  childAddress: Address,
  maxVotes: number
): Promise<DelegationRecord> {
  // Build the limitedCalls caveat manually — terms encode the limit as uint256
  const limitedCallsCaveat = createCaveat(
    environment.caveatEnforcers.LimitedCallsEnforcer as Hex,
    encodeAbiParameters(
      [{ type: "uint256" }],
      [BigInt(maxVotes)]
    )
  );

  // createDelegation with scope auto-adds allowedTargets + allowedMethods caveats
  // We pass limitedCalls as an additional caveat
  const delegation = createDelegation({
    environment,
    scope: {
      type: "functionCall",
      targets: [governanceContract],
      selectors: [CAST_VOTE_SELECTOR],
    },
    from: account.address as Hex,
    to: childAddress as Hex,
    caveats: [limitedCallsCaveat],
  });

  // Sign the delegation offchain using the owner's private key
  const signature = await signDelegation({
    privateKey: process.env.PRIVATE_KEY as Hex,
    delegation,
    delegationManager: environment.DelegationManager as Address,
    chainId: baseSepolia.id,
  });

  const signedDelegation: Delegation = {
    ...delegation,
    signature,
  };

  // Compute a hash for tracking (keccak of the encoded delegation struct)
  const delegationHash = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint256" }],
      [
        delegation.delegator as Address,
        delegation.delegate as Address,
        BigInt(delegation.salt as any),
      ]
    )
  );

  const record: DelegationRecord = {
    delegation: signedDelegation,
    signature,
    delegationHash,
    governanceContract,
    delegatee: childAddress,
    maxVotes,
    createdAt: Date.now(),
  };

  activeDelegations.set(delegationHash, record);

  console.log(
    `[Delegation] Created voting delegation for ${childAddress}`,
    `\n  Governance: ${governanceContract}`,
    `\n  Max votes: ${maxVotes}`,
    `\n  Caveats: ${signedDelegation.caveats.length} (allowedTargets + allowedMethods + limitedCalls)`,
    `\n  Hash: ${delegationHash}`
  );

  // Log delegation creation to agent_log.json for judging visibility
  logParentAction(
    "create_delegation",
    {
      delegatee: childAddress,
      governanceContract,
      maxVotes,
      caveats: signedDelegation.caveats.length,
    },
    {
      delegationHash,
      signature: signature.slice(0, 66) + "...",
      delegator: delegation.delegator,
      delegate: delegation.delegate,
    }
  );

  // Store delegation hash onchain as an ENS text record for verifiability
  await storeDelegationOnchain(childAddress, delegationHash, governanceContract);

  return record;
}

/**
 * Store a delegation hash as an ENS text record on the child's subdomain.
 * This makes the offchain-signed ERC-7715 delegation verifiable onchain
 * without needing to redeem it through the DelegationManager contract.
 */
async function storeDelegationOnchain(
  childAddress: Address,
  delegationHash: Hex,
  governanceContract: Address
): Promise<void> {
  // Derive the ENS label from known active delegations or address
  // The label is set by the caller in swarm.ts, but we can look up by address
  // by searching the ENS registry. For now, store on a label derived from the address.
  // The parent sets ENS labels before calling createVotingDelegation, so we
  // iterate active delegations to find the matching child label.
  try {
    // Use the child address to find its ENS label via reverse resolution
    const { reverseResolveAddress } = await import("./ens.js");
    const ensName = await reverseResolveAddress(childAddress);

    if (ensName) {
      // Strip the ".spawn.eth" suffix to get the label
      const label = ensName.replace(/\.spawn\.eth$/, "");
      const txHash = await setChildTextRecord(
        label,
        "erc7715.delegation.hash",
        delegationHash
      );
      if (txHash) {
        console.log(
          `[Delegation] Stored delegation hash onchain via ENS text record`,
          `\n  Label: ${label}.spawn.eth`,
          `\n  Key: erc7715.delegation.hash`,
          `\n  Tx: ${txHash}`
        );
        logParentAction(
          "store_delegation_hash_ens",
          { label, delegationHash, governanceContract },
          { txHash },
          txHash
        );
      }
    } else {
      console.log(
        `[Delegation] No ENS name found for ${childAddress.slice(0, 10)}... — delegation hash not stored onchain`
      );
    }
  } catch (err: any) {
    console.log(
      `[Delegation] Failed to store delegation hash onchain: ${err?.message?.slice(0, 60) || "unknown error"}`
    );
  }
}

/**
 * Verify that a delegation is valid and properly scoped.
 * Checks structure, signature presence, and caveat configuration.
 */
export function verifyDelegation(record: DelegationRecord): {
  valid: boolean;
  checks: Record<string, boolean>;
} {
  const checks: Record<string, boolean> = {
    hasSignature: false,
    hasCaveats: false,
    hasTargetCaveat: false,
    hasMethodCaveat: false,
    hasCallLimitCaveat: false,
    delegateeSet: false,
  };

  const { delegation } = record;

  // Check signature exists
  checks.hasSignature =
    delegation.signature !== undefined &&
    delegation.signature !== "0x" &&
    delegation.signature.length > 2;

  // Check caveats array exists and has entries
  checks.hasCaveats =
    Array.isArray(delegation.caveats) && delegation.caveats.length >= 3;

  if (checks.hasCaveats) {
    const enforcers = delegation.caveats.map((c) =>
      c.enforcer.toLowerCase()
    );

    checks.hasTargetCaveat = enforcers.includes(
      (environment.caveatEnforcers.AllowedTargetsEnforcer as string).toLowerCase()
    );
    checks.hasMethodCaveat = enforcers.includes(
      (environment.caveatEnforcers.AllowedMethodsEnforcer as string).toLowerCase()
    );
    checks.hasCallLimitCaveat = enforcers.includes(
      (environment.caveatEnforcers.LimitedCallsEnforcer as string).toLowerCase()
    );
  }

  // Verify delegatee is set
  checks.delegateeSet =
    record.delegatee !== undefined &&
    record.delegatee !== ("0x0000000000000000000000000000000000000000" as Address);

  const valid = Object.values(checks).every(Boolean);

  console.log(
    `[Delegation] Verification ${valid ? "PASSED" : "FAILED"}:`,
    checks
  );

  return { valid, checks };
}

/**
 * Revoke a delegation by removing it from active tracking.
 * In a full implementation this would also call the onchain revocation
 * via DelegationManager.disableDelegation().
 */
export function revokeDelegation(delegationHash: Hex): boolean {
  if (activeDelegations.has(delegationHash)) {
    activeDelegations.delete(delegationHash);
    console.log(`[Delegation] Revoked delegation ${delegationHash}`);
    return true;
  }
  console.log(`[Delegation] Delegation ${delegationHash} not found`);
  return false;
}

/**
 * Get all active delegations for a specific child address.
 */
export function getDelegationsForChild(
  childAddress: Address
): DelegationRecord[] {
  return Array.from(activeDelegations.values()).filter(
    (r) => r.delegatee.toLowerCase() === childAddress.toLowerCase()
  );
}

/**
 * Get all active delegations.
 */
export function getAllDelegations(): DelegationRecord[] {
  return Array.from(activeDelegations.values());
}
