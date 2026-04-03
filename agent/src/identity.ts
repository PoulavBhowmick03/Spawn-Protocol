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
import { account, publicClient, sendTxAndWait, walletClient } from "./chain.js";

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

function findRegisteredAgentByUri(uri: string): RegisteredAgent | null {
  return Array.from(localRegistry.values()).find((agent) => agent.uri === uri) || null;
}

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
    return findRegisteredAgentByUri(uri) || registerLocal(uri, metadata);
  }
  console.log(`[ERC-8004] Queuing registration: ${uri} (type=${metadata.agentType})`);

  if (AGENT_REGISTRY_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      const agent = await registerAgentOnchain(uri, metadata);
      if (!agent) throw new Error("Onchain registration returned null");
      return agent;
    } catch (error: any) {
      console.log(`[ERC-8004] Registration failed for ${uri}: ${error?.message?.slice(0, 80)}`);
    }
  }

  // Fallback: local registration
  registeredUris.add(uri);
  return findRegisteredAgentByUri(uri) || registerLocal(uri, metadata);
}

export async function registerAgentOnchain(
  uri: string,
  metadata: AgentMetadata
): Promise<RegisteredAgent | null> {
  if (AGENT_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return null;
  }

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

      if (agentId <= 0n) {
        throw new Error("AgentRegistered event missing agentId");
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
      registeredUris.add(uri);
      console.log(`[ERC-8004] Registered onchain ID #${agentId}: ${uri}`);
      return agent;
    });
    return agent;
  } catch (error: any) {
    console.log(`[ERC-8004] Onchain registration failed for ${uri}: ${error?.message?.slice(0, 80)}`);
    return null;
  }
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
 * Judge-mode helper: set a single metadata key and return the tx hash.
 * This is used when the proof flow needs explicit onchain receipts.
 */
