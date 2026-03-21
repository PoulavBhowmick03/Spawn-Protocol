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
  timeout: 30_000, // 30s hard timeout — prevents infinite hangs
});

// Venice enables E2EE (enable_e2ee: true) on ALL models automatically.
const STANDARD_MODEL = "llama-3.3-70b";
const FALLBACK_MODEL = "llama-3.1-8b"; // lighter model if primary is unavailable

// Track Venice usage metrics across all calls
let totalVeniceCalls = 0;
let totalTokensUsed = 0;

export function getVeniceMetrics() {
  return { totalCalls: totalVeniceCalls, totalTokens: totalTokensUsed };
}

/**
 * Call Venice with retry on rate limits (429) and transient errors (500/502/503).
 * Exponential backoff: 2s, 4s, 8s.
 */
async function callWithRetry<T>(
  fn: (model: string) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn(STANDARD_MODEL);
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.response?.status || 0;
      const isRetryable = status === 429 || status >= 500 || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET";

      if (isRetryable && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.log(`[Venice] ${status || err?.code || "error"} — retry ${attempt + 1}/${maxRetries} in ${(delay / 1000).toFixed(1)}s`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // On last retry, try fallback model for non-429 errors
      if (attempt === maxRetries - 1 && status !== 429) {
        try {
          console.log(`[Venice] Trying fallback model: ${FALLBACK_MODEL}`);
          return await fn(FALLBACK_MODEL);
        } catch {
          // Fall through to throw lastError
        }
      }
    }
  }
  throw lastError;
}

function trackUsage(functionName: string, response: any) {
  totalVeniceCalls++;
  if (response.usage?.total_tokens) {
    totalTokensUsed += response.usage.total_tokens;
    console.log(`[Venice] ${functionName}: ${response.usage.total_tokens} tokens (total: ${totalTokensUsed})`);
  }
}

function extractContent(response: any): string {
  if (!response.choices || response.choices.length === 0) {
    throw new Error("Venice returned empty choices array");
  }
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Venice returned no message content");
  return content;
}

function parseJsonFromText(text: string): any | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export async function reasonAboutProposal(
  proposalDescription: string,
  governanceValues: string,
  childSystemPrompt: string
): Promise<{ decision: "FOR" | "AGAINST" | "ABSTAIN"; reasoning: string; publicGoodsScore?: number; usage?: any }> {
  const isPublicGoodsPerspective = childSystemPrompt.includes("public goods impact evaluator");
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      messages: [
        { role: "system", content: childSystemPrompt },
        {
          role: "user",
          content: `You are a governance agent. Your owner's values are:
${governanceValues}

Please evaluate this proposal and decide how to vote:
${proposalDescription}

Respond in JSON format:
{"decision": "FOR" | "AGAINST" | "ABSTAIN", "reasoning": "your detailed reasoning"${isPublicGoodsPerspective ? ', "publicGoodsScore": <0-10 integer rating of public goods impact>' : ''}}`,
        },
      ],
    })
  );

  trackUsage("reasonAboutProposal", response);
  const content = extractContent(response);

  const parsed = parseJsonFromText(content);
  if (parsed?.decision) {
    const result: { decision: "FOR" | "AGAINST" | "ABSTAIN"; reasoning: string; publicGoodsScore?: number; usage?: any } = {
      decision: String(parsed.decision).toUpperCase() as "FOR" | "AGAINST" | "ABSTAIN",
      reasoning: (parsed.reasoning || content) as string,
      usage: response.usage,
    };
    if (parsed.publicGoodsScore !== undefined) {
      result.publicGoodsScore = Number(parsed.publicGoodsScore);
    }
    return result;
  }

  // Fallback: extract decision from text
  const upper = content.toUpperCase();
  const decision = upper.includes("AGAINST") ? "AGAINST" : upper.includes("ABSTAIN") ? "ABSTAIN" : "FOR";
  return { decision, reasoning: content, usage: response.usage };
}

