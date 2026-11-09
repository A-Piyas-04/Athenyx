import type { ReviewType } from "@/generated/prisma/enums";
import type { RunInput } from "@/lib/review/types";

/**
 * Review-type task texts (05 §4), appended after the persona brief, and the
 * rendering of developer input for the `<developer_input>` block.
 */

export const REVIEW_TASKS: Record<Exclude<ReviewType, "RECHECK">, string> = {
  PROJECT_HEALTH: `Task: Review the selected code for the most important issues in your area.
Report coverage limits (what you could not see) in "limitations". Set "answer" to null.
If <developer_input> names a focus, prioritise that area.`,
  LATEST_CHANGES: `Task: Focus on risks introduced or exposed by the changes in <diff>. Use other files only as
context. Mention regressions. Cite the changed code in the head version (<repository_file> blocks).
Set "answer" to null.`,
  ASK: `Task: Answer the developer's question in <developer_input> using the repository evidence.
Put the answer in "answer" (markdown). Reference code as \`path:line\` using only files shown in
<repository_file> blocks. If the code shown does not answer the question, say what is missing.
Raise findings only for real issues discovered while answering; do not turn the answer itself into findings.`,
  PROPOSAL: `Task: The developer proposes something that is NOT built yet (<developer_input>). Critically assess
it against the existing code and constraints. Never claim the proposed code already exists.
For concerns that rest on the proposal rather than on repository code, put the proposal fact you rely
on in "userPremise" and prefer DESIGN_CONCERN. Cite repository code when it is relevant (for example,
code the proposal would change or conflict with). Put the overall assessment in "answer" (markdown).`,
  ISSUE: `Task: The developer reports a symptom (<developer_input>). Identify plausible root causes in the code,
ranked most likely first, and for each give a concrete check that would confirm or rule it out.
You cannot run the code: never claim to have reproduced the problem. Report each cause the code supports
as a finding (usually POTENTIAL_RISK) with the confirming check in "verification". Use "userPremise" for
facts that come only from the developer's report. Put the investigation summary, ranking the causes, in
"answer" (markdown, referencing code as \`path:line\`).`,
  RELEASE: `Task: Assess release readiness for this commit in your area: unfinished risky code, config and
migration risks, missing tests for critical paths. Report blockers as findings; do not give a GO/NO_GO
verdict yourself. Set "answer" to null.`,
};

const block = (label: string, value: string | undefined) =>
  value && value.trim() !== "" ? `${label}:\n${value.trim()}` : null;

/** Appended last to every reviewer prompt, closest to where the model writes. */
export const EVIDENCE_REMINDER = `Reminder: every evidence.quote must be copied exactly from a <repository_file>; findings whose quotes
don't match the code are discarded. If nothing significant is found, return "findings": [].`;

/**
 * Renders the developer's input as plain labelled text. The caller places it
 * inside `<developer_input>` (escaped) — it is data, never instructions.
 */
export function renderDeveloperInput(type: ReviewType, input: RunInput): string {
  const parts: (string | null)[] = [];
  switch (type) {
    case "PROJECT_HEALTH":
    case "LATEST_CHANGES":
      parts.push(block("Focus", input.focus));
      break;
    case "ASK":
      parts.push(block("Question", input.question), block("Constraints", input.constraints));
      break;
    case "PROPOSAL":
      parts.push(block("Proposal (not yet built)", input.brief), block("Constraints", input.constraints));
      break;
    case "ISSUE":
      parts.push(
        block("Symptom", input.symptom),
        block("Expected behaviour", input.expected),
        block("Actual behaviour", input.actual),
        block("Log / error output", input.log),
      );
      break;
    default:
      break;
  }
  return parts.filter((p): p is string => p !== null).join("\n\n");
}

/** True when the developer input mentions AI/LLM topics (enables the ai_ml persona). */
export function mentionsAi(text: string): boolean {
  return /\b(ai|llm|llms|gpt|model|models|prompt|prompts|embedding|embeddings|rag|openai|gemini|anthropic|claude|langchain)\b/i.test(
    text,
  );
}
