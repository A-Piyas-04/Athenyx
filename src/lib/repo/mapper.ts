import path from "node:path";
import type { FileReader } from "@/lib/repo/files";
import { isTestPath } from "@/lib/repo/filters";

/** Deterministic description of a snapshot (04 §4). No AI involved. */
export type ProjectMap = {
  commitSha: string;
  fileCount: number;
  tree: { path: string; size: number }[];
  languages: Record<string, number>;
  stack: string[];
  packageManifests: PackageManifest[];
  configFiles: string[];
  testFiles: string[];
  ciFiles: string[];
  entryPoints: string[];
  usesAI: boolean;
  primarySupported: boolean;
};

export type PackageManifest = {
  path: string;
  name?: string;
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
};

export const NON_JS_LIMITATION =
  "Primary language is not JavaScript/TypeScript; review depth is limited.";

/** Extension → language, for source-code files only (data/docs are not counted). */
const LANGUAGES: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".vue": "Vue", ".svelte": "Svelte", ".astro": "Astro",
  ".py": "Python", ".rb": "Ruby", ".go": "Go", ".rs": "Rust", ".java": "Java",
  ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".swift": "Swift",
  ".c": "C", ".h": "C", ".cc": "C++", ".cpp": "C++", ".hpp": "C++", ".cs": "C#",
  ".php": "PHP", ".dart": "Dart", ".ex": "Elixir", ".exs": "Elixir", ".erl": "Erlang",
  ".clj": "Clojure", ".hs": "Haskell", ".lua": "Lua", ".r": "R", ".m": "Objective-C",
  ".sh": "Shell", ".bash": "Shell", ".sql": "SQL",
  ".css": "CSS", ".scss": "SCSS", ".sass": "SCSS", ".less": "Less", ".html": "HTML",
};

/** Languages that count toward `primarySupported` (JS/TS ecosystem). */
const JS_FAMILY = new Set(["TypeScript", "JavaScript", "Vue", "Svelte", "Astro"]);
/** Markup/styles/scripts that accompany any stack; not counted as a primary language. */
const SUPPORTING = new Set(["CSS", "SCSS", "Less", "HTML", "Shell", "SQL"]);

/** Dependency name (exact, or prefix ending in "/") → stack label. */
const STACK_RULES: [match: string, label: string][] = [
  ["next", "nextjs"],
  ["react", "react"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["svelte", "svelte"],
  ["@sveltejs/kit", "sveltekit"],
  ["@angular/core", "angular"],
  ["astro", "astro"],
  ["@remix-run/", "remix"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["koa", "koa"],
  ["hono", "hono"],
  ["@nestjs/core", "nestjs"],
  ["prisma", "prisma"],
  ["@prisma/client", "prisma"],
  ["drizzle-orm", "drizzle"],
  ["mongoose", "mongoose"],
  ["typeorm", "typeorm"],
  ["sequelize", "sequelize"],
  ["knex", "knex"],
  ["pg", "postgres"],
  ["mysql2", "mysql"],
  ["redis", "redis"],
  ["ioredis", "redis"],
  ["tailwindcss", "tailwind"],
  ["jest", "jest"],
  ["vitest", "vitest"],
  ["mocha", "mocha"],
  ["@playwright/test", "playwright"],
  ["playwright", "playwright"],
  ["cypress", "cypress"],
  ["stripe", "stripe"],
  ["next-auth", "nextauth"],
  ["@auth/", "authjs"],
  ["@clerk/", "clerk"],
  ["@supabase/supabase-js", "supabase"],
  ["firebase", "firebase"],
  ["firebase-admin", "firebase"],
  ["graphql", "graphql"],
  ["@trpc/server", "trpc"],
  ["zod", "zod"],
  ["typescript", "typescript"],
  ["electron", "electron"],
  ["react-native", "react-native"],
  ["expo", "expo"],
];

/** Dependencies that indicate the project calls AI/LLM services. */
const AI_DEPENDENCIES: string[] = [
  "openai",
  "@anthropic-ai/sdk",
  "langchain",
  "@langchain/",
  "ai",
  "@ai-sdk/",
  "@google/generative-ai",
  "@google/genai",
  "llamaindex",
  "cohere-ai",
  "@mistralai/mistralai",
  "groq-sdk",
  "ollama",
  "replicate",
  "@huggingface/inference",
  "@pinecone-database/pinecone",
];

function depMatches(dep: string, rule: string): boolean {
  return rule.endsWith("/") ? dep.startsWith(rule) : dep === rule;
}

const CONFIG_PATTERNS: RegExp[] = [
  /(^|\/)tsconfig(\.[^/]+)?\.json$/,
  /(^|\/)jsconfig\.json$/,
  /(^|\/)(next|vite|nuxt|svelte|astro|remix|webpack|rollup|tailwind|postcss|babel|jest|vitest|playwright|cypress|drizzle)\.config\.[^/]+$/,
  /(^|\/)eslint\.config\.[^/]+$/,
  /(^|\/)\.eslintrc(\.[^/]+)?$/,
  /(^|\/)\.prettierrc(\.[^/]+)?$/,
  /(^|\/)\.babelrc$/,
  /(^|\/)Dockerfile[^/]*$/,
  /(^|\/)docker-compose[^/]*\.ya?ml$/,
  /(^|\/)compose\.ya?ml$/,
  /(^|\/)prisma\/schema\.prisma$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /(^|\/)vercel\.json$/,
  /(^|\/)netlify\.toml$/,
  /(^|\/)fly\.toml$/,
  /(^|\/)render\.yaml$/,
  /(^|\/)Procfile$/,
  /(^|\/)\.env\.(example|sample)$/,
  /(^|\/)prisma\.config\.[^/]+$/,
];

const CI_PATTERNS: RegExp[] = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.gitlab-ci\.ya?ml$/,
  /^\.circleci\/config\.ya?ml$/,
  /^azure-pipelines\.ya?ml$/,
  /^bitbucket-pipelines\.ya?ml$/,
  /^\.travis\.ya?ml$/,
  /^Jenkinsfile$/,
];

const CODE_EXT = String.raw`\.(tsx?|jsx?|mjs|cjs|mts|cts)$`;
const ENTRY_PATTERNS: RegExp[] = [
  new RegExp(String.raw`^(src/)?app/(.+/)?(page|route|layout)` + CODE_EXT),
  new RegExp(String.raw`^(src/)?pages/.+` + CODE_EXT),
  new RegExp(String.raw`^src/(index|main|server|app)` + CODE_EXT),
  new RegExp(String.raw`^(src/)?server` + CODE_EXT),
  // NOTE: `proxy.*` is the Next.js 16 name for middleware.
  new RegExp(String.raw`^(src/)?(middleware|proxy)` + CODE_EXT),
];

function languageOf(p: string): string | null {
  return LANGUAGES[path.posix.extname(p).toLowerCase()] ?? null;
}

const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string") out[key] = v;
  }
  return out;
};

