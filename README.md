# Spawn Protocol — PL Genesis

Spawn Protocol is an autonomous governance agent swarm for PL Genesis. A parent agent spawns specialized child agents, mirrors real governance topics onto onchain test governors, lets each child reason privately with Venice, encrypts vote rationale with Lit Protocol, executes votes through scoped ERC-7715 delegations, evaluates alignment every 90 seconds, and terminates and respawns drifting agents with portable memory and onchain receipts.

This branch is the PL Genesis submission branch. The system is not a chatbot wrapper. It is a long-running multi-agent runtime with contracts, structured logs, a dashboard, Filecoin-backed storage, and full ERC-8004 identity, reputation, and validation integration.

## The Problem

DAO governance and autonomous agent coordination both have the same failure mode: too much trust is placed in opaque operators with too little continuous verification.

For governance, token holders do not have the time to read every proposal across every protocol they care about. Delegation helps, but delegates drift, go inactive, or become impossible to audit in detail. For autonomous agents, the problem is similar. An agent can claim to be aligned, safe, and useful, but without portable identity, persistent receipts, and verifiable storage, that claim is weak.

PL Genesis is a good fit because Spawn Protocol sits directly at the intersection of:

- autonomous multi-agent execution
- verifiable onchain identity and trust
- portable decentralized memory
- scoped authority and safety guardrails
- human-readable oversight through a dashboard and execution log

## The Solution

Spawn Protocol turns governance participation into a self-correcting agent system:

1. A human owner stores governance values once in `ParentTreasury`.
2. A parent agent runs continuously in `agent/src/swarm.ts`, discovers targets, and spawns child agents as EIP-1167 clones.
3. Each child runs as its own OS process in `agent/src/child.ts` with a distinct wallet and reasoning perspective.
4. Children read active proposals, summarize them with Venice, assess risk, choose `FOR` / `AGAINST` / `ABSTAIN`, encrypt rationale with Lit, and cast votes onchain through scoped delegation.
5. The parent scores each child against the owner's stated values, updates alignment onchain, writes ERC-8004 reputation and validation receipts, and kills misaligned agents.
6. Replacement agents inherit lineage memory from prior generations, so the swarm does not restart from zero knowledge after every failure.
7. Logs, state snapshots, identity metadata, and termination reports are stored to Filecoin Calibration so the system's memory is portable and independently inspectable.

## How It Works

```text
Owner stores governance values onchain
              |
         Parent Agent (agent/src/swarm.ts)
         |-- discovers proposals from Tally / Snapshot / Boardroom / Polymarket
         |-- spawns child agents via SpawnFactory
         |-- registers ENS labels + ERC-8004 identity
         |-- issues ERC-7715 scoped delegations
         |-- evaluates alignment every 90s
         |-- terminates and respawns drifting agents
         |-- checkpoints state and logs to Filecoin
         |
    +-----------+-----------+-----------+--------------+
    |           |           |           |              |
 Uniswap      Lido         ENS     Polymarket      more children
    |           |           |           |
    +--- each child is a separate OS process with its own wallet ---+
         |-- summarize proposal via Venice
         |-- assess risk via Venice
         |-- reason about vote via Venice
         |-- encrypt rationale with Lit
         |-- cast vote through delegated authority
         +-- reveal rationale after expiry
```

The live runtime documented for this branch is the Base Sepolia swarm with four active governance surfaces in code: `Uniswap`, `Lido`, `ENS`, and `Polymarket`.

## Architecture

### Runtime

| Module | Role |
| --- | --- |
| `agent/src/swarm.ts` | Main parent loop. Spawns children, funds wallets, creates delegations, evaluates alignment, kills and respawns children, stores state to Filecoin, and updates ERC-8004 registries. |
| `agent/src/child.ts` | One child process per agent. Reads proposals, calls Venice three times per vote, encrypts rationale with Lit, casts votes, and reveals rationale after proposal expiry. |
| `agent/src/discovery.ts` | Discovery feed for Tally, Snapshot, Boardroom, Polymarket, and mirrored proposal creation. |
| `agent/src/venice.ts` | Venice client with E2EE models `e2ee-qwen3-30b-a3b-p` and `e2ee-gemma-3-27b-p` plus six distinct reasoning and reporting calls. |
| `agent/src/lit.ts` | Time-locked encryption and decryption using Lit Protocol with `TimeLock.isAfterTimestamp()` access conditions. |
| `agent/src/delegation.ts` | ERC-7715 scoped delegations with `AllowedTargets`, `AllowedMethods`, and `LimitedCalls` caveats. |
| `agent/src/identity.ts` | ERC-8004 identity registration plus reputation and validation registry writes. |
| `agent/src/filecoin.ts` | Filecoin Calibration storage for logs, swarm snapshots, termination memory, identity metadata, and vote rationale archives. |
| `agent/src/logger.ts` | Structured execution logging for `agent_log.json`, dashboard consumption, and judge evidence. |
| `agent/src/lido.ts` | Simulated stETH treasury and yield accounting for self-sustainability modeling. |

