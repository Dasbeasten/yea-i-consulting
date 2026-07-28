// Background worker for the AI Readiness Diagnostic.
// The file name ends in -background, so Netlify runs it asynchronously with a
// long time limit and returns 202 to the browser straight away. Nothing here
// blocks the on-screen result, which is handled by diagnose-score.mjs.
//
// What it does, in order:
//   1. Stores the raw submission in Netlify Blobs as a durable record.
//   2. Makes one Anthropic call that returns two delimited pieces: a warm
//      client summary for the respondent, and the internal advisor briefing.
//   3. Emails the client their summary and emails Justin the briefing, both
//      through Resend from the verified yea-i.com domain.
//
// The file is pure ASCII on purpose. The build gate (check-dashes.mjs) scans
// .mjs files and fails on em dashes and curly quotes, so the banned characters
// only ever appear here as \u escapes inside the sanitise function.

import { getStore } from "@netlify/blobs";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;
const CAL_URL = "https://calendly.com/justin-yea-i/30min?min_notice=4320";
const FROM = "Yea I Consulting <justin@yea-i.com>";
const ADVISOR_TO = "justin@yea-i.com";

// Strip characters the brand never uses, in case the model slips them in.
// Written as escapes so this file itself stays clean for the build gate.
function sanitise(s) {
  return String(s || "")
    .replace(/[\u2014\u2015]/g, ", ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/ +,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
}

function between(text, start, end) {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i === -1 || j === -1 || j < i) return null;
  return text.slice(i + start.length, j).trim();
}

function buildPrompt({ name, company, role, summary, scores }) {
  const scoreBlock = scores
    ? "USE THESE EXACT SCORES. Do not recalculate them. The maturity tier, the overall score out of 10, and every dimension score out of 5 below are final and must appear unchanged in both pieces:\n" +
      scores +
      "\n\n"
    : "";

  return `You are a senior AI strategy consultant. A prospective client has just completed an AI readiness diagnostic. Produce two pieces of writing in one response, each wrapped in the exact markers shown. Write nothing outside the markers.

RESPONDENT: ${name}, ${role} at ${company}

THEIR RESPONSES:
${summary}

${scoreBlock}Writing rules for both pieces: plain, direct English. Short paragraphs of two or three sentences. No em dashes anywhere; use commas, colons or full stops. Straight quotes only. No marketing cliches. Do not use the words leverage, robust, seamless, crucial, pivotal, actionable, holistic or transformative. Contractions are fine.

FIRST PIECE, wrapped exactly like this:
<<<CLIENT_SUMMARY>>>
A warm, personal summary addressed directly to ${name} by first name. Include, in this order: a one line opening; their maturity tier and what it means for a business like theirs in one or two sentences; their overall readiness score out of 10; the six dimension scores, each on its own line as "Label: X/5"; two short paragraphs on what stands out in their answers and the single most useful place for them to start; a closing that invites them to book a short call. Do not mention internal notes, briefings or scoring rubrics. This goes straight to the client.
<<<END_CLIENT_SUMMARY>>>

SECOND PIECE, wrapped exactly like this:
<<<ADVISOR_BRIEFING>>>
A private briefing note for the advisor, Justin, before he replies. Use this structure:

## MATURITY TIER
The tier, then two or three sentences on why, referencing specific things they said.

## OVERALL READINESS SCORE: X/10
One sentence of rationale.

## DIMENSION SCORES
- Strategy & Leadership: X/5: [one sentence]
- Data & Infrastructure: X/5: [one sentence]
- People & Skills: X/5: [one sentence]
- Tools & Technology: X/5: [one sentence]
- Process & Operations: X/5: [one sentence]
- Culture & Risk: X/5: [one sentence]

## KEY OBSERVATIONS
Four or five specific, honest observations that reference what they actually said.

## RECOMMENDED ROADMAP
Phase 1: Quick Wins (0-90 days). Three or four concrete actions, each with an owner and a realistic outcome.
Phase 2: Build Capability (3-9 months). Three or four actions.
Phase 3: Embed and Scale (9-18 months). Three actions.

## WATCH POINTS
Two or three specific risks based on their blockers, leadership attitude, sector or concerns.

## SUGGESTED OPENING FOR THE REPLY
Two or three sentences Justin can use to open his reply, warm and specific.
<<<END_ADVISOR_BRIEFING>>>`;
}

