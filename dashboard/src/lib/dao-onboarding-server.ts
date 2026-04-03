import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type DAORegistrySource = "tally" | "snapshot";
export type DAORegistryStatus = "active" | "pending";

export interface RegisteredDAO {
  id: string;
  slug: string;
  name: string;
  source: DAORegistrySource;
  sourceRef: string;
  philosophy: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  status: DAORegistryStatus;
}

export interface MirroredProposalRecord {
  governorAddress: string;
  proposalId: string;
  externalProposalKey: string;
  sourceDaoId?: string;
  sourceDaoSlug?: string;
  sourceDaoName?: string;
  source: "tally" | "snapshot" | "boardroom" | "polymarket" | "simulated";
  sourceRef?: string;
  mirroredAt: string;
  transactionHash?: string;
}

interface DAORegistryFile {
  daos: RegisteredDAO[];
}

interface MirrorIndexFile {
  proposals: MirroredProposalRecord[];
}

const DAO_REGISTRY_PATH = join(process.cwd(), "..", "dao_registry.json");
const MIRRORED_PROPOSALS_PATH = join(process.cwd(), "..", "mirrored_proposals.json");

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function normalizeDaoSlug(input: string): string {
  return input.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/-+/g, "-");
}

export function readRegisteredDAOs(): RegisteredDAO[] {
  const registry = readJsonFile<DAORegistryFile>(DAO_REGISTRY_PATH, { daos: [] });
  return Array.isArray(registry.daos) ? registry.daos : [];
}

export function getRegisteredDAOBySlug(slug: string): RegisteredDAO | undefined {
  const normalized = normalizeDaoSlug(slug);
  return readRegisteredDAOs().find((dao) => dao.slug === normalized);
}

export function readMirroredProposals(): MirroredProposalRecord[] {
  const index = readJsonFile<MirrorIndexFile>(MIRRORED_PROPOSALS_PATH, { proposals: [] });
  return Array.isArray(index.proposals) ? index.proposals : [];
}

export function getMirrorLookupKey(
  governorAddress: string,
  proposalId: string | number | bigint
): string {
  return `${governorAddress.toLowerCase()}:${String(proposalId)}`;
}

export function buildMirrorLookup(): Map<string, MirroredProposalRecord> {
  return new Map(
    readMirroredProposals().map((proposal) => [
      getMirrorLookupKey(proposal.governorAddress, proposal.proposalId),
      proposal,
    ])
  );
}
