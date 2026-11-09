/**
 * Secret redaction (04 §4). Applied to every piece of repository content
 * before it can reach a prompt.
 *
 * Line count is preserved exactly — a multi-line match keeps its newlines —
 * so line numbers in evidence stay valid. Redacted values are never returned
 * or logged; only the count is.
 */

export const REDACTED = "[REDACTED_SECRET]";

type Rule = { name: string; pattern: RegExp; replace: (match: string, ...groups: string[]) => string };

/** Keeps every newline of the original match so line numbers do not shift. */
function blank(match: string): string {
  const newlines = match.split("\n").length - 1;
  return REDACTED + "\n".repeat(newlines);
}

const RULES: Rule[] = [
  {
    name: "private_key_block",
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
    replace: blank,
  },
  { name: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: blank },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, replace: blank },
  { name: "github_pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, replace: blank },
  { name: "stripe_key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}\b/g, replace: blank },
  // OpenAI / Anthropic style keys: sk-..., sk-proj-..., sk-ant-...
  { name: "sk_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replace: blank },
  { name: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: blank },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    replace: blank,
  },
  {
    // `apiKey = "…"`, `CLIENT_SECRET: '…'`, `"password": "…"`. The key name is
    // kept and only the quoted value is replaced. Values must be ≥ 8 chars and
    // contain no whitespace, which skips UI strings like "Enter your password".
    name: "assignment",
    pattern:
      /([A-Za-z0-9_]*(?:password|passwd|secret|api[_-]?key|token)[A-Za-z0-9_]*["']?\s*[:=]\s*)(["'])([^"'\s]{8,})\2/gi,
    replace: (match, prefix, quote, value) =>
      value === REDACTED ? match : `${prefix}${quote}${REDACTED}${quote}`,
  },
];

export type RedactionResult = { text: string; count: number };

/** Replaces likely secrets with {@link REDACTED}, keeping the line count. */
export function redactSecrets(text: string): RedactionResult {
  let count = 0;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      // rest = [...captureGroups, offset, wholeInput]; no named groups are used.
      const groups = rest.slice(0, -2).map((g) => (typeof g === "string" ? g : ""));
      const replaced = rule.replace(match, ...groups);
      if (replaced !== match) count += 1;
      return replaced;
    });
  }
  return { text: out, count };
}

/** The coverage limitation for a redaction count, or null when nothing was redacted. */
export function redactionLimitation(count: number): string | null {
  if (count <= 0) return null;
  return `${count} possible secret${count === 1 ? "" : "s"} redacted`;
}
