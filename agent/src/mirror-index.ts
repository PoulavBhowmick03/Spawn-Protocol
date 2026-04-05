import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type MirroredProposalSource =
  | "tally"
  | "snapshot"
  | "boardroom"
  | "polymarket"
  | "simulated";

export interface MirroredProposalRecord {
  governorAddress: string;
  proposalId: string;
  externalProposalKey: string;
  sourceDaoId?: string;
  sourceDaoSlug?: string;
  sourceDaoName?: string;
  source: MirroredProposalSource;
  sourceRef?: string;
  mirroredAt: string;
  transactionHash?: string;
}

interface MirrorIndexFile {
  proposals: MirroredProposalRecord[];
}

const EMPTY_MIRROR_INDEX: MirrorIndexFile = { proposals: [] };
export const MIRRORED_PROPOSALS_PATH = join(process.cwd(), "..", "mirrored_proposals.json");

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

function mergeMirroredProposalRecord(
  existing: MirroredProposalRecord,
  incoming: MirroredProposalRecord
): MirroredProposalRecord {
  return {
    ...existing,
    ...incoming,
    sourceDaoId: incoming.sourceDaoId ?? existing.sourceDaoId,
    sourceDaoSlug: incoming.sourceDaoSlug ?? existing.sourceDaoSlug,
    sourceDaoName: incoming.sourceDaoName ?? existing.sourceDaoName,
    sourceRef: incoming.sourceRef ?? existing.sourceRef,
    mirroredAt: existing.mirroredAt || incoming.mirroredAt,
    transactionHash: incoming.transactionHash ?? existing.transactionHash,
  };
}

export function readMirrorIndex(): MirrorIndexFile {
  const data = readJsonFile<MirrorIndexFile>(MIRRORED_PROPOSALS_PATH, EMPTY_MIRROR_INDEX);
  return {
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
  };
}

export function writeMirrorIndex(index: MirrorIndexFile) {
  writeJsonFile(MIRRORED_PROPOSALS_PATH, {
    proposals: Array.isArray(index.proposals) ? index.proposals : [],
  });
}

export function getAllMirroredProposals(): MirroredProposalRecord[] {
  return readMirrorIndex().proposals;
}

export function findMirroredProposalByInternal(
  governorAddress: string,
  proposalId: bigint | number | string
): MirroredProposalRecord | undefined {
  const address = governorAddress.toLowerCase();
  const normalizedProposalId = String(proposalId);
  return getAllMirroredProposals().find(
    (proposal) =>
      proposal.governorAddress.toLowerCase() === address &&
      proposal.proposalId === normalizedProposalId
  );
}

export function findMirroredProposalByExternalKey(
  externalProposalKey: string
): MirroredProposalRecord | undefined {
  return getAllMirroredProposals().find(
    (proposal) => proposal.externalProposalKey === externalProposalKey
  );
}

export function hasMirroredProposal(externalProposalKey: string): boolean {
  return !!findMirroredProposalByExternalKey(externalProposalKey);
}

export function recordMirroredProposal(record: MirroredProposalRecord): MirroredProposalRecord {
  const index = readMirrorIndex();
  const existingIndex = index.proposals.findIndex(
    (proposal) =>
      proposal.externalProposalKey === record.externalProposalKey ||
      (proposal.governorAddress.toLowerCase() === record.governorAddress.toLowerCase() &&
        proposal.proposalId === record.proposalId)
  );

  if (existingIndex !== -1) {
    const merged = mergeMirroredProposalRecord(index.proposals[existingIndex], record);
    index.proposals[existingIndex] = merged;
    writeMirrorIndex(index);
    return merged;
  }

  index.proposals.push(record);
  writeMirrorIndex(index);
  return record;
}

export function syncMirroredProposalsForRegisteredDaos(
  daos: Array<{
    id: string;
    slug: string;
    name: string;
    source: "tally" | "snapshot";
    sourceRef: string;
  }>
): number {
  if (daos.length === 0) return 0;

  const daosBySourceRef = new Map(
    daos.map((dao) => [`${dao.source}:${dao.sourceRef}`, dao] as const)
  );
  const index = readMirrorIndex();
  let changed = 0;

  index.proposals = index.proposals.map((proposal) => {
    if ((proposal.source !== "tally" && proposal.source !== "snapshot") || !proposal.sourceRef) {
      return proposal;
    }

    const dao = daosBySourceRef.get(`${proposal.source}:${proposal.sourceRef}`);
    if (!dao) return proposal;

    const next = mergeMirroredProposalRecord(proposal, {
      ...proposal,
      sourceDaoId: dao.id,
      sourceDaoSlug: dao.slug,
      sourceDaoName: dao.name,
    });

    if (
      next.sourceDaoId !== proposal.sourceDaoId ||
      next.sourceDaoSlug !== proposal.sourceDaoSlug ||
      next.sourceDaoName !== proposal.sourceDaoName
    ) {
      changed++;
      return next;
    }

    return proposal;
  });

  if (changed > 0) {
    writeMirrorIndex(index);
  }

  return changed;
}
