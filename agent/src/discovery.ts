/**
 * DAO Discovery & Proposal Feed
 *
 * Fetches real governance proposals from multiple sources:
 * 1. Tally API — onchain governance (Uniswap, Arbitrum, Optimism, Compound, etc.)
 * 2. Snapshot GraphQL — offchain signaling (30K+ DAOs)
 * 3. Simulated feed — realistic proposals as fallback
 *
 * Deduplication ensures the same proposal is never mirrored twice.
 * Proposals are mirrored onto our MockGovernor contracts so the swarm
 * can vote on real governance topics via Venice AI reasoning.
 */

import { type Address } from "viem";
import { MockGovernorABI } from "./abis.js";

// ── Types ──

export interface DiscoveredProposal {
  /** Unique ID from source (prevents duplicates) */
  externalId: string;
  /** Human-readable title */
  title: string;
  /** Full proposal description */
  description: string;
  /** DAO name (e.g. "Uniswap", "Compound") */
  daoName: string;
  /** DAO slug */
  daoSlug: string;
  /** Source platform */
  source: "tally" | "snapshot" | "simulated";
  /** Timestamp when we discovered it */
  discoveredAt: number;
}

export interface DiscoveredDAO {
  name: string;
  slug: string;
  proposalCount: number;
  source: "tally" | "snapshot" | "simulated";
}

// ── State (deduplication) ──

const MAX_TRACKED_PROPOSALS = 2000; // cap to prevent unbounded memory growth
const seenProposals = new Set<string>(); // externalId set for O(1) dedup
const allProposals: DiscoveredProposal[] = []; // ordered list (capped)
const discoveredDAOs = new Map<string, DiscoveredDAO>();
let feedInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false; // prevent overlapping polls
let simulatedIndex = 0;

// ── Tally API ──

const TALLY_ENDPOINT = "https://api.tally.xyz/query";

// Major DAOs on Tally — organization IDs
const TALLY_ORGS: Array<{ id: string; name: string }> = [
  { id: "2206072050315953936", name: "Arbitrum" },
  { id: "2206072049871356990", name: "Optimism" },
  { id: "2297436623035434412", name: "ZKsync" },
  { id: "2206072050315953922", name: "Uniswap" },
  { id: "2206072050315953934", name: "Compound" },
  { id: "2206072050315953921", name: "ENS" },
  { id: "2206072050315953935", name: "Aave" },
  { id: "2206072050315953933", name: "Gitcoin" },
  { id: "2228718511899828760", name: "Nouns" },
];

function buildTallyQuery(orgId: string): string {
  return `{
    proposals(input: {
      filters: { organizationId: "${orgId}" }
      page: { limit: 5 }
      sort: { isDescending: true, sortBy: id }
    }) {
      nodes {
        ... on Proposal {
          id
          metadata { title description }
          status
          governor { name slug }
        }
      }
    }
  }`;
}

async function fetchFromTally(): Promise<DiscoveredProposal[]> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) {
    console.log("[Discovery] No TALLY_API_KEY set — skipping Tally");
    return [];
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Api-Key": apiKey,
  };

  const results: DiscoveredProposal[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const org of TALLY_ORGS) {
    try {
      const response = await fetch(TALLY_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: buildTallyQuery(org.id) }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) continue;

      const json = (await response.json()) as {
        data?: { proposals: { nodes: any[] } };
        errors?: Array<{ message: string }>;
      };

      if (json.errors?.length) continue;

      const nodes = json.data?.proposals?.nodes || [];
      for (const p of nodes) {
        const externalId = `tally-${p.id}`;
        if (seenProposals.has(externalId)) continue; // dedup

        const title = p.metadata?.title || "Untitled";
        const description = p.metadata?.description || title;
        const daoName = p.governor?.name || org.name;
        const daoSlug = p.governor?.slug || org.name.toLowerCase();

        trackDAO(daoName, daoSlug, "tally");

        results.push({
          externalId,
          title,
          description: `[${daoName} — Real Governance via Tally] ${title}\n\n${truncate(description)}`,
          daoName,
          daoSlug,
          source: "tally",
          discoveredAt: now,
        });
      }

      // Rate limit: 1 req/sec between orgs
      await sleep(1100);
    } catch (err: any) {
      console.log(`[Discovery] Tally fetch error for ${org.name}: ${err?.message?.slice(0, 60)}`);
    }
  }

  if (results.length > 0) {
    console.log(`[Discovery] Tally: ${results.length} new proposals from ${TALLY_ORGS.length} DAOs`);
  }
  return results;
}

