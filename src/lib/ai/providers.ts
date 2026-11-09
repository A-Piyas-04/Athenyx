import { AiConfigError } from "@/lib/ai/errors";

/**
 * Provider and model-list parsing (05 §0, §1.1).
 *
 * Every provider is reached through its OpenAI-compatible endpoint, so one
 * code path serves all of them. Lists are ordered best-first; an entry's
 * `tier` is its position (0 = primary).
 *
 * Entry syntax: `provider[@keyAlias]:model[|flag|flag]`
 *   - no `@alias` → the provider's first key
 *   - `@*`        → one entry per key, in key order
 *   - flags       → `nosys`, `nojson`, `max=<tokens>`
 */

export type ProviderKey = { alias: string; key: string };

export type ProviderDef = {
  name: string;
  /** Human-readable name for the Review Lab data notice. */
  label: string;
  baseURL: string;
  keys: ProviderKey[];
  /** True for local providers that accept any key (ollama). */
  keyless: boolean;
  /** Link to the provider's terms, for the data notice. */
  termsUrl: string | null;
  /** True when code never leaves the operator's machine. */
  local: boolean;
};

export type EntryFlags = {
  /** Merge the system prompt into the user message (models without a system role). */
  nosys: boolean;
  /** Don't send `response_format` (models without JSON mode). */
  nojson: boolean;
  /** Skip this entry when the estimated input exceeds this many tokens. */
  max: number | null;
};

export type ModelEntry = {
  provider: string;
  /** Alias of the key used, or null for keyless providers. */
  keyAlias: string | null;
  model: string;
  baseURL: string;
  apiKey: string;
  tier: number;
  flags: EntryFlags;
  /** True for entries that come from a task route (05 §1.7). */
  routed: boolean;
  /** `provider@alias:model` — quota/cooldown identity. Never contains the key. */
  id: string;
  /** Display form for logs, usage and findings (alias shown only when explicit). */
  label: string;
};

/** The raw, unvalidated strings the AI configuration is built from. */
export type AiEnvSource = Record<string, string | undefined>;

export const DEFAULT_KEY_ALIAS = "default";

const BUILTIN_PROVIDERS: Record<
  string,
  { label: string; baseURL: string; keyEnv: string | null; termsUrl: string | null; local: boolean }
> = {
  gemini: {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyEnv: "GEMINI_API_KEY",
    termsUrl: "https://ai.google.dev/gemini-api/terms",
    local: false,
  },
  groq: {
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    termsUrl: "https://groq.com/terms-of-use/",
    local: false,
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    termsUrl: "https://openrouter.ai/terms",
    local: false,
  },
  ollama: {
    label: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    keyEnv: null,
    termsUrl: null,
    local: true,
  },
};

const ALIAS_RE = /^[A-Za-z0-9_-]{1,32}$/;
const PROVIDER_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function value(source: AiEnvSource, key: string): string | undefined {
  const v = source[key];
  return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
}

/** Parses `GEMINI_API_KEYS=alias:key,alias:key`, falling back to `GEMINI_API_KEY`. */
export function parseGeminiKeys(source: AiEnvSource): ProviderKey[] {
  const multi = value(source, "GEMINI_API_KEYS");
  if (multi) {
    const keys: ProviderKey[] = [];
    for (const part of multi.split(",").map((p) => p.trim()).filter(Boolean)) {
      const colon = part.indexOf(":");
      if (colon <= 0 || colon === part.length - 1) {
        throw new AiConfigError(
          'GEMINI_API_KEYS must be "alias:key,alias:key" (an entry is missing its alias or key).',
        );
      }
      const alias = part.slice(0, colon).trim();
      const key = part.slice(colon + 1).trim();
      if (!ALIAS_RE.test(alias) || alias === "*") {
        throw new AiConfigError(`GEMINI_API_KEYS: invalid key alias "${alias}".`);
      }
      if (keys.some((k) => k.alias === alias)) {
        throw new AiConfigError(`GEMINI_API_KEYS: duplicate key alias "${alias}".`);
      }
      keys.push({ alias, key });
    }
    if (keys.length > 0) return keys;
  }
  // NOTE: when GEMINI_API_KEYS is set, a separate GEMINI_API_KEY is ignored.
  const single = value(source, "GEMINI_API_KEY");
  return single ? [{ alias: DEFAULT_KEY_ALIAS, key: single }] : [];
}

