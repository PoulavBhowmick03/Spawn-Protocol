import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  defineChain,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY not set in .env");
}

export const account = privateKeyToAccount(PRIVATE_KEY);

// ── Base Sepolia (primary) ──
// Use a fallback transport across multiple public endpoints so that 429s on one
// automatically retry on the next without dropping the transaction.
const baseRpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const baseTransport = fallback([
  http(baseRpc),
  http("https://base-sepolia.drpc.org"),
  http("https://base-sepolia-rpc.publicnode.com"),
], { rank: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: baseTransport,
}) as any as PublicClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: baseTransport,
}) as any as WalletClient;

// ── Celo Sepolia (secondary) ──
const celoRpc = process.env.CELO_SEPOLIA_RPC_URL || "https://celo-sepolia.drpc.org";
export const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: [celoRpc] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://celo-sepolia.celoscan.io" },
  },
});

export const celoPublicClient = createPublicClient({
  chain: celoSepolia,
  transport: http(celoRpc),
});

export const celoWalletClient = createWalletClient({
  account,
  chain: celoSepolia,
  transport: http(celoRpc),
});

// Tx receipt timeout — prevents indefinite hangs
const TX_RECEIPT_TIMEOUT = 120_000; // 2 minutes

/**
 * Send a contract write tx with retry on transient errors.
 * Retries on: nonce issues, underpriced, rate limits, timeouts, connection errors.
 */
export async function sendTxAndWait(params: any, retries = 5) {
  const errors: string[] = [];
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const hash = await walletClient.writeContract(params);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: TX_RECEIPT_TIMEOUT,
      });
      return receipt;
    } catch (err: any) {
      const msg = err?.details || err?.message || "";
      errors.push(`#${attempt + 1}: ${msg.slice(0, 60)}`);
      const isRetryable =
        msg.includes("nonce") ||
        msg.includes("underpriced") ||
        msg.includes("already known") ||
        msg.includes("rate limit") ||
        msg.includes("timeout") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("429");
      if (isRetryable && attempt < retries - 1) {
        const delay = 3000 + attempt * 3000;
        console.log(`  [tx] ${msg.slice(0, 40)}... retrying in ${delay / 1000}s (${attempt + 2}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`sendTxAndWait: max retries exceeded [${errors.join(" | ")}]`);
}

export async function sendTxAndWaitCelo(params: any, retries = 5) {
  const errors: string[] = [];
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const hash = await celoWalletClient.writeContract(params);
      const receipt = await celoPublicClient.waitForTransactionReceipt({
        hash,
        timeout: TX_RECEIPT_TIMEOUT,
      });
      return receipt;
    } catch (err: any) {
      const msg = err?.details || err?.message || "";
      errors.push(`#${attempt + 1}: ${msg.slice(0, 60)}`);
      const isRetryable =
        msg.includes("nonce") ||
        msg.includes("underpriced") ||
        msg.includes("already known") ||
        msg.includes("rate limit") ||
        msg.includes("timeout") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("429");
      if (isRetryable && attempt < retries - 1) {
        const delay = 3000 + attempt * 3000;
        console.log(`  [celo-tx] ${msg.slice(0, 40)}... retrying in ${delay / 1000}s (${attempt + 2}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`sendTxAndWaitCelo: max retries exceeded [${errors.join(" | ")}]`);
}

export { baseSepolia };
