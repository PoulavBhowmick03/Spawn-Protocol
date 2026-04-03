# Spawn Protocol

An autonomous governance agent swarm. A human owner states their values once. A parent agent runs continuously, spawns child agents as EIP-1167 proxy contracts, assigns each child a DAO to govern, lets them reason privately through Venice, encrypts vote rationale with Lit Protocol until voting closes, executes votes onchain through scoped ERC-7715 delegations, scores alignment every 90 seconds, and terminates and respawns drifting children with portable Filecoin-backed memory.

**Track:** PL Genesis — AI & Robotics · Infrastructure & Digital Rights · Crypto · ERC-8004 · Filecoin

**Live on:** Base Sepolia + Filecoin Calibration

**License:** MIT

---

## The Problem

DAO governance participation has two failure modes. Token holders lack the time to read every proposal across every protocol. Delegates get delegated to, drift, go inactive, or become impossible to audit. Autonomous agents can claim to be aligned and safe, but without portable identity, persistent onchain receipts, and verifiable storage, that claim is unenforceable and unauditable.

Spawn Protocol addresses both problems at once: agents that actually govern, and infrastructure that makes their behavior auditable, portable, and correctable.

---

## What It Does

```
Owner stores governance values → ParentTreasury.sol
             │
        Parent Agent  (agent/src/swarm.ts)
        ├── discovers proposals from Tally / Snapshot / Boardroom / Polymarket
        ├── spawns child agents via SpawnFactory (EIP-1167 proxies)
        ├── registers ENS labels + ERC-8004 identity per child
        ├── issues ERC-7715 scoped delegations (castVote only)
        ├── evaluates alignment every 90s against owner values
        ├── terminates drifting children + generates Venice post-mortems
        ├── respawns replacements with lineage memory from prior generations
        └── checkpoints all state + termination reports to Filecoin
             │
    ┌────────┼────────┬────────┐
 Uniswap   Lido    ENS  Polymarket mirror
             │
   Each child is a separate OS process with its own wallet:
   ├── summarize proposal (Venice)
   ├── score risk (Venice)
   ├── decide FOR / AGAINST / ABSTAIN (Venice + owner values + lineage)
   ├── encrypt rationale with Lit (time-locked to proposal end)
   ├── castVote() onchain through delegated authority
   └── revealRationale() onchain after voting closes
```

Every vote is a real onchain transaction. Every termination produces a Filecoin-backed report. Every respawned child inherits its predecessor's lessons as Venice system prompt context.

---

## Sponsor SDKs Used

These are the sponsor-facing integrations used directly in the submitted build.

| Sponsor | SDK / Package | Where Used | Purpose |
|---|---|---|---|
| Protocol Labs / Filecoin | `@filoz/synapse-sdk` | `agent/src/filecoin.ts`, `dashboard/src/lib/storage-server.ts` | Stores agent logs, termination reports, swarm snapshots, identity metadata, and serves Filecoin-backed storage previews. |
| Lit Protocol | `@lit-protocol/auth-helpers`, `@lit-protocol/constants`, `@lit-protocol/lit-node-client-nodejs` | `agent/src/lit.ts`, `agent/src/child.ts` | Encrypts vote rationales with time-locked access control and enables the post-vote reveal flow. |

The rest of the stack, including Next.js, viem, and Foundry, supports the application but is not counted here as sponsor bounty SDK integration.

---

## Architecture

### Contracts (Base Sepolia, Foundry)

| Contract | Purpose |
|---|---|
| `SpawnFactory.sol` | Spawns and recalls children as EIP-1167 minimal proxies |
| `ChildGovernor.sol` | Per-child voting with encrypted rationale history and reveal lifecycle |
| `ParentTreasury.sol` | Owner values, spending caps, emergency pause, factory funding rules |
| `MockGovernor.sol` | Onchain target governors mirroring real DAO proposal topics |
| `ReputationRegistry.sol` | ERC-8004 trust signal per agent, written at every termination |
| `ValidationRegistry.sol` | ERC-8004 validation request + response workflow |
| `TimeLock.sol` | Timestamp gate for Lit Protocol access conditions |
| `StETHTreasury.sol` | Lido-style treasury where only stETH yield is spendable |
| `SpawnENSRegistry.sol` | Agent ENS labels, reverse resolution, and text-record metadata |

