import "server-only";

import { Synapse, calibration } from "@filoz/synapse-sdk";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync } from "fs";
import { join } from "path";
import { getCached, setCache } from "@/lib/server-client";

const CACHE_TTL = 30_000;
const DEFAULT_RPC = "https://api.calibration.node.glif.io/rpc/v1";
const ROOT_ENV_PATH = join(process.cwd(), "..", ".env");

let synapsePromise: Promise<Awaited<ReturnType<typeof Synapse.create>> | null> | null = null;

if (!process.env.FILECOIN_PRIVATE_KEY && existsSync(ROOT_ENV_PATH)) {
  try {
    process.loadEnvFile(ROOT_ENV_PATH);
  } catch {}
}

export function isFilecoinPieceCid(cid: string) {
  return cid.startsWith("bafkzci");
}

async function getSynapse() {
  if (synapsePromise) return synapsePromise;

  synapsePromise = (async () => {
    const key = process.env.FILECOIN_PRIVATE_KEY;
    if (!key) return null;

    try {
      const privateKey = key.startsWith("0x") ? key : `0x${key}`;
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      return await Synapse.create({
        chain: calibration,
        transport: http(process.env.FILECOIN_RPC_URL || DEFAULT_RPC),
        account,
        source: "spawn-protocol-dashboard",
      });
    } catch {
      return null;
    }
  })();

  return synapsePromise;
}

async function fetchFromFilecoin(cid: string) {
  const synapse = await getSynapse();
  if (!synapse) {
    throw new Error("Filecoin storage is not configured on the dashboard server");
  }

  const bytes = await synapse.storage.download({ pieceCid: cid });
  const text = new TextDecoder().decode(bytes).trim();
  return JSON.parse(text);
}

async function fetchFromIpfs(cid: string) {
  const gateways = [
    `https://ipfs.filebase.io/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];

  for (const url of gateways) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      return await res.json();
    } catch {}
  }

  throw new Error(`Unable to fetch storage object for ${cid}`);
}

export async function fetchStorageObject(cid: string) {
  const cacheKey = `storage:${cid}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  const storage = isFilecoinPieceCid(cid) ? "filecoin" : "ipfs";
  const data =
    storage === "filecoin" ? await fetchFromFilecoin(cid) : await fetchFromIpfs(cid);

  const payload = { cid, storage, data };
  setCache(cacheKey, payload, CACHE_TTL);
  return payload;
}
