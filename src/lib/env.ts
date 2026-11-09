import { z } from "zod";

/**
 * Validated environment configuration.
 *
 * Parsing is lazy (on first property access) so that tooling which merely
 * imports a module — `next build`, `eslint`, unit tests — does not fail before
 * the app actually needs a value. The first real access throws one error that
 * lists every missing or invalid key.
 */

const nonEmpty = z.string().trim().min(1);

/** Accepts both real newlines and the "\n"-escaped single-line PEM form. */
const pemKey = nonEmpty.transform((value) => {
  const unquoted = value.replace(/^["']|["']$/g, "");
  return unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
});

const intWithDefault = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  // App
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: nonEmpty,

  // Auth.js
  AUTH_SECRET: nonEmpty,
  AUTH_GITHUB_ID: nonEmpty,
  AUTH_GITHUB_SECRET: nonEmpty,

  // GitHub App
  GITHUB_APP_ID: nonEmpty,
  GITHUB_APP_SLUG: nonEmpty,
  GITHUB_APP_PRIVATE_KEY: pemKey,

  // AI — optional until Phase 4 (the review engine validates its own needs).
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEYS: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  AI_REVIEW_MODELS: z.string().default(""),
  AI_LIGHT_MODELS: z.string().default(""),
  AI_REVIEW_MAX_INPUT_TOKENS: intWithDefault(30_000),
  AI_LIGHT_MAX_INPUT_TOKENS: intWithDefault(5_000),
  AI_DEFAULT_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(6_000),
  AI_MIN_INTERVAL_MS_OVERRIDES: z.string().default(""),
  AI_TASK_ROUTES: z.string().default(""),
  AI_CUSTOM_PROVIDERS: z.string().default(""),

  // Limits
  MAX_PERSONAS_PER_RUN: intWithDefault(3),
  MAX_REVIEWS_PER_USER_PER_DAY: intWithDefault(5),
  MAX_SNAPSHOT_MB: intWithDefault(50),
  WORKER_CONCURRENCY: intWithDefault(1),
});

export type Env = z.infer<typeof envSchema>;

/** Any env-like bag of strings (process.env, or a literal in tests). */
export type EnvSource = Record<string, string | undefined>;

/** Treat empty strings as absent so `KEY=` in .env falls back to the default. */
function readRawEnv(source: EnvSource): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(envSchema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== "") raw[key] = value;
  }
  if (process.env.ATHENYX_PREVIEW === "1") {
    Object.assign(raw, {
      DATABASE_URL: "postgresql://preview:preview@127.0.0.1:5432/preview",
      AUTH_SECRET: "preview-only-secret-do-not-use-for-real-auth",
      AUTH_GITHUB_ID: "preview",
      AUTH_GITHUB_SECRET: "preview",
      GITHUB_APP_ID: "1",
      GITHUB_APP_SLUG: "preview",
      GITHUB_APP_PRIVATE_KEY: "preview",
    });
  }
  return raw;
}

export function parseEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(readRawEnv(source));
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    const hint = issue.code === "invalid_type" ? "missing" : issue.message;
    return `  - ${key}: ${hint}`;
  });

  throw new Error(
    [
      "Invalid environment configuration. Fix these entries in your .env file:",
      ...problems,
      "",
      "Copy .env.example to .env and fill in the values (see README.md).",
    ].join("\n"),
  );
}

let cached: Env | null = null;

/** Parses (once) and returns the validated environment. */
export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}

/** Resets the cache. Tests only. */
export function resetEnvCache(): void {
  cached = null;
}

/** Ergonomic accessor: `env.DATABASE_URL`. Validates on first access. */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    return {
      value: getEnv()[prop as keyof Env],
      enumerable: true,
      configurable: true,
    };
  },
});
