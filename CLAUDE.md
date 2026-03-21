# Spawn Protocol — Autonomous DAO Governance Agent Swarm

## What this is
A parent AI agent that autonomously spawns, funds, monitors, and terminates
child governance agents. Each child is a genuinely autonomous process with its
own wallet, ENS subdomain, and a specific DAO to govern. Children read
proposals, reason privately via Venice (no data retention), cast votes, and
encrypt their rationale via Lit Protocol until after voting closes. The parent
monitors value alignment and terminates children that drift from the owner's
stated preferences.

## Architecture

### Smart Contracts (Foundry, in `contracts/`)

Deployed to **Base Sepolia (primary)** + **Celo Sepolia (secondary)**.

1. **`MockGovernor.sol`**
   - Simplified governance with configurable voting periods (default 5 min / 300s)
   - `createProposal(string description) → uint256 proposalId`
   - `castVote(uint256 proposalId, uint8 support)` where support: 0=Against, 1=For, 2=Abstain
   - `getProposal(uint256 proposalId) → ProposalInfo`
   - `state(uint256 proposalId) → ProposalState` (Pending, Active, Defeated, Succeeded, Executed)
   - Mirrors OpenZeppelin IGovernor interface shape for real DAO drop-in compatibility
   - Events: `ProposalCreated`, `VoteCast`, `ProposalExecuted`

2. **`SpawnFactory.sol`**
   - Uses EIP-1167 minimal proxy (OpenZeppelin Clones library)
   - `spawnChild(string ensLabel, address governanceTarget, uint256 budget, uint256 maxGasPerVote) → uint256 childId`
   - `recallChild(uint256 childId)` — pull funds + deactivate
   - `reallocate(uint256 fromId, uint256 toId, uint256 amount)`
   - `getActiveChildren() → ChildInfo[]`
   - Only callable by registered parent agent address
   - Events: `ChildSpawned`, `ChildTerminated`, `FundsReallocated`

3. **`ChildGovernor.sol`** (implementation contract for clones)
   - `initialize(address parent, address factory, address governance, uint256 maxGas)`
   - `castVote(uint256 proposalId, uint8 support, bytes encryptedRationale)`
   - `revealRationale(uint256 proposalId, bytes decryptedRationale)`
   - `getVotingHistory() → VoteRecord[]`
   - `updateAlignmentScore(uint256 score)` — only parent can call
   - Only callable by factory or parent (modifier `onlyAuthorized`)
   - Enforces `maxGasPerVote` per transaction
   - Events: `VoteCast`, `RationaleRevealed`, `AlignmentUpdated`

4. **`ParentTreasury.sol`**
   - Owner deposits ETH/tokens
   - `setParentAgent(address agent)` — registers the AI agent as operator
   - `setGovernanceValues(string values)` — stores owner's values onchain
   - `getGovernanceValues() → string`
   - Global caps: `maxChildren`, `maxBudgetPerChild`, `emergencyPause`
   - Connects to SpawnFactory for fund transfers
   - Events: `Deposited`, `ValuesUpdated`, `AgentRegistered`

5. **`TimeLock.sol`** (helper for Lit Protocol conditions)
   - `isAfterTimestamp(uint256 timestamp) → bool` — returns `block.timestamp >= timestamp`
   - Used as Lit Protocol access control condition for time-locked decryption

6. **`SpawnENSRegistry.sol`** — onchain ENS subdomain registry for agent identity
7. **`StETHTreasury.sol`** — Lido stETH yield-based treasury (yield-only spending)

### Agent Runtime (TypeScript, in `agent/`)

Uses `viem` for chain interaction. Uses `openai` npm package with Venice base URL.

**ParentAgent** (`agent/src/swarm.ts`) — single process:
```
while (true) {
  1. Read owner's governance values from ParentTreasury contract
  2. Get list of active children from SpawnFactory
  3. For each child: resolve ENS name, fetch votes, evaluate alignment via Venice (0-100)
  4. If alignment < 60: terminate → deregister ENS → Venice post-mortem → pin termination report to IPFS → store CID as ENS text record → respawn with operator + ENS + lineage memory (last 3 termination reports) + process
  5. Dynamic scaling:
     - Check if any governor lacks a child → auto-spawn
     - Check if any child is idle (0 new votes for 5 cycles + no active proposals) → auto-recall
     - Check ETH budget → stop spawning if below 0.005 ETH threshold
  6. Generate swarm status report via Venice
  7. Log Venice usage metrics (calls + tokens)
  8. Sleep 90 seconds
}
```

**ChildAgent** (`agent/src/child.ts`) — one process per DAO:
```
while (active) {
  1. Fetch active proposals from assigned governance contract
  2. For each unvoted proposal:
     a. Summarize proposal via Venice
     b. Assess risk via Venice
     c. Decide FOR/AGAINST/ABSTAIN via Venice + owner values + lineage memory (predecessor termination reports)
     d. Encrypt reasoning via Lit Protocol (decrypt after vote ends)
     e. Call castVote() onchain with encrypted rationale
  3. For proposals where voting ended:
     a. Decrypt rationale via Lit (time condition now met)
     b. Call revealRationale() onchain
  4. Sleep 30 seconds
}
```

### Key Integration Details

**Venice API** (OpenAI-compatible, base URL swap):
```typescript
import OpenAI from "openai";
const venice = new OpenAI({
  apiKey: process.env.VENICE_API_KEY,
  baseURL: "https://api.venice.ai/api/v1",
});
```
6 distinct call types: `reasonAboutProposal`, `evaluateAlignment`, `summarizeProposal`, `assessProposalRisk`, `generateSwarmReport`, `generateTerminationReport`

