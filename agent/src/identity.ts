/**
 * ERC-8004 Onchain Agent Identity — Register agents on Base Sepolia
 *
 * Each agent (parent + children) gets a registered onchain identity with
 * metadata including agent type, assigned DAO, and alignment score.
 * Required for Protocol Labs bounties and improves AI judge scoring.
 *
 * Integrates all three ERC-8004 registries:
 *   1. Identity Registry — agent registration + metadata
 *   2. Reputation Registry — feedback after alignment evaluations
 *   3. Validation Registry — third-party verification of agent work
 */

import { type Address, type Hex, keccak256, toHex } from "viem";
import { account, publicClient, walletClient } from "./chain.js";

// ERC-8004 Agent Registry — deployed on Base Sepolia
const AGENT_REGISTRY_ADDRESS =
  (process.env.ERC8004_REGISTRY_ADDRESS as Address) ||
  ("0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address);

// Minimal ERC-8004 ABI based on the standard
const ERC8004_ABI = [
  {
    type: "function",
    name: "register",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMetadata",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getMetadata",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentURI",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setAgentURI",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MetadataUpdated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "key", type: "string", indexed: false },
      { name: "value", type: "string", indexed: false },
    ],
  },
];

export interface AgentMetadata {
  agentType: "parent" | "child";
  assignedDAO?: string;
  alignmentScore?: number;
  governanceContract?: Address;
  ensName?: string;
  capabilities?: string[];
  createdAt?: number;
}

interface RegisteredAgent {
  agentId: bigint;
  uri: string;
  metadata: AgentMetadata;
  owner: Address;
  registeredAt: number;
  txHash?: Hex;
}

// In-memory registry for demo when ERC-8004 contract isn't available
let nextLocalId = BigInt(1);
const localRegistry = new Map<string, RegisteredAgent>();
// URIs already registered this process lifetime — prevents parent re-registering on every restart
const registeredUris = new Set<string>();

// Serialize all onchain writes through a single queue to prevent nonce conflicts.
// The swarm spawns multiple children concurrently — without this, concurrent
// writeContract calls from the same EOA collide on nonce and silently revert.
let _writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = _writeQueue.then(fn);
  // Swallow errors on the queue tail so one failure doesn't block subsequent writes
  _writeQueue = result.then(() => {}, () => {});
  return result;
}

/**
 * Register an agent onchain with ERC-8004 identity.
 * Serialized via write queue to prevent nonce conflicts on concurrent spawns.
 * Falls back to local tracking if the registry call fails.
 */
export async function registerAgent(
  uri: string,
  metadata: AgentMetadata
): Promise<RegisteredAgent> {
  if (registeredUris.has(uri)) {
    console.log(`[ERC-8004] Skipping duplicate registration: ${uri}`);
    return registerLocal(uri, metadata);
  }
  registeredUris.add(uri);
  console.log(`[ERC-8004] Queuing registration: ${uri} (type=${metadata.agentType})`);

  if (AGENT_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      const agent = await enqueueWrite(async () => {
        const txHash = await walletClient.writeContract({
          address: AGENT_REGISTRY_ADDRESS,
          abi: ERC8004_ABI,
          functionName: "register",
          args: [uri],
        });

        console.log(`[ERC-8004] Registration TX sent: ${txHash}`);

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        // Extract agentId from AgentRegistered event (0xca52e62c...).
        // The ERC-721 Transfer event is emitted first with topics[1]=from (0x0),
        // so we must find the AgentRegistered event specifically, not the first log.
        const AGENT_REGISTERED_SIG = "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a";
        let agentId = BigInt(0);
        for (const log of receipt.logs) {
          if (
            log.address.toLowerCase() === AGENT_REGISTRY_ADDRESS.toLowerCase() &&
            log.topics[0] === AGENT_REGISTERED_SIG &&
            log.topics[1]
          ) {
            try { agentId = BigInt(log.topics[1]); } catch {}
            break;
          }
        }

        const agent: RegisteredAgent = {
          agentId,
          uri,
          metadata,
          owner: account.address,
          registeredAt: Date.now(),
          txHash,
        };
        localRegistry.set(agentId.toString(), agent);
        console.log(`[ERC-8004] Registered onchain ID #${agentId}: ${uri}`);
        return agent;
      });
      return agent;
    } catch (error: any) {
      console.log(`[ERC-8004] Registration failed for ${uri}: ${error?.message?.slice(0, 80)}`);
    }
  }

  // Fallback: local registration
  return registerLocal(uri, metadata);
}

/**
 * Local fallback registration.
 */
