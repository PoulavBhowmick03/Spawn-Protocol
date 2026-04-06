import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type DAORegistrySource = "tally" | "snapshot";
export type DAORegistryStatus =
  | "registered"
  | "validated"
  | "discovering"
  | "mirrored"
  | "cohort_spawned"
  | "voting"
  | "idle"
  | "error";

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
  enabled: boolean;
  status: DAORegistryStatus;
  lastActionAt: string | null;
  lastError: string | null;
  mirroredProposalCount: number;
  activeProposalCount: number;
  spawnedChildren: string[];
  lastVoteAt: string | null;
  timeToFirstMirrorMs: number | null;
  timeToFirstSpawnMs: number | null;
  timeToFirstVoteMs: number | null;
  votesLast24h: number;
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

export interface CohortRecord {
  daoSlug: string;
  label: string;
  governorAddr: string;
  governorName: string;
  perspective: string;
  spawnedAt: string;
  spawnReason: string;
  triggeringProposalId: string | null;
  active: boolean;
  recalledAt: string | null;
  recallReason: string | null;
}

interface DAORegistryFile {
  daos: RegisteredDAO[];
}

interface MirrorIndexFile {
  proposals: MirroredProposalRecord[];
}

interface CohortRegistryFile {
  records: CohortRecord[];
}

const DAO_REGISTRY_PATH = join(process.cwd(), "..", "dao_registry.json");
const MIRRORED_PROPOSALS_PATH = join(process.cwd(), "..", "mirrored_proposals.json");
const COHORT_REGISTRY_PATH = join(process.cwd(), "..", "cohort_records.json");

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

function normalizeStatus(value: unknown): DAORegistryStatus {
  switch (value) {
    case "validated":
    case "discovering":
    case "mirrored":
    case "cohort_spawned":
    case "voting":
    case "idle":
    case "error":
    case "registered":
      return value;
    case "active":
      return "idle";
    case "pending":
      return "registered";
    default:
      return "registered";
  }
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = normalizeNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeRegisteredDao(raw: Partial<RegisteredDAO> & Record<string, any>): RegisteredDAO {
  const createdAt = normalizeNullableString(raw.createdAt) || new Date().toISOString();
  const updatedAt = normalizeNullableString(raw.updatedAt) || createdAt;
  return {
    id: String(raw.id || ""),
    slug: normalizeDaoSlug(String(raw.slug || raw.name || "")),
    name: String(raw.name || "").trim(),
    source: raw.source === "tally" ? "tally" : "snapshot",
    sourceRef: String(raw.sourceRef || "").trim(),
    philosophy: String(raw.philosophy || "neutral").trim() || "neutral",
    contact: String(raw.contact || "").trim(),
    createdAt,
    updatedAt,
    enabled: raw.enabled !== false,
    status: normalizeStatus(raw.status),
    lastActionAt: normalizeNullableString(raw.lastActionAt) || updatedAt,
    lastError: normalizeNullableString(raw.lastError),
    mirroredProposalCount: normalizeNumber(raw.mirroredProposalCount, 0),
    activeProposalCount: normalizeNumber(raw.activeProposalCount, 0),
    spawnedChildren: normalizeStringArray(raw.spawnedChildren),
    lastVoteAt: normalizeNullableString(raw.lastVoteAt),
    timeToFirstMirrorMs: normalizeNullableNumber(raw.timeToFirstMirrorMs),
    timeToFirstSpawnMs: normalizeNullableNumber(raw.timeToFirstSpawnMs),
    timeToFirstVoteMs: normalizeNullableNumber(raw.timeToFirstVoteMs),
    votesLast24h: normalizeNumber(raw.votesLast24h, 0),
  };
}

export function readRegisteredDAOs(): RegisteredDAO[] {
  const registry = readJsonFile<DAORegistryFile>(DAO_REGISTRY_PATH, { daos: [] });
  return Array.isArray(registry.daos) ? registry.daos.map(normalizeRegisteredDao) : [];
}

export function getRegisteredDAOBySlug(slug: string): RegisteredDAO | undefined {
  const normalized = normalizeDaoSlug(slug);
  return readRegisteredDAOs().find((dao) => dao.slug === normalized);
}

export function readMirroredProposals(): MirroredProposalRecord[] {
  const index = readJsonFile<MirrorIndexFile>(MIRRORED_PROPOSALS_PATH, { proposals: [] });
  return Array.isArray(index.proposals) ? index.proposals : [];
}

export function readCohortRecords(): CohortRecord[] {
  const registry = readJsonFile<CohortRegistryFile>(COHORT_REGISTRY_PATH, { records: [] });
  return Array.isArray(registry.records) ? registry.records : [];
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
