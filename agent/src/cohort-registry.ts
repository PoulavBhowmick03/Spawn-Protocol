import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type CohortSpawnReason =
  | "active_proposal"
  | "scaling"
  | "respawn"
  | "manual";

export type CohortRecallReason =
  | "idle_no_active_proposals"
  | "registered_dao_idle_no_active_proposals"
  | "terminated"
  | "manual"
  | "respawned";

export interface CohortRecord {
  daoSlug: string;
  label: string;
  governorAddr: `0x${string}`;
  governorName: string;
  perspective: string;
  spawnedAt: string;
  spawnReason: CohortSpawnReason;
  triggeringProposalId: string | null;
  active: boolean;
  recalledAt: string | null;
  recallReason: CohortRecallReason | null;
}

interface CohortRegistryFile {
  records: CohortRecord[];
}

const EMPTY_REGISTRY: CohortRegistryFile = { records: [] };
export const COHORT_REGISTRY_PATH = join(process.cwd(), "..", "cohort_records.json");

function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function normalizeRecord(raw: Partial<CohortRecord> & Record<string, any>): CohortRecord {
  return {
    daoSlug: String(raw.daoSlug || "").trim().toLowerCase(),
    label: String(raw.label || "").trim(),
    governorAddr: String(raw.governorAddr || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    governorName: String(raw.governorName || "").trim(),
    perspective: String(raw.perspective || "").trim(),
    spawnedAt: String(raw.spawnedAt || new Date().toISOString()),
    spawnReason: (raw.spawnReason || "active_proposal") as CohortSpawnReason,
    triggeringProposalId: typeof raw.triggeringProposalId === "string" && raw.triggeringProposalId.trim()
      ? raw.triggeringProposalId
      : null,
    active: raw.active !== false,
    recalledAt: typeof raw.recalledAt === "string" && raw.recalledAt.trim() ? raw.recalledAt : null,
    recallReason: raw.recallReason ? (raw.recallReason as CohortRecallReason) : null,
  };
}

export function readCohortRegistry(): CohortRegistryFile {
  const registry = readJsonFile<CohortRegistryFile>(COHORT_REGISTRY_PATH, EMPTY_REGISTRY);
  return {
    records: Array.isArray(registry.records) ? registry.records.map(normalizeRecord) : [],
  };
}

export function writeCohortRegistry(registry: CohortRegistryFile) {
  writeJsonFile(COHORT_REGISTRY_PATH, {
    records: Array.isArray(registry.records) ? registry.records.map(normalizeRecord) : [],
  });
}

export function getCohortRecords(daoSlug?: string): CohortRecord[] {
  const records = readCohortRegistry().records;
  if (!daoSlug) return records;
  const normalized = daoSlug.trim().toLowerCase();
  return records.filter((record) => record.daoSlug === normalized);
}

export function getActiveCohortRecords(daoSlug?: string): CohortRecord[] {
  return getCohortRecords(daoSlug).filter((record) => record.active);
}

export function recordCohortSpawn(record: CohortRecord): CohortRecord {
  const normalized = normalizeRecord(record);
  const registry = readCohortRegistry();
  const index = registry.records.findIndex((entry) => entry.label === normalized.label);
  if (index === -1) {
    registry.records.push(normalized);
  } else {
    registry.records[index] = normalized;
  }
  writeCohortRegistry(registry);
  return normalized;
}

export function markCohortInactive(
  label: string,
  reason: CohortRecallReason,
  recalledAt = new Date().toISOString()
): CohortRecord | undefined {
  const registry = readCohortRegistry();
  const index = registry.records.findIndex((entry) => entry.label === label);
  if (index === -1) return undefined;
  const next = normalizeRecord({
    ...registry.records[index],
    active: false,
    recalledAt,
    recallReason: reason,
  });
  registry.records[index] = next;
  writeCohortRegistry(registry);
  return next;
}