/**
 * Parses `AI_CUSTOM_PROVIDERS=name|baseURL|API_KEY_ENV_VAR;…` (05 §1.7).
 * The key is read from the named variable; a missing key leaves the provider keyless
 * (its entries are then rejected in role lists and ignored in routes).
 */
export function parseCustomProviders(source: AiEnvSource): ProviderDef[] {
  const raw = value(source, "AI_CUSTOM_PROVIDERS");
  if (!raw) return [];
  const out: ProviderDef[] = [];
  for (const part of raw.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [name, baseURL, keyEnv, ...rest] = part.split("|").map((p) => p.trim());
    if (!name || !baseURL || !keyEnv || rest.length > 0) {
      throw new AiConfigError(
        `AI_CUSTOM_PROVIDERS: "${name ?? part}" must be "name|baseURL|API_KEY_ENV_VAR".`,
      );
    }
    if (!PROVIDER_RE.test(name)) {
      throw new AiConfigError(`AI_CUSTOM_PROVIDERS: invalid provider name "${name}".`);
    }
    if (name in BUILTIN_PROVIDERS) {
      throw new AiConfigError(`AI_CUSTOM_PROVIDERS: "${name}" is a built-in provider.`);
    }
    if (!/^https?:\/\//.test(baseURL)) {
      throw new AiConfigError(`AI_CUSTOM_PROVIDERS: "${name}" needs an http(s) base URL.`);
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(keyEnv)) {
      throw new AiConfigError(`AI_CUSTOM_PROVIDERS: "${keyEnv}" is not a valid env variable name.`);
    }
    const key = value(source, keyEnv);
    out.push({
      name,
      label: name,
      baseURL,
      keys: key ? [{ alias: DEFAULT_KEY_ALIAS, key }] : [],
      keyless: false,
      termsUrl: null,
      local: false,
    });
  }
  return out;
}

/** All known providers with the keys configured for them. */
export function buildProviders(source: AiEnvSource): Map<string, ProviderDef> {
  const providers = new Map<string, ProviderDef>();
  for (const [name, def] of Object.entries(BUILTIN_PROVIDERS)) {
    let keys: ProviderKey[] = [];
    if (name === "gemini") keys = parseGeminiKeys(source);
    else if (def.keyEnv) {
      const key = value(source, def.keyEnv);
      if (key) keys = [{ alias: DEFAULT_KEY_ALIAS, key }];
    }
    const baseURL = name === "ollama" ? (value(source, "OLLAMA_BASE_URL") ?? def.baseURL) : def.baseURL;
    providers.set(name, {
      name,
      label: def.label,
      baseURL,
      keys,
      keyless: def.keyEnv === null,
      termsUrl: def.termsUrl,
      local: def.local,
    });
  }
  for (const custom of parseCustomProviders(source)) providers.set(custom.name, custom);
  return providers;
}

/** A parsed but not yet key-resolved entry. */
export type EntrySpec = {
  provider: string;
  /** null = first key; "*" = every key. */
  keyAlias: string | null;
  model: string;
  flags: EntryFlags;
};

/** Parses one `provider[@alias]:model[|flags]` entry. */
export function parseEntrySpec(text: string): EntrySpec {
  const [head, ...flagParts] = text.trim().split("|").map((p) => p.trim());
  const colon = head.indexOf(":");
  if (colon <= 0 || colon === head.length - 1) {
    throw new AiConfigError(`Model entry "${text}" must look like "provider:model" or "provider@alias:model".`);
  }
  const providerPart = head.slice(0, colon);
  // Model ids may contain ":" themselves (e.g. OpenRouter "vendor/model:free").
  const model = head.slice(colon + 1);
  const at = providerPart.indexOf("@");
  const provider = at === -1 ? providerPart : providerPart.slice(0, at);
  const keyAlias = at === -1 ? null : providerPart.slice(at + 1);
  if (!PROVIDER_RE.test(provider)) {
    throw new AiConfigError(`Model entry "${text}": invalid provider "${provider}".`);
  }
  if (keyAlias !== null && keyAlias !== "*" && !ALIAS_RE.test(keyAlias)) {
    throw new AiConfigError(`Model entry "${text}": invalid key alias "${keyAlias}".`);
  }

  const flags: EntryFlags = { nosys: false, nojson: false, max: null };
  for (const flag of flagParts.filter(Boolean)) {
    if (flag === "nosys") flags.nosys = true;
    else if (flag === "nojson") flags.nojson = true;
    else if (/^max=\d+$/.test(flag)) flags.max = Number(flag.slice(4));
    else throw new AiConfigError(`Model entry "${text}": unknown flag "${flag}".`);
  }
  return { provider, keyAlias, model, flags };
}