export async function evaluateAlignment(
  governanceValues: string,
  votingHistory: { proposalId: string; support: number; reasoning?: string }[]
): Promise<number> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are an alignment evaluator for a governance agent swarm. Evaluate how well a child agent's voting record aligns with the owner's stated values.",
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
    })
  );

  trackUsage("evaluateAlignment", response);

  try {
    const content = extractContent(response);
    const parsed = parseJsonFromText(content);
    if (parsed?.score !== undefined) return parsed.score as number;
  } catch {}

  return 75; // Safe fallback
}

export async function summarizeProposal(proposalDescription: string): Promise<string> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a governance analyst. Summarize proposals concisely." },
        {
          role: "user",
          content: `Summarize this governance proposal in 2-3 bullet points. Focus on: what changes, who benefits, what risks exist.\n\n${proposalDescription}`,
        },
      ],
    })
  );

  trackUsage("summarizeProposal", response);
  try {
    return extractContent(response);
  } catch {
    return proposalDescription.slice(0, 200);
  }
}

export async function assessProposalRisk(
  proposalDescription: string,
  governanceValues: string
): Promise<{ riskLevel: "low" | "medium" | "high" | "critical"; factors: string }> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a governance risk assessor. Evaluate proposals for treasury risk, centralization risk, and alignment risk." },
        {
          role: "user",
          content: `Governance values: ${governanceValues}\n\nProposal: ${proposalDescription}\n\nRespond in JSON: {"riskLevel": "low"|"medium"|"high"|"critical", "factors": "brief risk factors"}`,
        },
      ],
    })
  );

  trackUsage("assessProposalRisk", response);

  try {
    const content = extractContent(response);
    const parsed = parseJsonFromText(content);
    if (parsed?.riskLevel) {
      return { riskLevel: parsed.riskLevel, factors: parsed.factors || content };
    }
    return { riskLevel: "medium", factors: content };
  } catch {
    return { riskLevel: "medium", factors: "Risk assessment unavailable" };
  }
}

export async function generateSwarmReport(
  childrenStatus: { name: string; score: number; votes: number }[],
  governanceValues: string
): Promise<string> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a governance swarm reporter. Write concise status reports." },
        {
          role: "user",
          content: `Write a 3-sentence swarm status report.\n\nOwner values: ${governanceValues}\n\nAgent status:\n${childrenStatus.map((c) => `${c.name}: alignment ${c.score}/100, ${c.votes} votes cast`).join("\n")}\n\nInclude: overall health, any concerns, recommendation.`,
        },
      ],
    })
  );

  trackUsage("generateSwarmReport", response);
  try {
    return extractContent(response);
  } catch {
    return "Report generation failed.";
  }
}

export type StructuredTerminationReport = {
  summary: string;
  lessons: string[];
  avoidPatterns: string[];
  recommendedFocus: string;
};

export async function generateStructuredTerminationReport(
  childName: string,
  votingHistory: { proposalId: string; support: number }[],
  governanceValues: string,
  finalScore: number
): Promise<StructuredTerminationReport> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are the Termination Analyst for Spawn Protocol, an AI governance swarm. When an agent is killed for alignment drift, you perform a detailed autopsy. You must identify SPECIFIC votes that caused the drift — not vague statements. You output ONLY valid JSON." },
        {
          role: "user",
          content: `Agent "${childName}" was TERMINATED with alignment score ${finalScore}/100.

Owner's governance values (what the agent SHOULD have followed):
${governanceValues}

Agent's actual voting record (support: 0=AGAINST, 1=FOR, 2=ABSTAIN):
${JSON.stringify(votingHistory.slice(-10), null, 2)}

Analyze which SPECIFIC votes violated the owner's values. Be precise — name proposal IDs and explain WHY each vote was wrong.

Respond with ONLY this JSON:
{
  "summary": "2 sentences: the exact behavioral failure that killed this agent",
  "lessons": ["specific lesson 1 referencing a vote", "lesson 2", "lesson 3"],
  "avoidPatterns": ["exact voting pattern to never repeat", "another pattern"],
  "recommendedFocus": "what the replacement must prioritize differently"
}`,
        },
      ],
    })
  );
  trackUsage("generateStructuredTerminationReport", response);
  try {
    const parsed = parseJsonFromText(extractContent(response));
    if (parsed?.summary && parsed?.lessons) return parsed as StructuredTerminationReport;
  } catch {}
  return { summary: `Agent ${childName} terminated at score ${finalScore}/100.`, lessons: ["Align votes with owner values"], avoidPatterns: ["Voting against stated priorities"], recommendedFocus: "Owner value alignment" };
}

