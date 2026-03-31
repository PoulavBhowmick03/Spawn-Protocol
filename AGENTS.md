# Agent Coordination File

Both Claude Code agents: READ THIS BEFORE DOING ANYTHING. Update after completing work.

---

# PL Genesis — Current State (April 1, 2026)

> Tracks: ERC-8004 Agent Receipt · AI & Robotics · Crypto & Filecoin
> Winners announced: April 10, 2026

---

## Completed Work

### P0 — Judge Flow ✅
Latest successful canonical run: `judge-1774994071985`

| Step | Evidence |
|---|---|
| Child spawned | `0x4d191f9f...` |
| Proposal seeded | `0x142d4316...` (proposal #4815) |
| Vote cast | `0x4620f88d...` |
| Alignment forced (15) | `0x301dd694...` |
| Filecoin termination report | `bafkzcibdzudaohd2qfsy42duzj5oc4lvimzhh5nm5ki4gi4dohmsmjj7s4rieiqb` |
| Reputation written | `0x73cb342a...` |
| Validation written | `0x9d6b625f...` (request `12`) |
| Child terminated | `0x37de75c2...` |
| Child respawned | `0x3e9e73c1...` |
| Proof child ERC-8004 id | `3253` |
| Respawned child ERC-8004 id | `3254` |

All 12 lifecycle steps confirmed. Evidence in `README.md` and `agent_log.json`.

Operational note: the first April 1 rerun failed because two `npm run swarm` parent processes were competing for the same Base Sepolia nonce stream. The older duplicate parent was stopped, the retrying ERC-8004 send path stayed in place, and the next rerun above completed successfully.

---

### P2 — Venice Reasoning Chain Panel ✅
3-step collapsible panel (Summarize → Risk → Decision) lives in `dashboard/src/app/agent/[id]/page.tsx` lines 837–860. API route at `dashboard/src/app/api/agent/[label]/reasoning/route.ts`.

### P3 — Filecoin Inline Preview ✅
`dashboard/src/components/StorageInlinePreview.tsx` embedded in swarm page and judge-flow page. Full typed renderer at `dashboard/src/app/storage/[cid]/page.tsx`.

### P4 — Judge Flow Track Badges ✅
Color-coded track pills on every judge-flow step in `dashboard/src/app/judge-flow/page.tsx`.

### P1 — Agent Receipt Page ✅
`dashboard/src/app/receipt/[runId]/page.tsx` now aggregates the full canonical proof bundle in one URL, backed by `dashboard/src/app/api/receipt/[runId]/route.ts` and `dashboard/src/lib/judge-receipt.ts`.

Latest proof URL:
`/receipt/judge-1774994071985`

### ERC-8004 Trust Gating ✅
`getAgentTrustDecision()` in `agent/src/identity.ts` gates children with reputation < 45. Wired into `child.ts` and `swarm.ts`.

### Judge Flow Reliability ✅
- Receipt-based child lookup replaces polling loops
- Discovery feed pauses during judge runs (nonce isolation)
- Retry logic on reputation + validation tx sends

### Filecoin Links ✅
Internal `/storage/[cid]` viewer replaces broken Filscan links throughout dashboard.

### Runtime Budget Fallback ✅
`/api/budget` now prefers the local `runtime_budget_state.json`, but falls back to the latest Filecoin-backed `filecoin.state` swarm snapshot via ENS + `/api/storage` when the dashboard is running separately from the swarm. New snapshots include `runtimeBudget` fields.

### README ✅
Rewritten as clean hackathon submission (April 1). Removed draft text, track sections are direct and factual.

---

## What Still Needs Doing

### 1. Submission tasks (Poulav)
- [ ] Delete `AGENTS.md` and `BuilderPrompt.md` before final submission push (internal coordination files)
- [ ] Add 2-3 dashboard screenshots to `docs/` folder
- [ ] Devfolio submission form
- [ ] Demo video (60-90s)

---

## Known Issues / Watch Points

- Do not run two parent swarms against the same wallet. Duplicate `npm run swarm` parents create nonce contention and can break judge-flow reliability.
- ERC-8004 validation is best-effort in judge mode and does not block a successful proof run.
- End-to-end judge flow takes ~204–237s on live infra. `JUDGE_FLOW_TIMEOUT_MS` should be ≥ 300000.
- Synapse piece CIDs must NOT be linked to Filscan. Use `/storage/[cid]` internal viewer only.
- The Filecoin budget fallback needs one fresh swarm cycle after this patch before remote-only deployments will see `runtimeBudget` in the latest `filecoin.state` snapshot.

---

## File Ownership

**Agent 1 (dashboard + integration):**
`agent/src/identity.ts`, `agent/src/discovery.ts`, `dashboard/**`, `agent.json`, `agent_log.json`, `run.sh`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`

**Agent 2 (contracts + core runtime):**
`contracts/src/*`, `contracts/test/*`, `contracts/script/*`, `agent/src/swarm.ts`, `agent/src/chain.ts`, `agent/src/wallet-manager.ts`, `agent/src/child.ts`, `agent/src/spawn-child.ts`, `agent/src/venice.ts`, `agent/src/lido.ts`, `agent/src/ens.ts`

---

## DO NOT TOUCH
- `agent/src/venice.ts` — provider lock enforced
- `agent/src/filecoin.ts` — Synapse SDK working
- Do not link Synapse piece CIDs to Filscan anywhere in the dashboard
- Do not re-add credentials or strategy notes to `CLAUDE.md`
