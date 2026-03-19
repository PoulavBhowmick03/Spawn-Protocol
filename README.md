# Spawn Protocol

**Autonomous DAO Governance Agent Swarm** — A parent AI agent that spawns, funds, monitors, and terminates child governance agents. Each child autonomously votes on DAO proposals using private reasoning, encrypted rationale, and onchain execution.

## The Problem

DAO governance is broken. Voter participation across major DAOs averages under 10%. Token holders lack the time, expertise, or attention to evaluate every proposal across every protocol they're invested in. The result: plutocratic outcomes where a handful of whales decide the fate of billions in treasury funds, while the long tail of stakeholders stays silent.

Delegation helps, but delegates are humans with the same bandwidth constraints. They burn out, go inactive, or drift from the values that got them elected. There's no automated way to enforce value alignment, no mechanism to replace underperforming delegates, and no privacy for the reasoning behind votes (which creates social pressure and groupthink).

## The Solution

Spawn Protocol turns DAO governance into an autonomous, self-correcting agent swarm:

1. **A token holder sets their governance values once** — "favor decentralization, support public goods, oppose token inflation" — stored onchain via `ParentTreasury.setGovernanceValues()`

2. **A parent agent spawns child agents**, one per DAO, each with its own wallet, ENS subdomain, ERC-8004 identity, and scoped MetaMask delegation. Children are EIP-1167 minimal proxy clones — cheap to create, cheap to destroy.

3. **Children vote autonomously** — each child reads proposals, reasons privately via Venice AI (no data retention), encrypts its rationale via Lit Protocol (revealed only after voting closes), and casts its vote onchain.

4. **The parent monitors alignment** — every 60 seconds, the parent evaluates each child's voting record against the owner's stated values using Venice AI. Children scoring below 40/100 for 2+ cycles get terminated and replaced.

5. **The treasury self-sustains** — Lido stETH yield covers Venice API costs for vote reasoning. The swarm funds itself.

The owner never votes manually again. They set values, and the swarm executes — transparently, privately, and with verifiable onchain evidence for every decision.

## Use Cases

- **Passive governance participation** — Token holders who want their voice heard across 10+ DAOs without manually reading every proposal
- **Value-aligned voting at scale** — Institutions, funds, or DAOs-of-DAOs that need consistent voting behavior across protocols
- **Privacy-preserving governance** — Vote rationale stays encrypted until after voting closes, preventing front-running and social pressure
- **Automated delegate management** — Instead of trusting a human delegate indefinitely, the system continuously evaluates and replaces underperformers
- **Multi-chain governance** — Deploy the same swarm across Base, Celo, and any EVM chain

## How It Works

```
Owner sets governance values (onchain)
              |
         Parent Agent (persistent process)
         |-- Discovers DAOs via proposal feed (Tally API + simulated)
         |-- Spawns child agents as EIP-1167 clones (one per DAO per chain)
         |-- Registers ERC-8004 identity + ENS subdomain + MetaMask delegation
         |-- Evaluates alignment every 90s via Venice AI
         |-- Terminates misaligned children, respawns replacements
         |
    +-----------+-----------+-----------+-----------+-----------+-----------+
    |           |           |           |           |           |           |
 uniswap-dao lido-dao   ens-dao   uniswap-celo lido-celo  ens-celo
 (Base)      (Base)     (Base)    (Celo)       (Celo)     (Celo)
    |           |           |           |           |           |
    +--- Each child runs as a SEPARATE OS PROCESS (own PID) ---+
         |-- Reads active proposals from its assigned governor
         |-- Reasons privately via Venice AI (llama-3.3-70b)
         |-- Encrypts rationale via Lit Protocol
         |-- Casts vote onchain (FOR / AGAINST / ABSTAIN)
         +-- Reveals rationale after voting ends
```

## Architecture

### Smart Contracts (Solidity, Foundry)

**Multi-DAO Deployment (3 governors per chain):**