**Lit Protocol** — encrypt with time-based access control via `evmContractConditions` pointing to `TimeLock.isAfterTimestamp()`

**MetaMask Delegation Framework** — ERC-7715 scoped delegations: `AllowedTargetsEnforcer` + `AllowedMethodsEnforcer` + `LimitedCallsEnforcer`

**ERC-8004** — onchain agent identity for parent + all children on Base Sepolia

**ENS Subdomains** — each child gets `{dao-name}.spawn.eth` via `SpawnENSRegistry.sol`

**Lido stETH** — treasury earns yield; operating costs funded from yield, not principal

### Dashboard (React/Next.js, in `dashboard/`)
- Real-time view of the agent swarm via onchain event polling
- Shows: active children with ENS names, assigned DAOs, recent votes
- Visual: agents spawning (green pulse), voting (blue), getting killed (red)
- **Leaderboard**: agents ranked by composite score (alignment + votes + diversity)
- **Proposal difficulty scoring**: Easy/Medium/Hard based on vote split, voter count, complexity
- **Reasoning verification**: keccak256 hash of revealed rationale shown for E2EE integrity proof
- **Multi-source proposals**: Tally (9 DAOs) + Snapshot (12 spaces) + simulated
- **IPFS**: Agent log pinned to decentralized storage, CID stored onchain as ENS text record
- **Lineage Memory**: termination reports pinned to IPFS, CID stored as ENS text record (`lineage-memory` key), respawned agents inherit last 3 predecessor reports as Venice system prompt context
- **ERC-7715 delegation lifecycle**: create → scope → evaluate → revoke, shown per agent with badges
- **DeleGator smart account**: parent uses MetaMask DeleGator for onchain delegation enforcement
- Timeline of all governance actions with tx links
- Owner's stated values alongside child voting patterns + alignment scores

## Deployed Contracts

### Base Sepolia (chain 84532)
| Contract | Address |
|----------|---------|
| MockGovernor (Uniswap) | `0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9` |
| MockGovernor (Lido) | `0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC` |
| MockGovernor (ENS) | `0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C` |
| ParentTreasury | `0x9428B93993F06d3c5d647141d39e5ba54fb97a7b` |
| ChildGovernor (impl) | `0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6` |
| SpawnFactory | `0xfEb8D54149b1a303Ab88135834220b85091D93A1` |
| SpawnENSRegistry | `0x29170A43352D65329c462e6cDacc1c002419331D` |
| StETHTreasury | `0x7434531B76aa98bDC5d4b03306dE29fadc88A06c` |
| TimeLock | `0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23` |

### Celo Sepolia (chain 11142220)
| Contract | Address |
|----------|---------|
| MockGovernor (Uniswap) | `0xB51Ad04efBb05607214d1B19b3F9686156f1A025` |
| MockGovernor (Lido) | `0x3B4D24aD2203641CE895ad9A4c9254F4f7291822` |
| MockGovernor (ENS) | `0xc01FDE9e1CC1d7319fA03861304eb626cAF9A5be` |
| ParentTreasury | `0x5Bb4b18CDFF5Dbac874235d7067B414F0709C444` |
| ChildGovernor (impl) | `0xff392223115Aef74e67b7aabF62659B86f486ce6` |
| SpawnFactory | `0xC06E6615E2bBBf795ae17763719dCB9b82cd781C` |
| TimeLock | `0x68686865af7287137818C12E5680AA04A8Fd525a` |

## Tech Stack
- **Contracts:** Foundry + Solidity (OpenZeppelin for Clones, Governor interface)
- **Agent Runtime:** TypeScript + viem + openai (with Venice base URL)
- **Private Reasoning:** Venice API (llama-3.3-70b, E2EE enabled on all models, zero data retention)
- **Encryption:** Lit Protocol SDK (@lit-protocol/lit-node-client)
- **Delegations:** MetaMask Delegation Toolkit (@metamask/delegation-toolkit)
- **Identity:** ERC-8004 on Base Sepolia
- **Dashboard:** Next.js 14 + React + viem + Tailwind CSS
- **Chains:** Base Sepolia (primary) + Celo Sepolia (secondary)

## Project Structure
```
synthesis/
├── CLAUDE.md                 (this file — project spec)
├── contracts/                (Foundry project)
│   ├── src/                  (MockGovernor, SpawnFactory, ChildGovernor, ParentTreasury, TimeLock, SpawnENSRegistry, StETHTreasury)
│   ├── test/                 (62 tests passing)
│   ├── script/               (DeployMultiDAO.s.sol)
│   └── broadcast/            (Foundry deployment receipts — verifiable evidence)
├── agent/
│   └── src/                  (swarm, child, venice, lit, delegation, ens, identity, lido, chain, wallet-manager)
├── dashboard/                (Next.js real-time swarm visualization)
├── agent.json                (Machine-readable agent manifest)
├── agent_log.json            (Execution log with tx hashes)
└── README.md
```

## Key Design Decisions
- **Venice is the ONLY reasoning backend.** Every inference call in the product routes through Venice. Claude Code is the builder harness; the product agents use Venice exclusively.
- **Every vote is an onchain transaction.** No off-chain simulation.
- **Encrypted rationale via Lit is a core feature.** Time-locked decryption prevents front-running.
- **Each child agent runs as its own OS process.** Genuinely independent reasoning loops via `fork()`.
- **Mock governance with 5-min voting periods for demo.** Real DAO interface compatibility for production.
- **Self-funding treasury.** Lido stETH yield covers Venice API costs.