/** Parses one package.json. Malformed manifests yield null (they are still in the tree). */
export function parsePackageManifest(p: string, text: string): PackageManifest | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  return {
    path: p,
    name: typeof obj.name === "string" ? obj.name : undefined,
    dependencies: Object.keys(stringRecord(obj.dependencies)).sort(),
    devDependencies: Object.keys(stringRecord(obj.devDependencies)).sort(),
    scripts: stringRecord(obj.scripts),
  };
}

export type BuildProjectMapInput = {
  commitSha: string;
  files: { path: string; size: number }[];
  read: FileReader;
};

export function buildProjectMap({ commitSha, files, read }: BuildProjectMapInput): ProjectMap {
  const paths = files.map((f) => f.path);

  const languages: Record<string, number> = {};
  for (const p of paths) {
    const lang = languageOf(p);
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
  }

  const packageManifests: PackageManifest[] = [];
  for (const p of paths) {
    if (path.posix.basename(p) !== "package.json") continue;
    const text = read(p);
    const manifest = text === null ? null : parsePackageManifest(p, text);
    if (manifest) packageManifests.push(manifest);
  }

  const allDeps = new Set(
    packageManifests.flatMap((m) => [...m.dependencies, ...m.devDependencies]),
  );

  const stack = new Set<string>();
  for (const dep of allDeps) {
    for (const [rule, label] of STACK_RULES) {
      if (depMatches(dep, rule)) stack.add(label);
    }
  }
  if ((languages.TypeScript ?? 0) > 0 || paths.some((p) => /(^|\/)tsconfig\.json$/.test(p))) {
    stack.add("typescript");
  }
  if (paths.some((p) => /(^|\/)prisma\/schema\.prisma$/.test(p))) stack.add("prisma");

  const usesAI = [...allDeps].some((dep) => AI_DEPENDENCIES.some((rule) => depMatches(dep, rule)));

  const isCode = (p: string) => languageOf(p) !== null;

  return {
    commitSha,
    fileCount: files.length,
    tree: files.map((f) => ({ path: f.path, size: f.size })),
    languages,
    stack: [...stack].sort(),
    packageManifests,
    configFiles: paths.filter((p) => CONFIG_PATTERNS.some((re) => re.test(p))),
    testFiles: paths.filter((p) => isCode(p) && isTestPath(p)),
    ciFiles: paths.filter((p) => CI_PATTERNS.some((re) => re.test(p))),
    entryPoints: paths.filter((p) => ENTRY_PATTERNS.some((re) => re.test(p))),
    usesAI,
    primarySupported: isPrimarilyJsTs(languages),
  };
}

