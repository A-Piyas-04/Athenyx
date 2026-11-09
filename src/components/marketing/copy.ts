/**
 * Every claim the landing page makes, in one file, so it can be audited in one
 * sitting. Each block names the source it came from. Persona names and their
 * focus lines are NOT here on purpose: they are derived from ROSTER
 * (lib/review/board.ts) so the page cannot drift from the product.
 *
 * Three rules for anything added here:
 *   1. Athenyx advises; it does not act. Never imply it writes, commits,
 *      merges, deploys or runs code.
 *   2. Reviews are user-started. Never imply a push triggers one.
 *   3. Nine specialists sit on the bench; two or three are seated per review.
 *      Never imply all nine run every time.
 */

/** source: docs/Athenyx_03_Business_Goals.md:8 (positioning, verbatim) */
export const POSITIONING =
  "An independent AI engineering review board that connects to a GitHub repository you choose, helps uncover meaningful risks in real project code, and compares practical fixes — without taking over development.";

/** source: README.md:5 */
export const ADVISORY_QUOTE = "It advises; it does not act.";

/** source: README.md:5, docs/Athenyx_01_AI_Personas.md:8 */
export const ADVISORY_NEGATIVES = [
  {
    title: "It never writes",
    text: "No commits, no pull requests, no merges, no deploys. Athenyx reads your repository and nothing else.",
  },
  {
    title: "It never runs your code",
    text: "Review is read-only inspection of the files at one commit. Nothing is executed, so nothing claims to have been tested.",
  },
  {
    title: "You start every review",
    text: "Pushing code triggers nothing. There are no webhooks. A review happens when you ask for one.",
  },
];

/** source: docs/Athenyx_01_AI_Personas.md:49-57, README.md:153-158 */
export const PIPELINE = [
  { step: "You press Start Review", text: "Nothing runs before that. You choose the review type and the branch." },
  { step: "The commit is pinned", text: "Your branch is resolved to one exact commit SHA. The review stays tied to that snapshot even if the branch moves." },
  { step: "The code is read", text: "That commit is downloaded read-only into a temporary folder. Secret files are never read, and detected credentials are redacted." },
  { step: "The project is mapped", text: "Directories, stack, configuration, important modules and the test files that exist." },
  { step: "Context is selected", text: "The files and functions the question actually needs, plus their imports and callers — not a blind dump of the repository." },
  { step: "Two or three specialists are seated", text: "A small planner call picks the specialists whose expertise the code at hand calls for, and the files each one needs." },
  { step: "Each one reviews in turn", text: "They examine the evidence independently and either flag meaningful issues or report that they found nothing significant." },
  { step: "The Evidence Arbiter checks the citations", text: "Every cited line is matched against the reviewed commit in code. Claims that cannot be matched are dropped, and duplicates are merged." },
  { step: "Findings are stored against that SHA", text: "With fix options and verification steps. A finding seen again later is linked to the existing one, not duplicated." },
  { step: "The copy of your code is deleted", text: "Only short evidence snippets remain, quoted from your repository." },
];

/** source: docs/Athenyx_01_AI_Personas.md:28 (verbatim), README.md:156 */
export const ARBITER_FOCUS =
  "Checks every citation against the reviewed commit, removes claims it cannot match, and merges duplicates.";

/** source: docs/Athenyx_01_AI_Personas.md:71-80 */
export const FINDING_ANATOMY = [
  { label: "Observation", text: "What is wrong, or might be wrong, described against the code it cites." },
  { label: "Evidence", text: "The repository path, the lines or symbol, and the exact commit SHA they were read at." },
  { label: "Impact", text: "The practical consequence, and which behaviour it affects." },
  { label: "Classification", text: "Verified defect, evidence-backed potential risk, or architectural concern. The distinction is the honesty." },
  { label: "Severity", text: "Proportionate to impact and evidence, from Critical down to Info. No invented certainty." },
  { label: "Options", text: "Usually two or three real ways forward, each with its advantages, disadvantages and cost." },
  { label: "Recommendation", text: "A preferred path where one is justified by the context — not an instruction." },
  { label: "Verification", text: "How you can tell whether the fix actually worked." },
];

