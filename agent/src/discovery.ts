/**
 * DAO Discovery & Proposal Feed
 *
 * Fetches real governance proposals from Tally API and mirrors them
 * onto our MockGovernor so the swarm votes on real governance topics.
 * Falls back to a simulated feed with realistic proposals if Tally
 * is unreachable or requires auth.
 */

import { type Address } from "viem";
import { MockGovernorABI } from "./abis.js";
import { logParentAction } from "./logger.js";

// ── Types ──

export interface DiscoveredProposal {
  /** Unique ID from source (Tally ID or simulated) */
  externalId: string;
  /** Human-readable title */
  title: string;
  /** Full proposal description */
  description: string;
  /** DAO name (e.g. "Uniswap", "Compound") */
  daoName: string;
  /** DAO slug on Tally */
  daoSlug: string;
  /** Voting start (unix seconds) */
  startTimestamp: number;
  /** Voting end (unix seconds) */
  endTimestamp: number;
  /** Whether this was sourced from Tally or simulated */
  source: "tally" | "simulated";
  /** Onchain proposal ID on our MockGovernor (set after mirroring) */
  mirroredProposalId?: bigint;
  /** Timestamp when we discovered it */
  discoveredAt: number;
}

export interface DiscoveredDAO {
  name: string;
  slug: string;
  proposalCount: number;
}

// ── State ──

const seenProposals = new Map<string, DiscoveredProposal>();
const discoveredDAOs = new Map<string, DiscoveredDAO>();
let feedInterval: ReturnType<typeof setInterval> | null = null;
let tallyAvailable: boolean | null = null; // null = not checked yet
let simulatedIndex = 0;

// ── Tally API ──

const TALLY_ENDPOINT = "https://api.tally.xyz/query";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Top DAO organization IDs on Tally
const TALLY_ORG_IDS = [
  "2206072050315953936", // Arbitrum
  "2206072049871356990", // Optimism
  "2297436623035434412", // ZKsync
];

function buildTallyQuery(orgId: string): string {
  return `{
    proposals(input: {
      filters: { organizationId: "${orgId}" }
      page: { limit: 3 }
      sort: { isDescending: true, sortBy: id }
    }) {
      nodes {
        ... on Proposal {
          id
          metadata { title description }
          status
          start { ... on Block { timestamp } ... on BlocklessTimestamp { timestamp } }
          end { ... on Block { timestamp } ... on BlocklessTimestamp { timestamp } }
          governor { name slug }
        }
      }
    }
  }`;
}

interface TallyProposal {
  id: string;
  metadata: { title: string; description: string };
  status: string;
  start: { timestamp: string };
  end: { timestamp: string };
  governor: { name: string; slug: string };
}

