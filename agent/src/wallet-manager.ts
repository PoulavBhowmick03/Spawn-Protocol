/**
 * Wallet Manager — Derives unique wallets for each child agent
 *
 * Uses keccak256(parentPrivateKey + childId) to deterministically derive
 * a unique private key for each child. This ensures each child agent
 * has its own wallet for signing transactions.
 */

import { keccak256, encodePacked, defineChain, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http, fallback } from "viem";
import { baseSepolia } from "viem/chains";

const celoSepoliaChain = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: [process.env.CELO_SEPOLIA_RPC_URL || "https://celo-sepolia.drpc.org"] } },
});

const BASE_SEPOLIA_TRANSPORT = fallback([
  http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
  http("https://base-sepolia.drpc.org"),
  http("https://base-sepolia-rpc.publicnode.com"),
], { rank: false });

function resolveChain(chainName?: string) {
  if (chainName === "celo-sepolia") return { chain: celoSepoliaChain, rpc: process.env.CELO_SEPOLIA_RPC_URL || "https://celo-sepolia.drpc.org" };
  return { chain: baseSepolia, rpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org" };
}

interface DerivedWallet {
  address: Address;
  privateKey: Hex;
  account: ReturnType<typeof privateKeyToAccount>;
}

// Track all derived wallets
const derivedWallets = new Map<number, DerivedWallet>();

/**
 * Derive a unique wallet for a child agent using the parent's private key + childId.
 * The derivation is deterministic: same parentKey + childId always produces the same wallet.
 */
export function deriveChildWallet(childId: number, parentPrivateKey?: Hex): DerivedWallet {
  // Return cached if already derived
  const cached = derivedWallets.get(childId);
  if (cached) return cached;

  const parentKey = parentPrivateKey || (process.env.PRIVATE_KEY as Hex);
  if (!parentKey) {
    throw new Error("PRIVATE_KEY not set — cannot derive child wallet");
  }

  // Derive child private key: keccak256(parentPrivateKey + childId)
  const childPrivateKey = keccak256(
    encodePacked(["bytes32", "uint256"], [parentKey as Hex, BigInt(childId)])
  );

  const account = privateKeyToAccount(childPrivateKey);

  const wallet: DerivedWallet = {
    address: account.address,
    privateKey: childPrivateKey,
    account,
  };

  derivedWallets.set(childId, wallet);
  return wallet;
}

/**
 * Create a walletClient for a specific child agent on a given chain.
 */
export function createChildWalletClient(
  childId: number,
  chain: typeof baseSepolia = baseSepolia,
  rpcUrl?: string,
  parentPrivateKey?: Hex
) {
  const wallet = deriveChildWallet(childId, parentPrivateKey);

  return createWalletClient({
    account: wallet.account,
    chain,
    transport: rpcUrl ? http(rpcUrl) : BASE_SEPOLIA_TRANSPORT,
  });
}

/**
 * Create a walletClient from an explicit private key (used by child processes).
 */
export function createWalletClientFromKey(
  privateKey: Hex,
  chainName?: string
) {
  const account = privateKeyToAccount(privateKey);
  const { chain } = resolveChain(chainName);
  const transport = chainName === "celo-sepolia"
    ? http(process.env.CELO_SEPOLIA_RPC_URL || "https://celo-sepolia.drpc.org")
    : BASE_SEPOLIA_TRANSPORT;

  return createWalletClient({
    account,
    chain,
    transport,
  });
}

/**
 * Get all derived wallets (for logging/debugging).
 */
export function getAllDerivedWallets(): Map<number, DerivedWallet> {
  return new Map(derivedWallets);
}

/**
 * Get a derived wallet by childId (returns undefined if not derived yet).
 */
export function getDerivedWallet(childId: number): DerivedWallet | undefined {
  return derivedWallets.get(childId);
}