/** source: docs/Athenyx_02_Features_and_Tabs.md:24-31 */
export const SURFACES = [
  { name: "Overview", text: "What is currently known about the project's health: open risks, the last review, unresolved decisions." },
  { name: "Review Lab", text: "Where you request a review, watch the seated specialists work, and read what each concluded." },
  { name: "Risk Center", text: "Every tracked finding, searchable by severity, status and the specialist who raised it." },
  { name: "Solution Lab", text: "Compare the fix options for one risk side by side, with their trade-offs and effort." },
  { name: "Decision Ledger", text: "The engineering decisions you made and why, kept understandable across later versions of the project." },
  { name: "Release Gate", text: "An advisory readiness view for one commit, with the evidence it rests on." },
];

/** source: docs/Athenyx_02_Features_and_Tabs.md:37-44 */
export const REVIEW_TYPES = [
  { name: "Project Health", text: "No prompt needed. An open-ended scan of the branch for important, code-supported concerns." },
  { name: "Latest Changes", text: "What changed since the last reviewed commit, plus the related code those changes touch." },
  { name: "Ask About My Codebase", text: "A specific question, answered against the relevant files rather than in general terms." },
  { name: "Proposal Review", text: "Describe something you have not built yet; it is assessed against the repository you actually have." },
  { name: "Issue Investigation", text: "Describe a symptom or error; get plausible causes and ways to verify them. No invented reproductions." },
  { name: "Release Assessment", text: "An advisory readiness check for the commit you select." },
];

/** source: README.md:165 — the caps are enforced in code, not by the model. */
export const GATE_RULES = [
  "Any open critical finding means No-Go.",
  "Open high findings, failing CI, or no tests at all mean at most Conditional Go.",
  "The verdict is advisory. It blocks nothing, and you decide when to ship.",
];

/** source: README.md:9, 104-122 */
export const COST = [
  {
    title: "No paid API keys",
    text: "GitHub access is free, and reviews run on Google Gemini's free tier with a fallback chain across several free models.",
  },
  {
    title: "What a free tier means",
    text: "Free AI models are weaker than paid ones, and free rate limits mean a review can take a few minutes. Providers may use submitted content to improve their products — for private code, point Athenyx at a local model instead.",
  },
];

/** source: README.md:181-185, docs/Athenyx_03_Business_Goals.md:92-94 */
export const LIMITS =
  "Athenyx can miss defects and raise false alarms. Repository access is not the same as understanding runtime behaviour. Every review names the commit it read, shows its evidence, and marks what is uncertain. It does not promise bug-free, secure or release-ready software.";

/**
 * One example concern per specialist, so a visitor can see the kind of thing
 * each seat actually catches. Names and focus lines are NOT duplicated here —
 * those come from ROSTER.
 *
 * source: docs/Athenyx_01_AI_Personas.md:14-22 (the "Example concern" column)
 */
export const PERSONA_EXAMPLES: Record<string, string> = {
  architecture: "A small application introduces microservices and a broker without a demonstrated need.",
  security: "A route checks that you are logged in, but never that the record belongs to you.",
  data_integrity: "Two concurrent balance updates can overwrite one another.",
  reliability: "An API retry may repeat a payment that was never safe to repeat.",
  quality: "A split-payment function has no test for unequal shares or rounding.",
  product_ux: "A key user action takes five screens when it could take one.",
  devops: "A database migration has no documented way back.",
  algorithms: "Repeated scans make an O(n²) pass where a set would do.",
  code_quality: "One component mixes UI, authorization and billing logic.",
  ai_ml: "Model output is trusted without validation, and prompts accept untrusted text.",
};

/** source: docs/Athenyx_01_AI_Personas.md:52, src/lib/env.ts:54 (MAX_PERSONAS_PER_RUN) */
export const SEATING_NOTE =
  "Which seats are filled depends on the review type and the code it touches. Not every specialist weighs in on every review, by design: a focused panel produces findings worth reading.";