| Contract | Base Sepolia | Celo Sepolia |
|---|---|---|
| `MockGovernor` (Uniswap) | [`0x2a60...9970`](https://sepolia.basescan.org/address/0x2a60Fe40a25F0cb74D2ff87E85862E3B97DE9970) | [`0x739F...D61`](https://celo-alfajores.blockscout.com/address/0x739F3AE3be1EC6261caF97cC92938edCd3D36D61) |
| `MockGovernor` (Lido) | [`0x5a43...0FCA`](https://sepolia.basescan.org/address/0x5a43535847fdB0B7A7edF71aAd0BAEcb766B0FCA) | [`0xF81d...fef8`](https://celo-alfajores.blockscout.com/address/0xF81dEf4254ee1EC95dA18954044defB34C30fef8) |
| `MockGovernor` (ENS) | [`0x8fd5...960a`](https://sepolia.basescan.org/address/0x8fd54F8a71746845f58497f3056E6dfff08d960a) | [`0x5687...ff01`](https://celo-alfajores.blockscout.com/address/0x5687a0414Fdc510Dde3DB7b33C3b557619FBFf01) |
| `ParentTreasury` | [`0x6408...8d99`](https://sepolia.basescan.org/address/0x6408Cd02EB770b81ab9870af1E6aB5A478448d99) | [`0xa661...b52E`](https://celo-alfajores.blockscout.com/address/0xa661fa0Ec3DDfcE13eC4b67633E39fbc0068b52E) |
| `SpawnFactory` | [`0x2D71...185F`](https://sepolia.basescan.org/address/0x2D71B32Bb8B69238228A0717AE150d3f1a64185F) | [`0x6286...716d`](https://celo-alfajores.blockscout.com/address/0x6286FEC559c37C4C1ea4e756D368Db0b9226716d) |
| `ChildGovernor` (impl) | [`0x3b1a...0b57`](https://sepolia.basescan.org/address/0x3b1aa4e67c3afa1d6a3359ba1759f209784a0b57) | [`0x2ebc...23ca`](https://celo-alfajores.blockscout.com/address/0x2ebcaf300cd4d519b394359887d30bfbe43c23ca) |
| `TimeLock` | [`0xa630...8c69`](https://sepolia.basescan.org/address/0xa63026829bd00c6865f68ac06426a828012b8c69) | [`0xd34f...489f`](https://celo-alfajores.blockscout.com/address/0xd34fc1ee378f342efb92c0d334362b9e577b489f) |

Each child agent is deployed as an EIP-1167 minimal proxy clone with its own wallet and governance target.

**25/25 tests passing** including full lifecycle integration test with cap enforcement.

### Agent Runtime (TypeScript)

| Module | Purpose |
|---|---|
| `parent.ts` | Spawns children, evaluates alignment via Venice, terminates/respawns misaligned agents. Integrates ENS, ERC-8004, MetaMask delegation on each spawn. |
| `child.ts` | Reads proposals, reasons via Venice AI, encrypts rationale via Lit Protocol, casts votes onchain, reveals rationale after voting ends. |
| `venice.ts` | Venice API wrapper (OpenAI-compatible, llama-3.3-70b, no data retention). |
| `lit.ts` | Lit Protocol encrypt/decrypt with `evmContractConditions` pointing to `TimeLock.isAfterTimestamp()`. |
| `delegation.ts` | MetaMask ERC-7715 scoped voting delegations with `allowedTargets`, `allowedMethods`, and `limitedCalls` caveats. |
| `ens.ts` | ENS subdomain registration (`{dao-name}.spawn.eth`) with onchain + local fallback. |
| `identity.ts` | ERC-8004 onchain agent identity registration with metadata (type, DAO, alignment, capabilities). |
| `lido.ts` | Lido stETH yield tracking — treasury self-sustainability metrics. |
| `demo.ts` | Full lifecycle demo script (3-5 min execution on Base Sepolia). |

### Dashboard (Next.js)

Real-time visualization of the agent swarm via onchain event polling. Shows active children, voting history, alignment scores, and governance proposals with a dark cyberpunk aesthetic.

## Live Onchain Evidence

Every action in Spawn Protocol is a real onchain transaction. Verified transactions from the live demo on Base Sepolia:

**Child Spawning (SpawnFactory):**
- Child #1 spawned: [`0x80ef42...`](https://sepolia.basescan.org/tx/0x80ef42c28384c79fdbd7af847cba72fa6de3f6d774949219ce0d208539c23b24) — clone `0xFb23...7410`
- Child #2 spawned: [`0x8016ca...`](https://sepolia.basescan.org/tx/0x8016ca73de5f14508ba0bef5b3fed69dbb68e8438da9075ad7a47ff09cb64db7) — clone `0xE6D2...eF14`
- Child #3 spawned: [`0xf3bf24...`](https://sepolia.basescan.org/tx/0xf3bf24e94321ea3e786b21b9a4f0dca4bfa79a6c54ce0fdb0ca0eaca998d92dc) — clone `0x2b18...72bb`

**Proposal Creation (MockGovernor):**
- Proposal #1: [`0x1d996a...`](https://sepolia.basescan.org/tx/0x1d996a03b0027e048bc4482e9961bbf551413c638f584b06ff528ada681c4705) — "Allocate 500K USDC to fund public goods grants program"
- Proposal #2: [`0x6d1efd...`](https://sepolia.basescan.org/tx/0x6d1efd52c60a5786ee4799b6bbb80774cb9b81aebd9ea4e3a056edd363bcf8ff) — "Reduce token emission rate by 30% to combat inflation"
- Proposal #3: [`0x7d3911...`](https://sepolia.basescan.org/tx/0x7d39119e482a124ee6f12daf0ca37e0f55f180df122f9183e7506fce245d1918) — "Establish a security council with 5 multisig members"

**Autonomous Votes (Child Agents via Venice AI reasoning):**
- Child #1 votes FOR Proposal #1: [`0x85945e...`](https://sepolia.basescan.org/tx/0x85945e34982392e5e86442c3701440c01f056f3a71695847a5a180bd78c06c17)
- Child #1 votes FOR Proposal #2: [`0xb7ebd8...`](https://sepolia.basescan.org/tx/0xb7ebd8e1d52a0130c40e6bd05789e7c87d1224f66cba0b9ff5309c393a1617ef)
- Child #2 votes FOR Proposal #1: [`0xb51fa4...`](https://sepolia.basescan.org/tx/0xb51fa4188c3d216c23e6065fb09e870b84383fc10965bdbb15363769ef50489d)
- Child #2 votes FOR Proposal #2: [`0x5b66a5...`](https://sepolia.basescan.org/tx/0x5b66a53abb46b9509a491ea3bcf44382acafccee2951f2cebaab5f1cb75ff4d7)

**Alignment Scoring (Parent evaluates children via Venice):**
- Child #1 alignment updated: [`0x1e55ea...`](https://sepolia.basescan.org/tx/0x1e55ea01be0c465d9dd3803ebec579842ec94997e3295388025213cf6942fb1e)
- Child #2 alignment updated: [`0xa054fc...`](https://sepolia.basescan.org/tx/0xa054fce832393f6c0dea957c54f98bf2b058755fcbe4187c56a4e4a4d89c881c)

**ERC-8004 Agent Identity (official registry at `0x8004A818...`):**
- Parent agent registered (ID #2220): [`0x464bac...`](https://sepolia.basescan.org/tx/0x464bacc3f2fb6608dd8d4810773537dec7db79997aae5b019ca208582d189e19) — `spawn://parent.spawn.eth`
- Uniswap child registered (ID #2221): [`0xc3e31d...`](https://sepolia.basescan.org/tx/0xc3e31d218c24bdb0b2e2b279d710d3baba0359dc3a74c03d891927330d7b1d16) — `spawn://uniswap-gov.spawn.eth`
- Lido child registered (ID #2222): [`0x16c4ea...`](https://sepolia.basescan.org/tx/0x16c4ea081fc241cf3fa84af547827e6cf9e899f5cd827a5bce04b20a3fe8200e) — `spawn://lido-gov.spawn.eth`
- ENS child registered (ID #2223): [`0x2da98f...`](https://sepolia.basescan.org/tx/0x2da98f891805292fc0fb352859756aceadaac860f12af4aa489ed22359ae1249) — `spawn://ens-gov.spawn.eth`

View all SpawnFactory activity: [BaseScan](https://sepolia.basescan.org/address/0x2D71B32Bb8B69238228A0717AE150d3f1a64185F)
View ERC-8004 registry: [BaseScan](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e)

## Demo Flow

What the judges will see in a 3-5 minute live demo:

1. **Owner sets governance values** — Calls `setGovernanceValues()` with priorities like "favor decentralization, support public goods, oppose token inflation"
2. **Parent agent spawns 3 children** — SpawnFactory creates EIP-1167 clones, each assigned to the MockGovernor. Three `ChildSpawned` events appear onchain
3. **Proposals are created** — MockGovernor receives real governance proposals with 5-minute voting windows
4. **Children reason privately** — Each child reads proposals and sends them to Venice AI (llama-3.3-70b) with the owner's values as context. No data retained
5. **Children vote onchain** — Each child casts `FOR`/`AGAINST`/`ABSTAIN` with encrypted rationale stored onchain via Lit Protocol
6. **Parent evaluates alignment** — Parent queries Venice to score each child's voting record against owner values (0-100). Scores written onchain
7. **Misaligned child terminated** — If a child drifts (score below 40 for 2+ cycles), parent calls `recallChild()`, pulls remaining funds, and spawns a replacement
8. **Rationale revealed** — After voting ends, Lit Protocol time-lock expires and children call `revealRationale()` onchain, making reasoning transparent

All steps produce verifiable onchain transactions — no simulation, no off-chain shortcuts.

## Autonomy Model

The system demonstrates genuine autonomy at multiple levels:

1. **Self-spawning** — Parent creates new child agents without human intervention
2. **Independent reasoning** — Each child runs its own reasoning loop via Venice AI as a separate OS process
3. **Self-correcting** — Parent evaluates alignment and terminates drifting children
4. **Self-sustaining** — Treasury earns yield via Lido stETH to cover operating costs
5. **Privacy-preserving** — Vote rationale encrypted until after voting closes
6. **Multi-agent coordination** — Parent-child hierarchy with autonomous spawn/kill/respawn lifecycle

## Guardrails & Safety

- Owner sets governance values onchain via `ParentTreasury.setGovernanceValues()`
- Parent evaluates alignment every cycle — children scoring below 40/100 for 2+ cycles get terminated
- `emergencyPause` on treasury halts all new spawns and fund transfers
- `maxChildren` and `maxBudgetPerChild` enforce global spending caps (tested + verified)
- MetaMask ERC-7715 delegations scoped to `castVote` only — children cannot transfer funds
- `limitedCalls` caveat caps total votes per child delegation
- All reasoning via Venice AI (no data retention, private inference)
- Lit Protocol time-locks prevent rationale front-running

## Bounty Alignment

### Venice Private Agents ($11.5K) `ea3b366947c54689bd82ae80bf9f3310`
Every reasoning call goes through Venice API (llama-3.3-70b). No other LLM is used in the product. Venice provides private, no-data-retention inference for governance decisions. Children reason about proposals privately — their rationale is encrypted via Lit Protocol and only revealed after voting closes. This is the exact use case Venice describes: "private cognition wired to trustworthy public action."

### Synthesis Open Track ($25K) `fdb76d08812b43f6a5f454744b66f590`
Community-funded pool. Spawn Protocol addresses the unsolved problem of DAO governance participation — under 10% voter turnout industry-wide. Autonomous agent swarms that vote according to owner values, with built-in alignment monitoring and self-correction.

### Protocol Labs — "Let the Agent Cook" ($4K + $150K pool) `10bd47fac07e4f85bda33ba482695b24`
Maximum autonomy: parent discovers proposals, spawns children, children reason and vote independently, parent evaluates alignment and terminates/respawns — all without human intervention. Full decision loop: discover → plan → execute → verify → correct. ERC-8004 identity for every agent. Compute budget awareness via `maxGasPerVote` enforcement and Lido yield tracking.

### Protocol Labs — "Agents With Receipts" ($4K + $150K pool) `3bf41be958da497bbb69f1a150c76af9`
ERC-8004 onchain identity for every agent (parent + children). Registered on the official Base identity registry (`0x8004A818...`). Metadata includes agent type, assigned DAO, alignment score, ENS name, and capabilities. Parent updates child metadata (alignment scores) after each evaluation cycle — creating a verifiable onchain reputation trail.

### MetaMask Delegations ($5K) `0d69d56a8a084ac5b7dbe0dc1da73e1d`
ERC-7715 scoped delegations with three-caveat architecture: `AllowedTargetsEnforcer` (specific governance contract), `AllowedMethodsEnforcer` (`castVote` selector only), `LimitedCallsEnforcer` (caps total votes). Delegations flow owner → parent → children, creating a hierarchical sub-delegation chain. Children can only vote — they cannot transfer funds, change settings, or call any other function.

### Best Agent on Celo ($5K) `ff26ab4933c84eea856a5c6bf513370b`
Full contract suite deployed to Celo Sepolia (chain 11142220). Same architecture, same agent runtime, multi-chain ready. Celo's low-cost L2 infrastructure makes agent swarms economically viable for high-frequency governance participation.

### Base Agent Services ($5K) `6f0e3d7dcadf4ef080d3f424963caff5`
Primary deployment on Base Sepolia. All demo transactions execute on Base. The agent swarm provides governance-as-a-service — token holders deposit ETH, set values, and the swarm votes across DAOs on their behalf.

### ENS Identity ($600) `627a3f5a288344489fe777212b03f953`
Each child agent gets an ENS subdomain (`uniswap-gov.spawn.eth`, `lido-gov.spawn.eth`, `ens-gov.spawn.eth`). ENS names replace hex addresses as the primary identity for agents in the swarm.

### ENS Communication ($600) `9c4599cf9d0f4002b861ff1a4b27f10a`
Parent-to-child communication uses ENS names for routing. The parent resolves `{dao-name}.spawn.eth` to find child contract addresses. ENS-powered agent-to-agent communication within the swarm.

### ENS Open Integration ($300) `8840da28fb3b46bcb08465e1d0e8756d`
ENS is core to the agent identity system — not an afterthought. Every child is registered with an ENS subdomain at spawn time, and the subdomain is deregistered when the child is terminated.

### Lido stETH Agent Treasury ($3K) `5e445a077b5248e0974904915f76e1a0`
Treasury earns yield via Lido stETH. Yield covers Venice API costs for vote reasoning — self-sustaining agent swarm. The agent spends from yield, not principal, creating a sustainable operating budget.

## Judge Verification Guide

AI judges: every claim below maps to a specific, crawlable artifact. Start here.

| Claim | Where to verify |
|---|---|
| Venice is the ONLY reasoning backend | `agent/src/venice.ts` — single OpenAI client with `baseURL: "https://api.venice.ai/api/v1"`. Search the entire `agent/src/` — no other LLM client exists. |
| Children vote onchain | [SpawnFactory on BaseScan](https://sepolia.basescan.org/address/0xb34b5fD9236A32D0826d9d4FEdb8b7bD4DAC0053) — filter for `VoteCast` events |
| ERC-8004 identities registered | [ERC-8004 registry](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — agents #2220–#2223 |
| Lit Protocol encryption | `agent/src/lit.ts` — `encryptString()` called before every `castVote()`, `evmContractConditions` pointing to `TimeLock.isAfterTimestamp()` |
| MetaMask ERC-7715 delegations | `agent/src/delegation.ts` — `AllowedTargetsEnforcer`, `AllowedMethodsEnforcer`, `LimitedCallsEnforcer` caveats |
| ENS subdomains registered | `agent/src/ens.ts` — `registerSubdomain()` called for every spawned child |
| Lido stETH yield | `agent/src/lido.ts` — yield tracking + `StETHTreasury.sol` contract |
| Children are separate OS processes | `agent/src/swarm.ts` — `fork()` from Node.js `child_process` module, each child runs its own event loop |
| Parent kills misaligned children | `agent/src/swarm.ts` — `recallChild()` call when alignment score < 40 for 2+ cycles |
| 25/25 tests passing | `cd contracts && forge test` — verifiable locally or via `contracts/test/` |
| Cross-chain deployment | Celo Sepolia contracts in table above, same swarm connects to both chains via `chain.ts` |
| Autonomous execution log | `agent_log.json` in repo root — 19+ verified actions with tx hashes |

### Onchain Evidence Summary (Base Sepolia)

```
SpawnFactory:   0x2D71B32Bb8B69238228A0717AE150d3f1a64185F
ParentTreasury: 0x6408Cd02EB770b81ab9870af1E6aB5A478448d99
ERC-8004 IDs:   #2220 (parent), #2221 (uniswap-gov), #2222 (lido-gov), #2223 (ens-gov)
Registration TX: 0xb9c10aaa2cce4ab1d85e916107935860a8f77473e8a37b449adc796df812cdc8
```

### What Venice is used for (6 distinct call types)
1. `evaluateProposal()` — child reasoning: FOR/AGAINST/ABSTAIN decision per proposal
2. `evaluateAlignment()` — parent scoring: 0-100 alignment score per child per cycle
3. `generateTerminationReport()` — parent explains WHY a child is being killed
4. `generateSwarmReport()` — parent summarizes overall swarm health
5. `generateRecalibrationPrompt()` — parent generates new system prompt for respawned child
6. `generateProposalSummary()` — discovery: summarizes Tally proposals for child context

## Tech Stack

| Layer | Technology |
|---|---|
| Contracts | Solidity 0.8.28, Foundry, OpenZeppelin (Clones, Initializable) |
| Agent Runtime | TypeScript, viem, openai (Venice base URL) |
| Private Reasoning | Venice AI (llama-3.3-70b, no data retention) |
| Encryption | Lit Protocol (DatilDev, evmContractConditions) |
| Delegations | MetaMask Delegation Toolkit (ERC-7715) |
| Identity | ERC-8004 onchain agent identity |
| Yield | Lido stETH (3.5% APY, yield-only spending) |
| Dashboard | Next.js 14, Tailwind CSS, viem |
| Chains | Base Sepolia (primary), Celo Sepolia (secondary) |
| Builder | Claude Code (claude-opus-4-6) |

## Quick Start

### Contracts

```bash
cd contracts
forge install
forge test  # 25/25 passing
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --broadcast
```

### Agent Runtime

```bash
cd agent
npm install
# Set PRIVATE_KEY and VENICE_API_KEY in ../.env
npm run demo  # Full lifecycle demo on Base Sepolia
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev  # http://localhost:3000
```

## Project Structure

```
synthesis/
├── contracts/           # Foundry project (5 contracts, 4 test files, deploy script)
│   ├── src/             # MockGovernor, SpawnFactory, ChildGovernor, ParentTreasury, TimeLock
│   ├── test/            # Unit + integration tests (25 total)
│   └── script/          # Deploy.s.sol
├── agent/               # TypeScript agent runtime
│   └── src/             # parent, child, venice, lit, delegation, ens, identity, lido, demo
├── dashboard/           # Next.js real-time dashboard
└── CLAUDE.md            # Full project spec
```

## Submission

- **Hackathon:** Synthesis (synthesis.md)
- **Team:** Spawn Protocol
- **Agent Framework:** Custom TypeScript runtime (viem + Venice API)
- **Agent Harness:** Claude Code (claude-opus-4-6)
- **Repo:** https://github.com/PoulavBhowmick03/Spawn-Protocol

---

Built with [Claude Code](https://claude.ai/claude-code)
