/**
 * Filecoin Storage — Synapse SDK integration for Spawn Protocol
 *
 * Replaces Filebase/IPFS as the primary storage backend for:
 *   - Agent execution logs (every 10 entries + end of cycle)
 *   - Termination/post-mortem reports (lineage memory)
 *   - Swarm state snapshots (every 90s parent cycle)
 *   - Agent identity metadata (on spawn)
 *   - Vote rationale reveals (post-Lit decryption)
 *
 * Uses @filoz/synapse-sdk against Filecoin Calibration Testnet (chain 314159).
 * All calls are fire-and-forget resilient — errors fall through to IPFS fallback.
 *
 * Required env vars:
 *   FILECOIN_PRIVATE_KEY  — hex private key for Calibration wallet (0x...)
 *   FILECOIN_RPC_URL      — optional, defaults to glif calibration RPC
 */

import { Synapse } from "@filoz/synapse-sdk";
import { calibration } from "@filoz/synapse-sdk";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_RPC = "https://api.calibration.node.glif.io/rpc/v1";
const LOG_PATH = join(process.cwd(), "..", "agent_log.json");
const FILECOIN_EXPLORER = "https://calibration.filfox.info/en";

// Module-level singleton — initialized once on first use
let synapseInstance: Awaited<ReturnType<typeof Synapse.create>> | null = null;
let initAttempted = false;