### Agent Runtime (TypeScript + viem)

| Module | Role |
|---|---|
| `agent/src/swarm.ts` | Parent loop: spawns, funds, delegates, evaluates, kills, respawns, stores |
| `agent/src/child.ts` | Child loop: reads proposals, calls Venice 3×, encrypts, votes, reveals |
| `agent/src/judge-flow.ts` | Deterministic proof controller for judge verification |
| `agent/src/venice.ts` | Venice client with E2EE models and six distinct reasoning calls |
| `agent/src/lit.ts` | Time-locked encryption via `TimeLock.isAfterTimestamp()` access conditions |
| `agent/src/delegation.ts` | ERC-7715 scoped delegations with AllowedTargets + AllowedMethods + LimitedCalls |
| `agent/src/identity.ts` | ERC-8004 identity registration, metadata updates, reputation, validation |
| `agent/src/filecoin.ts` | Filecoin Calibration storage for logs, snapshots, termination memory, rationale |
| `agent/src/discovery.ts` | Proposal feed from Tally, Snapshot, Boardroom, Polymarket |

### Dashboard (Next.js 14 + Tailwind)

- **Swarm**: active and terminated agents, alignment scores, Filecoin badges, ERC-8004 badges, wallets
- **Graph**: parent-child topology
- **Judge Flow**: canonical proof-run trigger, full timeline, tx hashes, Filecoin CID, lineage confirmation
- **Proposals**: mirrored governance proposals + Polymarket markets
- **Leaderboard**: child ranking by alignment × votes × diversity
- **Timeline**: chronological event stream
- **Exec Log**: structured execution log and aggregate metrics
- **Storage**: inline preview for any Filecoin piece CID

---

## Why Venice Is Load-Bearing

If vote reasoning is visible to a centralized provider before a vote is cast, the privacy and independence guarantees collapse. Venice is not a drop-in LLM call here — it is the private inference layer that makes the rest of the stack coherent.

The full pipeline per vote:

1. Venice privately summarizes the proposal
2. Venice scores proposal risk
3. Venice decides the vote and produces reasoning
4. Child commits the reasoning hash before execution
5. Lit encrypts rationale until the voting period ends
6. Vote is cast onchain
7. Rationale is revealed afterward — preserving both auditability and pre-vote privacy

Venice models used: `e2ee-qwen3-30b-a3b-p` (primary), `e2ee-gemma-3-27b-p` (fallback). Zero data retention.

---

## PL Genesis Track Alignment

### Protocol Labs — AI & Robotics

The parent-child runtime is not a demo loop. Children are separate OS processes created via `fork()` running independent 30-second polling cycles. The parent performs continuous human-oversight-style supervision: scoring alignment every 90 seconds, terminating children that drift, writing ERC-8004 reputation receipts, generating Venice post-mortems, and respawning with inherited lineage memory.

Safety guardrails are structural:
- `ParentTreasury` stores values and pause state onchain
- `agent/src/delegation.ts` scopes children to `castVote()` only
- `agent/src/lit.ts` prevents rationale leakage before proposal expiry
- `ChildGovernor.sol` stores reasoning commitments and reveal state
- `agent_log.json` and Filecoin snapshots give an independently verifiable execution history

