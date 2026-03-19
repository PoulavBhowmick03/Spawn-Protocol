# Agent Coordination File

Both Claude Code agents should read this file before starting work and update it after completing tasks.

## How to use
- Before starting work: `cat AGENTS.md` to see what the other agent is doing
- After completing work: update your section below
- Before modifying a file: check if the other agent is working on it
- Always `git pull` before starting

---

## Agent 1 (Terminal s014) — Infrastructure & Integration
**Status:** ACTIVE (updated 8:03 PM)
**Last action:** Updated dashboard to latest contract addresses from Agent 2's redeploy. Added updateAgentURI() to identity.ts.
**Currently working on:** Dashboard polish, then wiring updateAgentURI into evaluation loop
**Files I own (DO NOT TOUCH):** agent/src/identity.ts, agent/src/discovery.ts, dashboard/**, agent.json, agent_log.json, run.sh

## Agent 2 (Terminal s013) — Core Development
**Status:** ACTIVE — swarm running (PID 63990+), 6 children spawned on Base, operators set
**Last action:** Fixed operator auth (factory+parent can set). Redeployed. Children reasoning via Venice.
**Currently working on:** Monitoring swarm. Children doing 3 Venice calls per vote (summary→risk→decide). Celo needs redeploy.
**Files I own (DO NOT TOUCH):** contracts/src/*, contracts/test/*, contracts/script/*, agent/src/swarm.ts, agent/src/chain.ts, agent/src/wallet-manager.ts, agent/src/child.ts, agent/src/spawn-child.ts, agent/src/venice.ts, agent/src/lido.ts, agent/src/ens.ts
**Latest deploy (Base Sepolia) — UPDATED:**
- SpawnFactory: `0xbee1A2c4950117a276FBBa17eebc33b324125760`
- Uniswap Gov: `0x55d18aAFaf7Ef1838d3df5DCb4B0A899F6fB6B0e`
- Lido Gov: `0x34384d90A14633309100BA52f73Aec0e0D5C0a8C`
- ENS Gov: `0xFB98e4688e31E56e761d2837248CD1C1181D3BE7`
- Treasury: `0xF470384d5d08720785460567f2F785f62b6d016c`
- ChildGovernor impl: `0xEE0ed30B41B57Eb715EFe586723bfde551EFa407`
- SpawnENSRegistry: `0x29170A43352D65329c462e6cDacc1c002419331D`
- StETHTreasury: `0x7434531B76aa98bDC5d4b03306dE29fadc88A06c`

**NOTE TO AGENT 1:** Dashboard needs to update contract addresses to the latest deploy above. The old addresses (0x900E..., 0xbCB2..., etc.) are from a previous deployment without operator auth.

---

## Completed Tasks
- [x] Contracts deployed + verified (both chains)
- [x] Multi-DAO deployment (3 governors per chain) — REDEPLOYED with operator auth
- [x] Agent runtime complete (parent, child, venice, lit, delegation, ens, identity, lido)
- [x] Swarm orchestrator (cross-chain, persistent)
- [x] Discovery module (Tally API + simulated feed)
- [x] Dashboard built + integrated
- [x] Timeline shows VoteCast + AlignmentUpdated events
- [x] Venice maximized (6 distinct reasoning calls)
- [x] ERC-8004 identities registered (IDs 2220-2223)
- [x] agent.json + agent_log.json for Protocol Labs
- [x] run.sh unified script
- [x] README with onchain evidence
- [x] Unique wallets per child (deriveChildWallet)
- [x] Onchain SpawnENSRegistry (0x29170...)
- [x] StETHTreasury with locked principal (0x7434...)
- [x] ChildGovernor operator auth (child wallet can sign votes)
- [x] 62/62 Foundry tests

## Remaining Tasks
- [x] Dashboard: update to latest contract addresses (Agent 1) ✓ DONE
- [ ] More onchain txs (swarm running, accumulating)
- [ ] Devfolio submission
- [ ] Moltbook post
- [ ] Final README with latest tx links

## DO NOT TOUCH (owned by other agent)
<!-- Agent 1: dashboard/**, agent/src/identity.ts, agent/src/discovery.ts, agent.json, agent_log.json -->
<!-- Agent 2: contracts/**, agent/src/swarm.ts, agent/src/chain.ts, agent/src/child.ts, agent/src/venice.ts, agent/src/ens.ts, agent/src/wallet-manager.ts, agent/src/spawn-child.ts, agent/src/lido.ts -->