async function sendEmail(resendKey, { to, subject, text }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        reply_to: ADVISOR_TO,
        subject,
        text,
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: String(err && err.message || err) } };
  }
}

function validEmail(e) {
  return typeof e === "string" && e.includes("@") && e.toLowerCase() !== "unknown";
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
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

  const name = String(body.name || "Unknown").slice(0, 120);
  const company = String(body.company || "Unknown").slice(0, 120);
  const email = String(body.email || "Unknown").slice(0, 160);
  const role = String(body.role || "Unknown").slice(0, 120);
  const summary = String(body.summary || "").slice(0, 8000);
  const responses = String(body.responses || "").slice(0, 12000);
  const scores = body.scores ? String(body.scores).slice(0, 2000) : "";
  const firstName = name.split(" ")[0] || name;

  const result = { blob: "pending", diagnosis: "pending", clientEmail: "pending", advisorEmail: "pending" };

  // 1. Store the submission as a durable record.
  try {
    const store = getStore("submissions");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const key = `${ts}-${name}-${company}-${id}`.replace(/\s+/g, "-").substring(0, 200);
    await store.setJSON(key, {
      name, company, email, role, summary, responses, scores,
      submittedAt: new Date().toISOString(),
    });
    result.blob = "stored:" + key;
  } catch (err) {
    result.blob = "failed:" + String(err && err.message || err);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  // 2. Generate both pieces in one call.
  let clientText = "";
  let advisorText = "";
  if (anthropicKey && summary) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: "user", content: buildPrompt({ name, company, role, summary, scores }) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || ("Anthropic request failed (" + res.status + ")"));
      const full = (data.content || []).map((b) => b.text || "").join("");
      clientText = between(full, "<<<CLIENT_SUMMARY>>>", "<<<END_CLIENT_SUMMARY>>>") || "";
      advisorText = between(full, "<<<ADVISOR_BRIEFING>>>", "<<<END_ADVISOR_BRIEFING>>>") || full;
      result.diagnosis = "ok";
    } catch (err) {
      result.diagnosis = "failed:" + String(err && err.message || err);
    }
  } else {
    result.diagnosis = anthropicKey ? "skipped:no-summary" : "skipped:no-key";
  }

  // Fallback client text if the delimiters were missing or generation failed.
  if (!clientText) {
    clientText =
      "Hi " + firstName + ",\n\n" +
      "Thanks for completing the AI readiness diagnostic.\n\n" +
      (scores ? scores + "\n\n" : "Your detailed scores are being prepared and I will be in touch shortly.\n\n") +
      "If you would like to talk it through, you can book a short call here:\n" + CAL_URL + "\n\n" +
      "Best,\nJustin Yeaman\nYea I Consulting";
  }

  // 3a. Email the client their summary.
  if (!resendKey) {
    result.clientEmail = "skipped:no-resend-key";
  } else if (!validEmail(email)) {
    result.clientEmail = "skipped:no-address";
  } else {
    const r = await sendEmail(resendKey, {
      to: email,
      subject: "Your AI readiness summary",
      text: sanitise(clientText),
    });
    result.clientEmail = r.ok ? "sent" : ("failed:" + r.status + ":" + JSON.stringify(r.data).slice(0, 300));
  }

  // 3b. Email Justin the briefing plus the raw responses.
  if (!resendKey) {
    result.advisorEmail = "skipped:no-resend-key";
  } else {
    const advisorBody =
      sanitise(advisorText) +
      "\n\n----------------------------------------\n" +
      "RESPONDENT\n" +
      name + " / " + role + " / " + company + " / " + email + "\n\n" +
      "RAW RESPONSES\n" +
      responses;
    const r = await sendEmail(resendKey, {
      to: ADVISOR_TO,
      subject: "New diagnostic: " + name + " at " + company,
      text: advisorBody,
    });
    result.advisorEmail = r.ok ? "sent" : ("failed:" + r.status + ":" + JSON.stringify(r.data).slice(0, 300));
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