export async function setAgentMetadataValue(
  agentId: bigint,
  key: string,
  value: string
): Promise<string | null> {
  if (AGENT_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  try {
    return await enqueueWrite(async () => {
      const hash = await walletClient.writeContract({
        address: AGENT_REGISTRY_ADDRESS,
        abi: ERC8004_ABI,
        functionName: "setMetadata",
        args: [agentId, key, value],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[ERC-8004] setMetadata ${key}=${value} for agent ${agentId} (tx: ${hash})`);
      return hash;
    });
  } catch (err: any) {
    console.log(`[ERC-8004] setMetadata ${key} failed for ${agentId}: ${err?.message?.slice(0, 60)}`);
    return null;
  }
}

export async function getAgentMetadataValue(
  agentId: bigint,
  key: string
): Promise<string | null> {
  return fetchMetadata(agentId, key);
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
      const receipt = await sendTxAndWait({
        address: REPUTATION_REGISTRY_ADDRESS,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: "giveFeedback",
        args: [agentId, BigInt(Math.min(Math.max(score, 0), 100)), tags, endpoint, comment],
      });
      const hash = receipt.transactionHash;
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
      const receipt = await sendTxAndWait({
        address: VALIDATION_REGISTRY_ADDRESS,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationRequest",
        args: [agentId, validatorAddress, uri, contentHash, actionType],
      });
      const hash = receipt.transactionHash;
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
      const receipt = await sendTxAndWait({
        address: VALIDATION_REGISTRY_ADDRESS,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: "validationResponse",
        args: [requestId, BigInt(Math.min(Math.max(score, 0), 100)), approved, comment],
      });
      const hash = receipt.transactionHash;
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

const TRUST_MIN_REPUTATION = Number(process.env.ERC8004_TRUST_MIN_REPUTATION || 45);
const TRUST_MIN_VALIDATION_SCORE = Number(process.env.ERC8004_TRUST_MIN_VALIDATION_SCORE || 40);
const TRUST_MAX_REJECTIONS = Number(process.env.ERC8004_TRUST_MAX_REJECTIONS || 0);
const TRUST_CACHE_TTL_MS = Number(process.env.ERC8004_TRUST_CACHE_TTL_MS || 15_000);

export interface AgentTrustDecision {
  allowed: boolean;
  status: "healthy" | "gated";
  reason: string;
  checkedAt: number;
  reputation: Awaited<ReturnType<typeof getReputationSummary>>;
  validation: Awaited<ReturnType<typeof getValidationSummary>>;
}

const trustDecisionCache = new Map<string, { expiresAt: number; decision: AgentTrustDecision }>();
const resolvedAgentIdCache = new Map<string, bigint>();
const AGENT_ID_SCAN_START = Number(process.env.ERC8004_SCAN_START || 2200);
const AGENT_ID_SCAN_END = Number(process.env.ERC8004_SCAN_END || 4000);

/**
 * Evaluate whether an agent should retain autonomous voting authority.
 * This is intentionally conservative: if the agent has no trust history yet,
 * it remains allowed. Once it accumulates negative ERC-8004 signals, runtime
 * callers can gate delegation or voting behavior.
 */
export async function getAgentTrustDecision(agentId: bigint): Promise<AgentTrustDecision> {
  const cacheKey = agentId.toString();
  const cached = trustDecisionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.decision;
  }

  const [reputation, validation] = await Promise.all([
    getReputationSummary(agentId),
    getValidationSummary(agentId),
  ]);

  let allowed = true;
  let reason = "trust_healthy";

  if (validation && validation.rejected > TRUST_MAX_REJECTIONS) {
    allowed = false;
    reason = `validation_rejected_${validation.rejected}`;
  } else if (
    validation &&
    validation.validated > 0 &&
    validation.averageScore < TRUST_MIN_VALIDATION_SCORE
  ) {
    allowed = false;
    reason = `validation_score_${validation.averageScore}`;
  } else if (
    reputation &&
    reputation.activeFeedback > 0 &&
    reputation.averageScore < TRUST_MIN_REPUTATION
  ) {
    allowed = false;
    reason = `reputation_score_${reputation.averageScore}`;
  }

  const decision: AgentTrustDecision = {
    allowed,
    status: allowed ? "healthy" : "gated",
    reason,
    checkedAt: Date.now(),
    reputation,
    validation,
  };

  trustDecisionCache.set(cacheKey, {
    expiresAt: Date.now() + TRUST_CACHE_TTL_MS,
    decision,
  });

  return decision;
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

export async function resolveAgentIdByLabelOnchain(label: string): Promise<bigint | undefined> {
  const cached = agentIdByLabel.get(label) || resolvedAgentIdCache.get(label);
  if (cached !== undefined) {
    return cached;
  }

  const baseLabel = label.replace(/-v\d+$/, "");
  const targets = new Set([
    `spawn://${label}.spawn.eth`.toLowerCase(),
    `spawn://${baseLabel}.spawn.eth`.toLowerCase(),
  ]);

  for (let batchStart = AGENT_ID_SCAN_START; batchStart <= AGENT_ID_SCAN_END; batchStart += 20) {
    const batchEnd = Math.min(batchStart + 19, AGENT_ID_SCAN_END);
    const ids = Array.from({ length: batchEnd - batchStart + 1 }, (_, index) => BigInt(batchStart + index));
    const uris = await Promise.all(
      ids.map((agentId) =>
        publicClient.readContract({
          address: AGENT_REGISTRY_ADDRESS,
          abi: ERC8004_ABI,
          functionName: "agentURI",
          args: [agentId],
        }).catch(() => null)
      )
    );

    for (let i = 0; i < ids.length; i++) {
      const uri = (uris[i] as string | null)?.toLowerCase();
      if (!uri || !targets.has(uri)) continue;
      trackAgentId(label, ids[i]);
      resolvedAgentIdCache.set(label, ids[i]);
      if (baseLabel !== label) {
        resolvedAgentIdCache.set(baseLabel, ids[i]);
      }
      return ids[i];
    }
  }

  return undefined;
}
