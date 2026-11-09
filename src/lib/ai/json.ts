import { z } from "zod";

/**
 * JSON output handling for small models (05 §1.2, §5): fence stripping,
 * lenient normalisation before validation, and the schema instructions
 * appended to the system prompt.
 */

/** Extracts the JSON text from a reply that may be fenced or wrapped in prose. */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/.exec(trimmed);
  if (fenced) return fenced[1].trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first !== -1 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

/**
 * Lenient, schema-driven coercion (not a looser schema): numeric strings →
 * numbers, enum strings upper-cased (`"high"` → `"HIGH"`, `"potential risk"` →
 * `"POTENTIAL_RISK"`), `"true"`/`"false"` → booleans, missing arrays → `[]`,
 * missing nullable fields → `null`.
 */
export function normalize(schema: z.ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodNullable) {
    if (value === undefined || value === null) return null;
    return normalize(schema.unwrap() as z.ZodType, value);
  }
  if (schema instanceof z.ZodOptional) {
    if (value === undefined) return undefined;
    return normalize(schema.unwrap() as z.ZodType, value);
  }
  if (schema instanceof z.ZodObject) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      const normalized = normalize(child, input[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  if (schema instanceof z.ZodArray) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return value;
    return value.map((item) => normalize(schema.element as z.ZodType, item));
  }
  if (schema instanceof z.ZodEnum) {
    if (typeof value !== "string") return value;
    const candidate = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    return (schema.options as string[]).includes(candidate) ? candidate : value;
  }
  if (schema instanceof z.ZodNumber) {
    if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
    return value;
  }
  if (schema instanceof z.ZodBoolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  if (schema instanceof z.ZodString) {
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return value;
  }
  return value;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Summarises Zod issues for the repair prompt (paths and messages only). */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export function parseJsonOutput<T extends z.ZodType>(text: string, schema: T): ParseResult<z.infer<T>> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return { ok: false, error: "The reply was not valid JSON." };
  }
  const result = schema.safeParse(normalize(schema, raw));
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: describeIssues(result.error) };
}

const SAFE_INT_BOUNDS = new Set([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);

/** Compact JSON Schema text for the prompt (drops `$schema` and safe-integer bounds). */
export function schemaText(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema), (key, value) => {
    if (key === "$schema") return undefined;
    if ((key === "minimum" || key === "maximum") && SAFE_INT_BOUNDS.has(value)) return undefined;
    return value;
  });
}

export function jsonInstructions(schema: z.ZodType): string {
  return [
    "Respond with ONLY one JSON object matching this JSON Schema. No markdown fences, no text outside the JSON.",
    "Every property is required; use null for an unknown nullable value and [] for an empty list.",
    schemaText(schema),
  ].join("\n");
}

export function repairPrompt(error: string): string {
  return [
    "Your previous reply did not match the required JSON Schema.",
    `Problems: ${error}`,
    "Reply again with ONLY the corrected JSON object.",
  ].join("\n");
}
