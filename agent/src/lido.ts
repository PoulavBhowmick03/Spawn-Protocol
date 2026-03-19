import { publicClient, walletClient, account } from "./chain.js";
import { parseEther, formatEther, type Address } from "viem";

// Lido stETH contract on Base Sepolia (may not exist — we fall back to simulation)
const LIDO_STETH_ADDRESS: Address = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

// Simulated stETH state for testnet fallback
const STETH_APY = 0.035; // 3.5% annual yield
let simulatedStETHBalance = 0n;
let simulatedWrapTimestamp = 0;
let realStETHAvailable = false;

// Minimal ABI for Lido stETH submit (wrap ETH -> stETH)
const lidoSubmitABI = [
  {
    name: "submit",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "_referral", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Wrap ETH into stETH via Lido.
 * On testnets where Lido is not deployed, falls back to a simulated balance
 * that tracks yield based on time elapsed and a 3.5% APY.
 */
export async function wrapETHToStETH(amount: bigint): Promise<{
  success: boolean;
  simulated: boolean;
  txHash?: `0x${string}`;
  stETHReceived: bigint;
}> {
  // Try real Lido contract first
  try {
    const hash = await walletClient.writeContract({
      address: LIDO_STETH_ADDRESS,
      abi: lidoSubmitABI,
      functionName: "submit",
      args: ["0x0000000000000000000000000000000000000000"],
      value: amount,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      realStETHAvailable = true;
      console.log(
        `[Lido] Wrapped ${formatEther(amount)} ETH -> stETH (tx: ${hash})`
      );
      return { success: true, simulated: false, txHash: hash, stETHReceived: amount };
    }
  } catch {
    // Lido not available on this chain — fall back to simulation
  }

  // Testnet fallback: simulate the wrap
  simulatedStETHBalance += amount;
  simulatedWrapTimestamp = simulatedWrapTimestamp || Math.floor(Date.now() / 1000);
  console.log(
    `[Lido] Simulated wrap: ${formatEther(amount)} ETH -> stETH (testnet mode)`
  );
  return { success: true, simulated: true, stETHReceived: amount };
}

/**
 * Get current stETH balance.
 * Tries the real contract first, then falls back to simulated balance + accrued yield.
 */
export async function getStETHBalance(): Promise<{
  balance: bigint;
  simulated: boolean;
}> {
  // Try real balance first
  if (realStETHAvailable) {
    try {
      const balance = (await publicClient.readContract({
        address: LIDO_STETH_ADDRESS,
        abi: lidoSubmitABI,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;

      return { balance, simulated: false };
    } catch {
      // Fall through to simulation
    }
  }

  // Simulated balance with accrued yield
  if (simulatedStETHBalance === 0n) {
    return { balance: 0n, simulated: true };
  }

  const yieldAccrued = calculateSimulatedYield();
  return {
    balance: simulatedStETHBalance + yieldAccrued,
    simulated: true,
  };
}

/**
 * Calculate yield earned since the initial wrap.
 * Uses real stETH rebase mechanics if available, otherwise simulates
 * based on 3.5% APY and elapsed time.
 */
export async function getYieldEarned(): Promise<{
  yieldETH: bigint;
  yieldFormatted: string;
  apyPercent: number;
  elapsedDays: number;
  simulated: boolean;
}> {
  if (simulatedStETHBalance === 0n && !realStETHAvailable) {
    return {
      yieldETH: 0n,
      yieldFormatted: "0.0",
      apyPercent: STETH_APY * 100,
      elapsedDays: 0,
      simulated: true,
    };
  }

  // If real Lido is available, yield = current balance - deposited amount
  if (realStETHAvailable) {
    try {
      const currentBalance = (await publicClient.readContract({
        address: LIDO_STETH_ADDRESS,
        abi: lidoSubmitABI,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;

      // We approximate deposited amount as simulatedStETHBalance (tracked at wrap time)
      const yieldETH =
        currentBalance > simulatedStETHBalance
          ? currentBalance - simulatedStETHBalance
          : 0n;
      const elapsedSeconds =
        Math.floor(Date.now() / 1000) - (simulatedWrapTimestamp || Math.floor(Date.now() / 1000));
      const elapsedDays = elapsedSeconds / 86400;

      return {
        yieldETH,
        yieldFormatted: formatEther(yieldETH),
        apyPercent: STETH_APY * 100,
        elapsedDays,
        simulated: false,
      };
    } catch {
      // Fall through to simulation
    }
  }

  // Simulated yield
  const yieldETH = calculateSimulatedYield();
  const elapsedSeconds =
    Math.floor(Date.now() / 1000) - simulatedWrapTimestamp;
  const elapsedDays = elapsedSeconds / 86400;

  return {
    yieldETH,
    yieldFormatted: formatEther(yieldETH),
    apyPercent: STETH_APY * 100,
    elapsedDays,
    simulated: true,
  };
}

/**
 * Estimate how many Venice API vote cycles the stETH yield can cover.
 *
 * Assumptions:
 * - stETH APY: 3.5%
 * - Venice API cost per vote cycle: ~$0.002 (llama-3.3-70b inference)
 * - ETH price: ~$2,000
 * - One vote cycle = 1 reasoning call + 1 alignment evaluation = 2 API calls
 * - Each API call ~1000 tokens in + 500 tokens out = ~$0.001
 */
export async function estimateVeniceCostCoverage(): Promise<{
  annualYieldETH: number;
  annualYieldUSD: number;
  costPerVoteCycleUSD: number;
  voteCyclesCoveredPerYear: number;
  voteCyclesCoveredPerDay: number;
  sustainabilityRatio: number; // >1 means self-sustaining
  treasuryBalanceETH: string;
  simulated: boolean;
}> {
  const ETH_PRICE_USD = 2000;
  const COST_PER_VOTE_CYCLE_USD = 0.002; // 2 Venice API calls per cycle
  const VOTES_PER_DAY_PER_CHILD = 10; // estimated active votes per day
  const DEFAULT_CHILDREN = 3;

  const { balance, simulated } = await getStETHBalance();
  const balanceNum = Number(formatEther(balance));

  const annualYieldETH = balanceNum * STETH_APY;
  const annualYieldUSD = annualYieldETH * ETH_PRICE_USD;

  const dailyCostUSD =
    COST_PER_VOTE_CYCLE_USD * VOTES_PER_DAY_PER_CHILD * DEFAULT_CHILDREN;
  const annualCostUSD = dailyCostUSD * 365;

  const voteCyclesCoveredPerYear = annualYieldUSD / COST_PER_VOTE_CYCLE_USD;
  const voteCyclesCoveredPerDay = voteCyclesCoveredPerYear / 365;

  const sustainabilityRatio =
    annualCostUSD > 0 ? annualYieldUSD / annualCostUSD : 0;

  return {
    annualYieldETH,
    annualYieldUSD,
    costPerVoteCycleUSD: COST_PER_VOTE_CYCLE_USD,
    voteCyclesCoveredPerYear: Math.floor(voteCyclesCoveredPerYear),
    voteCyclesCoveredPerDay: Math.floor(voteCyclesCoveredPerDay),
    sustainabilityRatio: Math.round(sustainabilityRatio * 100) / 100,
    treasuryBalanceETH: formatEther(balance),
    simulated,
  };
}

/**
 * Log a summary of yield status for the parent agent loop.
 */
export async function logYieldStatus(): Promise<void> {
  const yieldInfo = await getYieldEarned();
  const coverage = await estimateVeniceCostCoverage();

  const mode = yieldInfo.simulated ? " (simulated)" : "";
  console.log(
    `[Lido] Yield earned: ${yieldInfo.yieldFormatted} ETH${mode} | ` +
      `APY: ${yieldInfo.apyPercent}% | ` +
      `Elapsed: ${yieldInfo.elapsedDays.toFixed(2)} days`
  );
  console.log(
    `[Lido] Treasury: ${coverage.treasuryBalanceETH} stETH | ` +
      `Annual yield: $${coverage.annualYieldUSD.toFixed(2)} | ` +
      `Covers ${coverage.voteCyclesCoveredPerDay} vote cycles/day`
  );
  console.log(
    `[Lido] Sustainability ratio: ${coverage.sustainabilityRatio}x ` +
      `(${coverage.sustainabilityRatio >= 1 ? "SELF-SUSTAINING" : "needs more treasury capital"})`
  );
}

// --- Internal helpers ---

function calculateSimulatedYield(): bigint {
  if (simulatedStETHBalance === 0n || simulatedWrapTimestamp === 0) {
    return 0n;
  }

  const elapsedSeconds =
    Math.floor(Date.now() / 1000) - simulatedWrapTimestamp;
  const elapsedYears = elapsedSeconds / (365.25 * 24 * 3600);

  // yield = principal * APY * time
  // Use basis-point math to avoid floating point: APY 3.5% = 350 bps
  const yieldBps = BigInt(Math.floor(elapsedYears * 350));
  const yieldAmount = (simulatedStETHBalance * yieldBps) / 10000n;

  return yieldAmount;
}

/**
 * Initialize the Lido module with an existing simulated balance.
 * Useful for demo mode where you want to show yield from a pre-seeded treasury.
 */
export function initSimulatedTreasury(
  balanceWei: bigint,
  wrapTimestampOverride?: number
): void {
  simulatedStETHBalance = balanceWei;
  simulatedWrapTimestamp =
    wrapTimestampOverride || Math.floor(Date.now() / 1000) - 86400; // default: 1 day ago
  console.log(
    `[Lido] Initialized simulated treasury: ${formatEther(balanceWei)} stETH ` +
      `(wrapped ${Math.floor((Date.now() / 1000 - simulatedWrapTimestamp) / 3600)}h ago)`
  );
}
