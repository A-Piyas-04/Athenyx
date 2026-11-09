/**
 * `npm run ai:check` — verifies the configured free AI models (05 §1.5).
 *
 * For each provider + key used anywhere (role lists and task routes): list
 * the provider's models, report whether each configured id exists, and send
 * one tiny JSON request to each entry directly (bypassing fallback). Keys are
 * never printed — only their aliases.
 */

try {
  process.loadEnvFile?.(".env");
} catch {
  // No .env file: use the real environment.
}

import { buildAiConfig } from "../src/lib/ai/config";
import { jsonInstructions, parseJsonOutput } from "../src/lib/ai/json";
import { classifyFailure, ProviderHttpError } from "../src/lib/ai/fallback";
import type { ModelEntry } from "../src/lib/ai/providers";
import { PingOutput } from "../src/lib/ai/schemas";
import { clientFor, openAiCompatibleTransport, toProviderError } from "../src/lib/ai/transport";

type Row = {
  role: string;
  tier: string;
  provider: string;
  key: string;
  model: string;
  exists: string;
  json: string;
  latency: string;
  error: string;
};

const stripPrefix = (id: string) => id.replace(/^models\//, "");

async function listModels(entry: ModelEntry): Promise<Set<string> | string> {
  try {
    const ids = new Set<string>();
    for await (const model of clientFor(entry).models.list()) ids.add(stripPrefix(model.id));
    return ids;
  } catch (error) {
    const failure = toProviderError(error)?.failure;
    return failure ? `list failed (HTTP ${failure.status ?? "network"})` : "list failed";
  }
}

async function ping(entry: ModelEntry): Promise<{ ok: boolean; ms: number; error: string }> {
  const started = Date.now();
  const system = `Reply with a JSON object.\n\n${jsonInstructions(PingOutput)}`;
  try {
    const response = await openAiCompatibleTransport({
      entry,
      messages: entry.flags.nosys
        ? [{ role: "user", content: `${system}\n\nReturn {"ok": true}.` }]
        : [
            { role: "system", content: system },
            { role: "user", content: 'Return {"ok": true}.' },
          ],
      maxTokens: 50,
      jsonMode: !entry.flags.nojson,
      temperature: 0,
    });
    const parsed = parseJsonOutput(response.content, PingOutput);
    return { ok: parsed.ok, ms: Date.now() - started, error: parsed.ok ? "" : "invalid JSON reply" };
  } catch (error) {
    const ms = Date.now() - started;
    if (error instanceof ProviderHttpError) {
      const { kind } = classifyFailure(error.failure);
      return { ok: false, ms, error: `HTTP ${error.failure.status ?? "network"} (${kind})` };
    }
    return { ok: false, ms, error: error instanceof Error ? error.name : "error" };
  }
}

function printTable(rows: Row[]): void {
  const headers: (keyof Row)[] = ["role", "tier", "provider", "key", "model", "exists", "json", "latency", "error"];
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(headers.map((h) => h.toUpperCase())));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(headers.map((h) => row[h])));
}

async function main(): Promise<void> {
  const config = buildAiConfig();
  for (const warning of config.warnings) console.warn(`warning: ${warning}`);

  const targets: { role: string; entry: ModelEntry }[] = [
    ...config.roles.review.map((entry) => ({ role: "review", entry })),
    ...config.roles.light.map((entry) => ({ role: "light", entry })),
    ...[...config.routes].flatMap(([task, entries]) => entries.map((entry) => ({ role: `route ${task}`, entry }))),
  ];

  // One model listing per provider + key.
  const listings = new Map<string, Set<string> | string>();
  for (const { entry } of targets) {
    const scope = `${entry.provider}@${entry.keyAlias ?? "-"}`;
    if (!listings.has(scope)) listings.set(scope, await listModels(entry));
  }

  const rows: Row[] = [];
  let okCount = 0;
  const tested = new Map<string, { ok: boolean; ms: number; error: string }>();
  for (const { role, entry } of targets) {
    const listing = listings.get(`${entry.provider}@${entry.keyAlias ?? "-"}`)!;
    const exists = typeof listing === "string" ? "?" : listing.has(entry.model) ? "yes" : "NO";
    let result = tested.get(entry.id);
    if (!result) {
      result = await ping(entry);
      tested.set(entry.id, result);
    }
    if (result.ok) okCount += 1;
    rows.push({
      role,
      tier: entry.routed ? "route" : String(entry.tier),
      provider: entry.provider,
      key: entry.keyAlias ?? "-",
      model: entry.model,
      exists,
      json: result.ok ? "ok" : "FAIL",
      latency: `${result.ms}ms`,
      error: typeof listing === "string" && !result.error ? listing : result.error,
    });
  }

  printTable(rows);

  // Free Gemini models available to the key(s) but not configured anywhere.
  const configured = new Set(targets.map((t) => t.entry.model));
  const suggestions = new Set<string>();
  for (const [scope, listing] of listings) {
    if (!scope.startsWith("gemini@") || typeof listing === "string") continue;
    for (const id of listing) {
      if (/^(gemini|gemma)-/.test(id) && !configured.has(id) && !/embedding|aqa|imagen|tts|image|live|audio/.test(id)) {
        suggestions.add(id);
      }
    }
  }
  if (suggestions.size > 0) {
    console.log("\nOther Gemini models available to your key(s) (check Google AI Studio for which are free):");
    for (const id of [...suggestions].sort()) console.log(`  gemini:${id}`);
  }

  console.log(`\n${okCount}/${rows.length} configured entries answered with valid JSON.`);
  if (okCount === 0) {
    console.error("No configured model works. Check your API keys and model ids.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
