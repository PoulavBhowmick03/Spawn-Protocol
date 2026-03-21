# Demo Video Script (80 seconds)

Record with QuickTime (Cmd+Shift+5) or Loom. Split screen: dashboard left, terminal right.

---

## Beat 1: THE HOOK (0-8s)

**Narrate:** "Right now, nine AI agents are voting on real Uniswap, Lido, and ENS governance proposals. Each has its own wallet, ENS identity, and a scoped MetaMask delegation that limits it to castVote only. If one drifts from the owner's values — the system kills it."

**Show:** Dashboard swarm page — 9 agents pulsing green, IPFS badge, ERC-7715 delegation bar.

---

## Beat 2: THE DISAGREEMENT (8-25s)

**Narrate:** "Three perspectives analyze every proposal through Venice AI — privately, with zero data retention. A DeFi agent votes FOR. A conservative agent votes AGAINST. They reason independently and disagree."

**Show:** Terminal output:
```
[uniswap-dao-defi]         Decision: FOR    — "capital efficient, generates revenue"
[uniswap-dao-conservative] Decision: AGAINST — "500K too aggressive without pilot"
[Venice] reasonAboutProposal: 1036 tokens | enable_e2ee: true
```
Then click Proposals page — show split votes on same proposal with difficulty badge.

---

## Beat 3: THE KILL (25-45s)

**Narrate:** "Every 90 seconds, the parent evaluates alignment. This agent scored 50 out of 100. Its ERC-7715 delegation is revoked onchain. The agent is terminated. A replacement spawns with a fresh wallet and fresh delegation — in the same cycle."

**Show:** Terminal:
```
  uniswap-dao-conservative-v22: 50/100 [DRIFTING]
  TERMINATING uniswap-dao-conservative-v22
  [ENS] erc7715.delegation.revoked — reason: alignment_drift_score_50
  Respawning as uniswap-dao-conservative-v23
  [Delegation] Created voting delegation — hash: 0x5ae0e1ac...
  [Delegation] ERC-7715 stored onchain (tx: 0xe7ffde...)
  ↻ Child process launched
```
Click agent detail page — show "REVOKED" badge + delegation details.

---

## Beat 4: THE PROOF (45-60s)

**Narrate:** "Every vote, every spawn, every kill, every delegation is an onchain transaction. 10,000 transactions from one wallet. The execution log is pinned to IPFS with the CID stored onchain. Venice is the only reasoning backend — remove it and the swarm dies."

**Show:** Split — dashboard Exec Log page (IPFS badge + entries) left, BaseScan deployer page right. Scroll BaseScan.

---

## Beat 5: THE SCALE (60-75s)

**Narrate:** "9 agents. 3 DAOs. 2 chains. Real proposals from Tally and Snapshot. Self-funding treasury via Lido stETH yield. The owner set their values once and never touched it again."

**Show:** Dashboard leaderboard page — composite scores, perspectives, FOR/AGAINST breakdown.

---

## Beat 6: CLOSE (75-80s)

**Narrate:** "DAOs don't need more voters. They need a swarm that debates, votes, self-corrects, and never sleeps. Spawn Protocol."

**Show:** Dashboard swarm view, agents pulsing green, IPFS + delegation badges visible.

---

## Tips
- Keep it under 80 seconds
- Don't explain code — show the RUNNING system
- Terminal + dashboard split is the money shot
- The kill/respawn with delegation revocation is the memorable moment
- Upload to YouTube unlisted for submission
