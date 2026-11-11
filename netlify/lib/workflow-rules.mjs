// Shared rules for the "Where's the time going?" workflow diagnostic.
// Used by diagnose-score.mjs (on-screen result) and
// diagnostic-submit-background.mjs (client email and advisor briefing), so the
// page and both emails always say the same thing.
//
// Everything here is rule-based on purpose. The first email goes out before
// Justin has seen the answers, so no generated prose is used anywhere.
//
// Pure ASCII on purpose: the build gate (check-dashes.mjs) fails on em dashes
// and curly quotes, and the pound sign is written as an escape.

const GBP = "\u00a3";
const WEEKS_PER_YEAR = 46;

// Q4: hours a week on the task. min and max are weekly hours; max null = open.
export const HOURS = {
  h_lt2:     { label: "Under 2 hours",      min: 0,  max: 2 },
  h_2_5:     { label: "2 to 5 hours",       min: 2,  max: 5 },
  h_5_15:    { label: "5 to 15 hours",      min: 5,  max: 15 },
  h_15_40:   { label: "15 to 40 hours",     min: 15, max: 40 },
  h_40p:     { label: "More than 40 hours", min: 40, max: null },
  h_unknown: { label: "Honestly, no idea",  min: null, max: null },
};

// Q5: who does it, with the hourly rate used for the rough cost in the briefing.
export const WHO = {
  w_owner:      { label: "Owner or director",                rate: 100 },
  w_manager:    { label: "Managers or team leads",           rate: 30 },
  w_admin:      { label: "Admin, office or operations staff", rate: 20 },
  w_specialist: { label: "Specialists",                       rate: 40 },
  w_everyone:   { label: "Spread across everyone",           rate: 30 },
};

// Q6: how information moves. Order here is the order lines are shown in.
export const FLOW = {
  f_typed:   { label: "Typed in from emails, forms or PDFs",
               line: "Details are being retyped from documents. Reading emails, forms and PDFs and pulling out the details is something current AI tools do well." },
  f_copied:  { label: "Copied between spreadsheets or systems",
               line: "The same information lives in more than one place. That's often fixed by connecting the systems, sometimes without AI at all." },
  f_chasing: { label: "People chasing each other",
               line: "Time goes on chasing people for missing pieces. Automatic reminders and one place to submit things usually cut this down." },
  f_checked: { label: "Checked by hand",
               line: "Someone checks for mistakes by hand. AI can do a first pass and flag what looks wrong, so the person only checks the exceptions." },
  f_paper:   { label: "Printed, signed or scanned",
               line: "There's paper in the process. Digital forms and e-signatures usually come first, before AI comes into it." },
  f_auto:    { label: "Mostly automatic, but slow or unreliable",
               line: "Something's already in place but not working well. That usually means fixing what's there before adding anything new." },
};

export const BLOCKERS = {
  b_time:        "Nobody's had time to look at it",
  b_unknown:     "We don't know what's possible",
  b_tried:       "We tried a tool and it didn't stick",
  b_cost:        "Cost, or not sure it's worth it",
  b_messy:       "Our data or systems are too messy",
  b_comfortable: "The team's comfortable with how it works now",
  b_security:    "Worried about data security or client confidentiality",
  b_putup:       "Honestly, we've just put up with it",
};

export const SYSTEMS = {
  s_m365:     "Microsoft 365",
  s_google:   "Google Workspace",
  s_accounts: "Accounting software",
  s_crm:      "CRM",
  s_pm:       "Project or job management",
  s_industry: "Industry software",
  s_ecom:     "E-commerce",
  s_sheets:   "Mostly spreadsheets and email",
};

export const AI_USE = {
  a_none:    "Not at all, as far as I know",
  a_free:    "A few people use free tools on their own",
  a_paid:    "We pay for some licences",
  a_builtin: "It's built into software we already use",
  a_core:    "It's part of at least one core process",
};

export const APPETITE = {
  p_existing: { label: "Make better use of what we already pay for",
                next: "If you'd like to talk it through, the call would focus on what you can do with the tools you already have." },
  p_small:    { label: "Spend a small amount",
                next: "If you'd like to talk it through, we'd look at the tools you have and one or two low-cost options worth trying." },
  p_project:  { label: "Fund a proper project",
                next: "If you'd like to talk it through, we'd look at whether this justifies a proper project and what a sensible first step would be." },
  p_none:     { label: "Nothing yet",
                next: "No pressure to do anything. If you'd like to talk it through, the link's below, and if not, the ideas above are yours to use." },
};

// Client email prompts, in priority order. Each test gets the answers object.
const PROMPTS = [
  { test: (a) => has(a.systems, "s_m365"),
    text: "Check which Microsoft 365 plan you're on. Some AI features come with business plans and others are a paid add-on, so it's worth knowing what you already have." },
  { test: (a) => has(a.systems, "s_google"),
    text: "Check which Google Workspace plan you're on, as some include Gemini features at no extra cost." },
  { test: (a) => a.aiUse === "a_free",
    text: "Find out which AI tools people are using and what they're putting into them. Free versions may use what you type to improve their models, which matters if client information goes in." },
  { test: (a) => has(a.systems, "s_sheets"),
    text: "Have the spreadsheets involved in this task to hand for the call. Seeing the real thing saves a lot of explaining." },
  { test: (a) => has(a.blockers, "b_tried"),
    text: "Make a note of what you tried and why it didn't stick. That's often the most useful thing you can tell me." },
];

function has(list, key) {
  return Array.isArray(list) && list.includes(key);
}

