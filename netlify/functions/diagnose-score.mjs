// Fast score endpoint for the AI Readiness Diagnostic.
// Returns ONLY the maturity tier, overall score, and six dimension scores,
// in the exact text shape the page's parseScores() already reads. Output is
// tiny, so this returns in a few seconds and renders the on-screen result
// well inside Netlify's 60 second synchronous limit. The full written
// briefing and the two emails are handled separately by the background
// function, so nothing here waits on a long generation.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 400;

function buildScorePrompt({ name, company, role, summary }) {
  return `You are a senior AI strategy consultant scoring an AI readiness diagnostic. Read the responses and assess the business.

RESPONDENT: ${name}, ${role} at ${company}

THEIR RESPONSES:
${summary}

Output ONLY the block below. No preamble, no commentary, no extra lines. Fill in a maturity tier, an overall score out of 10, and a score out of 5 for each dimension, based strictly on what they said. Keep the labels and the "/10" and "/5" formatting exactly as shown.

MATURITY TIER: [one of: Unaware, Exploring, Developing, Scaling, Leading]

OVERALL READINESS SCORE: X/10

DIMENSION SCORES
Strategy & Leadership: X/5
Data & Infrastructure: X/5
People & Skills: X/5
Tools & Technology: X/5
Process & Operations: X/5
Culture & Risk: X/5`;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Server is missing ANTHROPIC_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = String(body.name || "").slice(0, 120);
  const company = String(body.company || "").slice(0, 120);
  const role = String(body.role || "").slice(0, 120);
  const summary = String(body.summary || "").slice(0, 8000);
  if (!summary) {
    return new Response(JSON.stringify({ error: "Missing responses" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: buildScorePrompt({ name, company, role, summary }) }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || "Anthropic request failed" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = (data.content || []).map((b) => b.text || "").join("") || "";
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