// ── Snapshot GraphQL ──

const SNAPSHOT_ENDPOINT = "https://hub.snapshot.org/graphql";

// Major Snapshot spaces
const SNAPSHOT_SPACES = [
  "uniswapgovernance.eth",
  "ens.eth",
  "lido-snapshot.eth",
  "aave.eth",
  "gitcoindao.eth",
  "opcollective.eth",
  "arbitrumfoundation.eth",
  "safe.eth",
  "balancer.eth",
  "cow.eth",
  "starknet.eth",
  "apecoin.eth",
];

function buildSnapshotQuery(): string {
  const spacesStr = SNAPSHOT_SPACES.map(s => `"${s}"`).join(", ");
  return `{
    proposals(
      first: 20,
      skip: 0,
      where: { space_in: [${spacesStr}] },
      orderBy: "created",
      orderDirection: desc
    ) {
      id
      title
      body
      choices
      state
      space { id name }
      created
      end
    }
  }`;
}

async function fetchFromSnapshot(): Promise<DiscoveredProposal[]> {
  const results: DiscoveredProposal[] = [];
  const now = Math.floor(Date.now() / 1000);

  try {
    const response = await fetch(SNAPSHOT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: buildSnapshotQuery() }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.log(`[Discovery] Snapshot returned ${response.status}`);
      return [];
    }

    const json = (await response.json()) as {
      data?: { proposals: any[] };
    };

    const proposals = json.data?.proposals || [];
    for (const p of proposals) {
      const externalId = `snapshot-${p.id}`;
      if (seenProposals.has(externalId)) continue; // dedup

      const daoName = p.space?.name || "Unknown";
      const daoSlug = p.space?.id || "unknown";

      trackDAO(daoName, daoSlug, "snapshot");

      results.push({
        externalId,
        title: p.title || "Untitled",
        description: `[${daoName} — Snapshot Governance] ${p.title}\n\n${truncate(p.body || p.title)}`,
        daoName,
        daoSlug,
        source: "snapshot",
        discoveredAt: now,
      });
    }

    if (results.length > 0) {
      console.log(`[Discovery] Snapshot: ${results.length} new active proposals`);
    }
  } catch (err: any) {
    console.log(`[Discovery] Snapshot fetch failed: ${err?.message?.slice(0, 60)}`);
  }

  return results;
}

// ── Simulated Feed (fallback) ──