function fmtNum(n) {
  return Math.round(n).toLocaleString("en-GB");
}

function roundTo(n, step) {
  return Math.round(n / step) * step;
}

// Annual hours, as numbers and as the line shown to the client.
export function hoursRange(hoursKey) {
  const h = HOURS[hoursKey];
  if (!h || h.min === null) {
    return { min: null, max: null, line: "You weren't sure how long it takes, which is common. We'll work it out together." };
  }
  const min = roundTo(h.min * WEEKS_PER_YEAR, 10);
  const max = h.max === null ? null : roundTo(h.max * WEEKS_PER_YEAR, 10);
  let phrase;
  if (h.min === 0) phrase = "up to around " + fmtNum(max) + " hours a year";
  else if (max === null) phrase = "more than " + fmtNum(min) + " hours a year";
  else phrase = "around " + fmtNum(min) + " to " + fmtNum(max) + " hours a year";
  return { min, max, phrase, line: "By your estimate, that's " + phrase + " of your team's time." };
}

// Rough cost of that time, for the advisor briefing only.
export function roughCost(hoursKey, whoKey) {
  const r = hoursRange(hoursKey);
  const w = WHO[whoKey];
  if (r.min === null || !w) return "Not enough to estimate (hours or role missing).";
  const lo = roundTo(r.min * w.rate, 100);
  const rateNote = " (at " + GBP + w.rate + " an hour for " + w.label.toLowerCase() + ")";
  if (r.max === null) return "More than " + GBP + fmtNum(lo) + " a year" + rateNote;
  const hi = roundTo(r.max * w.rate, 100);
  if (lo === 0) return "Up to " + GBP + fmtNum(hi) + " a year" + rateNote;
  return GBP + fmtNum(lo) + " to " + GBP + fmtNum(hi) + " a year" + rateNote;
}

// Up to two "where it's likely breaking" lines, in FLOW order.
export function breakingLines(flow) {
  return Object.keys(FLOW).filter((k) => has(flow, k)).slice(0, 2).map((k) => FLOW[k].line);
}

export function clientPrompts(a) {
  return PROMPTS.filter((p) => p.test(a)).slice(0, 2).map((p) => p.text);
}

export function nextStepLine(appetiteKey) {
  return (APPETITE[appetiteKey] || APPETITE.p_none).next;
}

const FIVE_PLUS = ["h_5_15", "h_15_40", "h_40p"];
const FIFTEEN_PLUS = ["h_15_40", "h_40p"];

export function leadRating(a) {
  if ((a.appetite === "p_small" || a.appetite === "p_project") && FIVE_PLUS.includes(a.hours)) return "Hot";
  if (a.appetite === "p_none" || a.hours === "h_lt2") return "Cool";
  return "Warm";
}

function wordCount(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

export function flags(a) {
  const out = [];
  if (has(a.flow, "f_auto") && FIFTEEN_PLUS.includes(a.hours))
    out.push("Says it's automated but it still takes 15+ hours a week. Ask what the people are doing.");
  if (a.appetite === "p_project" && a.hours === "h_lt2")
    out.push("Appetite is bigger than this task. There may be a bigger problem behind it.");
  if (a.who === "w_owner" && FIVE_PLUS.includes(a.hours))
    out.push("The owner is doing this themselves. Probably the strongest motivation you'll find.");
  if (has(a.blockers, "b_security") && a.aiUse === "a_free")
    out.push("Worried about data security while staff use free tools. Worth raising gently.");
  if (a.aiUse === "a_core" && has(a.blockers, "b_unknown"))
    out.push("Answers don't sit together. Check what the AI in their core process is.");
  if (wordCount(a.task) < 15)
    out.push("Task description is thin. Open by asking them to walk you through the last time it was done.");
  return out;
}

export const OPENING_QUESTIONS = [
  "Walk me through the last time this was done, start to finish.",
  "What happens when it goes wrong?",
  "If this took ten minutes, what would that person do with the time?",
];

// Clean and bound the answers the page sends, so nothing odd reaches an email.
export function cleanAnswers(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (v, n) => String(v == null ? "" : v).slice(0, n).trim();
  const keys = (v, allowed) => (Array.isArray(v) ? v.filter((k) => Object.prototype.hasOwnProperty.call(allowed, k)) : []);
  const one = (v, allowed) => (Object.prototype.hasOwnProperty.call(allowed, v) ? v : "");
  return {
    sector: str(r.sector, 80),
    size: str(r.size, 80),
    timeLoss: Array.isArray(r.timeLoss) ? r.timeLoss.slice(0, 3).map((x) => str(x, 80)) : [],
    task: str(r.task, 2000),
    taskWho: str(r.taskWho, 1000),
    hours: one(r.hours, HOURS),
    who: one(r.who, WHO),
    flow: keys(r.flow, FLOW),
    blockers: keys(r.blockers, BLOCKERS),
    systems: keys(r.systems, SYSTEMS),
    systemsNote: str(r.systemsNote, 500),
    aiUse: one(r.aiUse, AI_USE),
    appetite: one(r.appetite, APPETITE),
  };
}

export function cleanContact(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (v, n) => String(v == null ? "" : v).slice(0, n).trim();
  return {
    name: str(r.name, 120),
    company: str(r.company, 120),
    email: str(r.email, 160),
    role: str(r.role, 120),
    website: str(r.website, 200),
  };
}

// Everything the on-screen result needs, in one call.
export function onScreenResult(a) {
  const r = hoursRange(a.hours);
  return { task: a.task, sizeLine: r.line, breaking: breakingLines(a.flow) };
}
