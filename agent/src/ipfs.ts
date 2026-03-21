/**
 * IPFS Integration — Pin agent execution logs to IPFS via Pinata
 *
 * Provides verifiable, immutable storage for agent_log.json so that
 * governance actions have a permanent audit trail beyond the local file.
 *
 * Uses Pinata's free HTTP API (no SDK). Gracefully degrades if PINATA_JWT
 * is not set — logs a warning and skips without crashing.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { setChildTextRecord } from "./ens.js";

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const LOG_PATH = join(process.cwd(), "..", "agent_log.json");

function getPinataJWT(): string | null {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    console.warn("[IPFS] PINATA_JWT not set — skipping IPFS pin");
    return null;
  }
  return jwt;
}

/**
 * Pin arbitrary JSON data to IPFS via Pinata.
 * Returns the CID (content identifier) on success.
 */
export async function pinToIPFS(data: any): Promise<string> {
  const jwt = getPinataJWT();
  if (!jwt) {
    throw new Error("PINATA_JWT not configured");
  }

  const body = JSON.stringify({
    pinataContent: data,
    pinataMetadata: {
      name: `spawn-protocol-log-${Date.now()}`,
    },
  });

  const response = await fetch(PINATA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    throw new Error(`Pinata API error ${response.status}: ${text}`);
  }

  const result = (await response.json()) as { IpfsHash: string };
  return result.IpfsHash;
}

/**
 * Read agent_log.json from disk and pin it to IPFS.
 * Returns the CID on success.
 */
export async function pinAgentLog(): Promise<string> {
  const raw = readFileSync(LOG_PATH, "utf-8");
  const logData = JSON.parse(raw);
  const cid = await pinToIPFS(logData);
  return cid;
}

/**
 * Store a CID as an ENS text record on SpawnENSRegistry.
 * Uses label "parent" and key "ipfs.agent_log".
 */
export async function storeLogCIDOnchain(cid: string): Promise<void> {
  await setChildTextRecord("parent", "ipfs.agent_log", cid);
}

/**
 * Pin a termination memory record to IPFS for lineage persistence.
 * Returns the CID on success, null on failure.
 */
export async function pinTerminationMemory(report: {
  lineageKey: string;
  generation: number;
  reason: string;
  score: number;
  childLabel: string;
  // Structured Venice analysis
  summary?: string;
  lessons?: string[];
  avoidPatterns?: string[];
  recommendedFocus?: string;
  // Actual voting record that triggered termination
  votingHistory?: Array<{ proposalId: string; support: number; description?: string }>;
  ownerValues?: string;
}): Promise<string | null> {
  try {
    return await pinToIPFS({
      ...report,
      type: 'termination_memory',
      project: 'spawn-protocol',
      pinnedAt: new Date().toISOString(),
    });
  } catch { return null; }
}