async function fetchFromTally(): Promise<DiscoveredProposal[]> {
  try {
    const apiKey = process.env.TALLY_API_KEY;
    if (!apiKey) {
      console.log("[Discovery] No TALLY_API_KEY — using simulated feed");
      tallyAvailable = false;
      return [];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    };

    const allProposals: DiscoveredProposal[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Fetch from multiple DAOs
    for (const orgId of TALLY_ORG_IDS) {
      try {
        const response = await fetch(TALLY_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: buildTallyQuery(orgId) }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          console.log(`[Discovery] Tally returned ${response.status} for org ${orgId}`);
          continue;
        }

        const json = (await response.json()) as {
          data?: { proposals: { nodes: TallyProposal[] } };
          errors?: Array<{ message: string }>;
        };

        if (json.errors?.length) {
          console.log(`[Discovery] Tally error: ${json.errors[0].message}`);
          continue;
        }

        const nodes = json.data?.proposals?.nodes || [];
        for (const p of nodes) {
          const daoName = p.governor?.name || "Unknown DAO";
          const daoSlug = p.governor?.slug || "unknown";
          const title = p.metadata?.title || "Untitled";
          const description = p.metadata?.description || title;

          // Track discovered DAOs
          const existing = discoveredDAOs.get(daoSlug);
          if (existing) {
            existing.proposalCount++;
          } else {
            discoveredDAOs.set(daoSlug, { name: daoName, slug: daoSlug, proposalCount: 1 });
          }

          // Parse timestamps (could be ISO string or unix)
          let startTs = now;
          let endTs = now + 300;
          try {
            const startRaw = p.start?.timestamp;
            const endRaw = p.end?.timestamp;
            startTs = startRaw?.includes?.("T") ? Math.floor(new Date(startRaw).getTime() / 1000) : parseInt(startRaw, 10);
            endTs = endRaw?.includes?.("T") ? Math.floor(new Date(endRaw).getTime() / 1000) : parseInt(endRaw, 10);
          } catch {}

          allProposals.push({
            externalId: `tally-${p.id}`,
            title,
            description: `[${daoName} — Real Governance via Tally] ${title}\n\n${truncateDescription(description)}`,
            daoName,
            daoSlug,
            startTimestamp: startTs,
            endTimestamp: endTs,
            source: "tally",
            discoveredAt: now,
          });
        }

        // Rate limit: 1 req/sec
        await new Promise((r) => setTimeout(r, 1100));
      } catch (err: any) {
        console.log(`[Discovery] Tally fetch error for org ${orgId}: ${err?.message?.slice(0, 60)}`);
      }
    }

    if (allProposals.length > 0) {
      tallyAvailable = true;
      console.log(`[Discovery] Fetched ${allProposals.length} real proposals from Tally (${TALLY_ORG_IDS.length} DAOs)`);
    } else {
      tallyAvailable = false;
    }

    return allProposals;
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.log(`[Discovery] Tally fetch failed: ${msg.slice(0, 80)} — falling back to simulated feed`);
    tallyAvailable = false;
    return [];
  }
}

// ── Simulated Feed ──

/**
 * Realistic governance proposals based on actual DAO governance patterns.
 * These rotate through real governance topics so Venice reasoning is meaningful.
 */