function entryIdentity(provider: string, keyAlias: string | null, model: string) {
  const id = `${provider}@${keyAlias ?? "-"}:${model}`;
  const label =
    keyAlias === null || keyAlias === DEFAULT_KEY_ALIAS ? `${provider}:${model}` : `${provider}@${keyAlias}:${model}`;
  return { id, label };
}

export type ResolveResult = { entries: Omit<ModelEntry, "tier" | "routed">[]; missingKey: boolean };

/**
 * Resolves a spec against the configured providers: picks the key(s) and
 * expands `@*`. `missingKey` is true when the provider has no key at all.
 */
export function resolveEntrySpec(
  spec: EntrySpec,
  providers: Map<string, ProviderDef>,
  context: string,
): ResolveResult {
  const provider = providers.get(spec.provider);
  if (!provider) {
    throw new AiConfigError(`${context}: unknown provider "${spec.provider}".`);
  }
  if (spec.provider === "openrouter" && !spec.model.endsWith(":free")) {
    throw new AiConfigError(
      `${context}: OpenRouter model "${spec.model}" is not a free model. Only ids ending in ":free" are allowed.`,
    );
  }

  const make = (keyAlias: string | null, apiKey: string) => ({
    provider: spec.provider,
    keyAlias,
    model: spec.model,
    baseURL: provider.baseURL,
    apiKey,
    flags: spec.flags,
    ...entryIdentity(spec.provider, keyAlias, spec.model),
  });

  if (provider.keyless) {
    if (spec.keyAlias !== null && spec.keyAlias !== "*") {
      throw new AiConfigError(`${context}: provider "${spec.provider}" takes no key alias.`);
    }
    return { entries: [make(null, "ollama")], missingKey: false };
  }
  if (provider.keys.length === 0) return { entries: [], missingKey: true };

  if (spec.keyAlias === "*") {
    return { entries: provider.keys.map((k) => make(k.alias, k.key)), missingKey: false };
  }
  const key = spec.keyAlias === null ? provider.keys[0] : provider.keys.find((k) => k.alias === spec.keyAlias);
  if (!key) {
    throw new AiConfigError(`${context}: unknown key alias "${spec.keyAlias}" for provider "${spec.provider}".`);
  }
  return { entries: [make(key.alias, key.key)], missingKey: false };
}

export const MAX_MODELS_PER_ROLE = 8;

/**
 * Parses a role list (`AI_REVIEW_MODELS` / `AI_LIGHT_MODELS`). A provider
 * without a key is a startup error here (routes only warn).
 */
export function parseRoleList(
  envName: string,
  raw: string | undefined,
  providers: Map<string, ProviderDef>,
): ModelEntry[] {
  const parts = (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new AiConfigError(`${envName} is empty. List at least one free model, e.g. "gemini:gemini-2.5-flash".`);
  }
  if (parts.length > MAX_MODELS_PER_ROLE) {
    throw new AiConfigError(`${envName} lists ${parts.length} models; at most ${MAX_MODELS_PER_ROLE} are allowed.`);
  }

  const entries: ModelEntry[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const spec = parseEntrySpec(part);
    const resolved = resolveEntrySpec(spec, providers, envName);
    if (resolved.missingKey) {
      const hint = spec.provider === "gemini" ? "GEMINI_API_KEY or GEMINI_API_KEYS" : `the ${spec.provider} API key`;
      throw new AiConfigError(`${envName} uses provider "${spec.provider}" but ${hint} is not set.`);
    }
    for (const entry of resolved.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push({ ...entry, tier: entries.length, routed: false });
    }
  }
  return entries;
}

/** `AI_MIN_INTERVAL_MS_OVERRIDES=provider:model=ms,…` (applies to that model on every key). */
export function parseIntervalOverrides(raw: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.lastIndexOf("=");
    const target = part.slice(0, eq).trim();
    const ms = part.slice(eq + 1).trim();
    if (eq <= 0 || !/^\d+$/.test(ms) || !target.includes(":")) {
      throw new AiConfigError(`AI_MIN_INTERVAL_MS_OVERRIDES: "${part}" must be "provider:model=milliseconds".`);
    }
    out.set(target, Number(ms));
  }
  return out;
}
