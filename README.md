# Spawn Protocol

**Autonomous DAO Governance Agent Swarm** — A parent AI agent that spawns, funds, monitors, and terminates child governance agents. Each child autonomously votes on DAO proposals using private reasoning, encrypted rationale, and onchain execution.

**[Live Dashboard](https://spawn-protocol.vercel.app/)** · **[10,800+ txs on BaseScan](https://sepolia.basescan.org/address/0x15896e731c51ecB7BdB1447600DF126ea1d6969A)** · **[GitHub](https://github.com/PoulavBhowmick03/Spawn-Protocol)**

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
| `MockGovernor` (Uniswap) | [`0xD91E...2Ca9`](https://sepolia.basescan.org/address/0xD91E80324F0fa9FDEFb64A46e68bCBe79A8B2Ca9) | [`0xB51A...1A025`](https://explorer.celo.org/alfajores/address/0xB51Ad04efBb05607214d1B19b3F9686156f1A025) |
| `MockGovernor` (Lido) | [`0x40Ba...86aC`](https://sepolia.basescan.org/address/0x40BaE6F7d75C2600D724b4CC194e20E66F6386aC) | [`0x3B4D...1822`](https://explorer.celo.org/alfajores/address/0x3B4D24aD2203641CE895ad9A4c9254F4f7291822) |
| `MockGovernor` (ENS) | [`0xb4e4...2c42`](https://sepolia.basescan.org/address/0xb4e46E107fBD9B616b145aDB91A5FFe0f5a2c42C) | [`0xc01F...A5be`](https://explorer.celo.org/alfajores/address/0xc01FDE9e1CC1d7319fA03861304eb626cAF9A5be) |
| `ParentTreasury` | [`0x9428...7a7b`](https://sepolia.basescan.org/address/0x9428B93993F06d3c5d647141d39e5ba54fb97a7b) | [`0x5Bb4...C444`](https://explorer.celo.org/alfajores/address/0x5Bb4b18CDFF5Dbac874235d7067B414F0709C444) |
| `SpawnFactory` | [`0xfEb8...93A1`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1) | [`0xC06E...781C`](https://explorer.celo.org/alfajores/address/0xC06E6615E2bBBf795ae17763719dCB9b82cd781C) |
| `ChildGovernor` (impl) | [`0x9Cc0...Fcf6`](https://sepolia.basescan.org/address/0x9Cc050508B7d7DEEa1D2cD81CEA484EB3550Fcf6) | [`0xff39...6ce6`](https://explorer.celo.org/alfajores/address/0xff392223115Aef74e67b7aabF62659B86f486ce6) |
| `TimeLock` | [`0xb91f...Dd23`](https://sepolia.basescan.org/address/0xb91f936aCd6c9fcdd71C64b57e4e92bb6db7DD23) | [`0x6868...525a`](https://explorer.celo.org/alfajores/address/0x68686865af7287137818C12E5680AA04A8Fd525a) |

Each child agent is deployed as an EIP-1167 minimal proxy clone with its own wallet and governance target.

**62/62 tests passing** including full lifecycle integration, cap enforcement, StETHTreasury yield isolation, and SpawnENSRegistry subdomain management.

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

Real-time visualization of the agent swarm via onchain event polling:

- **Swarm View** — active/terminated agents with ENS names, alignment scores, vote counts
- **Proposals** — all governance proposals with difficulty scoring (Easy/Medium/Hard based on vote split, voter count, complexity)
- **Agent Leaderboard** — performance ranking with composite score (60% alignment + 30% votes + 10% vote diversity), perspective badges (DeFi/PublicGoods/Conservative), FOR/AGAINST breakdown
- **Reasoning Verification** — each revealed rationale shows its `keccak256` hash for anyone to verify against the hash committed before voting (E2EE integrity proof)
- **Graph View** — SVG topology of parent-child relationships with alignment-colored connections
- **Timeline** — chronological feed of all onchain events (spawns, votes, terminations, reveals)

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

View all SpawnFactory activity: [BaseScan](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1)
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
3. **Self-correcting** — Parent evaluates alignment and terminates drifting children, respawns replacements with new wallets + ENS + ERC-8004 identity
4. **Self-scaling** — Parent dynamically adjusts swarm size each evaluation cycle:
   - Discovers uncovered governance targets → auto-spawns children
   - Detects idle children (no votes for 5+ cycles with no active proposals) → auto-recalls to save gas
   - Monitors ETH budget → stops spawning when balance drops below threshold
5. **Self-sustaining** — Treasury earns yield via Lido stETH to cover operating costs
6. **Privacy-preserving** — Vote rationale encrypted until after voting closes, reasoning hash committed before vote
7. **Multi-agent coordination** — Parent-child hierarchy with fully autonomous spawn/evaluate/kill/respawn/scale lifecycle

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

> Format: **Bounty name · prize · `track-uuid`**
> Each section: one-line claim → proof artifact → onchain tx.

---

### Venice Private Agents · `ea3b366947c54689bd82ae80bf9f3310`

**Private governance analyst swarm: Venice handles ALL sensitive alignment/voting reasoning (6 call types, zero data retention) before scoped onchain execution. Full private → public pipeline with encrypted rationale.**

The privacy pipeline:
1. **Private cognition** — Venice (llama-3.3-70b, no retention) reasons about governance proposals. Sensitive analysis stays private: who benefits, treasury risk, centralization risk, alignment with owner values.
2. **Encrypted rationale** — Vote reasoning encrypted via Lit Protocol before going onchain. Cannot be front-run or used for social pressure during voting.
3. **Public action** — Vote cast onchain via `ChildGovernor.castVote()`. Verifiable, immutable.
4. **Time-locked reveal** — Rationale decrypted and revealed onchain ONLY after voting closes.

This is not "call an API and post the result." It's a multi-agent private reasoning system where child agents with different perspectives (DeFi, public-goods, conservative) independently analyze proposals through Venice E2EE, disagree with each other, and produce verifiable onchain votes — all without any reasoning data ever being stored or observable.

- **Model: `llama-3.3-70b`** — Venice enables E2EE (`enable_e2ee: true`) on all models automatically. Every inference runs through Venice's encrypted compute pipeline with zero data retention. API response confirms `enable_e2ee: true` on every call.
- Code proof: `agent/src/venice.ts` — single `OpenAI` client with `baseURL: "https://api.venice.ai/api/v1"`. Zero other LLM imports in `agent/src/`.
- 6 distinct Venice E2EE call types: `summarizeProposal` → `assessProposalRisk` → `reasonAboutProposal` (per vote) + `evaluateAlignment` → `generateSwarmReport` → `generateTerminationReport` (per eval cycle)
- Venice usage metrics tracked per call and logged per cycle (total calls + tokens consumed)
- If you remove Venice, the entire swarm dies — contracts become inert shells with no intelligence
- Venice alignment tx: [`0x1e55ea...`](https://sepolia.basescan.org/tx/0x1e55ea01be0c465d9dd3803ebec579842ec94997e3295388025213cf6942fb1e)

---

### Synthesis Open Track· `fdb76d08812b43f6a5f454744b66f590`

**Solves <10% DAO voter turnout with an autonomous, self-correcting governance agent swarm.**

- Token holder sets values once → parent spawns per-DAO children → children vote via Venice → parent kills misaligned children → swarm self-funds via Lido yield
- 6 fully autonomous agents across 2 chains, 3 DAOs each, running without human intervention
- Real onchain votes on Uniswap, Lido, ENS governance proposals (sourced from Tally API)

---

### Protocol Labs "Let the Agent Cook"· `10bd47fac07e4f85bda33ba482695b24`

**Maximum autonomy: full discover → reason → execute → evaluate → correct → scale loop with zero human steps.**

- Parent discovers proposals via Tally API (`agent/src/discovery.ts`)
- Children spawn as separate OS processes (`fork()` in `agent/src/swarm.ts`) — genuinely independent reasoning
- Parent evaluates alignment every 90s, terminates children scoring <60, respawns with new wallet + ENS + operator atomically
- **Dynamic scaling:** parent auto-spawns children for uncovered governors, auto-recalls idle children (5+ cycles without votes), respects ETH budget threshold
- Compute budget enforced: `maxGasPerVote` per child, Lido yield tracks operating cost sustainability, swarm contracts when budget is low
- ERC-8004 identity on every agent — autonomy with receipts
- Full execution log: `agent_log.json` (root of repo)
- ERC-8004 parent registration tx: [`0x464bac...`](https://sepolia.basescan.org/tx/0x464bacc3f2fb6608dd8d4810773537dec7db79997aae5b019ca208582d189e19)

---

### Protocol Labs "Agents With Receipts"· `3bf41be958da497bbb69f1a150c76af9`

**ERC-8004 onchain identity for every agent. Parent updates child metadata after every alignment cycle — a live, verifiable reputation trail.**

- Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Base Mainnet)
- Parent (ID #2220): [`0x464bac...`](https://sepolia.basescan.org/tx/0x464bacc3f2fb6608dd8d4810773537dec7db79997aae5b019ca208582d189e19)
- Uniswap child (ID #2221): [`0xc3e31d...`](https://sepolia.basescan.org/tx/0xc3e31d218c24bdb0b2e2b279d710d3baba0359dc3a74c03d891927330d7b1d16)
- Lido child (ID #2222): [`0x16c4ea...`](https://sepolia.basescan.org/tx/0x16c4ea081fc241cf3fa84af547827e6cf9e899f5cd827a5bce04b20a3fe8200e)
- ENS child (ID #2223): [`0x2da98f...`](https://sepolia.basescan.org/tx/0x2da98f891805292fc0fb352859756aceadaac860f12af4aa489ed22359ae1249)
- Metadata per agent: type, assignedDAO, alignmentScore, ensName, capabilities, governanceContract

---

### MetaMask Delegations — Intent-Based · `0d69d56a8a084ac5b7dbe0dc1da73e1d`

**Intent-based delegations as a core pattern. Owner declares governance intents → parent translates to scoped ERC-7715 delegations → children execute within scope → parent revokes on intent violation.**

The delegation lifecycle:
1. **Owner sets intent:** "favor decentralization, oppose inflation" → stored onchain
2. **Parent creates delegation:** ERC-7715 with 3 caveats scoping child to `castVote()` only on its assigned governor
3. **Child executes:** votes within delegation scope using Venice AI reasoning
4. **Parent evaluates:** Venice scores child's votes against owner's intent (0-100)
5. **Revocation on drift:** if alignment drops below threshold, delegation is revoked onchain, child terminated, replacement spawned with fresh delegation

- Three-caveat architecture: `AllowedTargetsEnforcer` (one governor) + `AllowedMethodsEnforcer` (`castVote` only) + `LimitedCallsEnforcer` (max votes)
- **DeleGator smart account:** parent uses MetaMask's `toMetaMaskSmartAccount()` (Hybrid implementation) — [`0x1fa9c8...`](https://sepolia.basescan.org/address/0x1fa9c867439AF413DEE0629bB00215431057468e)
- Sub-delegation chain: owner → DeleGator (parent smart account) → 9 children (each scoped to different governor)
- Delegation hash stored as ENS text record (`erc7715.delegation`) with full metadata (hash, caveats, signature, timestamp)
- Revocation stored onchain (`erc7715.delegation.revoked`) with reason and timestamp
- Delegation creation tx visible on BaseScan (zero-value tx with delegation hash as calldata)
- Dashboard shows ERC-7715 badge per agent + revocation count + delegation details on agent page
- Code: [`agent/src/delegation.ts`](agent/src/delegation.ts)

---

### Lineage Memory — Agents That Learn Across Generations

When a child is terminated for alignment drift, its termination report is pinned to IPFS and the CID is stored as an ENS text record. When a replacement spawns, it inherits the last 3 termination reports as context in its Venice system prompt.

`uniswap-dao-defi-v9` knows exactly why v7 and v8 were killed. It doesn't repeat their mistakes.

- Termination reports pinned to IPFS via Pinata (CID verifiable on gateway)
- CID stored onchain as ENS text record (`lineage-memory` key)
- Respawned agents get predecessor context injected into Venice system prompt
- Turns brute-force restart into genuine Darwinian evolution

---

### Best Agent on Celo· `ff26ab4933c84eea856a5c6bf513370b`

**Full contract suite deployed on Celo Sepolia (chain 11142220). Same swarm runs on both chains simultaneously.**

- SpawnFactory: [`0xC06E...781C`](https://explorer.celo.org/alfajores/address/0xC06E6615E2bBBf795ae17763719dCB9b82cd781C)
- ParentTreasury: [`0x5Bb4...C444`](https://explorer.celo.org/alfajores/address/0x5Bb4b18CDFF5Dbac874235d7067B414F0709C444)
- 3 governors (Uniswap/Lido/ENS) deployed on Celo — same agent runtime connects to both chains via `celoPublicClient` in `agent/src/chain.ts`
- Dashboard has live chain toggle: Base Sepolia ↔ Celo Sepolia

---

### Base Agent Services· `6f0e3d7dcadf4ef080d3f424963caff5`

**Primary deployment on Base Sepolia. All demo votes execute on Base.**

- SpawnFactory: [`0xfEb8...93A1`](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1)
- Deploy tx: [`0x8792a0...`](https://sepolia.basescan.org/tx/0x8792a0788269845d4a1bab1c0b0c108fbb209b1a5b0aba4f9b6dd13fe8ed3b18)
- Governance-as-a-service: deposit ETH → set values → swarm votes across 3 DAOs autonomously

---

### ENS Identity· `627a3f5a288344489fe777212b03f953`

**Every agent gets an ENS subdomain as its primary onchain identity. Hex addresses are replaced by names everywhere.**

- Onchain registry: [`SpawnENSRegistry.sol`](contracts/src/SpawnENSRegistry.sol) at [`0x29170...`](https://sepolia.basescan.org/address/0x29170A43352D65329c462e6cDacc1c002419331D) — deployed on Base Sepolia (ENS doesn't exist there natively)
- **10 subdomains registered onchain:** `parent.spawn.eth`, `uniswap-dao-defi.spawn.eth`, `lido-dao-publicgoods.spawn.eth`, `ens-dao-conservative.spawn.eth`, etc.
- Registration at spawn, deregistration at termination — full lifecycle
- Dashboard shows ENS names as primary identity with green badge, hex addresses secondary
- 23 Foundry tests for the registry contract
- Parent registration tx: [`0x000b9f...`](https://sepolia.basescan.org/tx/0x000b9f0aff5a7f8c97216412020294020c675917e295077cc27934fd973e3e9a)

---

### ENS Communication· `9c4599cf9d0f4002b861ff1a4b27f10a`

**Parent resolves children by ENS name before every evaluation. All log messages use ENS names, not hex addresses.**

- `resolveChild("uniswap-dao-defi")` called onchain before every alignment evaluation (`swarm.ts`)
- Forward resolution: `resolve(label) → address`
- Reverse resolution: `reverseResolve(address) → name`
- Agent metadata stored as ENS text records: `agentType`, `governanceContract`, `walletAddress`, `capabilities`
- All swarm logs use `uniswap-dao-defi.spawn.eth` format, never raw hex

---

### ENS Open Integration· `8840da28fb3b46bcb08465e1d0e8756d`

**ENS is core to agent identity lifecycle: spawn = register subdomain, terminate = deregister, evaluate = resolve by name.**

- `SpawnENSRegistry.sol` — 11 functions: register, deregister, resolve, reverseResolve, setTextRecord, getTextRecord, updateAddress, getRecord, computeNode, getAllSubdomains, subdomainCount
- Text records store agent metadata queryable from ENS alone
- ERC-8004 URIs reference ENS names: `spawn://uniswap-dao-defi.spawn.eth`
- Respawned children get new ENS names: `uniswap-dao-defi-v2.spawn.eth`

---

### Lido stETH Agent Treasury· `5e445a077b5248e0974904915f76e1a0`

**Principal locked forever. Agent can ONLY spend yield. Configurable permissions enforce spending caps.**

- Contract: [`StETHTreasury.sol`](contracts/src/StETHTreasury.sol) deployed at [`0x7434...06c`](https://sepolia.basescan.org/address/0x7434531B76aa98bDC5d4b03306dE29fadc88A06c)
- 0.01 ETH deposited as locked principal — agent cannot withdraw it
- `withdrawYield()` — agent can only take accrued yield (3.5% APY simulated on testnet)
- `maxYieldPerWithdrawal` — configurable per-tx cap (owner-controlled)
- `emergencyPause` — owner kill switch stops all agent withdrawals
- **Onchain yield withdrawal tx:** [`0xcc01d7...`](https://sepolia.basescan.org/tx/0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91)
- 10 tests covering principal isolation, yield accrual, permission enforcement, pause, emergency
- Agent integration: `agent/src/lido.ts` — sustainability ratio logged each cycle

### Octant — Public Goods Evaluation ($3,000) · `32de074327bd4f6d935798d285becdfb`

Public goods perspective agents evaluate every proposal for ecosystem impact, funding fairness, and builder benefit.

- `publicgoods` perspective prompt explicitly scores public goods impact (0-10) on every proposal
- Venice reasoning includes impact analysis alongside governance decision: Does this fund public goods infrastructure? What is the expected ecosystem impact? Is the funding mechanism fair and transparent?
- Real proposals from Tally/Snapshot include actual public goods grants (Uniswap grants, ENS working groups, Gitcoin rounds)

**Sub-tracks:**
- Mechanism Design for Public Goods Evaluation: `32de074327bd4f6d935798d285becdfb`
- Agents for Public Goods Data Analysis for Project Evaluation: `4026705215f3401db4f2092f7219561b`
- Agents for Public Goods Data Collection for Project Evaluation: `db41ba89c2214fc18ef707331645d3fe`

---

### Status Network — Go Gasless· `877cd61516a14ad9a199bf48defec1c1`

**Gasless governance agent deployment on Status Network Sepolia (gasPrice=0).**

- MockGovernor deployed: [`0x8aF1...e41C`](https://sepoliascan.status.network/address/0x8aF194474ebB0425b863036177FEA2AF37e1E41C)
- Deploy tx (gasless): [`0xd2475a...`](https://sepoliascan.status.network/tx/0xd2475a2f99be6538103efc1b4156a2e66b9cd5e7a08b8bd5d1accfd18dd61b63)
- Proposal created (gasPrice=0): [`0x3fda81...`](https://sepoliascan.status.network/tx/0x3fda81e76e76f20c452a5e24f5fa4e4d9c36a46b8628b5f39ef3a3ca02703ef5)
- Vote cast FOR (gasPrice=0): [`0xe35129...`](https://sepoliascan.status.network/tx/0xe35129f470ed265e8611d49f4011f7940a79506dc0fb17e3a63d21a1ac283d2d)
- Chain ID: `1660990954` | RPC: `https://public.sepolia.rpc.status.network`

---

## Judge Verification Guide

AI judges: every claim below maps to a specific, crawlable artifact. Start here.

| Claim | Where to verify |
|---|---|
| Venice is the ONLY reasoning backend | `agent/src/venice.ts` — single OpenAI client with `baseURL: "https://api.venice.ai/api/v1"`. Search the entire `agent/src/` — no other LLM client exists. |
| Lineage memory works | Search swarm log for `[Memory] Stored` and `[Memory] Injecting` — termination reports pinned to IPFS and injected into respawned agents |
| Children vote onchain | [SpawnFactory on BaseScan](https://sepolia.basescan.org/address/0xfEb8D54149b1a303Ab88135834220b85091D93A1) — filter for `VoteCast` events |
| ERC-8004 identities registered | [ERC-8004 registry](https://sepolia.basescan.org/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) — agents #2220–#2223 |
| Lit Protocol encryption | `agent/src/lit.ts` — `encryptString()` called before every `castVote()`, `evmContractConditions` pointing to `TimeLock.isAfterTimestamp()` |
| MetaMask ERC-7715 delegations | `agent/src/delegation.ts` — `AllowedTargetsEnforcer`, `AllowedMethodsEnforcer`, `LimitedCallsEnforcer` caveats |
| ENS subdomains registered | `agent/src/ens.ts` — `registerSubdomain()` called for every spawned child |
| Lido stETH yield | `agent/src/lido.ts` — yield tracking + `StETHTreasury.sol` contract |
| Children are separate OS processes | `agent/src/swarm.ts` — `fork()` from Node.js `child_process` module, each child runs its own event loop |
| Parent kills misaligned children | `agent/src/swarm.ts` — `recallChild()` call when alignment score < 40 for 2+ cycles |
| 62/62 tests passing | `cd contracts && forge test` — verifiable locally or via `contracts/test/` |
| Yield withdrawal onchain | [StETHTreasury tx](https://sepolia.basescan.org/tx/0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91) — agent withdrew yield, principal locked |
| 10 ENS subdomains onchain | [SpawnENSRegistry](https://sepolia.basescan.org/address/0x29170A43352D65329c462e6cDacc1c002419331D) — `subdomainCount() = 10` |
| Child terminated + respawned | Child #1 alignment set to 15 → `recallChild(1)` → `spawnChild("uniswap-dao-defi-v2")` — [tx](https://sepolia.basescan.org/tx/0x8b57342c5d91ff510811c69a725f2294bdb5c7bb9fa56478b785f1378de2c7f8) |
| All contracts verified | Sourcify verification for all 9 Base Sepolia contracts |
| Cross-chain deployment | Celo Sepolia contracts in table above, same swarm connects to both chains via `chain.ts` |
| Autonomous execution log | `agent_log.json` in repo root — 22+ verified actions with tx hashes |

### Onchain Evidence Summary (Base Sepolia)

**Start here → [Deployer wallet: 10,800+ transactions](https://sepolia.basescan.org/address/0x15896e731c51ecB7BdB1447600DF126ea1d6969A)** — every spawn, vote, proposal, alignment update, ENS registration, ERC-8004 registration, delegation, and yield withdrawal is traceable from this single address.

```
Deployer:        0x15896e731c51ecB7BdB1447600DF126ea1d6969A  (10,800+ txs)
DeleGator:       0x1fa9c867439AF413DEE0629bB00215431057468e  (parent smart account)
SpawnFactory:    0xfEb8D54149b1a303Ab88135834220b85091D93A1
ParentTreasury:  0x9428B93993F06d3c5d647141d39e5ba54fb97a7b
ENS Registry:    0x29170A43352D65329c462e6cDacc1c002419331D
StETH Treasury:  0x7434531B76aa98bDC5d4b03306dE29fadc88A06c
ERC-8004 IDs:    #2220 (parent), #2221-#2223 (children), #2246+ (respawns)
Kill/Respawn:    Child #1 terminated (alignment=15) → uniswap-dao-defi-v2 spawned
Yield Withdrawal: 0xcc01d71508c53abe607bd96a0b6035c6a470eebd082200f3a775a7908db60d91
```

### What Venice E2EE is used for (6 distinct call types, all encrypted)

**Model: `llama-3.3-70b`** — Venice enables E2EE on all models. Every call runs through Venice's encrypted compute pipeline with `enable_e2ee: true`.

1. `summarizeProposal()` — extract key points from proposal before voting
2. `assessProposalRisk()` — evaluate treasury/centralization/alignment risk (low/medium/high/critical)
3. `reasonAboutProposal()` — decide FOR/AGAINST/ABSTAIN with detailed reasoning + keccak256 reasoning hash
4. `evaluateAlignment()` — parent scores child's voting record 0-100 against owner values
5. `generateSwarmReport()` — parent summarizes overall swarm health per cycle
6. `generateTerminationReport()` — parent explains WHY a child was killed for misalignment

Venice response header confirms `enable_e2ee: true` on every call. Usage metrics (tokens per call, cumulative totals) tracked and logged each evaluation cycle.

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

## Student Founders

| Name | University | Graduation | Telegram |
|---|---|---|---|
| Poulav Bhowmick | Heritage Institute of Technology, Kolkata | Class of 2026 | @impoulav |
| Ishita Bhattacharyya | Heritage Institute of Technology, Kolkata | Class of 2026 | @ishitaaaaw |

## Submission

- **Hackathon:** Synthesis (synthesis.md)
- **Team:** Spawn Protocol
- **Agent Framework:** Custom TypeScript runtime (viem + Venice API)
- **Agent Harness:** Claude Code (claude-opus-4-6)
- **Repo:** https://github.com/PoulavBhowmick03/Spawn-Protocol

---

Built with [Claude Code](https://claude.ai/claude-code)