const SIMULATED_PROPOSALS: Array<{
  daoName: string;
  daoSlug: string;
  title: string;
  description: string;
}> = [
  {
    daoName: "Uniswap",
    daoSlug: "uniswap",
    title: "Deploy Uniswap v3 on ZKsync Era",
    description:
      "This proposal seeks to deploy Uniswap v3 contracts on ZKsync Era mainnet. ZKsync Era has reached $500M TVL and deployment would expand Uniswap's reach to a major L2. The deployment would use the canonical bridge and include all standard fee tiers. Oku would serve as the default frontend integration. GFX Labs has volunteered to manage the deployment process.",
  },
  {
    daoName: "Compound",
    daoSlug: "compound",
    title: "Adjust WETH Collateral Factor to 82%",
    description:
      "Gauntlet recommends increasing the WETH collateral factor from 80% to 82% on Compound v3 (Ethereum mainnet). Analysis of historical volatility, liquidation simulations, and current utilization rates supports this change. The adjustment would unlock approximately $45M in additional borrowing capacity while maintaining protocol safety margins above target thresholds.",
  },
  {
    daoName: "ENS",
    daoSlug: "ens",
    title: "Fund ENS Public Goods Working Group — Q2 2026",
    description:
      "Request 250,000 USDC and 50 ETH for the ENS Public Goods Working Group for Q2 2026. Funds will support ENS integration grants, developer documentation, ecosystem tooling, and community education initiatives. The working group delivered 12 grants in Q1 including ENS-for-L2s resolver improvements and ENSjs v4 development.",
  },
  {
    daoName: "Aave",
    daoSlug: "aave",
    title: "Add weETH as Collateral on Aave v3 Base",
    description:
      "This AIP proposes adding Ether.fi's wrapped eETH (weETH) as a collateral asset on Aave v3 Base deployment. weETH has demonstrated consistent liquidity with $2.1B in TVL across chains. Risk parameters: LTV 72.5%, Liquidation Threshold 75%, Liquidation Bonus 7.5%. Chainlink oracle feed is available and audited. This listing would enable leveraged restaking strategies on Base.",
  },
  {
    daoName: "Arbitrum",
    daoSlug: "arbitrum",
    title: "Activate ARB Staking with 1.5% Emission Rate",
    description:
      "Proposal to activate the ARB staking module with a 1.5% annual emission rate. Stakers would lock ARB for a minimum of 3 months and receive stARB in return. The emission rate is funded from the DAO treasury's ARB allocation. The staking contract has been audited by OpenZeppelin and Trail of Bits. This mechanism aims to reduce circulating supply and align long-term governance participation.",
  },
  {
    daoName: "Lido",
    daoSlug: "lido",
    title: "Upgrade Oracle Reporting with Distributed Validator Technology",
    description:
      "Proposal to integrate Distributed Validator Technology (DVT) into Lido's oracle reporting infrastructure. Currently oracle reports rely on 5-of-9 consensus. This upgrade would split each oracle key across 4 operators using SSV Network, requiring 3-of-4 threshold signatures per oracle. This reduces single-point-of-failure risk and improves liveness guarantees. Implementation timeline: 8 weeks.",
  },
  {
    daoName: "MakerDAO",
    daoSlug: "makerdao",
    title: "Increase USDS Savings Rate to 8.5%",
    description:
      "This executive proposal adjusts the USDS Savings Rate (USR) from 6.5% to 8.5%. The increase is supported by current protocol revenue of $180M annualized, primarily from RWA vaults and ETH-backed lending. The Stability Advisory Council recommends this adjustment to maintain competitive positioning against T-bill yields and attract additional USDS deposits into the savings module.",
  },
  {
    daoName: "Optimism",
    daoSlug: "optimism",
    title: "Season 6 Grants Council Budget — 3M OP",
    description:
      "Budget request for the Season 6 Grants Council: 3,000,000 OP tokens. Allocation breakdown: Builder Grants (1.5M OP), Growth Experiments (800K OP), Developer Tooling (400K OP), Council Operations (300K OP). Season 5 metrics: 47 grants distributed, 23 projects reached mainnet deployment, $12M TVL attributed to grant recipients. The council will continue using milestone-based disbursement.",
  },
  {
    daoName: "Uniswap",
    daoSlug: "uniswap",
    title: "Activate Uniswap v3 1bp Fee Tier on Ethereum",
    description:
      "Proposal to activate a 0.01% (1 basis point) fee tier for Uniswap v3 on Ethereum mainnet with a tick spacing of 1. This fee tier is designed for stable-stable pairs (USDC/USDT, DAI/USDC) where the current 0.05% tier results in significant volume loss to competitors. Analysis shows approximately $2B weekly stablecoin volume migrating to lower-fee venues. The 1bp tier has been successfully deployed on Polygon and Arbitrum.",
  },
  {
    daoName: "Compound",
    daoSlug: "compound",
    title: "Launch Compound Treasury v2 with Institutional On-Ramp",
    description:
      "Proposal to launch Compound Treasury v2, a permissioned lending product for institutional participants. Key features: KYC/AML compliance via Securitize integration, fixed-rate USDC lending at T-bill + 150bp, segregated risk pools, and quarterly redemption windows. Legal structure reviewed by Latham & Watkins. Initial capacity: $500M. Revenue share: 15% of management fees to COMP governance.",
  },
  {
    daoName: "ENS",
    daoSlug: "ens",
    title: "Migrate ENS Registry to CCIP-Read for L2 Resolution",
    description:
      "Proposal to upgrade the ENS registry to support CCIP-Read (EIP-3668) for cross-chain name resolution. This enables ENS names to resolve data stored on any L2 without bridging. Users could store records on Base, Arbitrum, or Optimism and have them resolved seamlessly by L1 clients. The upgrade is backwards-compatible — existing L1 records continue working. Implementation by ENS Labs, audited by ChainSecurity.",
  },
  {
    daoName: "Aave",
    daoSlug: "aave",
    title: "Deploy Aave v3.1 with Liquid E-Mode",
    description:
      "This proposal initiates deployment of Aave v3.1, featuring Liquid E-Mode — a new efficiency mode allowing users to borrow against correlated assets at higher LTVs without being restricted to single-category collateral. Additional v3.1 features: dynamic interest rate curves, improved liquidation mechanics, and gas-optimized position management. Audit by Certora (formal verification) and Sigma Prime completed.",
  },
];

