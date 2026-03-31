import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const JUDGE_FLOW_CONTROL_PATH =
  process.env.JUDGE_FLOW_CONTROL_PATH ||
  join(__dirname, "..", "..", "judge_flow_state.json");
export const JUDGE_FLOW_ENABLED = process.env.JUDGE_FLOW_ENABLED !== "false";
export const JUDGE_FLOW_TIMEOUT_MS = Number(process.env.JUDGE_FLOW_TIMEOUT_MS || 90_000);
export const JUDGE_FLOW_POLL_MS = 2_000;

export const JUDGE_STEP_ORDER = [
  "judge_flow_started",
  "judge_child_spawned",
  "judge_proposal_seeded",
  "judge_vote_cast",
  "judge_alignment_forced",
  "judge_reputation_written",
  "judge_validation_written",
  "judge_termination_report_filecoin",
  "judge_child_terminated",
  "judge_child_respawned",
  "judge_lineage_loaded",
  "judge_flow_completed",
] as const;

export type JudgeAction = (typeof JUDGE_STEP_ORDER)[number];
export type JudgeStatus = "idle" | "queued" | "running" | "failed" | "completed";

export interface JudgeEvent {
  action: JudgeAction;
  at: string;
  status: "pending" | "success" | "failed";
  txHash?: string;
  txHashes?: string[];
  details?: string;
  proposalId?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  respawnedChild?: string;
  lineageSourceCid?: string;
}

export interface JudgeFlowState {
  runId: string | null;
  status: JudgeStatus;
  governor: string;
  governorAddress?: string;
  proofChildLabel?: string;
  proofChildAgentId?: string;
  respawnedChildLabel?: string;
  respawnedChildAgentId?: string;
  proposalId?: string;
  proposalDescription?: string;
  forcedScore: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  failureReason?: string;
  filecoinCid?: string;
  filecoinUrl?: string;
  validationRequestId?: string;
  validationTxHash?: string;
  validationResponseTxHash?: string;
  reputationTxHash?: string;
  alignmentTxHash?: string;
  terminationTxHash?: string;
  proposalTxHash?: string;
  respawnTxHash?: string;
  voteTxHash?: string;
  lineageSourceCid?: string;
  proofStatus?: string;
  requestedAt?: string;
  events: JudgeEvent[];
}

export function emptyJudgeFlowState(): JudgeFlowState {
  return {
    runId: null,
    status: "idle",
    governor: "uniswap",
    forcedScore: 15,
    events: [],
  };
}

export function readJudgeFlowState(): JudgeFlowState {
  if (!existsSync(JUDGE_FLOW_CONTROL_PATH)) return emptyJudgeFlowState();
  try {
    const raw = JSON.parse(readFileSync(JUDGE_FLOW_CONTROL_PATH, "utf-8"));
    return {
      ...emptyJudgeFlowState(),
      ...raw,
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  } catch {
    return emptyJudgeFlowState();
  }
}

export function writeJudgeFlowState(state: JudgeFlowState) {
  writeFileSync(JUDGE_FLOW_CONTROL_PATH, JSON.stringify(state, null, 2));
}

export function updateJudgeFlowState(
  updater: (current: JudgeFlowState) => JudgeFlowState
): JudgeFlowState {
  const next = updater(readJudgeFlowState());
  writeJudgeFlowState(next);
  return next;
}

export function appendJudgeEvent(
  state: JudgeFlowState,
  event: JudgeEvent
): JudgeFlowState {
  return {
    ...state,
    events: [...state.events, event],
  };
}

export function isJudgeChildLabel(label: string): boolean {
  return label.startsWith("judge-");
}

export function buildJudgeMarker(runId: string): string {
  return `[JUDGE_FLOW:${runId}]`;
}

export function extractJudgeRunIdFromDescription(description: string): string | null {
  const match = description.match(/\[JUDGE_FLOW:([^\]]+)\]/);
  return match?.[1] || null;
}