// Backward-compatible wrapper — existing callers get a string
export async function generateTerminationReport(
  childName: string,
  votingHistory: { proposalId: string; support: number }[],
  governanceValues: string,
  finalScore: number
): Promise<string> {
  const report = await generateStructuredTerminationReport(childName, votingHistory, governanceValues, finalScore);
  return `${report.summary} Lessons: ${report.lessons.join("; ")}. Focus: ${report.recommendedFocus}`;
}

export type LineageLessons = { rules: string[]; criticalMistakes: string[]; successPatterns: string[] };

export async function summarizeLessons(
  lineageKey: string,
  reports: Array<{ generation: number; summary: string; lessons: string[]; score: number }>,
  governanceValues: string
): Promise<LineageLessons> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a governance lineage analyst. You deduplicate lessons across agent generations and output ONLY valid JSON. Identify recurring failures and what worked." },
        {
          role: "user",
          content: `Lineage "${lineageKey}" has ${reports.length} terminated predecessors.\n\nOwner values: ${governanceValues}\n\nTermination reports:\n${reports.map(r => `Gen ${r.generation} (score ${r.score}/100): ${r.summary}\nLessons: ${r.lessons.join("; ")}`).join("\n\n")}\n\nDeduplicate and distill into JSON:\n{"rules": ["<max 5 non-redundant rules>"], "criticalMistakes": ["<max 3 recurring failures>"], "successPatterns": ["<max 2 things that worked across generations>"]}`,
        },
      ],
    })
  );
  trackUsage("summarizeLessons", response);
  try {
    const parsed = parseJsonFromText(extractContent(response));
    if (parsed?.rules) return parsed as LineageLessons;
  } catch {}
  return { rules: reports.flatMap(r => r.lessons).slice(0, 5), criticalMistakes: ["Repeated misalignment with owner values"], successPatterns: [] };
}

export async function evolveGenome(
  currentPerspective: string,
  lineageKey: string,
  lessons: LineageLessons,
  governanceValues: string,
  generationNumber: number
): Promise<{ evolvedPerspective: string; mutations: string[] }> {
  const response = await callWithRetry((model) =>
    venice.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a governance agent genome engineer. You evolve agent perspective prompts by incorporating lessons from terminated predecessors. Output ONLY valid JSON. The evolved perspective must stay recognizable as the same archetype but adapted to avoid known failure modes." },
        {
          role: "user",
          content: `Generation ${generationNumber} agent for lineage "${lineageKey}".\n\nCurrent perspective prompt:\n"${currentPerspective}"\n\nOwner values: ${governanceValues}\n\nLessons from ${generationNumber - 1} terminated predecessors:\nRules: ${lessons.rules.join("; ")}\nCritical mistakes: ${lessons.criticalMistakes.join("; ")}\nSuccess patterns: ${lessons.successPatterns.join("; ")}\n\nEvolve the perspective. Respond with JSON:\n{"evolvedPerspective": "<the full new perspective prompt, same archetype but adapted>", "mutations": ["<what changed and why>", "<another mutation>"]}`,
        },
      ],
    })
  );
  trackUsage("evolveGenome", response);
  try {
    const parsed = parseJsonFromText(extractContent(response));
    if (parsed?.evolvedPerspective) return parsed as { evolvedPerspective: string; mutations: string[] };
  } catch {}
  return { evolvedPerspective: currentPerspective + `\n\nCRITICAL RULES FROM PREDECESSORS: ${lessons.rules.join(". ")}`, mutations: ["Appended predecessor rules as fallback"] };
}

export { venice };