/**
 * True when JS/TS-family files are the largest group among primary languages.
 * A repository with no code at all (e.g. docs only) is reported as unsupported.
 */
export function isPrimarilyJsTs(languages: Record<string, number>): boolean {
  let js = 0;
  let topOther = 0;
  for (const [lang, count] of Object.entries(languages)) {
    if (JS_FAMILY.has(lang)) js += count;
    else if (!SUPPORTING.has(lang)) topOther = Math.max(topOther, count);
  }
  return js > 0 && js >= topOther;
}

/** Limitations implied by the map alone. */
export function projectMapLimitations(map: ProjectMap): string[] {
  return map.primarySupported ? [] : [NON_JS_LIMITATION];
}

// ---------------------------------------------------------------------------
// Compact text form for prompts
// ---------------------------------------------------------------------------

export const MAX_TREE_LINES = 400;

type DirNode = { name: string; dirs: Map<string, DirNode>; files: string[]; total: number };

function buildDirTree(paths: string[]): DirNode {
  const root: DirNode = { name: "", dirs: new Map(), files: [], total: 0 };
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    node.total += 1;
    for (const part of parts.slice(0, -1)) {
      let child = node.dirs.get(part);
      if (!child) {
        child = { name: part, dirs: new Map(), files: [], total: 0 };
        node.dirs.set(part, child);
      }
      child.total += 1;
      node = child;
    }
    node.files.push(parts[parts.length - 1]);
  }
  return root;
}

/**
 * Renders the tree within `maxLines`. Directories are expanded breadth-first
 * while the budget allows; the rest collapse to `dir/ (N files)`.
 */
export function renderTree(paths: string[], maxLines = MAX_TREE_LINES): string {
  const root = buildDirTree(paths);
  const expanded = new Set<DirNode>([root]);
  let used = root.dirs.size + root.files.length;

  // Breadth-first: expand shallow directories before deep ones.
  const queue: DirNode[] = [...root.dirs.values()];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const cost = node.dirs.size + node.files.length;
    if (used + cost > maxLines) continue;
    expanded.add(node);
    used += cost;
    queue.push(...node.dirs.values());
  }

  const lines: string[] = [];
  const walk = (node: DirNode, indent: string) => {
    const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      if (expanded.has(dir)) {
        lines.push(`${indent}${dir.name}/`);
        walk(dir, indent + "  ");
      } else {
        lines.push(`${indent}${dir.name}/ (${dir.total} files)`);
      }
    }
    for (const file of [...node.files].sort()) lines.push(`${indent}${file}`);
  };
  walk(root, "");

  if (lines.length > maxLines) {
    const omitted = lines.length - maxLines;
    return [...lines.slice(0, maxLines), `… (${omitted} more entries)`].join("\n");
  }
  return lines.join("\n");
}

/** Compact text form of the map for the `<project_map>` block (04 §4). */
export function renderProjectMap(map: ProjectMap, options: { maxTreeLines?: number } = {}): string {
  const maxTreeLines = options.maxTreeLines ?? MAX_TREE_LINES;
  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : "(none)");
  const languages = Object.entries(map.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang} ${count}`);

  const sections: string[] = [
    `files: ${map.fileCount}`,
    `languages: ${list(languages)}`,
    `stack: ${list(map.stack)}`,
    `uses_ai: ${map.usesAI ? "yes" : "no"}`,
  ];

  for (const manifest of map.packageManifests) {
    sections.push(
      `manifest ${manifest.path}${manifest.name ? ` (${manifest.name})` : ""}:`,
      `  dependencies: ${list(manifest.dependencies)}`,
      `  devDependencies: ${list(manifest.devDependencies)}`,
      `  scripts: ${list(Object.keys(manifest.scripts))}`,
    );
  }

  sections.push(
    `config_files: ${list(map.configFiles)}`,
    `test_files: ${map.testFiles.length > 0 ? `${map.testFiles.length} — ${list(map.testFiles.slice(0, 30))}${map.testFiles.length > 30 ? ", …" : ""}` : "(none)"}`,
    `ci_files: ${list(map.ciFiles)}`,
    `entry_points: ${list(map.entryPoints.slice(0, 60))}${map.entryPoints.length > 60 ? ", …" : ""}`,
  );
  if (maxTreeLines > 0) sections.push("tree:", renderTree(map.tree.map((f) => f.path), maxTreeLines));

  return sections.join("\n");
}