function generateSimulatedProposal(): DiscoveredProposal {
  const template =
    SIMULATED_PROPOSALS[simulatedIndex % SIMULATED_PROPOSALS.length];
  simulatedIndex++;

  const now = Math.floor(Date.now() / 1000);
  const votingDuration = 300; // 5 minutes for demo

  // Track the DAO
  const existing = discoveredDAOs.get(template.daoSlug);
  if (existing) {
    existing.proposalCount++;
  } else {
    discoveredDAOs.set(template.daoSlug, {
      name: template.daoName,
      slug: template.daoSlug,
      proposalCount: 1,
    });
  }

  return {
    externalId: `sim-${now}-${simulatedIndex}`,
    title: template.title,
    description: `[${template.daoName} Governance] ${template.title}\n\n${template.description}`,
    daoName: template.daoName,
    daoSlug: template.daoSlug,
    startTimestamp: now,
    endTimestamp: now + votingDuration,
    source: "simulated",
    discoveredAt: now,
  };
}

// ── Helpers ──

function truncateDescription(desc: string, maxLen = 1000): string {
  if (desc.length <= maxLen) return desc;
  return desc.slice(0, maxLen) + "...";
}

// ── Send TX function type ──

type SendTxFn = (params: {
  address: Address;
  abi: typeof MockGovernorABI;
  functionName: string;
  args: readonly unknown[];
}) => Promise<{ transactionHash: `0x${string}` }>;

// ── Core Feed Logic ──

async function mirrorToMockGovernor(
  proposal: DiscoveredProposal,
  mockGovernorAddr: Address,
  sendTxFn: SendTxFn
): Promise<bigint | null> {
  try {
    // Create proposal on our MockGovernor with the real/simulated description
    const fullDesc = `[${proposal.daoName}] ${proposal.title}\n\n${proposal.description}`;

    const receipt = await sendTxFn({
      address: mockGovernorAddr,
      abi: MockGovernorABI,
      functionName: "createProposal",
      args: [fullDesc],
    });

    logParentAction(
      "mirror_proposal",
      {
        externalId: proposal.externalId,
        daoName: proposal.daoName,
        title: proposal.title,
        source: proposal.source,
      },
      {
        txHash: receipt.transactionHash,
        mirrored: true,
      },
      receipt.transactionHash
    );

    console.log(
      `[Discovery] Mirrored "${proposal.title}" from ${proposal.daoName} (${proposal.source}) — tx: ${receipt.transactionHash}`
    );

    // We don't know the exact proposal ID without parsing logs, but the parent
    // agent can read proposalCount to determine it
    return null;
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(
      `[Discovery] Failed to mirror proposal "${proposal.title}": ${msg.slice(0, 100)}`
    );
    logParentAction(
      "mirror_proposal",
      {
        externalId: proposal.externalId,
        daoName: proposal.daoName,
        title: proposal.title,
      },
      {},
      undefined,
      false,
      msg.slice(0, 200)
    );
    return null;
  }
}

