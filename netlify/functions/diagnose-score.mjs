// On-screen result for the "Where's the time going?" workflow diagnostic.
// Rule-based and instant: plays the client's task back to them, sizes it from
// their own weekly estimate, and gives up to two "where it's likely breaking"
// lines. No AI call, so there is nothing to wait on and nothing to get wrong.
// The rules live in netlify/lib/workflow-rules.mjs, shared with the emails.

import { cleanAnswers, onScreenResult } from "../lib/workflow-rules.mjs";

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const answers = cleanAnswers(body.answers);
  if (!answers.task) return json(400, { error: "Missing task" });

  return json(200, onScreenResult(answers));
};
