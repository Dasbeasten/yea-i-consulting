import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, company, email, role, summary, responses } = await req.json();

  const result = {
    submissionStatus: 'pending',
    diagnosisStatus: 'pending',
    emailStatus: 'pending',
    diagnosis: '',
    details: {
      submission: '',
      diagnosis: '',
      email: '',
    },
  };

  // 1. Store submission in Netlify Blobs
  try {
    const store = getStore('submissions');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const id = crypto.randomUUID();
    const key = `${ts}-${name}-${company}-${id}`.replace(/\s+/g, '-').substring(0, 200);
    await store.setJSON(`submissions/${key}`, {
      name,
      company,
      email,
      role,
      summary,
      responses,
      submittedAt: new Date().toISOString(),
    });
    result.submissionStatus = 'sent';
    result.details.submission = `Submission stored in Netlify Blobs (submissions/${key}).`;
  } catch (err) {
    result.submissionStatus = 'failed';
    result.details.submission = `Blob storage failed: ${err.message}`;
  }

  // 2. Generate diagnosis via Anthropic API
  const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    try {
      const prompt = `You are a senior AI strategy consultant preparing a detailed advisor briefing note before responding to a prospective client who has just completed an AI readiness diagnostic.

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

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!anthropicRes.ok) {
        throw new Error(`Anthropic request failed (${anthropicRes.status})`);
      }

      const anthropicData = await anthropicRes.json();
      result.diagnosis = anthropicData.content?.map((b) => b.text || '').join('') || 'Unable to generate diagnosis.';
      result.diagnosisStatus = 'sent';
      result.details.diagnosis = 'Diagnosis generated successfully.';
    } catch (err) {
      result.diagnosisStatus = 'failed';
      result.diagnosis = 'Unable to generate diagnosis right now. Please try again shortly.';
      result.details.diagnosis = `${err.message}`;
    }
  } else {
    result.diagnosisStatus = 'failed';
    result.diagnosis = 'Unable to generate diagnosis right now. Please try again shortly.';
    result.details.diagnosis = 'ANTHROPIC_API_KEY not configured.';
  }

  // 3. Send email notification via Formspree
  const formspreeId = Netlify.env.get('FORMSPREE_ID');
  const notificationEmail = Netlify.env.get('NOTIFICATION_EMAIL');
  if (formspreeId) {
    try {
      const emailRes = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `New diagnostic: ${name} at ${company}`,
          respondent: `${name} · ${role} · ${company}`,
          reply_to: email,
          responses,
        }),
      });

      if (!emailRes.ok) {
        throw new Error(`Formspree returned ${emailRes.status}`);
      }

      result.emailStatus = 'sent';
      result.details.email = notificationEmail
        ? `Notification email sent to ${notificationEmail}.`
        : 'Notification email sent.';
    } catch (err) {
      result.emailStatus = 'failed';
      result.details.email = `Email notification failed: ${err.message}`;
    }
  } else {
    result.emailStatus = 'skipped';
    result.details.email = 'FORMSPREE_ID not configured.';
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