async function pollOnce(
  mockGovernorAddr: Address,
  sendTxFn: SendTxFn
): Promise<DiscoveredProposal[]> {
  let newProposals: DiscoveredProposal[] = [];

  // Try Tally first (unless we already know it's unavailable)
  if (tallyAvailable !== false) {
    const tallyProposals = await fetchFromTally();
    for (const p of tallyProposals) {
      if (!seenProposals.has(p.externalId)) {
        seenProposals.set(p.externalId, p);
        newProposals.push(p);
      }
    }
  }

  // If Tally is unavailable or returned nothing, use simulated feed
  if (tallyAvailable === false || newProposals.length === 0) {
    if (tallyAvailable === false) {
      console.log(
        "[Discovery] Using simulated proposal feed (Tally unavailable)"
      );
    }
    // Generate 1-2 simulated proposals per cycle
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const p = generateSimulatedProposal();
      if (!seenProposals.has(p.externalId)) {
        seenProposals.set(p.externalId, p);
        newProposals.push(p);
      }
    }
  }

  // Mirror new proposals to MockGovernor
  for (const p of newProposals) {
    await mirrorToMockGovernor(p, mockGovernorAddr, sendTxFn);
  }

  if (newProposals.length > 0) {
    logParentAction(
      "discovery_poll",
      {
        source: tallyAvailable ? "tally" : "simulated",
        totalSeen: seenProposals.size,
      },
      {
        newProposals: newProposals.length,
        daos: newProposals.map((p) => p.daoName),
      }
    );
  }

  return newProposals;
}

// ── Exported API ──

/**
 * Start the proposal feed. Polls Tally (or simulated feed) every 5 minutes
 * and mirrors discovered proposals to the MockGovernor contract.
 *
 * @param mockGovernorAddr - Address of deployed MockGovernor
 * @param sendTxFn - Function to send transactions (e.g., sendTxAndWait)
 * @returns Cleanup function to stop the feed
 */
export async function startProposalFeed(
  mockGovernorAddr: Address,
  sendTxFn: SendTxFn
): Promise<() => void> {
  console.log("[Discovery] Starting proposal feed...");
  console.log(
    `[Discovery] MockGovernor: ${mockGovernorAddr}`
  );
  console.log(
    `[Discovery] Poll interval: ${POLL_INTERVAL_MS / 1000}s`
  );

  // Initial poll immediately
  await pollOnce(mockGovernorAddr, sendTxFn);

  // Set up recurring poll
  feedInterval = setInterval(async () => {
    try {
      await pollOnce(mockGovernorAddr, sendTxFn);
    } catch (err: any) {
      console.error(
        `[Discovery] Poll error: ${err?.message || String(err)}`
      );
    }
  }, POLL_INTERVAL_MS);

  logParentAction(
    "discovery_started",
    { mockGovernorAddr, pollIntervalMs: POLL_INTERVAL_MS },
    { tallyAvailable }
  );

  // Return cleanup function
  return () => {
    if (feedInterval) {
      clearInterval(feedInterval);
      feedInterval = null;
      console.log("[Discovery] Proposal feed stopped");
    }
  };
}

/**
 * Trigger a single poll immediately (useful for demos).
 */
export async function pollNow(
  mockGovernorAddr: Address,
  sendTxFn: SendTxFn
): Promise<DiscoveredProposal[]> {
  return pollOnce(mockGovernorAddr, sendTxFn);
}

/**
 * Get all discovered proposals (cached).
 */
export function getLatestProposals(): DiscoveredProposal[] {
  return Array.from(seenProposals.values()).sort(
    (a, b) => b.discoveredAt - a.discoveredAt
  );
}

/**
 * Get list of discovered DAOs.
 */
export function getDiscoveredDAOs(): DiscoveredDAO[] {
  return Array.from(discoveredDAOs.values());
}

/**
 * Check whether Tally API is available.
 * Returns null if not yet checked.
 */
export function isTallyAvailable(): boolean | null {
  return tallyAvailable;
}
