import path from "node:path";
import type { FileReader } from "@/lib/repo/files";

/**
 * One-hop JS/TS import resolution (04 §5b). Regex-based on purpose: no AST,
 * no dependency graph, no execution of repository code.
 */

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/** Source files whose imports are worth parsing. */
export const IMPORTING_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro",
]);

const SPECIFIER_PATTERNS: RegExp[] = [
  // import x from "y"; import { a } from 'y'; import type T from "y"; export * from "y"
  /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*["']([^"'\n]+)["']/g,
  // import "y" (side effect)
  /\bimport\s*["']([^"'\n]+)["']/g,
  // require("y")
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  // import("y")
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];

/** Every module specifier in `source`, in order of first appearance, unique. */
export function parseImportSpecifiers(source: string): string[] {
  const found: { index: number; spec: string }[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.push({ index: match.index ?? 0, spec: match[1] });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return [...new Set(found.map((f) => f.spec))];
}

/** `compilerOptions.paths` from tsconfig/jsconfig, with targets made repo-relative. */
export type PathAliases = { pattern: string; targets: string[] }[];

/** Strips // and /* *\/ comments and trailing commas so tsconfig (JSONC) parses. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * Reads path aliases from the root `tsconfig.json` (or `jsconfig.json`).
 * NOTE: `extends` chains are not followed; root-level `paths` covers the
 * common `@/*` setups and keeps this simple.
 */
export function loadPathAliases(read: FileReader): PathAliases {
  for (const configPath of ["tsconfig.json", "jsconfig.json"]) {
    const text = read(configPath);
    if (text === null) continue;
    let config: unknown;
    try {
      config = parseJsonc(text);
    } catch {
      continue;
    }
    const options = (config as { compilerOptions?: Record<string, unknown> } | null)
      ?.compilerOptions;
    if (!options) return [];
    const baseUrl = typeof options.baseUrl === "string" ? options.baseUrl : ".";
    const paths = options.paths;
    if (!paths || typeof paths !== "object") return [];

    const aliases: PathAliases = [];
    for (const [pattern, targets] of Object.entries(paths as Record<string, unknown>)) {
      if (!Array.isArray(targets)) continue;
      aliases.push({
        pattern,
        targets: targets
          .filter((t): t is string => typeof t === "string")
          .map((t) => path.posix.normalize(path.posix.join(baseUrl, t))),
      });
    }
    return aliases;
  }
  return [];
}

/** Context shared by every resolution in one snapshot. */
export type ImportResolver = {
  fileSet: ReadonlySet<string>;
  aliases: PathAliases;
};

export function createImportResolver(
  files: { path: string }[] | string[],
  read: FileReader,
): ImportResolver {
  const fileSet = new Set(files.map((f) => (typeof f === "string" ? f : f.path)));
  return { fileSet, aliases: loadPathAliases(read) };
}

/** Tries the path itself, known extensions, `.js`→`.ts` swaps, then `/index.*`. */
function resolveCandidate(base: string, fileSet: ReadonlySet<string>): string | null {
  const normalized = path.posix.normalize(base);
  if (normalized.startsWith("../") || normalized === "..") return null;

  const candidates = [normalized];
  // TS ESM style: `./x.js` written in source, `x.ts` on disk.
  const jsExt = /\.(m|c)?jsx?$/.exec(normalized);
  if (jsExt) {
    const stem = normalized.slice(0, -jsExt[0].length);
    const tsExt = jsExt[0].replace("js", "ts");
    candidates.push(stem + tsExt, stem + ".tsx");
  }
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(normalized + ext);
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(`${normalized}/index${ext}`);

  return candidates.find((c) => fileSet.has(c)) ?? null;
}

function matchAlias(spec: string, pattern: string): string | null {
  const star = pattern.indexOf("*");
  if (star === -1) return spec === pattern ? "" : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) return null;
  if (spec.length < prefix.length + suffix.length) return null;
  return spec.slice(prefix.length, spec.length - suffix.length);
}

/**
 * Resolves one specifier imported by `fromPath` to a repository file, or null
 * for packages, unresolvable paths, and anything outside the repository.
 */
export function resolveImport(
  fromPath: string,
  spec: string,
  resolver: ImportResolver,
): string | null {
  if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
    return resolveCandidate(path.posix.join(path.posix.dirname(fromPath), spec), resolver.fileSet);
  }
  if (spec.startsWith("/")) return null;

  // Longest pattern prefix wins, like TypeScript.
  const aliases = [...resolver.aliases].sort((a, b) => b.pattern.length - a.pattern.length);
  for (const alias of aliases) {
    const captured = matchAlias(spec, alias.pattern);
    if (captured === null) continue;
    for (const target of alias.targets) {
      const resolved = resolveCandidate(target.replace("*", captured), resolver.fileSet);
      if (resolved) return resolved;
    }
  }
  return null; // a package import
}

function canImport(p: string): boolean {
  return IMPORTING_EXTENSIONS.has(path.posix.extname(p));
}

/** Local files directly imported by `fromPath` (one hop), in source order. */
export function localImportsOf(
  fromPath: string,
  read: FileReader,
  resolver: ImportResolver,
): string[] {
  if (!canImport(fromPath)) return [];
  const source = read(fromPath);
  if (source === null) return [];
  const resolved = parseImportSpecifiers(source)
    .map((spec) => resolveImport(fromPath, spec, resolver))
    .filter((p): p is string => p !== null && p !== fromPath);
  return [...new Set(resolved)];
}

/**
 * Files that import `targetPath` (LATEST_CHANGES, 04 §5b step 3).
 * A cheap text filter on the module's basename narrows candidates; each is
 * then confirmed by real resolution so unrelated name matches are dropped.
 */
export function findImporters(
  targetPath: string,
  read: FileReader,
  resolver: ImportResolver,
  limit = 10,
): string[] {
  const ext = path.posix.extname(targetPath);
  let needle = path.posix.basename(targetPath, ext);
  // `foo/index.ts` is imported as `foo`.
  if (needle === "index") needle = path.posix.basename(path.posix.dirname(targetPath));
  if (!needle || needle === ".") return [];

  const importers: string[] = [];
  for (const candidate of resolver.fileSet) {
    if (importers.length >= limit) break;
    if (candidate === targetPath || !canImport(candidate)) continue;
    const source = read(candidate);
    if (source === null || !source.includes(needle)) continue;
    if (localImportsOf(candidate, read, resolver).includes(targetPath)) {
      importers.push(candidate);
    }
  }
  return importers;
}
