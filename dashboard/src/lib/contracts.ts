import {
  MockGovernorABI,
  ParentTreasuryABI,
  SpawnFactoryABI,
  ChildGovernorABI,
} from "./abis";

// Multi-DAO deployment — Base Sepolia (chain 84532)
export const CONTRACTS = {
  // Legacy single governor (kept for backward compat)
  MockGovernor: {
    address: "0x900Ea5B3D69eD4f12Fe8cDCF5BaCd0671742D380" as const,
    abi: MockGovernorABI,
  },
  ParentTreasury: {
    address: "0x51Ec9a651A56B81e2309fE4615fE26B99a93902F" as const,
    abi: ParentTreasuryABI,
  },
  SpawnFactory: {
    address: "0xb34b5fD9236A32D0826d9d4FEdb8b7bD4DAC0053" as const,
    abi: SpawnFactoryABI,
  },
  ChildGovernorImpl: {
    address: "0xdAC96F133cb8a062AEEAAe136Cee25FF3BbDfddC" as const,
    abi: ChildGovernorABI,
  },
} as const;

// All 3 DAO governors — used by proposals page and swarm
export const GOVERNORS = [
  {
    name: "Uniswap DAO",
    slug: "uniswap",
    address: "0x900Ea5B3D69eD4f12Fe8cDCF5BaCd0671742D380" as const,
    abi: MockGovernorABI,
    color: "text-pink-400",
    borderColor: "border-pink-400/30",
    bgColor: "bg-pink-400/5",
  },
  {
    name: "Lido DAO",
    slug: "lido",
    address: "0xbCB2d76e5838313B422094909e833bA3f13714B5" as const,
    abi: MockGovernorABI,
    color: "text-blue-400",
    borderColor: "border-blue-400/30",
    bgColor: "bg-blue-400/5",
  },
  {
    name: "ENS DAO",
    slug: "ens",
    address: "0xa127EB3882CA0E8C0F9730cb2D9781F5d02EeAD6" as const,
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
