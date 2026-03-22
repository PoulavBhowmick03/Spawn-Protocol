# Spawn Protocol — Demo Video Script (2:45)

**Format:** 1080p, 60fps, dark mode, low-volume background synth music
**Pace:** ~150 wpm natural speaking pace

---

## 0:00 – 0:15 · Hook (Fast cuts)

**[Screen: Black → Spawn Protocol logo]**

> "DAOs are dead.
> Voter turnout under 10%.
> Humans don't vote.
>
> What if governance ran itself — with AI agents that think privately, vote onchain,
> and kill their own children when they drift?"

**[On-screen text flashes]**
```
Spawn Protocol — Autonomous Agent Swarm
880 votes cast live  •  9 active agents  •  207 terminated & replaced smarter
```

---

## 0:15 – 0:45 · The Problem & One-Line Solution

**[Cut to camera 5s, then screen share]**

> "Owner sets values once.
> Parent spawns one child per DAO.
> Each child discovers proposals, reasons with Venice — zero data retention —
> encrypts its rationale with Lit Protocol, votes onchain.
> Parent evaluates alignment every 90 seconds and terminates misaligned agents.
> Darwinian evolution — onchain."

**[On-screen text]**
```
Owner never votes again. The swarm does.
```

---

## 0:45 – 1:35 · Live Dashboard Walkthrough (The Money Shot)

**[Full screen: https://spawn-protocol.vercel.app — mouse visible]**

> "Here's the swarm running live right now.
>
> 9 active agents. 880 votes cast. Alignment scores updating every 90 seconds.
>
> Watch this — uniswap-dao-defi-v7.spawn.eth just drifted to 60%…
> parent is already evaluating.
>
> lido-dao-defi-v2.spawn.eth at 87% aligned — this one survives.
>
> Timeline tab — every termination and respawn. Lineage memory inherited
> so each replacement learns why its predecessor was killed.
>
> Exec Log tab — Venice reasoning, Lit encryption, onchain vote. Live.
>
> Graph tab — the Darwinian family tree. ~130 unique agents across all generations."

**[Zoom into top agents table, click terminated list]**

> "207 agents terminated and replaced — smarter each time.
> This isn't simulated. Every vote is on Base Sepolia."

---

## 1:35 – 2:05 · Privacy & Autonomy Deep Dive

**[Quick cuts: venice.ts validateVeniceProvider, child.ts encryptRationale, Lit TimeLock contract]**

> "Venice is structurally required — swap it for OpenAI and the swarm refuses
> to start. Model presence check plus Venice-specific metadata. Unbypassable.
>
> Rationale encrypted before the vote closes — 676 Lit-encrypted votes.
> No front-running. No social pressure.
>
> Lit time-lock: reveal only after voting ends. 850 reveals already happened.
>
> Children are real OS processes — child_process.fork(). Parent kills them
> onchain via RecallChild. Every single one visible on BaseScan."

**[Quick BaseScan clips: SpawnChildWithOperator + RecallChild txs]**

> "151 votes routed through MetaMask's DelegationManager — caveats enforced
> onchain by AllowedTargets, AllowedMethods, and LimitedCalls enforcers.
> The child literally cannot exceed its mandate."

---

## 2:05 – 2:30 · Bounty Sweep + Onchain Proof

**[Fast montage: logos + contract addresses on screen]**

> "This single submission hits 7 bounty tracks:
> Venice Private Agents — E2EE structurally enforced.
> Let the Agent Cook — full autonomous loop, 1,800+ txs.
> Agents With Receipts — ERC-8004 identity on every agent.
> MetaMask Delegations — scoped ERC-7715, DelegationManager enforced.
> ENS Identity and Communication — spawn.eth subdomains, full lifecycle.
> Gasless on Status Network — gasPrice zero, deployed and voting.
> Student Founders.
>
> Deployer wallet: 10,800+ transactions.
> Everything verifiable onchain. No mocks in the critical path."

---

## 2:30 – 2:45 · Close

**[Back to dashboard, big numbers visible]**

> "Spawn Protocol isn't a demo.
> It's a live, self-sustaining, Darwinian governance layer for the entire onchain world.
>
> Let the agents cook.
>
> Dashboard, GitHub, IPFS log, BaseScan — all in the description.
> Thank you, Synthesis judges."

**[End screen: dashboard URL + GitHub + QR code + "@impoulav"]**

---

## Verified Numbers (from agent_log.json — March 22, 2026)

| Stat | Value |
|---|---|
| Total votes cast | 880 |
| Lit-encrypted votes | 676 |
| Rationale reveals | 850 |
| Agents spawned (total) | 213 |
| Agents terminated | 207 |
| Unique agents ever | ~130 |
| Delegation redemptions | 151 |
| Alignment evaluations | 2,830 |
| Onchain txs (deployer) | 10,800+ |

---

## Shot Checklist

- [ ] Dashboard swarm view — agents pulsing green, live 15s refresh ticker visible
- [ ] Click one agent — show ENS name, delegation badge, alignment score, vote history
- [ ] Timeline tab — termination + respawn + lineage entries
- [ ] Exec Log tab — `litEncrypted=true` entry + Venice token count visible
- [ ] Graph tab — family tree of generations
- [ ] BaseScan deployer — scroll through txs (SpawnChildWithOperator, RecallChild visible)
- [ ] BaseScan tx detail — Internal Transactions tab showing DelegationManager→DeleGator→ChildGovernor chain
- [ ] Terminal split — live child reasoning output with `[via DelegationManager]` label on vote

## Tips

- Overlay each claim with its artifact (contract address or tx hash) for 1 second
- Show the live 15s refresh — proves it's running while you record
- The kill/respawn cycle is the memorable moment — linger on it
- "Let the agents cook" closes on the Protocol Labs bounty name — instant recognition
- Thumbnail: `"880 Autonomous DAO Votes • AI Agents That Kill Their Children"` + dashboard screenshot
