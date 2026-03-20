# Spawn Protocol

**Autonomous DAO Governance Agent Swarm** — 9 AI agents voting on real governance proposals across 3 DAOs, 2 chains. They disagree. They get killed. They respawn. Zero human intervention.

**[Live Dashboard](https://spawn-protocol.vercel.app/)** · **[4,500+ txs on BaseScan](https://sepolia.basescan.org/address/0x15896e731c51ecB7BdB1447600DF126ea1d6969A)** · **[GitHub](https://github.com/PoulavBhowmick03/Spawn-Protocol)**

---

## What It Does

A token holder sets their governance values once. A parent agent spawns 9 child agents — 3 DAOs × 3 perspectives (DeFi, public goods, conservative). Each child has its own wallet, ENS identity, and ERC-8004 registration. Children read real proposals from Tally and Snapshot, reason privately through Venice AI (E2EE, zero data retention), and cast votes onchain. The parent evaluates alignment every 90 seconds. Drifting agents get terminated, replaced, and the swarm heals itself.

```
Owner types: "favor decentralization, support public goods, oppose inflation"
                              ↓
                    Parent Agent (persistent)
                    ├── Discovers proposals (Tally + Snapshot)
                    ├── Spawns children as EIP-1167 clones
                    ├── Evaluates alignment every 90s via Venice
                    └── Kills drifters, respawns replacements
                              ↓
    ┌──────────────┬──────────────┬──────────────┐
    │ uniswap-dao  │   lido-dao   │   ens-dao    │
    │  defi (FOR)  │  defi (FOR)  │  defi (FOR)  │
    │  pubgoods    │  pubgoods    │  pubgoods    │
    │  conserv (⊗) │  conserv (⊗) │  conserv (⊗) │
    └──────────────┴──────────────┴──────────────┘
    Each child = separate OS process, own wallet, own Venice reasoning
```

## Why It Matters

DAO governance has <10% voter turnout. Delegates burn out. There's no automated way to enforce value alignment or replace underperformers. Spawn Protocol is automated delegate lifecycle management — spawn, evaluate, kill, respawn — with private reasoning and onchain receipts for every decision.

## Live Evidence

| Metric | Value |
|--------|-------|
| Deployer transactions | [4,500+](https://sepolia.basescan.org/address/0x15896e731c51ecB7BdB1447600DF126ea1d6969A) |
| Active agents | 9 (3 DAOs × 3 perspectives) |
| Children spawned | 76+ |
| Children terminated | 67+ |
| Chains | Base Sepolia + Celo Sepolia |
| Proposal sources | Tally (9 DAOs) + Snapshot (12 spaces) |
| Venice reasoning calls | 500+ |
| Foundry tests | 62/62 passing |

---

## Bounty Tracks

### Venice — Private Agents ($11,500) · `ea3b366947c54689bd82ae80bf9f3310`

Venice is the ONLY inference backend. Zero other LLM imports in `agent/src/`. Remove Venice and the swarm is braindead.

- **6 distinct call types:** `summarizeProposal` → `assessProposalRisk` → `reasonAboutProposal` (per vote) + `evaluateAlignment` → `generateSwarmReport` → `generateTerminationReport` (per cycle)
- **E2EE on every call:** Venice confirms `enable_e2ee: true` in every response. Model: `llama-3.3-70b`
- **Multi-agent disagreement:** 3 perspectives × 3 DAOs = 9 agents independently reasoning through Venice, producing different votes on the same proposal
- **Privacy pipeline:** Venice private reasoning → keccak256 hash committed → vote cast → rationale revealed after voting closes
- **Retry with backoff:** 30s timeout, exponential retry on 429/5xx, fallback model (`llama-3.1-8b`)
- Code: [`agent/src/venice.ts`](agent/src/venice.ts) — single `OpenAI` client, `baseURL: "https://api.venice.ai/api/v1"`

### Protocol Labs — Let the Agent Cook ($4,000) · `10bd47fac07e4f85bda33ba482695b24`

Full autonomous lifecycle: discover → reason → vote → evaluate → terminate → respawn → scale. Zero human steps.

- Children run as **separate OS processes** via `fork()` — genuinely independent reasoning loops
- Parent evaluates alignment every 90s, kills children scoring below threshold
- **Dynamic scaling:** auto-spawn for uncovered governors, auto-recall idle children, budget-aware
- `uniswap-dao-defi-v9` — one agent killed and respawned 9 times for alignment drift
- `agent.json` + `agent_log.json` in repo root

### Protocol Labs — Agents With Receipts ($4,000) · `3bf41be958da497bbb69f1a150c76af9`

ERC-8004 onchain identity for every agent. Parent updates metadata after every alignment cycle.

- Registry: [`0x8004A818...`](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — IDs #2220–#2223+
- Metadata: agentType, assignedDAO, alignmentScore, ensName, capabilities
- Every vote, alignment eval, spawn, and kill logged to `agent_log.json`

### MetaMask Delegations ($5,000) · `0d69d56a8a084ac5b7dbe0dc1da73e1d`

ERC-7715 scoped delegations — children can ONLY call `castVote()` on their assigned governor.

- Three caveats: `AllowedTargetsEnforcer` + `AllowedMethodsEnforcer` + `LimitedCallsEnforcer`
- Children cannot transfer funds, change settings, or call any other function
- Code: [`agent/src/delegation.ts`](agent/src/delegation.ts)

### ENS Identity ($600) · `627a3f5a288344489fe777212b03f953`

Every agent gets `{name}.spawn.eth` — registered at spawn, deregistered at termination.

- [`SpawnENSRegistry.sol`](contracts/src/SpawnENSRegistry.sol) at [`0x29170...`](https://sepolia.basescan.org/address/0x29170A43352D65329c462e6cDacc1c002419331D)
- 10 subdomains registered onchain, text records for agent metadata
- Forward + reverse resolution used in every evaluation cycle

### ENS Communication ($600) · `9c4599cf9d0f4002b861ff1a4b27f10a`

Parent resolves children by ENS name before every evaluation. All logs use ENS names.

### ENS Open ($300) · `8840da28fb3b46bcb08465e1d0e8756d`

Full ENS lifecycle: spawn = register, terminate = deregister, respawn = re-register with `-v2` suffix.

### Lido stETH Treasury ($3,000) · `5e445a077b5248e0974904915f76e1a0`

Principal locked forever. Agent spends only yield. Self-funding governance.

- [`StETHTreasury.sol`](contracts/src/StETHTreasury.sol) at [`0x7434...`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c)
- Yield withdrawal tx: [`0xcc01d7...`](https://sepolia.basescan.org/tx/0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91)
- `maxYieldPerWithdrawal` + `emergencyPause` — owner controls the brakes

### Best Agent on Celo ($5,000) · `ff26ab4933c84eea856a5c6bf513370b`

Full contract suite on Celo Sepolia. Same swarm, two chains.

- SpawnFactory: [`0xC06E...`](https://explorer.celo.org/alfajores/address/0xC06E6615E2bBBf795ae17763719dCB9b82cd781C) + 6 more contracts
- Dashboard chain toggle: Base ↔ Celo

### Synthesis Open Track ($28,309) · `fdb76d08812b43f6a5f454744b66f590`

Autonomous, self-correcting governance swarm. 4,500+ onchain txs. 9 agents. 2 chains. Zero human intervention.

### Student Founder's Bet ($2,500) · `f467eea3352b4a289814a522377fcef6`

Solo college student. 3-day build. 76 agents spawned, 67 terminated, 62 tests, 4,500+ transactions.

### Status Network ($50) · `877cd61516a14ad9a199bf48defec1c1`

Gasless deployment: [MockGovernor](https://sepoliascan.status.network/address/0x8aF194474ebB0425b863036177FEA2AF37e1E41C) + [proposal](https://sepoliascan.status.network/tx/0x3fda81e76e76f20c452a5e24f5fa4e4d9c36a46b8628b5f39ef3a3ca02703ef5) + [vote](https://sepoliascan.status.network/tx/0xe35129f470ed265e8611d49f4011f7940a79506dc0fb17e3a63d21a1ac283d2d) — all gasPrice=0.

---

## Contracts

| Contract | Base Sepolia | Celo Sepolia |
|----------|-------------|-------------|
| SpawnFactory | [`0xfEb8...93A1`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1) | [`0xC06E...781C`](https://explorer.celo.org/alfajores/address/0xC06E6615E2bBBf795ae17763719dCB9b82cd781C) |
| MockGovernor (×3) | Uniswap / Lido / ENS | Uniswap / Lido / ENS |
| ParentTreasury | [`0x9428...7a7b`](https://sepolia.basescan.org/address/0x9428B93993F06d3c5d647141d39e5ba54fb97a7b) | [`0x5Bb4...C444`](https://explorer.celo.org/alfajores/address/0x5Bb4b18CDFF5Dbac874235d7067B414F0709C444) |
| ChildGovernor (impl) | [`0x9Cc0...Fcf6`](https://sepolia.basescan.org/address/0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6) | [`0xff39...6ce6`](https://explorer.celo.org/alfajores/address/0xff392223115Aef74e67b7aabF62659B86f486ce6) |
| SpawnENSRegistry | [`0x2917...331D`](https://sepolia.basescan.org/address/0x29170A43352D65329c462e6cDacc1c002419331D) | — |
| StETHTreasury | [`0x7434...06c`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c) | — |

## Dashboard

**[spawn-protocol.vercel.app](https://spawn-protocol.vercel.app/)**

- **Swarm** — 9 active agents with ENS names, alignment scores, vote counts
- **Proposals** — real governance proposals with difficulty scoring (Easy/Medium/Hard)
- **Leaderboard** — composite performance ranking (alignment + votes + diversity)
- **Graph** — parent-child topology with alignment-colored connections
- **Timeline** — chronological feed of all onchain events
- **Exec Log** — every vote, spawn, kill, and reveal with tx hashes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Contracts | Solidity, Foundry, OpenZeppelin Clones |
| Agent | TypeScript, viem, Node.js `child_process` |
| Reasoning | Venice AI (llama-3.3-70b, E2EE, zero retention) |
| Encryption | Lit Protocol (time-locked rationale) |
| Delegations | MetaMask Delegation Toolkit (ERC-7715) |
| Identity | ERC-8004, ENS subdomains |
| Treasury | Lido stETH (yield-only spending) |
| Proposals | Tally API (9 DAOs) + Snapshot (12 spaces) |
| Dashboard | Next.js, Tailwind, viem |
| Chains | Base Sepolia, Celo Sepolia |

## Quick Start

```bash
# Contracts
cd contracts && forge install && forge test

# Agent
cd agent && npm install
echo "PRIVATE_KEY=0x... VENICE_API_KEY=..." > ../.env
npm run swarm  # launches 9 autonomous agents

# Dashboard
cd dashboard && npm install && npm run dev
```

## Team

| Name | University | Class | Contact |
|------|-----------|-------|---------|
| Poulav Bhowmick | Heritage Institute of Technology, Kolkata | 2026 | @impoulav |
| Ishita Bhattacharyya | Heritage Institute of Technology, Kolkata | 2026 | @ishitaaaaw |

---

Built with [Claude Code](https://claude.ai/claude-code) · Synthesis 2026
