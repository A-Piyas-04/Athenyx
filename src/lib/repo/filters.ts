import path from "node:path";

/**
 * Which repository files Athenyx may read (04 §4).
 *
 * All functions take repository-relative POSIX paths ("src/lib/x.ts"). They are
 * pure so the same rules apply during tar extraction (to avoid writing ignored
 * or secret files at all) and when scanning the extracted snapshot.
 */

/** Why a file is not part of the review context. Mirrors `Coverage.filesExcluded`. */
export type ExclusionReason =
  | "budget"
  | "ignored"
  | "secret"
  | "binary"
  | "too_large";

export type ExcludedFile = { path: string; reason: ExclusionReason };

/** Files larger than this are never read. */
export const MAX_FILE_BYTES = 200 * 1024;

/** Bytes inspected for a null byte when detecting binary files. */
export const BINARY_SNIFF_BYTES = 8 * 1024;

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".vercel",
  "coverage",
  "vendor",
  ".cache",
  "__pycache__",
  ".venv",
  "target",
  "bin",
  "obj",
]);

const LOCKFILES: ReadonlySet<string> = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

/** Images, fonts, media, archives and documents — never useful as review context. */
const IGNORED_EXTENSIONS: ReadonlySet<string> = new Set([
  // images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".avif", ".tiff", ".tif", ".psd", ".heic",
  // fonts
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  // audio / video
  ".mp3", ".mp4", ".wav", ".ogg", ".oga", ".webm", ".mov", ".avi", ".mkv", ".flac", ".m4a",
  // archives
  ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar",
  // documents
  ".pdf",
  // source maps and test snapshots
  ".map", ".snap",
]);

const SECRET_EXTENSIONS: ReadonlySet<string> = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".keystore",
]);

const SECRET_NAMES: ReadonlySet<string> = new Set([
  ".env",
  "credentials.json",
  ".npmrc",
  ".netrc",
]);

/** `.env.*` variants that hold placeholders rather than real values. */
const ENV_TEMPLATES: ReadonlySet<string> = new Set([".env.example", ".env.sample"]);

/** Normalizes to a relative POSIX path without leading "./" or trailing "/". */
export function normalizeRepoPath(p: string): string {
  return p.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

/**
 * The first ignored directory in `p`, e.g. "packages/web/node_modules" for
 * "packages/web/node_modules/x/index.js". Only directory segments count, so a
 * file named "build" is not ignored by this rule.
 */
export function ignoredDirOf(p: string, isDirectory = false): string | null {
  const parts = normalizeRepoPath(p).split("/");
  const dirCount = isDirectory ? parts.length : parts.length - 1;
  for (let i = 0; i < dirCount; i++) {
    if (IGNORED_DIRS.has(parts[i])) return parts.slice(0, i + 1).join("/");
  }
  return null;
}

/** True for files that may contain credentials. These are never read. */
export function isSecretPath(p: string): boolean {
  const base = path.posix.basename(normalizeRepoPath(p)).toLowerCase();
  if (ENV_TEMPLATES.has(base)) return false;
  if (SECRET_NAMES.has(base) || base.startsWith(".env.")) return true;
  if (SECRET_EXTENSIONS.has(path.posix.extname(base))) return true;
  if (base.startsWith("id_rsa")) return true;
  if (base.startsWith("service-account") && base.endsWith(".json")) return true;
  return false;
}

/** True for lockfiles, minified bundles, source maps, snapshots and media files. */
export function isIgnoredFileName(p: string): boolean {
  const base = path.posix.basename(normalizeRepoPath(p)).toLowerCase();
  if (LOCKFILES.has(base)) return true;
  if (base.endsWith(".min.js")) return true;
  return IGNORED_EXTENSIONS.has(path.posix.extname(base));
}

/**
 * Path-only classification of a file (no content needed).
 * Returns null when the file may be read, subject to size and binary checks.
 */
export function classifyPath(p: string): "ignored" | "secret" | null {
  if (ignoredDirOf(p) !== null) return "ignored";
  if (isSecretPath(p)) return "secret";
  if (isIgnoredFileName(p)) return "ignored";
  return null;
}

/** True when the buffer looks binary: a null byte within the first 8KB. */
export function isBinaryContent(buffer: Uint8Array): boolean {
  const end = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < end; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Full classification of one file. `head` is optional so callers that only
 * know the size (tar headers) can still apply the size rule.
 */
export function classifyFile(
  p: string,
  size: number,
  head?: Uint8Array,
): ExclusionReason | null {
  const byPath = classifyPath(p);
  if (byPath) return byPath;
  if (size > MAX_FILE_BYTES) return "too_large";
  if (head && isBinaryContent(head)) return "binary";
  return null;
}

/** Test-file convention used across the mapper and context expansion. */
export function isTestPath(p: string): boolean {
  const normalized = normalizeRepoPath(p);
  const base = path.posix.basename(normalized);
  if (/\.(test|spec)\.[^.]+$/.test(base)) return true;
  return /(^|\/)(__tests__|tests?|e2e)\//.test(normalized);
}