function getPrivateKey(): `0x${string}` | null {
  const key = process.env.FILECOIN_PRIVATE_KEY;
  if (!key) return null;
  return key.startsWith("0x") ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`);
}

async function getSynapse(): Promise<typeof synapseInstance> {
  if (initAttempted) return synapseInstance;
  initAttempted = true;

  const privateKey = getPrivateKey();
  if (!privateKey) {
    console.warn("[Filecoin] FILECOIN_PRIVATE_KEY not set — Filecoin storage disabled");
    return null;
  }

  try {
    const account = privateKeyToAccount(privateKey);
    const rpcUrl = process.env.FILECOIN_RPC_URL || DEFAULT_RPC;

    synapseInstance = await Synapse.create({
      chain: calibration,
      transport: http(rpcUrl),
      account,
      source: "spawn-protocol",
    });

    console.log(`[Filecoin] Synapse initialized on Calibration Testnet (chain 314159)`);
    console.log(`[Filecoin] Wallet: ${account.address}`);
    return synapseInstance;
  } catch (err: any) {
    console.warn(`[Filecoin] Synapse init failed: ${err?.message?.slice(0, 80)}`);
    synapseInstance = null;
    return null;
  }
}

/**
 * Upload arbitrary JSON to Filecoin via Synapse SDK.
 * Returns the pieceCid string on success, throws on failure.
 */
// Synapse SDK enforces a minimum upload size of 127 bytes
const SYNAPSE_MIN_BYTES = 127;

export async function uploadToFilecoin(data: unknown): Promise<string> {
  const synapse = await getSynapse();
  if (!synapse) throw new Error("Synapse not initialized");

  const json = JSON.stringify(data);
  // Pad with whitespace if below minimum to satisfy provider requirement
  const padded = json.length < SYNAPSE_MIN_BYTES
    ? json + " ".repeat(SYNAPSE_MIN_BYTES - json.length)
    : json;
  const bytes = new TextEncoder().encode(padded);
  const result = await synapse.storage.upload(bytes);

  const cid = result.pieceCid.toString();
  const copies = result.copies.length;
  const complete = result.complete;

  console.log(`[Filecoin] Stored ${bytes.length} bytes | CID: ${cid} | copies: ${copies} | complete: ${complete}`);
  if (!complete) {
    console.warn(`[Filecoin] Partial upload — ${result.failedAttempts.length} failed attempts`);
  }

  return cid;
}

/**
 * Download and parse JSON from Filecoin by pieceCid.
 */
export async function downloadFromFilecoin(pieceCid: string): Promise<unknown> {
  const synapse = await getSynapse();
  if (!synapse) throw new Error("Synapse not initialized");

  const bytes = await synapse.storage.download({ pieceCid });
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Filecoin explorer URL for a given pieceCid.
 */
export function filecoinExplorerUrl(pieceCid: string): string {
  return `${FILECOIN_EXPLORER}/deal/${encodeURIComponent(pieceCid)}`;
}

// ── High-level helpers (same interface shape as ipfs.ts) ──────────────────────

const LOG_MAX_ENTRIES = 500;

/**
 * Pin agent_log.json to Filecoin. Returns pieceCid string.
 * Trims to last 500 entries to stay within reasonable size limits.
 */
export async function storeAgentLog(): Promise<string> {
  const raw = readFileSync(LOG_PATH, "utf-8");
  const logData = JSON.parse(raw);
  const trimmed = {
    ...logData,
    executionLogs: (logData.executionLogs ?? []).slice(-LOG_MAX_ENTRIES),
    entries: (logData.entries ?? []).slice(-LOG_MAX_ENTRIES),
    _filecoinNote: `Last ${LOG_MAX_ENTRIES} entries on Filecoin Calibration. Full log: https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json`,
    _storedAt: new Date().toISOString(),
    _chain: "filecoin-calibration-314159",
  };
  return uploadToFilecoin(trimmed);
}

/**
 * Store a termination/post-mortem report on Filecoin.
 * Returns pieceCid string, or null if storage fails.
 */
export async function storeTerminationReport(report: {
  lineageKey: string;
  generation: number;
  reason: string;
  score: number;
  childLabel: string;
  summary?: string;
  lessons?: string[];
  avoidPatterns?: string[];
  recommendedFocus?: string;
  votingHistory?: Array<{ proposalId: string; support: number; description?: string }>;
  ownerValues?: string;
}): Promise<string | null> {
  try {
    return await uploadToFilecoin({
      ...report,
      type: "termination_memory",
      project: "spawn-protocol",
      storage: "filecoin-calibration",
      chain: 314159,
      storedAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

/**
 * Store a full swarm state snapshot on Filecoin.
 * Called every parent cycle (~90s). Returns pieceCid string, or null on failure.
 *
 * This is the "Filecoin-backed agent state" that distinguishes Spawn Protocol
 * from Challenge #4 — every 90 seconds, the complete swarm state is checkpointed
 * to Filecoin with verifiable provenance.
 */
export async function storeSwarmStateSnapshot(state: {
  cycleNumber: number;
  activeAgents: Array<{
    label: string;
    address: string;
    governance: string;
    alignmentScore: number;
    voteCount: number;
    budget: string;
    generation: number;
  }>;
  ownerValues: string;
  totalVotes: number;
  terminatedThisCycle: string[];
  spawnedThisCycle: string[];
  ethBalance: string;
}): Promise<string | null> {
  try {
    return await uploadToFilecoin({
      ...state,
      type: "swarm_state_snapshot",
      project: "spawn-protocol",
      storage: "filecoin-calibration",
      chain: 314159,
      snapshotAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

/**
 * Store agent identity metadata on Filecoin at spawn time.
 * Returns pieceCid string, or null on failure.
 * CID should be stored as ENS text record "filecoin.identity".
 */
export async function storeAgentIdentityMetadata(metadata: {
  ensLabel: string;
  address: string;
  parentAddress: string;
  governanceContract: string;
  governanceName: string;
  generation: number;
  spawnedAt: string;
  erc8004Id?: string;
  delegationHash?: string;
  lineageCids?: string[];
}): Promise<string | null> {
  try {
    return await uploadToFilecoin({
      ...metadata,
      type: "agent_identity",
      project: "spawn-protocol",
      storage: "filecoin-calibration",
      chain: 314159,
    });
  } catch {
    return null;
  }
}

/**
 * Store a decrypted vote rationale on Filecoin after Lit Protocol reveal.
 * Returns pieceCid string, or null on failure.
 * CID stored as ENS text record "filecoin.rationale.{proposalId}".
 */
export async function storeVoteRationale(data: {
  childLabel: string;
  childAddress: string;
  proposalId: string;
  governanceContract: string;
  support: number;
  rationale: string;
  revealedAt: string;
}): Promise<string | null> {
  try {
    return await uploadToFilecoin({
      ...data,
      type: "vote_rationale",
      project: "spawn-protocol",
      storage: "filecoin-calibration",
      chain: 314159,
    });
  } catch {
    return null;
  }
}

/**
 * Check whether Filecoin storage is available (env key set + Synapse init succeeded).
 */
export async function isFilecoinAvailable(): Promise<boolean> {
  const synapse = await getSynapse();
  return synapse !== null;
}
