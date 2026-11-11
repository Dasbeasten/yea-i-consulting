// Background worker for the "Where's the time going?" workflow diagnostic.
// The file name ends in -background, so Netlify runs it asynchronously and
// returns 202 to the browser straight away.
//
// What it does, in order:
//   1. Stores the raw submission in Netlify Blobs as a durable record.
//   2. Emails the client a short, rule-based acknowledgement.
//   3. Emails Justin the advisor briefing.
//
// Both emails are built from fixed lines in netlify/lib/workflow-rules.mjs.
// There is no AI call: the client email goes out before Justin has read the
// answers, so it only ever says things that are true for every business.
//
// Pure ASCII on purpose, for the check-dashes.mjs build gate.

import { getStore } from "@netlify/blobs";
import {
  HOURS, WHO, FLOW, BLOCKERS, SYSTEMS, AI_USE, APPETITE, OPENING_QUESTIONS,
  cleanAnswers, cleanContact, hoursRange, roughCost, breakingLines,
  clientPrompts, nextStepLine, leadRating, flags,
} from "../lib/workflow-rules.mjs";

const CAL_URL = "https://calendly.com/justin-yea-i/30min?min_notice=4320";
const FROM = "Yea I Consulting <justin@yea-i.com>";
const ADVISOR_TO = "justin@yea-i.com";
const RULE = "----------------------------------------";

// Belt and braces: strip characters the brand never uses from anything the
// client typed before it goes into an email.
function sanitise(s) {
  return String(s || "")
    .replace(/[\u2014\u2015]/g, ", ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

function firstWords(s, n) {
  const words = String(s || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "..." : "");
}

function validEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function list(keys, map) {
  if (!keys || !keys.length) return "None selected";
  return keys.map((k) => (typeof map[k] === "string" ? map[k] : map[k].label)).join(", ");
}

function label(key, map) {
  if (!key || !map[key]) return "Not answered";
  return typeof map[key] === "string" ? map[key] : map[key].label;
}

export function buildClientEmail(c, a) {
  const firstName = (c.name.split(" ")[0] || c.name || "there").trim();
  const r = hoursRange(a.hours);
  const lines = breakingLines(a.flow);
  const prompts = clientPrompts(a);

  let body = "Hi " + firstName + ",\n\n";
  body += "Thanks for doing the diagnostic. The task you picked was: \"" + sanitise(a.task) + "\"\n\n";
  body += (r.min === null ? r.line : "On your estimate, that's " + r.phrase + ".") + "\n\n";
  if (lines.length) body += lines.join(" ") + "\n\n";
  body += "I'll read through your answers and come back to you within one working day with a few ideas for this task.\n\n";
  if (prompts.length) {
    body += "A couple of things worth checking before we speak:\n\n";
    body += prompts.map((p) => "- " + p).join("\n") + "\n\n";
  }
  body += nextStepLine(a.appetite) + "\n\n";
  body += CAL_URL + "\n\n";
  body += "Best,\nJustin";

  return {
    subject: "Your diagnostic: " + sanitise(firstWords(a.task, 6)),
    text: body,
  };
}

export function buildAdvisorEmail(c, a) {
  const rating = leadRating(a);
  const r = hoursRange(a.hours);
  const f = flags(a);

  let b = "LEAD RATING: " + rating.toUpperCase() + "\n\n";
  b += "THE TASK\n" + sanitise(a.task) + "\n";
  if (a.taskWho) b += "Who and how often: " + sanitise(a.taskWho) + "\n";
  b += "\nSIZE\n" + label(a.hours, HOURS) + " a week" + (r.min === null ? "" : ", " + r.phrase) + "\n\n";
  b += "ROUGH COST OF THAT TIME\n" + roughCost(a.hours, a.who) + "\n\n";
  b += "WHO DOES IT\n" + label(a.who, WHO) + "\n\n";
  b += "WHERE IT BREAKS\n" + list(a.flow, FLOW) + "\n\n";
  b += "WHAT'S STOPPED THEM\n" + list(a.blockers, BLOCKERS) + "\n\n";
  b += "SYSTEMS\n" + list(a.systems, SYSTEMS) + (a.systemsNote ? "\nNamed: " + sanitise(a.systemsNote) : "") + "\n\n";
  b += "AI USE TODAY\n" + label(a.aiUse, AI_USE) + "\n\n";
  b += "APPETITE (NEXT THREE MONTHS)\n" + label(a.appetite, APPETITE) + "\n\n";
  b += "WHERE THEY LOSE TIME\n" + (a.timeLoss.length ? a.timeLoss.join(", ") : "None selected") + "\n\n";
  b += "BUSINESS\n" + (a.sector || "Sector not given") + ", " + (a.size || "size not given") + "\n";
  b += "Website: " + (c.website || "not given") + "\n\n";
  b += "FLAGS\n" + (f.length ? f.map((x) => "- " + x).join("\n") : "None") + "\n\n";
  b += "OPENING QUESTIONS\n" + OPENING_QUESTIONS.map((q, i) => (i + 1) + ". " + q).join("\n") + "\n\n";
  b += RULE + "\nRESPONDENT\n" + [c.name, c.role, c.company, c.email].join(" / ") + "\n";

  return {
    subject: "[" + rating + "] New diagnostic: " + (c.name || "Unknown") + " at " + (c.company || "Unknown"),
    text: b,
  };
}

async function sendEmail(resendKey, { to, subject, text }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: ADVISOR_TO, subject, text }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: String((err && err.message) || err) } };
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const c = cleanContact(body.contact);
  const a = cleanAnswers(body.answers);
  const result = { blob: "pending", clientEmail: "pending", advisorEmail: "pending" };

  // 1. Store the submission as a durable record.
  try {
    const store = getStore("submissions");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const id = globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const key = (ts + "-" + c.name + "-" + c.company + "-" + id).replace(/\s+/g, "-").substring(0, 200);
    await store.setJSON(key, {
      version: "workflow-v1",
      contact: c,
      answers: a,
      leadRating: leadRating(a),
      submittedAt: new Date().toISOString(),
    });
    result.blob = "stored:" + key;
  } catch (err) {
    result.blob = "failed:" + String((err && err.message) || err);
  }

  const resendKey = process.env.RESEND_API_KEY;

  // 2. Client acknowledgement.
  if (!resendKey) result.clientEmail = "skipped:no-resend-key";
  else if (!validEmail(c.email)) result.clientEmail = "skipped:no-address";
  else if (!a.task) result.clientEmail = "skipped:no-task";
  else {
    const m = buildClientEmail(c, a);
    const r = await sendEmail(resendKey, { to: c.email, subject: m.subject, text: m.text });
    result.clientEmail = r.ok ? "sent" : "failed:" + r.status + ":" + JSON.stringify(r.data).slice(0, 300);
  }

  // 3. Advisor briefing. Sent even if the client email was skipped.
  if (!resendKey) result.advisorEmail = "skipped:no-resend-key";
  else {
    const m = buildAdvisorEmail(c, a);
    const r = await sendEmail(resendKey, { to: ADVISOR_TO, subject: m.subject, text: m.text });
    result.advisorEmail = r.ok ? "sent" : "failed:" + r.status + ":" + JSON.stringify(r.data).slice(0, 300);
  }

  return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
};