### Contracts

| Contract | Purpose |
| --- | --- |
| `SpawnFactory.sol` | Spawns and recalls child agents as EIP-1167 minimal proxies. |
| `ChildGovernor.sol` | Per-child voting contract with encrypted rationale history, reveal flow, and alignment score. |
| `ParentTreasury.sol` | Stores owner values, pause state, spending caps, and factory funding rules. |
| `MockGovernor.sol` | Onchain target governors used for mirrored proposal execution. |
| `ReputationRegistry.sol` | ERC-8004 reputation feedback per agent. |
| `ValidationRegistry.sol` | ERC-8004 validation request and response workflow. |
| `TimeLock.sol` | Timestamp gate used by Lit access control. |
| `StETHTreasury.sol` | Simulated Lido-style treasury where principal is locked and only yield is spendable. |
| `SpawnENSRegistry.sol` | Agent labels, reverse resolution, and text-record metadata. |

### Dashboard

The dashboard in `dashboard/` is a Next.js app with live views for:

- `Swarm`: active and terminated agents, Filecoin and ERC-8004 badges, alignment, wallets, and activity
- `Graph`: parent-child topology
- `Judge Flow`: canonical proof-run trigger, timeline, receipts, Filecoin CID, respawn label, and lineage-loaded confirmation
- `Proposals`: mirrored governance proposals plus live Polymarket markets
- `Leaderboard`: child ranking across alignment and activity
- `Timeline`: chronological event stream
- `Exec Log`: judge-facing structured execution logs and aggregate metrics
- `Settings`: deployed contracts and treasury configuration surface

## Why Venice Is Load-Bearing

Spawn Protocol only makes sense if agent reasoning stays private until execution is complete.

If vote reasoning is visible to a centralized provider before the vote is cast, the privacy and independence guarantees collapse. That is why Venice is not treated as a generic interchangeable LLM call in this project. It is the private inference layer that makes the rest of the stack coherent.

The pipeline is:

1. Venice privately summarizes the proposal.
2. Venice scores proposal risk.
3. Venice decides the vote and produces reasoning.
4. The child commits the reasoning hash before execution.
5. Lit encrypts the rationale until the voting period is over.
6. The vote is executed onchain.
7. The rationale is revealed later, preserving both auditability and pre-vote privacy.

That logic lives in:

- `agent/src/child.ts`
- `agent/src/venice.ts`
- `agent/src/lit.ts`
- `contracts/src/ChildGovernor.sol`
- `contracts/src/TimeLock.sol`

## PL Genesis Track Alignment

The old Synthesis README used bounty-by-bounty sections. This branch needs the same treatment, but aligned to the current PL Genesis scope.

---

### Protocol Labs — Fresh Code

**This PL Genesis submission is also being entered under `Fresh Code` in addition to the sponsor tracks below.**

`Fresh Code` is a submission category rather than a standalone sponsor challenge, so the relevant evidence is the scope of the code being submitted on this branch.

- The submitted branch includes new PL Genesis-facing runtime, contract, and dashboard surfaces rather than only documentation or packaging changes.
- The strongest fresh-code areas in the current submission are:
  - `contracts/src/ReputationRegistry.sol`
  - `contracts/src/ValidationRegistry.sol`
  - `agent/src/filecoin.ts`
  - the expanded ERC-8004 runtime in `agent/src/identity.ts`
  - the PL Genesis dashboard surfaces in `dashboard/`
- The project under review is not just identity minting. It includes portable Filecoin-backed state, ERC-8004 reputation and validation receipts, Polymarket integration, and the dashboard paths that expose those receipts to judges.
- This category sits on top of the challenge-specific sections below, which explain how the same codebase maps to Protocol Labs and Ethereum Foundation judging criteria.

---

### Protocol Labs — AI & Robotics

