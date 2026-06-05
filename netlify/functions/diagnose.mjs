// AI Readiness Diagnostic — server-side proxy.
// The Anthropic key is read from the ANTHROPIC_API_KEY environment variable, so it
// never appears in the browser. The prompt is built here, which means this endpoint
// can only produce the diagnostic briefing — it can't be used as a general LLM proxy.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;

function buildPrompt({ name, company, role, summary }) {
  return `You are a senior AI strategy consultant preparing a detailed advisor briefing note before responding to a prospective client who has just completed an AI readiness diagnostic.

RESPONDENT: ${name}, ${role} at ${company}

THEIR RESPONSES:
${summary}

Write a thorough, specific, actionable advisor briefing using this exact structure:

## MATURITY TIER
Assign one of: Unaware / Exploring / Developing / Scaling / Leading
2–3 sentences explaining exactly why, referencing specific things they said.

## OVERALL READINESS SCORE: X/10
One clear sentence of rationale.

## DIMENSION SCORES
Score each dimension out of 5 based on their actual answers. Add one sentence of honest commentary per dimension.
- Strategy & Leadership: X/5 — [comment]
- Data & Infrastructure: X/5 — [comment]
- People & Skills: X/5 — [comment]
- Tools & Technology: X/5 — [comment]
- Process & Operations: X/5 — [comment]
- Culture & Risk: X/5 — [comment]

## KEY OBSERVATIONS
4–5 specific, honest observations. Reference what they actually said. Avoid generalities — this should feel like you've genuinely read their responses.

## RECOMMENDED ROADMAP

**Phase 1 — Quick Wins (0–90 days)**
3–4 concrete actions. Be specific about which tools, who should own each one, and what a realistic outcome looks like.

**Phase 2 — Build Capability (3–9 months)**
3–4 actions focused on building the foundations and scaling what's worked.

**Phase 3 — Embed & Scale (9–18 months)**
3 actions focused on making AI a lasting competitive advantage for this specific business.

## WATCH POINTS
2–3 specific risks or cautions based on their blockers, leadership attitude, sector context or concerns raised.

## SUGGESTED OPENING FOR YOUR REPLY EMAIL
2–3 sentences the advisor can use to open their response — warm, personal, referencing something specific from the diagnostic. Ready to use as-is or adapt.

Tone throughout: direct, warm, zero jargon. This is a private briefing note — write as if you're a knowledgeable colleague who has just reviewed the form and wants to give the advisor a genuinely useful steer before they reply.`;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const name = String(body.name || "").slice(0, 120);
  const company = String(body.company || "").slice(0, 120);
  const role = String(body.role || "").slice(0, 120);
  const summary = String(body.summary || "").slice(0, 8000);
  if (!summary) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing responses" }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: buildPrompt({ name, company, role, summary }) }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data?.error?.message || "Anthropic request failed" }) };
    }

    const text = (data.content || []).map((b) => b.text || "").join("") || "Unable to generate diagnosis.";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Upstream error" }) };
  }
};
