import {
  MockGovernorABI,
  ParentTreasuryABI,
  SpawnFactoryABI,
  ChildGovernorABI,
} from "./abis";

// Latest deployment — Base Sepolia (chain 84532) — with operator auth + unique child wallets
export const CONTRACTS = {
  MockGovernor: {
    address: "0x2a60Fe40a25F0cb74D2ff87E85862E3B97DE9970" as const,
    abi: MockGovernorABI,
  },
  ParentTreasury: {
    address: "0x6408Cd02EB770b81ab9870af1E6aB5A478448d99" as const,
    abi: ParentTreasuryABI,
  },
  SpawnFactory: {
    address: "0x2D71B32Bb8B69238228A0717AE150d3f1a64185F" as const,
    abi: SpawnFactoryABI,
  },
  ChildGovernorImpl: {
    address: "0x2D71B32Bb8B69238228A0717AE150d3f1a64185F" as const,
    abi: ChildGovernorABI,
  },
} as const;

// All 3 DAO governors — used by proposals page and swarm
export const GOVERNORS = [
  {
    name: "Uniswap DAO",
    slug: "uniswap",
    address: "0x2a60Fe40a25F0cb74D2ff87E85862E3B97DE9970" as const,
    abi: MockGovernorABI,
    color: "text-pink-400",
    borderColor: "border-pink-400/30",
    bgColor: "bg-pink-400/5",
  },
  {
    name: "Lido DAO",
    slug: "lido",
    address: "0x5a43535847fdB0B7A7edF71aAd0BAEcb766B0FCA" as const,
    abi: MockGovernorABI,
    color: "text-blue-400",
    borderColor: "border-blue-400/30",
    bgColor: "bg-blue-400/5",
  },
  {
    name: "ENS DAO",
    slug: "ens",
    address: "0x8fd54F8a71746845f58497f3056E6dfff08d960a" as const,
    abi: MockGovernorABI,
    color: "text-purple-400",
    borderColor: "border-purple-400/30",
    bgColor: "bg-purple-400/5",
  },
] as const;

export const EXPLORER_BASE = "https://sepolia.basescan.org";

export function explorerTx(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_BASE}/address/${address}`;
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(ts: bigint | number): string {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
}

export function supportLabel(support: number): string {
  if (support === 1) return "FOR";
  if (support === 0) return "AGAINST";
  return "ABSTAIN";
}

export function supportColor(support: number): string {
  if (support === 1) return "text-green-400";
  if (support === 0) return "text-red-400";
  return "text-yellow-400";
}

export function proposalStateLabel(state: number): string {
  const labels: Record<number, string> = {
    0: "Pending",
    1: "Active",
    2: "Defeated",
    3: "Succeeded",
    4: "Executed",
  };
  return labels[state] ?? "Unknown";
}

export function proposalStateColor(state: number): string {
  if (state === 1) return "text-blue-400 border-blue-400";
  if (state === 3 || state === 4) return "text-green-400 border-green-400";
  if (state === 2) return "text-red-400 border-red-400";
  return "text-gray-400 border-gray-400";
}
