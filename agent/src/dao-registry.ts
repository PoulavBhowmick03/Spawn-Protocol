import { existsSync, readFileSync, writeFileSync } from "fs";
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

interface DAORegistryFile {
  daos: RegisteredDAO[];
}

const EMPTY_REGISTRY: DAORegistryFile = { daos: [] };
export const DAO_REGISTRY_PATH = join(process.cwd(), "..", "dao_registry.json");

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

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/https?:\/\/[^/]+\/?/g, "")
    .replace(/[#/?].*$/, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateDaoId(): string {
  return `dao_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
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

export function normalizeRegisteredDAO(raw: Partial<RegisteredDAO> & Record<string, any>): RegisteredDAO {
  const createdAt = normalizeNullableString(raw.createdAt) || new Date().toISOString();
  const updatedAt = normalizeNullableString(raw.updatedAt) || createdAt;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : generateDaoId(),
    slug: normalizeSlug(String(raw.slug || raw.name || "")),
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

export function readDAORegistry(): DAORegistryFile {
  const registry = readJsonFile<DAORegistryFile>(DAO_REGISTRY_PATH, EMPTY_REGISTRY);
  return {
    daos: Array.isArray(registry.daos) ? registry.daos.map(normalizeRegisteredDAO) : [],
  };
}

export function writeDAORegistry(registry: DAORegistryFile) {
  writeJsonFile(DAO_REGISTRY_PATH, {
    daos: Array.isArray(registry.daos) ? registry.daos.map(normalizeRegisteredDAO) : [],
  });
}

export function getAllRegisteredDAOs(): RegisteredDAO[] {
  return readDAORegistry().daos;
}

export function getRegisteredDAOBySlug(slug: string): RegisteredDAO | undefined {
  const normalized = normalizeSlug(slug);
  return getAllRegisteredDAOs().find((dao) => dao.slug === normalized);
}

export function getRegisteredDAOBySource(
  source: DAORegistrySource,
  sourceRef: string
): RegisteredDAO | undefined {
  return getAllRegisteredDAOs().find(
    (dao) => dao.source === source && dao.sourceRef === sourceRef
  );
}

export function createRegisteredDAO(input: {
  name: string;
  slug?: string;
  source: DAORegistrySource;
  sourceRef: string;
  philosophy?: string;
  contact?: string;
  status?: DAORegistryStatus;
  enabled?: boolean;
}): RegisteredDAO {
  const timestamp = new Date().toISOString();
  return {
    id: generateDaoId(),
    slug: normalizeSlug(input.slug || input.name),
    name: input.name.trim(),
    source: input.source,
    sourceRef: input.sourceRef.trim(),
    philosophy: input.philosophy?.trim() || "neutral",
    contact: input.contact?.trim() || "",
    createdAt: timestamp,
    updatedAt: timestamp,
    enabled: input.enabled !== false,
    status: input.status || "registered",
    lastActionAt: timestamp,
    lastError: null,
    mirroredProposalCount: 0,
    activeProposalCount: 0,
    spawnedChildren: [],
    lastVoteAt: null,
    timeToFirstMirrorMs: null,
    timeToFirstSpawnMs: null,
    timeToFirstVoteMs: null,
    votesLast24h: 0,
  };
}

export function appendRegisteredDAO(dao: RegisteredDAO): RegisteredDAO {
  const registry = readDAORegistry();
  if (
    registry.daos.some(
      (existing) => existing.source === dao.source && existing.sourceRef === dao.sourceRef
    )
  ) {
    throw new Error(`DAO already registered for ${dao.source}:${dao.sourceRef}`);
  }
  if (registry.daos.some((existing) => existing.slug === dao.slug)) {
    throw new Error(`DAO slug already registered: ${dao.slug}`);
  }

  registry.daos.push(dao);
  writeDAORegistry(registry);
  return dao;
}

export function updateRegisteredDAO(
  slug: string,
  patch: Partial<Omit<RegisteredDAO, "id" | "slug" | "createdAt">>
): RegisteredDAO | undefined {
  const normalizedSlug = normalizeSlug(slug);
  const registry = readDAORegistry();
  const index = registry.daos.findIndex((dao) => dao.slug === normalizedSlug);
  if (index === -1) return undefined;

  const timestamp = new Date().toISOString();
  const current = registry.daos[index];
  const next = normalizeRegisteredDAO({
    ...current,
    ...patch,
    updatedAt: timestamp,
    lastActionAt: patch.lastActionAt ?? timestamp,
  });
  registry.daos[index] = next;
  writeDAORegistry(registry);
  return next;
}

export function extractTallyOrganizationInput(raw: string): { id?: string; slug?: string } {
  const value = raw.trim();
  if (!value) return {};

  const urlMatch = value.match(/tally\.xyz\/gov\/([^/?#]+)/i);
  const candidate = (urlMatch?.[1] || value).trim();

  if (/^\d+$/.test(candidate)) {
    return { id: candidate };
  }

  return { slug: normalizeSlug(candidate) };
}

export function extractSnapshotSpace(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  const urlMatch = value.match(/snapshot\.org\/#\/([^/?#]+)/i);
  if (urlMatch?.[1]) return urlMatch[1].trim();

  const altUrlMatch = value.match(/snapshot\.org\/[^#]*#\/([^/?#]+)/i);
  if (altUrlMatch?.[1]) return altUrlMatch[1].trim();

  return value;
}