function registerLocal(
  uri: string,
  metadata: AgentMetadata
): RegisteredAgent {
  const agentId = nextLocalId++;
  const agent: RegisteredAgent = {
    agentId,
    uri,
    metadata,
    owner: account.address,
    registeredAt: Date.now(),
  };

  localRegistry.set(agentId.toString(), agent);
  console.log(`[ERC-8004] Agent registered locally with ID: ${agentId}`);
  return agent;
}

/**
 * Update metadata for a registered agent.
 * Used to update alignment scores, DAO assignments, etc.
 */
export async function updateAgentMetadata(
  agentId: bigint,
  metadata: Partial<AgentMetadata>
): Promise<boolean> {
  const key = agentId.toString();
  const existing = localRegistry.get(key);

  if (!existing) {
    console.log(`[ERC-8004] Agent ${agentId} not found`);
    return false;
  }

  // Merge metadata
  const updatedMetadata: AgentMetadata = {
    ...existing.metadata,
    ...metadata,
  };

  // Try onchain update (serialized through write queue)
  if (AGENT_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    const entries = serializeMetadata(metadata);
    for (const [metaKey, metaValue] of entries) {
      try {
        await enqueueWrite(() =>
          walletClient.writeContract({
            address: AGENT_REGISTRY_ADDRESS,
            abi: ERC8004_ABI,
            functionName: "setMetadata",
            args: [agentId, metaKey, metaValue],
          }).then((hash) => {
            console.log(`[ERC-8004] setMetadata ${metaKey} tx: ${hash}`);
          })
        );
      } catch (e: any) {
        console.log(`[ERC-8004] setMetadata ${metaKey} failed: ${e?.message?.slice(0, 60)}`);
      }
    }
  }

  // Update local
  existing.metadata = updatedMetadata;
  localRegistry.set(key, existing);

  console.log(
    `[ERC-8004] Updated agent ${agentId} metadata:`,
    JSON.stringify(metadata)
  );
  return true;
}

/**
 * Get a registered agent by ID.
 */
export async function getAgent(
  agentId: bigint
): Promise<RegisteredAgent | null> {
  const key = agentId.toString();
  const local = localRegistry.get(key);

  if (local) {
    return local;
  }

  // Try onchain lookup
  if (AGENT_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      const uri = await publicClient.readContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: ERC8004_ABI,
        functionName: "agentURI",
        args: [agentId],
      });

      const owner = await publicClient.readContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: ERC8004_ABI,
        functionName: "ownerOf",
        args: [agentId],
      });

      // Fetch metadata fields
      const agentType = await fetchMetadata(agentId, "agentType");
      const assignedDAO = await fetchMetadata(agentId, "assignedDAO");
      const alignmentStr = await fetchMetadata(agentId, "alignmentScore");
      const governanceContract = await fetchMetadata(
        agentId,
        "governanceContract"
      );
      const ensName = await fetchMetadata(agentId, "ensName");

      const metadata: AgentMetadata = {
        agentType: (agentType as "parent" | "child") || "child",
        assignedDAO: assignedDAO || undefined,
        alignmentScore: alignmentStr ? parseInt(alignmentStr) : undefined,
        governanceContract: governanceContract
          ? (governanceContract as Address)
          : undefined,
        ensName: ensName || undefined,
      };

      return {
        agentId,
        uri: uri as string,
        metadata,
        owner: owner as Address,
        registeredAt: Date.now(),
      };
    } catch {
      // Not found onchain
    }
  }

  return null;
}

/**
 * Get all registered agents from local registry.
 */
export function getAllAgents(): RegisteredAgent[] {
  return Array.from(localRegistry.values());
}

/**
 * Get all child agents from local registry.
 */
export function getChildAgents(): RegisteredAgent[] {
  return Array.from(localRegistry.values()).filter(
    (a) => a.metadata.agentType === "child"
  );
}

/**
 * Get the parent agent from local registry.
 */
export function getParentAgent(): RegisteredAgent | null {
  return (
    Array.from(localRegistry.values()).find(
      (a) => a.metadata.agentType === "parent"
    ) || null
  );
}

/**
 * Deregister an agent (when child is terminated).
 */
export function deregisterAgent(agentId: bigint): boolean {
  const key = agentId.toString();
  const removed = localRegistry.delete(key);
  if (removed) {
    console.log(`[ERC-8004] Deregistered agent ${agentId}`);
  }
  return removed;
}

// --- Helpers ---

/**
 * Convert AgentMetadata into key-value pairs for onchain storage.
 */
