import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { serverClient, getCached, setCache } from "@/lib/server-client";

const CACHE_KEY = "agent-logs";
const CACHE_TTL = 5_000;

const GITHUB_URL = "https://raw.githubusercontent.com/PoulavBhowmick03/Spawn-Protocol/main/agent_log.json";
const KNOWN_CID = "QmRKSPkg7MQuChCXkgRPqmsAhLG4Y7xf7nUo6N3AXr9wFx";
const ENS_REGISTRY = "0x29170A43352D65329c462e6cDacc1c002419331D";
const LOCAL_LOG_PATH = join(process.cwd(), "..", "agent_log.json");

export const dynamic = "force-dynamic";

async function tryIPFS(cid: string): Promise<any | null> {
  const gateways = [
    `https://ipfs.filebase.io/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];
  for (const url of gateways) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

export async function GET() {
  try {
    const cached = getCached<any>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    // 1. Prefer the local live log written by the running swarm.
    if (existsSync(LOCAL_LOG_PATH)) {
      const data = JSON.parse(readFileSync(LOCAL_LOG_PATH, "utf-8"));
      setCache(CACHE_KEY, data, CACHE_TTL);
      return NextResponse.json(data);
    }

    // 2. Try onchain CID
    try {
      const cid = await serverClient.readContract({
        address: ENS_REGISTRY as `0x${string}`,
        abi: [{ type: "function", name: "getTextRecord", inputs: [{ name: "label", type: "string" }, { name: "key", type: "string" }], outputs: [{ name: "", type: "string" }], stateMutability: "view" }] as const,
        functionName: "getTextRecord",
        args: ["parent", "ipfs.agent_log"],
      });
      if (cid && cid !== KNOWN_CID) {
        const data = await tryIPFS(cid);
        if (data) {
          setCache(CACHE_KEY, data, CACHE_TTL);
          return NextResponse.json(data);
        }
      }
    } catch {}

    // 3. Try known CID
    const ipfsData = await tryIPFS(KNOWN_CID);
    if (ipfsData) {
      setCache(CACHE_KEY, ipfsData, CACHE_TTL);
      return NextResponse.json(ipfsData);
    }

    // 4. Fallback to GitHub
    const res = await fetch(GITHUB_URL);
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const data = await res.json();
    setCache(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch logs" }, { status: 500 });
  }
}
