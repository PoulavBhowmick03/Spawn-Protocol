/**
 * ENS Subdomain Registration — Onchain agent identity via SpawnENSRegistry
 *
 * Uses our custom SpawnENSRegistry deployed on Base Sepolia since real ENS
 * doesn't exist there. Registers subdomains like {dao-name}.spawn.eth for
 * each child agent, with text records for metadata.
 *
 * Satisfies all 3 ENS bounties:
 * - ENS Identity ($600): agents use ENS names as primary identity
 * - ENS Communication ($600): parent resolves children by name, not hex address
 * - ENS Open Integration ($300): ENS is core to agent identity system
 */

import { type Address, type Hex } from "viem";
import { account, publicClient, walletClient, sendTxAndWait } from "./chain.js";

// ── SpawnENSRegistry deployed on Base Sepolia ──
export const SPAWN_ENS_REGISTRY_ADDRESS: Address =
  (process.env.SPAWN_ENS_REGISTRY_ADDRESS as Address) ||
  "0x29170A43352D65329c462e6cDacc1c002419331D";

const PARENT_DOMAIN = "spawn.eth";

// SpawnENSRegistry ABI
export const SpawnENSRegistryABI = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "registerSubdomain",
    inputs: [
      { name: "label", type: "string" },
      { name: "addr", type: "address" },
    ],
    outputs: [{ name: "node", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deregisterSubdomain",
    inputs: [{ name: "label", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolve",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reverseResolve",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setTextRecord",
    inputs: [
      { name: "label", type: "string" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getTextRecord",
    inputs: [
      { name: "label", type: "string" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "updateAddress",
    inputs: [
      { name: "label", type: "string" },
      { name: "newAddr", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAllSubdomains",
    inputs: [],
    outputs: [
      { name: "names", type: "string[]" },
      { name: "addresses", type: "address[]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRecord",
    inputs: [{ name: "label", type: "string" }],
    outputs: [
      { name: "recordOwner", type: "address" },
      { name: "resolvedAddress", type: "address" },
      { name: "name", type: "string" },
      { name: "registeredAt", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "computeNode",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "subdomainCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "parentDomain",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "NameRegistered",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "resolvedAddress", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "NameDeregistered",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "name", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TextRecordSet",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "key", type: "string", indexed: false },
      { name: "value", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AddressChanged",
    inputs: [
      { name: "node", type: "bytes32", indexed: true },
      { name: "newAddress", type: "address", indexed: false },
    ],
  },
] as const;

/**
 * Register a subdomain onchain for a child agent.
 * e.g., registerSubdomain("uniswap-dao", "0x123...") => uniswap-dao.spawn.eth
 */
export async function registerSubdomain(
  label: string,
  childAddress: Address
): Promise<{ name: string; node?: Hex; txHash?: string }> {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const fullName = `${normalizedLabel}.${PARENT_DOMAIN}`;

  console.log(`[ENS] Registering subdomain onchain: ${fullName} => ${childAddress}`);

  try {
    const receipt = await sendTxAndWait({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "registerSubdomain",
      args: [normalizedLabel, childAddress],
    });

    console.log(`[ENS] Registered onchain: ${fullName} => ${childAddress} (tx: ${receipt.transactionHash})`);
    return { name: fullName, txHash: receipt.transactionHash };
  } catch (err: any) {
    const msg = err?.message || "";
    if (msg.includes("already registered")) {
      console.log(`[ENS] ${fullName} already registered, skipping`);
      return { name: fullName };
    }
    console.log(`[ENS] Registration failed: ${msg.slice(0, 80)}`);
    return { name: fullName };
  }
}

/**
 * Deregister a subdomain onchain when a child is terminated.
 */
export async function deregisterSubdomain(label: string): Promise<boolean> {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const fullName = `${normalizedLabel}.${PARENT_DOMAIN}`;

  console.log(`[ENS] Deregistering subdomain onchain: ${fullName}`);

  try {
    const receipt = await sendTxAndWait({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "deregisterSubdomain",
      args: [normalizedLabel],
    });

    console.log(`[ENS] Deregistered onchain: ${fullName} (tx: ${receipt.transactionHash})`);
    return true;
  } catch (err: any) {
    console.log(`[ENS] Deregistration failed: ${err?.message?.slice(0, 80)}`);
    return false;
  }
}

/**
 * Resolve a child agent's address from its subdomain label via onchain lookup.
 */
export async function resolveChild(label: string): Promise<Address | null> {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const fullName = `${normalizedLabel}.${PARENT_DOMAIN}`;

  try {
    const resolved = (await publicClient.readContract({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "resolve",
      args: [normalizedLabel],
    })) as Address;

    if (resolved === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    console.log(`[ENS] Resolved ${fullName} => ${resolved}`);
    return resolved;
  } catch (err: any) {
    console.log(`[ENS] Resolution failed for ${fullName}: ${err?.message?.slice(0, 50)}`);
    return null;
  }
}

/**
 * Reverse resolve an address to an ENS name via onchain lookup.
 */
export async function reverseResolveAddress(addr: Address): Promise<string | null> {
  try {
    const name = (await publicClient.readContract({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "reverseResolve",
      args: [addr],
    })) as string;

    if (!name || name.length === 0) return null;
    return name;
  } catch {
    return null;
  }
}

/**
 * Set text records on a child's ENS subdomain for agent metadata.
 */
export async function setChildTextRecord(
  label: string,
  key: string,
  value: string
): Promise<Hex | null> {
  const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9-]/g, "");

  try {
    const receipt = await sendTxAndWait({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "setTextRecord",
      args: [normalizedLabel, key, value],
    });

    console.log(`[ENS] Text record set: ${normalizedLabel}.${PARENT_DOMAIN} ${key}=${value}`);
    return receipt.transactionHash;
  } catch (err: any) {
    console.log(`[ENS] Text record failed: ${err?.message?.slice(0, 50)}`);
    return null;
  }
}

/**
 * Set multiple metadata text records for a child agent in one go.
 */
export async function setAgentMetadata(
  label: string,
  metadata: {
    agentType?: string;
    governanceContract?: string;
    alignmentScore?: string;
    walletAddress?: string;
    capabilities?: string;
  }
): Promise<void> {
  const entries = Object.entries(metadata).filter(([_, v]) => v !== undefined);
  for (const [key, value] of entries) {
    try {
      await setChildTextRecord(label, key, value!);
    } catch {
      // Continue with remaining records
    }
  }
}

/**
 * Get all registered child subdomains from the onchain registry.
 */
export async function getAllRegisteredChildren(): Promise<
  Array<{ name: string; address: Address }>
> {
  try {
    const [names, addresses] = (await publicClient.readContract({
      address: SPAWN_ENS_REGISTRY_ADDRESS,
      abi: SpawnENSRegistryABI,
      functionName: "getAllSubdomains",
    })) as [string[], Address[]];

    return names.map((name, i) => ({ name, address: addresses[i] }));
  } catch (err: any) {
    console.log(`[ENS] Could not fetch all subdomains: ${err?.message?.slice(0, 50)}`);
    return [];
  }
}