function serializeMetadata(
  metadata: Partial<AgentMetadata>
): [string, string][] {
  const entries: [string, string][] = [];

  if (metadata.agentType !== undefined) {
    entries.push(["agentType", metadata.agentType]);
  }
  if (metadata.assignedDAO !== undefined) {
    entries.push(["assignedDAO", metadata.assignedDAO]);
  }
  if (metadata.alignmentScore !== undefined) {
    entries.push(["alignmentScore", metadata.alignmentScore.toString()]);
  }
  if (metadata.governanceContract !== undefined) {
    entries.push(["governanceContract", metadata.governanceContract]);
  }
  if (metadata.ensName !== undefined) {
    entries.push(["ensName", metadata.ensName]);
  }
  if (metadata.capabilities !== undefined) {
    entries.push(["capabilities", JSON.stringify(metadata.capabilities)]);
  }
  if (metadata.createdAt !== undefined) {
    entries.push(["createdAt", metadata.createdAt.toString()]);
  }

  return entries;
}

/**
 * Fetch a single metadata value from the onchain registry.
 */
async function fetchMetadata(
  agentId: bigint,
  key: string
): Promise<string | null> {
  try {
    const value = await publicClient.readContract({
      address: AGENT_REGISTRY_ADDRESS,
      abi: ERC8004_ABI,
      functionName: "getMetadata",
      args: [agentId, key],
    });
    return (value as string) || null;
  } catch {
    return null;
  }
}

/**
 * Update an agent's onchain URI with current stats.
 * Creates a verifiable performance trail on ERC-8004 — each update is an onchain tx.
 * URI format: spawn://{label}.spawn.eth?alignment={score}&votes={count}&status={status}&updatedAt={timestamp}
 */