Key contracts: [`SpawnFactory`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1) · [`ParentTreasury`](https://sepolia.basescan.org/address/0x9428B93993F06d3c5d647141d39e5ba54fb97a7b) · [`ChildGovernor impl`](https://sepolia.basescan.org/address/0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6) · [`TimeLock`](https://sepolia.basescan.org/address/0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23)

---

### Protocol Labs — Infrastructure & Digital Rights

Agent memory and receipts are portable user-owned infrastructure, not app-local state. `agent/src/filecoin.ts` stores everything through `@filoz/synapse-sdk` to Filecoin Calibration:

- `storeAgentLog()` — portable execution log
- `storeTerminationReport()` — post-mortems for lineage inheritance
- `storeSwarmStateSnapshot()` — recurring swarm checkpoints
- `storeAgentIdentityMetadata()` — per-agent identity objects at spawn time
- `storeVoteRationale()` — revealed rationale archives

The swarm is durable across restarts, devices, and operators. A new operator can recover the full lineage from Filecoin rather than starting from zero.

---

### Protocol Labs — Crypto

Spawn Protocol is a coordination system: programmable governance, scoped authority, agent reputation, and treasury controls.

- `SpawnFactory.sol` turns owner intents into live child-agent instances
- `ChildGovernor.sol` records the vote surface and reasoning-reveal lifecycle
- `agent/src/delegation.ts` uses ERC-7715-style scoped delegation — children cannot drain the treasury
- `StETHTreasury.sol` locks principal; only yield is spendable
- `ReputationRegistry.sol` and `ValidationRegistry.sol` convert alignment into portable trust signals
- `agent/src/discovery.ts` maps real governance topics and Polymarket markets into mirrored onchain execution targets

Contracts: [`MockGovernor: Uniswap`](https://sepolia.basescan.org/address/0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9) · [`MockGovernor: Lido`](https://sepolia.basescan.org/address/0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC) · [`MockGovernor: ENS`](https://sepolia.basescan.org/address/0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C) · [`StETHTreasury`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c)

Yield withdrawal: [`0xcc01d7...`](https://sepolia.basescan.org/tx/0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91)

---

### Filecoin Foundation

Filecoin is the persistence layer for swarm memory, logs, identity metadata, and portable receipts. The runtime integration is not cosmetic:

- `agent/src/swarm.ts` imports four storage functions and calls them in-loop
- `agent/src/logger.ts` calls `storeAgentLog()` so every execution log has a Filecoin publication path
- The dashboard surfaces Filecoin links throughout the agent detail, judge flow, and storage preview pages

**Live CIDs (Filecoin Calibration, chain 314159)**

| Type | Piece CID | Timestamp |
|---|---|---|
| Agent log snapshot | [`bafkzcibewtrq...`](https://calibration.filscan.io/en/cid/bafkzcibewtrqqdvlybjzqok2q5dgbdiddltdhj5asyhfnavmvowvqpeuckuuraq4ce) | 2026-04-01 |
| Agent log snapshot (prev) | [`bafkzcibe6tvq...`](https://calibration.filscan.io/en/cid/bafkzcibe6tvqqdummqlqkuzfj6p26agdz4l4ve6ram6vp6uvibdjhz4jux4ustspg4) | 2026-03-31 |
| Swarm state snapshot | [`bafkzcibd6ala...`](https://calibration.filscan.io/en/cid/bafkzcibd6alarh63xutmenadqshebqac5b3wa2wnrbekwxw3z3nvrxbr7rwuy4ys) | 2026-03-31 |
| Judge termination report | [`bafkzcibdwmea...`](https://calibration.filscan.io/en/cid/bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7) | 2026-03-31T18:57Z |
| Judge termination report | [`bafkzcibdyyea...`](https://calibration.filscan.io/en/cid/bafkzcibdyyeap67ttem7n7sy7kcokvt3rknl5wl2slx2n7c3s4x67vkgys5jbayy) | 2026-03-31T20:07Z |
| Judge termination report | [`bafkzcibd2uea...`](https://calibration.filscan.io/en/cid/bafkzcibd2ueaplkrcruuyfa4r7tkxpyxwytlpmax72yqgdhrkmzpky4j6nvlvez3) | 2026-03-31T18:51Z |
| Judge termination report | [`bafkzcibdqacq...`](https://calibration.filscan.io/en/cid/bafkzcibdqacqppifmj4vdljgaqow3tkjs5qlpj2yvjnadfsjkxt26iceq34jf6yi) | 2026-03-31T18:20Z |

---

### Ethereum Foundation — Agent Only: Let The Agent Cook

The full autonomous loop, not just "AI suggests, human clicks":

| Step | Implementation |
|---|---|
| Discover | `agent/src/discovery.ts` — Tally, Snapshot, Boardroom, Polymarket |
| Plan | `agent/src/child.ts` — Venice summary + Venice risk score before every vote |
| Execute | `agent/src/delegation.ts` + `ChildGovernor.castVote()` |
| Verify | child decrypts and reveals rationale; parent evaluates alignment and writes onchain receipts |
| Self-correct | `agent/src/swarm.ts` — revoke delegation, recall, post-mortem, respawn |
| Submit | `agent/src/logger.ts` + `agent_log.json` + dashboard |

Key files: `agent/src/swarm.ts` · `agent/src/child.ts` · `agent/src/discovery.ts` · `agent.json` · `agent_log.json`

---

### Ethereum Foundation — Agents With Receipts — ERC-8004

All three ERC-8004 registries are used, not just identity minting. Integration lives in `agent/src/identity.ts` and is called from `agent/src/swarm.ts` in every cycle.

**Identity registry** [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)
Functions: `register`, `setMetadata`, `getMetadata`, `setAgentURI`

**Reputation registry** [`0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14`](https://sepolia.basescan.org/address/0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14)
Functions: `giveFeedback`, `revokeFeedback`, `getSummary`
Example tx: [`0x3143c2...`](https://sepolia.basescan.org/tx/0x3143c2a969f54592910fc19e76d5856984cff331081fe77af35da7155a6866ef)

**Validation registry** [`0x3caE87f24e15970a8e19831CeCD5FAe3c087a546`](https://sepolia.basescan.org/address/0x3caE87f24e15970a8e19831CeCD5FAe3c087a546)
Functions: `validationRequest`, `validationResponse`, `getSummary`
Example request: [`0xdb238b...`](https://sepolia.basescan.org/tx/0xdb238bbfd479fcab18fcd6a8a4bb61bd6c5a6b6298506ebd0a9c4b06e3468f2b) · response: [`0x34d508...`](https://sepolia.basescan.org/tx/0x34d50890db40db6b64058a0729628e5e13963b3faf08efe1efd42d217678cd6c)

What gets written: identity at spawn, alignment metadata continuously, reputation on termination, validation tied to vote-history content hashes. The dashboard reads lineage memory from ERC-8004 metadata as a fallback path when Filecoin is unavailable.

---

## Canonical Judge Flow

A deterministic proof path so judges can observe the full lifecycle directly rather than inferring it from ambient swarm activity.

The path:
1. Queue one isolated proof run from the `/judge-flow` dashboard page
2. Spawn a dedicated proof child with a `judge-proof-<runId>` label
3. Seed one judge-marked proposal on the Base Sepolia Uniswap mock governor
4. Let the proof child reason privately and cast exactly one onchain vote
5. Force proof child alignment score to `15`
6. Require a Filecoin termination report (hard requirement — run fails visibly without it)
7. Write ERC-8004 reputation for the failed child
8. Terminate, respawn a replacement, wait for `judge_lineage_loaded` confirmation

**Latest successful run**

| Step | Evidence |
|---|---|
| Run ID | `judge-1774983203955` |
| Proof child ERC-8004 id | `3237` |
| Respawned child ERC-8004 id | `3238` |
| Proposal ID | `4692` |
| Proposal seed tx | [`0x5559bf...`](https://sepolia.basescan.org/tx/0x5559bfafbdb49518ad66848490991bd3a9db8720b1d71849603408be2311f60b) |
| Vote tx | [`0xb6b527...`](https://sepolia.basescan.org/tx/0xb6b5276fdca308f5d26c7dd5aac2ec05546e12f0c204e5f7d18c91c53f7a2587) |
| Forced alignment tx | [`0x76ca9a...`](https://sepolia.basescan.org/tx/0x76ca9a167866ae428308073732c2ceb8c05ac36e6178b8d488a4c7c4c282620b) |
| Reputation tx | [`0x41ac74...`](https://sepolia.basescan.org/tx/0x41ac74a9d0ab533129d773d937c76d0eb8de60b8baf9e0647255405bdf330629) |
| Termination tx | [`0xfb912c...`](https://sepolia.basescan.org/tx/0xfb912c10f20c70f8213223f53f6ca6da4dba532b16b3af7eecfcb5367b61b1f8) |
| Respawn tx | [`0x1bbc56...`](https://sepolia.basescan.org/tx/0x1bbc56ab64366d7dbd4f821ad99e1f974f4fec14c03f1e5d5ff0279980b9e5a9) |
| Filecoin piece CID | [`bafkzcibdwmea...`](https://calibration.filscan.io/en/cid/bafkzcibdwmeaoosgc5atz3ea6zg4sgajkk64gnm6do3ocvy7w6iu2aq65gji74q7) |

The full end-to-end path on live infra takes approximately 237s (Base Sepolia + Filecoin Calibration latency dominate). The timeout env var defaults to 90s but should be set higher for a live demonstration.

---

## Deployed Contracts

### Base Sepolia (`84532`)

| Contract | Address |
|---|---|
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

---

## Verification Snapshot

As of March 31, 2026, `agent_log.json` reports:

- `19,089` total onchain transactions
- `3,810` votes cast
- `5,552` alignment evaluations
- `508` children spawned · `547` terminated · `67` respawned
- `11,216` Venice reasoning calls
- `22` ENS subdomains registered
- `1` stETH yield withdrawal
- `9` verified contracts

Test suite: `cd contracts && forge test` → **97/97 passing**
Dashboard build: `cd dashboard && npm run build` → production build clean

---

## Running Locally

### Prerequisites

- Node.js 20+, npm, Foundry
- Funded Base Sepolia wallet
- Venice API key
- (optional) Funded Filecoin Calibration wallet

### Environment Variables

Create a `.env` at repo root:

```bash
PRIVATE_KEY=0x...
VENICE_API_KEY=...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Filecoin (optional — disables storage if omitted)
FILECOIN_PRIVATE_KEY=0x...
FILECOIN_RPC_URL=https://api.calibration.node.glif.io/rpc/v1

# Judge flow
JUDGE_FLOW_ENABLED=true
JUDGE_FLOW_CONTROL_PATH=./judge_flow_state.json
JUDGE_FLOW_TIMEOUT_MS=300000

# Runtime budget thresholds
RUNTIME_BUDGET_WARNING_ETH=0.03
RUNTIME_BUDGET_PAUSE_ETH=0.015
COMPUTE_BUDGET_WARNING_TOKENS=200000
COMPUTE_BUDGET_PAUSE_TOKENS=350000

# Contract addresses (Base Sepolia)
SPAWN_ENS_REGISTRY_ADDRESS=0x29170A43352D65329c462e6cDacc1c002419331D
ERC8004_REGISTRY_ADDRESS=0x8004A818BFB912233c491871b3d84c89A494BD9e
REPUTATION_REGISTRY_ADDRESS=0x3d54B01D6cdbeba55eF8Df0F186b82d98Ec5fE14
VALIDATION_REGISTRY_ADDRESS=0x3caE87f24e15970a8e19831CeCD5FAe3c087a546

# Discovery (optional — improves coverage)
TALLY_API_KEY=
BOARDROOM_API_KEY=
```

### Start Everything

```bash
./run.sh
```

Starts the Next.js dashboard on `http://localhost:3000` and the agent swarm runtime.

### Manual Start

```bash
# Agent
cd agent && npm install && npm run swarm

# Dashboard
cd dashboard && npm install && npm run dev

# Contract tests
cd contracts && forge test
```

---

## Repository Layout

```
.
├── contracts/      Solidity contracts (Foundry, 97 tests)
├── agent/          Autonomous runtime, Venice, Lit, ERC-8004, Filecoin, delegation, ENS
├── dashboard/      Next.js dashboard + API routes
├── agent.json      ERC-8004 agent manifest
├── agent_log.json  Structured execution log and metrics snapshot
└── run.sh          One-command launcher
```

---

## Scope Notes

- Children vote on mirrored proposals inside `MockGovernor` contracts rather than directly calling upstream DAO governance contracts. The interface shape mirrors OpenZeppelin's IGovernor for production compatibility.
- ENS is used in the backend for labels and text-record receipts.
- The canonical judge flow runs end-to-end on live infra. End-to-end latency is approximately 237s due to Base Sepolia and Filecoin Calibration roundtrips — set `JUDGE_FLOW_TIMEOUT_MS` accordingly.
- ERC-8004 validation is best-effort in the judge path and does not block a successful proof run.

---

## Team

### Poulav Bhowmick

- GitHub: https://github.com/PoulavBhowmick03
- LinkedIn: https://www.linkedin.com/in/poulavb/
- X: https://x.com/impoulav

### Ishita

- GitHub: https://github.com/ishitab02
- LinkedIn: https://www.linkedin.com/in/ishitab02/
- X: https://x.com/ishitaaaaw

---

## License

This project is released under the MIT License. See [`LICENSE`](./LICENSE).
