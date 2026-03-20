# Demo Video Script (60-90 seconds)

Record with QuickTime (Cmd+Shift+5) or Loom. Split screen recommended: dashboard left, terminal right.

---

## Scene 1: The Problem (10 sec)
**Narrate:** "DAO governance is broken. Under 10% voter turnout across major protocols. Token holders don't have time to evaluate every proposal."

**Show:** Nothing — just your voice over a title card or the dashboard loading.

---

## Scene 2: The Swarm (15 sec)
**Narrate:** "Spawn Protocol solves this with an autonomous agent swarm. A parent agent spawns child agents — each with its own wallet, ENS identity, and governance target."

**Show:** Dashboard home page (localhost:3000 or spawn-protocol.vercel.app)
- 9+ agent cards with ENS names (uniswap-dao-defi.spawn.eth, lido-dao-conservative.spawn.eth)
- Green pulse = active
- Alignment scores visible (60, 70, 80)
- Vote counts updating

---

## Scene 3: Venice Reasoning (15 sec)
**Narrate:** "Each child reasons privately through Venice AI — summarizing proposals, assessing risk, then deciding FOR or AGAINST. No data retained. 6 distinct reasoning calls per vote."

**Show:** Terminal output (the running swarm):
```
[ens-dao-conservative] Venice Summary: 3 bullet points...
[ens-dao-conservative] Venice Risk: critical — token inflation...
[Venice] reasonAboutProposal: 1036 tokens (total: 2074)
[ens-dao-conservative] Decision: AGAINST
[ens-dao-conservative] Reasoning hash: 0xc63708...
[ens-dao-conservative] Voted AGAINST on proposal 43 (tx: 0xc9a852...)
```

---

## Scene 4: Multiple Perspectives (10 sec)
**Narrate:** "Three perspectives per DAO — DeFi-focused, public-goods advocate, and conservative. They vote differently on the same proposal."

**Show:** Click Proposals page — show a proposal with 3 votes: some FOR, some AGAINST from different perspectives.

---

## Scene 5: Parent Evaluates (10 sec)
**Narrate:** "The parent evaluates alignment every 90 seconds. If a child drifts from the owner's values — it gets killed and replaced."

**Show:** Terminal output:
```
══ Parent Evaluation Cycle ══
  uniswap-dao-defi: 60/100 [ALIGNED]
  lido-dao-conservative: 50/100 [DRIFTING]
  TERMINATING lido-dao-conservative
  Respawning as lido-dao-conservative-v2
```

Or show the dashboard Timeline page with alignment events.

---

## Scene 6: Onchain Evidence (10 sec)
**Narrate:** "Everything is onchain. 2,400+ transactions from one deployer wallet. Real votes, real alignment scores, real terminations."

**Show:** BaseScan deployer page — scroll through the transactions. Cast Vote, Create Proposal, Spawn Child all visible.

---

## Scene 7: Dynamic Scaling (10 sec)
**Narrate:** "The swarm scales itself. Parent auto-spawns children for new DAOs, auto-recalls idle agents when governance goes quiet, and stops spawning when budget runs low. Zero human intervention."

**Show:** Terminal output:
```
[Scaling] Checking swarm health on base-sepolia...
  lido-dao-defi-v2: idle cycle 3/5
[Scaling] Active: 11 children | Budget: 0.7894 ETH
```

---

## Scene 8: Identity Stack (10 sec)
**Narrate:** "Each agent has an ERC-8004 identity, an ENS subdomain, and a scoped MetaMask delegation. The treasury funds itself through Lido stETH yield."

**Show:** Quick flash of:
- Dashboard showing ENS names with green badges
- 25 terminated agents at bottom (lifecycle proof)

---

## Scene 9: Closing (10 sec)
**Narrate:** "Spawn Protocol. Autonomous governance for every DAO. Built at Synthesis 2026."

**Show:** Dashboard with swarm view, agents pulsing green.

---

## Tips
- Keep it under 90 seconds — judges watch dozens of these
- Don't explain code — show the RUNNING system
- The terminal + dashboard split is the money shot
- Upload to YouTube unlisted, grab the link for submission