export async function updateAgentURI(
  agentId: bigint,
  label: string,
  stats: { alignmentScore?: number; voteCount?: number; status?: string; chain?: string }
): Promise<string | null> {
  const registryAddr = AGENT_REGISTRY_ADDRESS;
  if (!registryAddr || registryAddr === "0x0000000000000000000000000000000000000000") return null;

  const params = new URLSearchParams();
  if (stats.alignmentScore !== undefined) params.set("alignment", stats.alignmentScore.toString());
  if (stats.voteCount !== undefined) params.set("votes", stats.voteCount.toString());
  if (stats.status) params.set("status", stats.status);
  if (stats.chain) params.set("chain", stats.chain);
  params.set("updatedAt", Math.floor(Date.now() / 1000).toString());

  const uri = `spawn://${label}.spawn.eth?${params.toString()}`;

  try {
    return await enqueueWrite(async () => {
      const hash = await walletClient.writeContract({
        address: registryAddr,
        abi: ERC8004_ABI,
        functionName: "setAgentURI",
        args: [agentId, uri],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[ERC-8004] Updated agent ${agentId} URI: ${uri} (tx: ${receipt.transactionHash})`);
      return receipt.transactionHash;
    });
  } catch (err: any) {
    console.log(`[ERC-8004] setAgentURI failed for ${agentId}: ${err?.message?.slice(0, 50)}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ERC-8004 Reputation Registry
// ═══════════════════════════════════════════════════════════════════

const REPUTATION_REGISTRY_ADDRESS =
  (process.env.REPUTATION_REGISTRY_ADDRESS as Address) ||
  ("0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14" as Address);

const REPUTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "giveFeedback",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "tags", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "comment", type: "string" },
    ],
    outputs: [{ name: "feedbackId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeFeedback",
    inputs: [{ name: "feedbackId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSummary",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalFeedback", type: "uint256" },
          { name: "activeFeedback", type: "uint256" },
          { name: "averageScore", type: "uint256" },
          { name: "highestScore", type: "uint256" },
          { name: "lowestScore", type: "uint256" },
          { name: "lastUpdated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeedbackCount",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      { name: "total", type: "uint256" },
      { name: "active", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalFeedbackCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Submit reputation feedback for an agent after alignment evaluation.
 * Called by the parent agent in the alignment eval loop.
 */
export async function submitReputationFeedback(
  agentId: bigint,
  score: number,
  tags: string,
  endpoint: string,
  comment: string = ""
): Promise<string | null> {
  try {
    return await enqueueWrite(async () => {
      const hash = await walletClient.writeContract({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "giveFeedback",
        args: [agentId, BigInt(Math.min(Math.max(score, 0), 100)), tags, endpoint, comment],
      });
      console.log(`[Reputation] Feedback submitted for agent ${agentId}: score=${score} tags=${tags} (tx: ${hash})`);
      return hash;
    });
  } catch (err: any) {
    console.log(`[Reputation] giveFeedback failed for ${agentId}: ${err?.message?.slice(0, 60)}`);
    return null;
  }
}

/**
 * Get reputation summary for an agent from the onchain registry.
 */
export async function getReputationSummary(agentId: bigint): Promise<{
  totalFeedback: number;
  activeFeedback: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
} | null> {
  try {
    const summary = await publicClient.readContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId],
    }) as any;
    return {
      totalFeedback: Number(summary.totalFeedback),
      activeFeedback: Number(summary.activeFeedback),
      averageScore: Number(summary.averageScore),
      highestScore: Number(summary.highestScore),
      lowestScore: Number(summary.lowestScore),
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ERC-8004 Validation Registry
// ═══════════════════════════════════════════════════════════════════

const VALIDATION_REGISTRY_ADDRESS =
  (process.env.VALIDATION_REGISTRY_ADDRESS as Address) ||
  ("0x3caE87f24e15970a8e19831CeCD5FAe3c087a546" as Address);

const VALIDATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "validationRequest",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "validator", type: "address" },
      { name: "uri", type: "string" },
      { name: "contentHash", type: "bytes32" },
      { name: "actionType", type: "string" },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "validationResponse",
    inputs: [
      { name: "requestId", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "approved", type: "bool" },
      { name: "comment", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getSummary",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalRequests", type: "uint256" },
          { name: "validated", type: "uint256" },
          { name: "rejected", type: "uint256" },
          { name: "pending", type: "uint256" },
          { name: "averageScore", type: "uint256" },
          { name: "lastValidated", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalValidationCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Request validation of an agent's work (e.g., a vote or alignment eval).
 * Returns the requestId for later response.
 */
export async function requestValidation(
  agentId: bigint,
  validatorAddress: Address,
  uri: string,
  contentHash: `0x${string}`,
  actionType: string
): Promise<{ txHash: string; requestId?: bigint } | null> {
  try {
    return await enqueueWrite(async () => {
      const hash = await walletClient.writeContract({
        address: VALIDATION_REGISTRY_ADDRESS,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationRequest",
        args: [agentId, validatorAddress, uri, contentHash, actionType],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      // Extract requestId from ValidationRequested event
      let requestId: bigint | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === VALIDATION_REGISTRY_ADDRESS.toLowerCase() && log.topics[0]) {
          try { requestId = BigInt(log.topics[1] || "0"); } catch {}
          break;
        }
      }
      console.log(`[Validation] Request submitted for agent ${agentId}: type=${actionType} (tx: ${hash})`);
      return { txHash: hash, requestId };
    });
  } catch (err: any) {
    console.log(`[Validation] validationRequest failed for ${agentId}: ${err?.message?.slice(0, 60)}`);
    return null;
  }
}

/**
 * Submit a validation response (parent validates child's work).
 */
export async function submitValidationResponse(
  requestId: bigint,
  score: number,
  approved: boolean,
  comment: string = ""
): Promise<string | null> {
  try {
    return await enqueueWrite(async () => {
      const hash = await walletClient.writeContract({
        address: VALIDATION_REGISTRY_ADDRESS,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationResponse",
        args: [requestId, BigInt(Math.min(Math.max(score, 0), 100)), approved, comment],
      });
      console.log(`[Validation] Response submitted for request ${requestId}: score=${score} approved=${approved} (tx: ${hash})`);
      return hash;
    });
  } catch (err: any) {
    console.log(`[Validation] validationResponse failed for ${requestId}: ${err?.message?.slice(0, 60)}`);
    return null;
  }
}

/**
 * Get validation summary for an agent.
 */
export async function getValidationSummary(agentId: bigint): Promise<{
  totalRequests: number;
  validated: number;
  rejected: number;
  pending: number;
  averageScore: number;
} | null> {
  try {
    const summary = await publicClient.readContract({
      address: VALIDATION_REGISTRY_ADDRESS,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getSummary",
      args: [agentId],
    }) as any;
    return {
      totalRequests: Number(summary.totalRequests),
      validated: Number(summary.validated),
      rejected: Number(summary.rejected),
      pending: Number(summary.pending),
      averageScore: Number(summary.averageScore),
    };
  } catch {
    return null;
  }
}

/**
 * Convenience: hash content for validation request contentHash field.
 */
export function hashContent(content: string): `0x${string}` {
  return keccak256(toHex(content));
}

// Track ERC-8004 agent IDs by ENS label for the swarm to reference
const agentIdByLabel = new Map<string, bigint>();

/**
 * Store a child's ERC-8004 agent ID mapped to its ENS label.
 */
export function trackAgentId(label: string, agentId: bigint) {
  agentIdByLabel.set(label, agentId);
}

/**
 * Look up a child's ERC-8004 agent ID by ENS label.
 */
export function getAgentIdByLabel(label: string): bigint | undefined {
  return agentIdByLabel.get(label);
}
