import {
  MockGovernorABI,
  ParentTreasuryABI,
  SpawnFactoryABI,
  ChildGovernorABI,
} from "./abis";

// Latest deployment — Base Sepolia (chain 84532)
// With operator auth, unique child wallets, SpawnENSRegistry, StETHTreasury
export const CONTRACTS = {
  MockGovernor: {
    address: "0x55d18aAFaf7Ef1838d3df5DCb4B0A899F6fB6B0e" as const,
    abi: MockGovernorABI,
  },
  ParentTreasury: {
    address: "0xF470384d5d08720785460567f2F785f62b6d016c" as const,
    abi: ParentTreasuryABI,
  },
  SpawnFactory: {
    address: "0xbee1A2c4950117a276FBBa17eebc33b324125760" as const,
    abi: SpawnFactoryABI,
  },
  ChildGovernorImpl: {
    address: "0xEE0ed30B41B57Eb715EFe586723bfde551EFa407" as const,
    abi: ChildGovernorABI,
  },
} as const;

// All 3 DAO governors
export const GOVERNORS = [
  {
    name: "Uniswap DAO",
    slug: "uniswap",
    address: "0x55d18aAFaf7Ef1838d3df5DCb4B0A899F6fB6B0e" as const,
    abi: MockGovernorABI,
    color: "text-pink-400",
    borderColor: "border-pink-400/30",
    bgColor: "bg-pink-400/5",
  },
  {
    name: "Lido DAO",
    slug: "lido",
    address: "0x34384d90A14633309100BA52f73Aec0e0D5C0a8C" as const,
    abi: MockGovernorABI,
    color: "text-blue-400",
    borderColor: "border-blue-400/30",
    bgColor: "bg-blue-400/5",
  },
  {
    name: "ENS DAO",
    slug: "ens",
    address: "0xFB98e4688e31E56e761d2837248CD1C1181D3BE7" as const,
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