const SIMULATED_PROPOSALS = [
  { daoName: "Uniswap", daoSlug: "uniswap", title: "Deploy Uniswap v3 on ZKsync Era", description: "This proposal seeks to deploy Uniswap v3 contracts on ZKsync Era mainnet. ZKsync Era has reached $500M TVL and deployment would expand Uniswap's reach to a major L2. The deployment would use the canonical bridge and include all standard fee tiers." },
  { daoName: "Compound", daoSlug: "compound", title: "Adjust WETH Collateral Factor to 82%", description: "Gauntlet recommends increasing the WETH collateral factor from 80% to 82% on Compound v3. Analysis of historical volatility, liquidation simulations, and current utilization rates supports this change." },
  { daoName: "ENS", daoSlug: "ens", title: "Fund ENS Public Goods Working Group — Q2 2026", description: "Request 250,000 USDC and 50 ETH for the ENS Public Goods Working Group for Q2 2026. Funds will support ENS integration grants, developer documentation, ecosystem tooling." },
  { daoName: "Aave", daoSlug: "aave", title: "Add weETH as Collateral on Aave v3 Base", description: "This AIP proposes adding Ether.fi's wrapped eETH (weETH) as a collateral asset on Aave v3 Base deployment. Risk parameters: LTV 72.5%, Liquidation Threshold 75%, Liquidation Bonus 7.5%." },
  { daoName: "Arbitrum", daoSlug: "arbitrum", title: "Activate ARB Staking with 1.5% Emission Rate", description: "Proposal to activate the ARB staking module with a 1.5% annual emission rate. Stakers lock ARB for minimum 3 months. Audited by OpenZeppelin and Trail of Bits." },
  { daoName: "Lido", daoSlug: "lido", title: "Upgrade Oracle Reporting with DVT", description: "Proposal to integrate Distributed Validator Technology (DVT) into Lido's oracle reporting. Split each oracle key across 4 operators using SSV Network, requiring 3-of-4 threshold signatures." },
  { daoName: "MakerDAO", daoSlug: "makerdao", title: "Increase USDS Savings Rate to 8.5%", description: "Adjusts the USDS Savings Rate from 6.5% to 8.5%. Supported by current protocol revenue of $180M annualized from RWA vaults and ETH-backed lending." },
  { daoName: "Optimism", daoSlug: "optimism", title: "Season 6 Grants Council Budget — 3M OP", description: "Budget request for Season 6: 3,000,000 OP tokens. Season 5 delivered 47 grants, 23 projects reached mainnet, $12M TVL attributed to grant recipients." },
  { daoName: "Safe", daoSlug: "safe", title: "Deploy Safe Modules Registry on Base", description: "Proposal to deploy the Safe Modules Registry on Base L2 to enable permissionless module discovery and verification for Smart Account users." },
  { daoName: "Balancer", daoSlug: "balancer", title: "Activate veBAL Boost for LRT Pools", description: "Proposal to allocate veBAL boost incentives to Liquid Restaking Token pools on Balancer v3. Targets weETH/WETH, ezETH/WETH, and rswETH/WETH pools." },
  { daoName: "Nouns", daoSlug: "nouns", title: "Fund Nouns Builder Public Infrastructure", description: "Request 150 ETH to fund Nouns Builder v2 infrastructure: improved DAO deployment UX, cross-chain auction support, and sub-DAO treasury management." },
  { daoName: "Gitcoin", daoSlug: "gitcoin", title: "GTC Staking for Passport Score Boost", description: "Proposal to allow GTC staking to boost Gitcoin Passport scores. Stakers get enhanced sybil-resistance scoring, creating utility for GTC beyond governance." },
];

function generateSimulatedProposal(): DiscoveredProposal {
  const template = SIMULATED_PROPOSALS[simulatedIndex % SIMULATED_PROPOSALS.length];
  simulatedIndex++;
  const now = Math.floor(Date.now() / 1000);
  const externalId = `sim-${template.daoSlug}-${simulatedIndex}`;

  trackDAO(template.daoName, template.daoSlug, "simulated");

  return {
    externalId,
    title: template.title,
    description: `[${template.daoName} Governance] ${template.title}\n\n${template.description}`,
    daoName: template.daoName,
    daoSlug: template.daoSlug,
    source: "simulated",
    discoveredAt: now,
  };
}

// ── Helpers ──

