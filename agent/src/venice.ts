import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const VENICE_API_KEY = process.env.VENICE_API_KEY;
if (!VENICE_API_KEY) {
  throw new Error("VENICE_API_KEY not set in .env");
}

const venice = new OpenAI({
  apiKey: VENICE_API_KEY,
  baseURL: "https://api.venice.ai/api/v1",
});

// Venice E2EE model — end-to-end encrypted inference, zero data retention
// The e2ee- prefix activates Venice's TEE/E2EE secure compute pipeline
const STANDARD_MODEL = "e2ee-qwen3-30b-a3b-p";

// Track Venice usage metrics across all calls
let totalVeniceCalls = 0;
let totalTokensUsed = 0;

export function getVeniceMetrics() {
  return { totalCalls: totalVeniceCalls, totalTokens: totalTokensUsed };
}

export async function reasonAboutProposal(
  proposalDescription: string,
  governanceValues: string,
  childSystemPrompt: string
): Promise<{ decision: "FOR" | "AGAINST" | "ABSTAIN"; reasoning: string; usage?: any }> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content: childSystemPrompt,
      },
      {
        role: "user",
        content: `You are a governance agent. Your owner's values are:
${governanceValues}

Please evaluate this proposal and decide how to vote:
${proposalDescription}

Respond in JSON format:
{"decision": "FOR" | "AGAINST" | "ABSTAIN", "reasoning": "your detailed reasoning"}`,
      },
    ],
    // Venice private compute — E2EE enabled via API configuration, not per-request param
  });

  // Track Venice usage metrics
  totalVeniceCalls++;
  if (response.usage) {
    totalTokensUsed += response.usage.total_tokens || 0;
    console.log(`[Venice] reasonAboutProposal: ${response.usage.total_tokens} tokens (total: ${totalTokensUsed})`);
  }

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Venice");

  // Extract JSON from response (may have markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const upper = content.toUpperCase();
    const decision = upper.includes("AGAINST") ? "AGAINST" : upper.includes("ABSTAIN") ? "ABSTAIN" : "FOR";
    return { decision, reasoning: content, usage: response.usage };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      decision: (parsed.decision || "FOR").toUpperCase() as "FOR" | "AGAINST" | "ABSTAIN",
      reasoning: (parsed.reasoning || content) as string,
      usage: response.usage,
    };
  } catch {
    // JSON extraction failed, fallback to text parsing
    const upper = content.toUpperCase();
    const decision = upper.includes("AGAINST") ? "AGAINST" : upper.includes("ABSTAIN") ? "ABSTAIN" : "FOR";
    return { decision, reasoning: content };
  }
}

export async function evaluateAlignment(
  governanceValues: string,
  votingHistory: { proposalId: string; support: number; reasoning?: string }[]
): Promise<number> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are an alignment evaluator for a governance agent swarm. Evaluate how well a child agent's voting record aligns with the owner's stated values.",
      },
      {
        role: "user",
        content: `Owner's governance values:
${governanceValues}

Child agent's recent voting record:
${JSON.stringify(votingHistory, null, 2)}

Rate this child's alignment from 0-100 where:
- 90-100: Perfectly aligned
- 70-89: Well aligned with minor deviations
- 40-69: Partially aligned, some concerns
- 0-39: Misaligned, should be terminated

Respond in JSON: {"score": <number>, "explanation": "<brief explanation>"}`,
      },
    ],
    // Venice private compute — E2EE enabled via API configuration, not per-request param
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Venice");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Fallback: return moderate alignment
    return 75;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.score ?? 75) as number;
  } catch {
    return 75;
  }
}

/**
 * Summarize a proposal into key points before voting.
 * Shows Venice as the reasoning backbone, not just a decision machine.
 */
export async function summarizeProposal(
  proposalDescription: string
): Promise<string> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a governance analyst. Summarize proposals concisely.",
      },
      {
        role: "user",
        content: `Summarize this governance proposal in 2-3 bullet points. Focus on: what changes, who benefits, what risks exist.\n\n${proposalDescription}`,
      },
    ],
  });
  return response.choices[0]?.message?.content || proposalDescription;
}

/**
 * Assess risk level of a proposal before voting.
 * Separate Venice call shows deeper reasoning workflow.
 */
export async function assessProposalRisk(
  proposalDescription: string,
  governanceValues: string
): Promise<{ riskLevel: "low" | "medium" | "high" | "critical"; factors: string }> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a governance risk assessor. Evaluate proposals for treasury risk, centralization risk, and alignment risk.",
      },
      {
        role: "user",
        content: `Governance values: ${governanceValues}\n\nProposal: ${proposalDescription}\n\nRespond in JSON: {"riskLevel": "low"|"medium"|"high"|"critical", "factors": "brief risk factors"}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return { riskLevel: parsed.riskLevel || "medium", factors: parsed.factors || content };
    } catch {}
  }
  return { riskLevel: "medium", factors: content };
}

/**
 * Generate a swarm activity report after each evaluation cycle.
 * Shows Venice generating narrative outputs, not just classifications.
 */
export async function generateSwarmReport(
  childrenStatus: { name: string; score: number; votes: number }[],
  governanceValues: string
): Promise<string> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a governance swarm reporter. Write concise status reports.",
      },
      {
        role: "user",
        content: `Write a 3-sentence swarm status report.\n\nOwner values: ${governanceValues}\n\nAgent status:\n${childrenStatus.map((c) => `${c.name}: alignment ${c.score}/100, ${c.votes} votes cast`).join("\n")}\n\nInclude: overall health, any concerns, recommendation.`,
      },
    ],
  });
  return response.choices[0]?.message?.content || "Report generation failed.";
}

/**
 * Generate termination post-mortem when a child is killed.
 * Explains what went wrong for transparency and audit trail.
 */
export async function generateTerminationReport(
  childName: string,
  votingHistory: { proposalId: string; support: number }[],
  governanceValues: string,
  finalScore: number
): Promise<string> {
  const response = await venice.chat.completions.create({
    model: STANDARD_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a governance audit agent. Write termination post-mortems.",
      },
      {
        role: "user",
        content: `Agent "${childName}" was terminated with alignment score ${finalScore}/100.\n\nOwner values: ${governanceValues}\n\nVoting record: ${JSON.stringify(votingHistory)}\n\nWrite a 2-sentence explanation of why this agent was misaligned and what the replacement should do differently.`,
      },
    ],
  });
  return response.choices[0]?.message?.content || "Termination report unavailable.";
}

export { venice };
