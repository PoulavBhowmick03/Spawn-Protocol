import { existsSync, readFileSync, writeFileSync } from "fs";
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

export function readDAORegistry(): DAORegistryFile {
  const registry = readJsonFile<DAORegistryFile>(DAO_REGISTRY_PATH, EMPTY_REGISTRY);
  return {
    daos: Array.isArray(registry.daos) ? registry.daos : [],
  };
}

export function writeDAORegistry(registry: DAORegistryFile) {
  writeJsonFile(DAO_REGISTRY_PATH, {
    daos: Array.isArray(registry.daos) ? registry.daos : [],
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
    status: input.status || "active",
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
