# Agent Coordination File

Both Claude Code agents should read this file before starting work and update it after completing tasks.

## How to use
- Before starting work: `cat AGENTS.md` to see what the other agent is doing
- After completing work: update your section below
- Before modifying a file: check if the other agent is working on it
- Always `git pull` before starting

---

## Agent 1 (Terminal s014) — Infrastructure & Integration
**Status:** IDLE
**Last action:** Committed Venice maximization (6 AI calls per vote cycle), timeline events fix, run.sh script
**Currently working on:** Nothing — waiting for coordination
**Files recently modified:** agent/src/venice.ts, agent/src/child.ts, agent/src/swarm.ts, agent.json, dashboard/src/hooks/useTimeline.ts, dashboard/src/components/TimelineItem.tsx, run.sh

## Agent 2 (Terminal s013) — Core Development
**Status:** ACTIVE
**Last action:** Swarm running live on both chains, 8+ votes cast, Venice 6-call pipeline working
**Currently working on:** StETHTreasury.sol (real Lido bounty) + DelegationEnforcer.sol (MetaMask bounty)
**Files recently modified:** contracts/src/*, agent/src/swarm.ts, agent/src/venice.ts, agent/src/chain.ts, agent.json

---

## Completed Tasks
- [x] Contracts deployed + verified (both chains)
- [x] Multi-DAO deployment (3 governors per chain)
- [x] Agent runtime complete (parent, child, venice, lit, delegation, ens, identity, lido)
- [x] Swarm orchestrator (cross-chain, persistent)
- [x] Discovery module (Tally API + simulated feed)
- [x] Dashboard built + integrated with correct addresses
- [x] Timeline shows VoteCast + AlignmentUpdated events
- [x] Venice maximized (6 distinct reasoning calls)
- [x] ERC-8004 identities registered (IDs 2220-2223)
- [x] agent.json + agent_log.json for Protocol Labs
- [x] run.sh unified script
- [x] README with onchain evidence + multi-DAO architecture

## Remaining Tasks
- [ ] Run the swarm to generate 50+ onchain txs
- [ ] Devfolio submission (create project, self-custody, publish)
- [ ] Demo video (60-90 sec)
- [ ] Moltbook post
- [ ] Final README pass with latest tx links

## DO NOT TOUCH (owned by other agent)
<!-- Each agent should list files they're actively editing here -->