**Spawn Protocol is a verifiable multi-agent system with real autonomy, real guardrails, and real intervention logic.**

- The parent-child runtime is implemented in `agent/src/swarm.ts` and `agent/src/child.ts`, not in a single-script demo loop.
- Children are separate OS processes created through `fork()` and run independent polling and reasoning cycles.
- Each voting cycle includes proposal reading, Venice summary, Venice risk scoring, Venice decision, encrypted rationale creation, vote execution, and later rationale reveal.
- The parent performs continuous human-oversight style supervision by scoring alignment every 90 seconds and terminating children that drift.
- The system exposes its state through a dashboard instead of hiding internal behavior behind logs alone.
- Guardrails are structural:
  - `ParentTreasury` stores governance values and pause state.
  - `agent/src/delegation.ts` scopes children to `castVote()` only.
  - `agent/src/lit.ts` prevents rationale leakage before proposal expiry.
  - `contracts/src/ChildGovernor.sol` stores reasoning commitments and reveal state.
  - `agent/src/logger.ts` and `agent_log.json` give judges a machine-readable execution history.

Relevant contracts on Base Sepolia:

- [`SpawnFactory`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1)
- [`ParentTreasury`](https://sepolia.basescan.org/address/0x9428B93993F06d3c5d647141d39e5ba54fb97a7b)
- [`ChildGovernor implementation`](https://sepolia.basescan.org/address/0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6)
- [`TimeLock`](https://sepolia.basescan.org/address/0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23)

---

### Protocol Labs — Infrastructure & Digital Rights

**Spawn Protocol treats agent memory and receipts as portable user-owned infrastructure rather than app-local state.**

- `agent/src/filecoin.ts` stores execution artifacts on Filecoin Calibration using `@filoz/synapse-sdk`.
- `storeSwarmStateSnapshot()` checkpoints the live swarm state every parent cycle.
- `storeAgentLog()` publishes a trimmed but portable execution log to Filecoin.
- `storeTerminationReport()` preserves post-mortems so later generations can inherit memory.
- `storeAgentIdentityMetadata()` gives each agent a portable identity object that can live outside any single UI.
- `filecoinExplorerUrl()` generates verifiable Filscan links for Synapse piece CIDs, which is the correct explorer path for Filecoin piece CIDs on Calibration.
- `agent/src/logger.ts` keeps `agent_log.json` as an auditable local artifact while `agent/src/filecoin.ts` makes the same behavior portable and harder to censor.

This is the part of the system that makes the swarm durable across restarts, devices, and operators instead of being trapped inside one server process.

---

### Protocol Labs — Crypto

**Spawn Protocol is also a crypto coordination system: programmable governance, scoped authority, agent reputation, and treasury controls.**

- `ParentTreasury.sol` is the owner control plane for values, caps, and emergency pause behavior.
- `SpawnFactory.sol` turns those owner intents into live child-agent instances.
- `ChildGovernor.sol` records the vote surface and the reasoning-reveal lifecycle.
- `agent/src/delegation.ts` uses ERC-7715-style scoped delegation so children can vote without receiving unrestricted treasury power.
- `StETHTreasury.sol` models a treasury where principal remains locked and only yield is spendable.
- `ReputationRegistry.sol` and `ValidationRegistry.sol` convert alignment and verification into portable trust signals.
- `agent/src/discovery.ts` maps real governance topics and Polymarket markets into mirrored onchain execution targets, so coordination happens on live contracts and not only in memory.

Relevant Base Sepolia contracts:

- [`MockGovernor: Uniswap`](https://sepolia.basescan.org/address/0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9)
- [`MockGovernor: Lido`](https://sepolia.basescan.org/address/0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC)
- [`MockGovernor: ENS`](https://sepolia.basescan.org/address/0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C)
- [`MockGovernor: Polymarket mirror`](https://sepolia.basescan.org/address/0xe09eb6dca83e7d8e3226752a6c57680a2565b4e6)
- [`StETHTreasury`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c)

Yield-withdrawal evidence already referenced by the system:

- [`withdrawYield()` tx`](https://sepolia.basescan.org/tx/0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91)

---

### Filecoin Foundation — Filecoin

**Filecoin is not an afterthought in this branch. It is the persistence layer for swarm memory, logs, identity metadata, and portable receipts.**

The Filecoin implementation is concentrated in `agent/src/filecoin.ts`:

- `uploadToFilecoin()` uploads JSON payloads through Synapse SDK.
- `downloadFromFilecoin()` reads them back.
- `storeAgentLog()` publishes trimmed execution logs.
- `storeTerminationReport()` stores lineage memory for killed agents.
- `storeSwarmStateSnapshot()` stores recurring swarm checkpoints.
- `storeAgentIdentityMetadata()` stores per-agent identity objects at spawn time.
- `storeVoteRationale()` stores revealed rationale artifacts after the Lit time lock is over.
- `filecoinExplorerUrl()` points piece CIDs to `https://calibration.filscan.io/en/cid/<pieceCid>`.

The runtime integration points are not cosmetic:

- `agent/src/swarm.ts` imports `storeAgentLog`, `storeTerminationReport`, `storeSwarmStateSnapshot`, and `storeAgentIdentityMetadata`.
- `agent/src/logger.ts` calls `storeAgentLog()` so the structured execution log has a Filecoin publication path.
- `dashboard/src/app/page.tsx`, `dashboard/src/components/AgentCard.tsx`, and `dashboard/src/app/agent/[id]/page.tsx` surface Filecoin links in the UI.

Operational details:

- Chain: Filecoin Calibration `314159`
- SDK: `@filoz/synapse-sdk`
- Required local env var: `FILECOIN_PRIVATE_KEY`
- Optional override: `FILECOIN_RPC_URL`
- Piece CIDs are explorer-linked through Filscan, not IPFS gateways and not Filfox deal URLs

#### Known Live CIDs (Filecoin Calibration Testnet)

| Type | Piece CID | Timestamp |
|------|-----------|-----------|
| Agent log snapshot | [`bafkzcibewtrqqdvlybjzqok2q5dgbdiddltdhj5asyhfnavmvowvqpeuckuuraq4ce`](https://calibration.filscan.io/en/cid/bafkzcibewtrqqdvlybjzqok2q5dgbdiddltdhj5asyhfnavmvowvqpeuckuuraq4ce) | 2026-04-01 |
| Agent log snapshot (prev) | [`bafkzcibe6tvqqdummqlqkuzfj6p26agdz4l4ve6ram6vp6uvibdjhz4jux4ustspg4`](https://calibration.filscan.io/en/cid/bafkzcibe6tvqqdummqlqkuzfj6p26agdz4l4ve6ram6vp6uvibdjhz4jux4ustspg4) | 2026-03-31 |
| Judge termination report | [`bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7`](https://calibration.filscan.io/en/cid/bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7) | 2026-03-31T18:57Z |
| Judge termination report | [`bafkzcibdyyeap67ttem7n7sy7kcokvt3rknl5wl2slx2n7c3s4x67vkgys5jbayy`](https://calibration.filscan.io/en/cid/bafkzcibdyyeap67ttem7n7sy7kcokvt3rknl5wl2slx2n7c3s4x67vkgys5jbayy) | 2026-03-31T20:07Z |
| Judge termination report | [`bafkzcibd2ueaplkrcruuyfa4r7tkxpyxwytlpmax72yqgdhrkmzpky4j6nvlvez3`](https://calibration.filscan.io/en/cid/bafkzcibd2ueaplkrcruuyfa4r7tkxpyxwytlpmax72yqgdhrkmzpky4j6nvlvez3) | 2026-03-31T18:51Z |
| Judge termination report | [`bafkzcibdqacqppifmj4vdljgaqow3tkjs5qlpj2yvjnadfsjkxt26iceq34jf6yi`](https://calibration.filscan.io/en/cid/bafkzcibdqacqppifmj4vdljgaqow3tkjs5qlpj2yvjnadfsjkxt26iceq34jf6yi) | 2026-03-31T18:20Z |

All CIDs stored via `@filoz/synapse-sdk` against Filecoin Calibration Testnet (chain 314159). Viewable in the dashboard at `/storage/<cid>`.

This branch fits Filecoin's core interests directly:

- onchain agent registry backed by Filecoin metadata
- agent reputation and portable identity backed by stored history
- autonomous agent state that persists outside the runtime process

---

### Ethereum Foundation — Agent Only: Let The Agent Cook

**Spawn Protocol satisfies the full autonomous loop instead of stopping at "AI suggests, human clicks".**

The system maps cleanly onto the required loop:

1. `discover`
   - `agent/src/discovery.ts` pulls from Tally, Snapshot, Boardroom, and Polymarket.
2. `plan`
   - `agent/src/child.ts` invokes `summarizeProposal()` and `assessProposalRisk()` before voting.
3. `execute`
   - `agent/src/delegation.ts` and `ChildGovernor.castVote()` handle scoped onchain voting.
4. `verify`
   - the child later decrypts and reveals rationale
   - the parent evaluates alignment and writes onchain receipts
5. `self-correct`
   - `agent/src/swarm.ts` revokes, recalls, post-mortems, and respawns drifting children
6. `submit`
   - `agent/src/logger.ts` writes `agent_log.json`
   - the dashboard presents the same behavior in a judge-readable UI

Why this section is strong:

- The autonomous behavior is described explicitly in `agent.json` through `agent_loops`.
- The runtime keeps operating without human intervention after launch.
- Children are independent processes with their own jittered cycles and wallet execution paths.
- Safety checks are part of the loop, not bolted on afterward.

Key files:

- `agent/src/swarm.ts`
- `agent/src/child.ts`
- `agent/src/discovery.ts`
- `agent/src/logger.ts`
- `agent.json`
- `agent_log.json`

---

### Ethereum Foundation — Agents With Receipts — 8004

**Spawn Protocol uses all three ERC-8004 registries, not just identity minting.**

The integration lives in `agent/src/identity.ts` and is used by the runtime in `agent/src/swarm.ts`.

Identity layer:

- registry address: [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
- functions used: `register`, `setMetadata`, `getMetadata`, `setAgentURI`
- runtime helpers: `registerAgent()`, `updateAgentMetadata()`, `trackAgentId()`, `getAgentIdByLabel()`

Reputation layer:

- registry address: [`0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14`](https://sepolia.basescan.org/address/0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14)
- functions used: `giveFeedback`, `revokeFeedback`, `getSummary`
- runtime helpers: `submitReputationFeedback()`, `getReputationSummary()`
- example tx from `agent.json`: [`0x3143c2a969f54592910fc19e76d5856984cff331081fe77af35da7155a6866ef`](https://sepolia.basescan.org/tx/0x3143c2a969f54592910fc19e76d5856984cff331081fe77af35da7155a6866ef)

Validation layer:

- registry address: [`0x3caE87f24e15970a8e19831CeCD5FAe3c087a546`](https://sepolia.basescan.org/address/0x3caE87f24e15970a8e19831CeCD5FAe3c087a546)
- functions used: `validationRequest`, `validationResponse`, `getSummary`
- runtime helpers: `requestValidation()`, `submitValidationResponse()`, `getValidationSummary()`, `hashContent()`
- example request tx from `agent.json`: [`0xdb238bbfd479fcab18fcd6a8a4bb61bd6c5a6b6298506ebd0a9c4b06e3468f2b`](https://sepolia.basescan.org/tx/0xdb238bbfd479fcab18fcd6a8a4bb61bd6c5a6b6298506ebd0a9c4b06e3468f2b)
- example response tx from `agent.json`: [`0x34d50890db40db6b64058a0729628e5e13963b3faf08efe1efd42d217678cd6c`](https://sepolia.basescan.org/tx/0x34d50890db40db6b64058a0729628e5e13963b3faf08efe1efd42d217678cd6c)

This is why the branch is materially stronger for ERC-8004 than a minimal identity-only integration:

- parent and child identities are registered onchain
- alignment metadata is updated continuously
- reputation is written as an explicit trust signal
- validation is recorded as a request-response workflow tied to vote-history content hashes
- the dashboard can read lineage memory from ERC-8004 metadata as a fallback path

## Canonical Judge Flow

This branch now includes a deterministic proof path for judges instead of asking them to infer system behavior from the ambient swarm.

Implementation surfaces:

- `agent/src/judge-flow.ts` defines the control-plane file schema, run states, and ordered proof events
- `agent/src/swarm.ts` runs the judge controller on a short poll interval, seeds the marked proposal, forces the alignment failure, requires the Filecoin termination report, writes ERC-8004 receipts, and waits for respawn + lineage confirmation
- `dashboard/src/app/judge-flow/page.tsx` is the canonical proof page
- `dashboard/src/app/api/judge-flow/route.ts` exposes current proof state
- `dashboard/src/app/api/judge-flow/start/route.ts` queues a fresh proof run

The lifecycle is:

1. queue one isolated run
2. spawn a dedicated proof child
3. seed one judge-marked proposal on the Base Sepolia Uniswap mock governor
4. let the proof child reason privately and cast exactly one onchain vote
5. force the proof child's alignment score to `15`
6. require a Filecoin termination report
7. write ERC-8004 reputation for the failed child
8. terminate the child, respawn a replacement, and wait for `judge_lineage_loaded`

Latest successful live run:

- run id: `judge-1774983203955`
- proof child ERC-8004 id: `3237`
- respawned child ERC-8004 id: `3238`
- proposal id: `4692`
- proposal seed tx: [`0x5559bfafbdb49518ad66848490991bd3a9db8720b1d71849603408be2311f60b`](https://sepolia.basescan.org/tx/0x5559bfafbdb49518ad66848490991bd3a9db8720b1d71849603408be2311f60b)
- vote tx: [`0xb6b5276fdca308f5d26c7dd5aac2ec05546e12f0c204e5f7d18c91c53f7a2587`](https://sepolia.basescan.org/tx/0xb6b5276fdca308f5d26c7dd5aac2ec05546e12f0c204e5f7d18c91c53f7a2587)
- forced alignment tx: [`0x76ca9a167866ae428308073732c2ceb8c05ac36e6178b8d488a4c7c4c282620b`](https://sepolia.basescan.org/tx/0x76ca9a167866ae428308073732c2ceb8c05ac36e6178b8d488a4c7c4c282620b)
- reputation tx: [`0x41ac74a9d0ab533129d773d937c76d0eb8de60b8baf9e0647255405bdf330629`](https://sepolia.basescan.org/tx/0x41ac74a9d0ab533129d773d937c76d0eb8de60b8baf9e0647255405bdf330629)
- termination tx: [`0xfb912c10f20c70f8213223f53f6ca6da4dba532b16b3af7eecfcb5367b61b1f8`](https://sepolia.basescan.org/tx/0xfb912c10f20c70f8213223f53f6ca6da4dba532b16b3af7eecfcb5367b61b1f8)
- respawn tx: [`0x1bbc56ab64366d7dbd4f821ad99e1f974f4fec14c03f1e5d5ff0279980b9e5a9`](https://sepolia.basescan.org/tx/0x1bbc56ab64366d7dbd4f821ad99e1f974f4fec14c03f1e5d5ff0279980b9e5a9)
- Filecoin piece CID: [`bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7`](https://calibration.filscan.io/en/cid/bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7)

Operational notes:

- `JUDGE_FLOW_TIMEOUT_MS` still defaults to `90000`, but the latest full live run took about `237.4s` because Base Sepolia and Synapse/Filecoin latency dominate the end-to-end path.
- the judge run requires Filecoin primary success and fails visibly if the Filecoin write does not complete
- ERC-8004 validation remains integrated in the runtime, but `judge_validation_written` is currently best-effort in judge mode and does not block a successful proof run when the validation path is unavailable
- the resulting run id can be searched in the execution log UI and replayed from the `/judge-flow` page

## Deployed Contracts

### Base Sepolia `84532`

| Contract | Address |
| --- | --- |
| SpawnFactory | [`0xfEb8D54149b1a303Ab88135834220b85091D93A1`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1) |
| ParentTreasury | [`0x9428B93993F06d3c5d647141d39e5ba54fb97a7b`](https://sepolia.basescan.org/address/0x9428B93993F06d3c5d647141d39e5ba54fb97a7b) |
| ChildGovernor implementation | [`0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6`](https://sepolia.basescan.org/address/0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6) |
| MockGovernor: Uniswap | [`0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9`](https://sepolia.basescan.org/address/0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9) |
| MockGovernor: Lido | [`0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC`](https://sepolia.basescan.org/address/0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC) |
| MockGovernor: ENS | [`0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C`](https://sepolia.basescan.org/address/0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C) |
| MockGovernor: Polymarket mirror | [`0xe09eb6dca83e7d8e3226752a6c57680a2565b4e6`](https://sepolia.basescan.org/address/0xe09eb6dca83e7d8e3226752a6c57680a2565b4e6) |
| SpawnENSRegistry | [`0x29170A43352D65329c462e6cDacc1c002419331D`](https://sepolia.basescan.org/address/0x29170A43352D65329c462e6cDacc1c002419331D) |
| StETHTreasury | [`0x7434531B76aa98bDC5d4b03306dE29fadc88A06c`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c) |
| TimeLock | [`0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23`](https://sepolia.basescan.org/address/0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23) |
| ERC-8004 Identity Registry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ERC-8004 Reputation Registry | [`0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14`](https://sepolia.basescan.org/address/0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14) |
| ERC-8004 Validation Registry | [`0x3caE87f24e15970a8e19831CeCD5FAe3c087a546`](https://sepolia.basescan.org/address/0x3caE87f24e15970a8e19831CeCD5FAe3c087a546) |

## Verification Snapshot

As of March 31, 2026, the checked-in `agent_log.json` reports:

- `19,089` total onchain transactions
- `3,810` votes cast
- `5,552` alignment evaluations
- `508` children spawned
- `547` children terminated
- `67` children respawned
- `11,216` Venice reasoning calls
- `1` yield withdrawal
- `22` ENS subdomains registered
- `9` verified contracts

Local verification completed on this branch:

- `cd contracts && forge test` -> `97/97` tests passing
- `cd dashboard && npm run build` -> production build passes

## Running Locally

### Prerequisites

- Node.js `20+`
- npm
- Foundry
- a funded Base Sepolia wallet for agent execution
- optional: a funded Filecoin Calibration wallet if you want Filecoin storage enabled locally

### Environment Variables

Create a root `.env` file.

```bash
PRIVATE_KEY=0x...
VENICE_API_KEY=...

BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

FILECOIN_PRIVATE_KEY=0x...
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1
JUDGE_FLOW_ENABLED=true
JUDGE_FLOW_CONTROL_PATH=./judge_flow_state.json
JUDGE_FLOW_TIMEOUT_MS=90000

TALLY_API_KEY=
BOARDROOM_API_KEY=

FILEBASE_KEY=
FILEBASE_SECRET=
FILEBASE_BUCKET=

SPAWN_ENS_REGISTRY_ADDRESS=0x29170A43352D65329c462e6cDacc1c002419331D
ERC8004_REGISTRY_ADDRESS=0x8004A818BFB912233c491871b3d84c89A494BD9e
REPUTATION_REGISTRY_ADDRESS=0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14
VALIDATION_REGISTRY_ADDRESS=0x3caE87f24e15970a8e19831CeCD5FAe3c087a546
```

Notes:

- `PRIVATE_KEY` and `VENICE_API_KEY` are required.
- Without `FILECOIN_PRIVATE_KEY`, the runtime still works but Filecoin uploads are disabled.
- `JUDGE_FLOW_ENABLED=false` disables the judge controller entirely.
- `JUDGE_FLOW_CONTROL_PATH` defaults to `./judge_flow_state.json` at the repo root.
- Filebase keys are only used as an IPFS fallback path.
- Tally and Boardroom keys improve discovery coverage but are optional.

### Start Everything

```bash
./run.sh
```

This starts:

- the Next.js dashboard on `http://localhost:3000`
- the autonomous swarm runtime in `agent/src/swarm.ts`

### Start Services Manually

```bash
cd agent
npm install
npm run swarm
```

```bash
cd dashboard
npm install
npm run dev
```

### Run Contract Tests

```bash
cd contracts
forge test
```

### Build The Dashboard

```bash
cd dashboard
npm run build
```

## Repository Layout

```text
.
├── contracts/      Solidity contracts and Foundry tests
├── agent/          Autonomous runtime, discovery, logging, Filecoin, Venice, Lit, ERC-8004
├── dashboard/      Next.js dashboard and API routes
├── agent.json      DevSpot / ERC-8004 agent manifest
├── agent_log.json  Structured execution log and metrics snapshot
└── run.sh          One-command local launcher
```

## Honest Scope Notes

- The swarm currently votes on mirrored proposals inside local `MockGovernor` contracts rather than directly calling upstream DAO governance contracts.
- The Base Sepolia runtime is the primary live path for this branch.
- ENS is still used in the backend for labels and text-record receipts even though the PL Genesis dashboard now minimizes ENS-centric presentation.
- The canonical judge flow now runs end-to-end on live infra, but the latest successful run took about `237s`, not `90s`.
- ERC-8004 validation is best-effort in the judge path today and is not yet a hard requirement for a successful proof lifecycle.

## Why This Matters

Spawn Protocol is a concrete testbed for a future where autonomous agents have:

- portable identity
- verifiable execution history
- private reasoning
- scoped authority
- portable memory
- decentralized storage
- kill-and-respawn safety loops

That combination is what makes this branch a serious PL Genesis submission instead of a thin demo around one API call.