function truncate(text: string, maxLen = 1500): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function trackDAO(name: string, slug: string, source: "tally" | "snapshot" | "simulated") {
  const existing = discoveredDAOs.get(slug);
  if (existing) {
    existing.proposalCount++;
  } else {
    discoveredDAOs.set(slug, { name, slug, proposalCount: 1, source });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Send TX function type ──

type SendTxFn = (params: {
  address: Address;
  abi: typeof MockGovernorABI;
  functionName: string;
  args: readonly unknown[];
}) => Promise<{ transactionHash: `0x${string}` }>;

// ── Core Feed Logic ──

/**
 * Mirror a discovered proposal onto our MockGovernor contract.
 * Maps the real-world proposal to a DAO-specific governor based on topic.
 */
async function mirrorToMockGovernor(
  proposal: DiscoveredProposal,
  governors: Array<{ addr: Address; name: string }>,
  sendTxFn: SendTxFn
): Promise<void> {
  // Map proposal to a governor based on DAO name similarity
  const gov = pickGovernor(proposal, governors);

  try {
    const receipt = await sendTxFn({
      address: gov.addr,
      abi: MockGovernorABI,
      functionName: "createProposal",
      args: [proposal.description],
    });

    console.log(`[Discovery] Mirrored "${proposal.title.slice(0, 50)}" → ${gov.name} (${proposal.source}) tx: ${receipt.transactionHash?.slice(0, 18)}...`);
  } catch (err: any) {
    console.log(`[Discovery] Mirror failed "${proposal.title.slice(0, 40)}": ${err?.message?.slice(0, 40)}`);
  }
}

/**
 * Pick the most appropriate MockGovernor for a given proposal.
 * Maps real DAOs to our 3 governors (Uniswap, Lido, ENS).
 */
function pickGovernor(
  proposal: DiscoveredProposal,
  governors: Array<{ addr: Address; name: string }>
): { addr: Address; name: string } {
  const slug = proposal.daoSlug.toLowerCase();
  const name = proposal.daoName.toLowerCase();

  // DeFi protocols → Uniswap governor
  if (slug.includes("uniswap") || slug.includes("compound") || slug.includes("aave") ||
      slug.includes("balancer") || slug.includes("maker") || slug.includes("cow") ||
      name.includes("defi") || name.includes("swap")) {
    return governors.find(g => g.name.toLowerCase().includes("uniswap")) || governors[0];
  }

  // Staking/infrastructure → Lido governor
  if (slug.includes("lido") || slug.includes("safe") || slug.includes("starknet") ||
      slug.includes("arbitrum") || slug.includes("optimism") || slug.includes("zksync") ||
      slug.includes("op") || name.includes("staking") || name.includes("infra")) {
    return governors.find(g => g.name.toLowerCase().includes("lido")) || governors[1 % governors.length];
  }

  // Identity/public goods → ENS governor
  if (slug.includes("ens") || slug.includes("gitcoin") || slug.includes("nouns") ||
      slug.includes("apecoin") || name.includes("public") || name.includes("identity")) {
    return governors.find(g => g.name.toLowerCase().includes("ens")) || governors[2 % governors.length];
  }

  // Default: round-robin
  return governors[Math.floor(Math.random() * governors.length)];
}

/**
 * Poll all sources for new proposals, deduplicate, and mirror to chain.
 */
async function pollOnce(
  governors: Array<{ addr: Address; name: string }>,
  sendTxFn: SendTxFn
): Promise<DiscoveredProposal[]> {
  const newProposals: DiscoveredProposal[] = [];

  // 1. Fetch from Tally
  try {
    const tallyProposals = await fetchFromTally();
    for (const p of tallyProposals) {
      if (!seenProposals.has(p.externalId)) {
        seenProposals.add(p.externalId);
        allProposals.push(p);
        newProposals.push(p);
      }
    }
  } catch (err: any) {
    console.log(`[Discovery] Tally error: ${err?.message?.slice(0, 50)}`);
  }

  // 2. Fetch from Snapshot
  try {
    const snapshotProposals = await fetchFromSnapshot();
    for (const p of snapshotProposals) {
      if (!seenProposals.has(p.externalId)) {
        seenProposals.add(p.externalId);
        allProposals.push(p);
        newProposals.push(p);
      }
    }
  } catch (err: any) {
    console.log(`[Discovery] Snapshot error: ${err?.message?.slice(0, 50)}`);
  }

  // 3. If no real proposals found, generate simulated ones
  if (newProposals.length === 0) {
    const sim = generateSimulatedProposal();
    if (!seenProposals.has(sim.externalId)) {
      seenProposals.add(sim.externalId);
      allProposals.push(sim);
      newProposals.push(sim);
    }
  }

  // 4. Mirror new proposals to MockGovernor (max 3 per poll to avoid nonce issues)
  const toMirror = newProposals.slice(0, 3);
  for (const p of toMirror) {
    await mirrorToMockGovernor(p, governors, sendTxFn);
    await sleep(2000); // space out txs to avoid nonce collisions
  }

  // Cap tracked proposals to prevent unbounded memory growth
  if (allProposals.length > MAX_TRACKED_PROPOSALS) {
    const removed = allProposals.splice(0, allProposals.length - MAX_TRACKED_PROPOSALS);
    for (const r of removed) seenProposals.delete(r.externalId);
  }

  if (newProposals.length > 0) {
    const sources = [...new Set(newProposals.map(p => p.source))];
    console.log(`[Discovery] ${newProposals.length} new proposals (${sources.join("+")}), ${seenProposals.size} total tracked`);
  }

  return newProposals;
}

// ── Exported API ──

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Start the multi-source proposal feed.
 * Polls Tally + Snapshot + simulated feed every 3 minutes
 * and mirrors discovered proposals to MockGovernor contracts.
 */
export async function startProposalFeed(
  governors: Array<{ addr: Address; name: string }>,
  sendTxFn: SendTxFn
): Promise<() => void> {
  console.log("[Discovery] Starting multi-source proposal feed...");
  console.log(`[Discovery] Sources: Tally (${TALLY_ORGS.length} DAOs) + Snapshot (${SNAPSHOT_SPACES.length} spaces) + simulated`);
  console.log(`[Discovery] Governors: ${governors.map(g => g.name).join(", ")}`);
  console.log(`[Discovery] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

  // Initial poll
  await pollOnce(governors, sendTxFn);

  // Recurring poll (with overlap prevention)
  feedInterval = setInterval(async () => {
    if (isPolling) return; // prevent overlapping polls
    isPolling = true;
    try {
      await pollOnce(governors, sendTxFn);
    } catch (err: any) {
      console.log(`[Discovery] Poll error: ${err?.message?.slice(0, 60)}`);
    } finally {
      isPolling = false;
    }
  }, POLL_INTERVAL_MS);

  return () => {
    if (feedInterval) {
      clearInterval(feedInterval);
      feedInterval = null;
      console.log("[Discovery] Proposal feed stopped");
    }
  };
}

/**
 * Trigger a single poll immediately.
 */
export async function pollNow(
  governors: Array<{ addr: Address; name: string }>,
  sendTxFn: SendTxFn
): Promise<DiscoveredProposal[]> {
  return pollOnce(governors, sendTxFn);
}

/**
 * Get all discovered proposals (newest first).
 */
export function getLatestProposals(): DiscoveredProposal[] {
  return [...allProposals].sort((a, b) => b.discoveredAt - a.discoveredAt);
}

/**
 * Get list of discovered DAOs.
 */
export function getDiscoveredDAOs(): DiscoveredDAO[] {
  return Array.from(discoveredDAOs.values());
}

/**
 * Get feed stats.
 */
export function getFeedStats() {
  return {
    totalProposals: seenProposals.size,
    tallyDAOs: TALLY_ORGS.length,
    snapshotSpaces: SNAPSHOT_SPACES.length,
    discoveredDAOs: discoveredDAOs.size,
    sources: {
      tally: allProposals.filter(p => p.source === "tally").length,
      snapshot: allProposals.filter(p => p.source === "snapshot").length,
      simulated: allProposals.filter(p => p.source === "simulated").length,
    },
  };
}
