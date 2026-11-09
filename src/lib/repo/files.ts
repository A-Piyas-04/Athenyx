import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  BINARY_SNIFF_BYTES,
  classifyFile,
  ignoredDirOf,
  type ExcludedFile,
} from "@/lib/repo/filters";

/**
 * The readable files of one extracted snapshot.
 *
 * `files` holds only files that passed every filter, so anything downstream
 * (mapper, search, context) can only ever see allowed content.
 */
export type SnapshotFiles = {
  root: string;
  files: { path: string; size: number }[];
  excluded: ExcludedFile[];
};

/** Reads a file's text by repository path, or null when it is not readable. */
export type FileReader = (repoPath: string) => string | null;

async function readHead(absolute: string): Promise<Uint8Array> {
  const handle = await open(absolute, "r");
  try {
    const buffer = Buffer.alloc(BINARY_SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Walks an extracted snapshot and applies the filters (04 §4).
 *
 * `alreadyExcluded` carries entries skipped during extraction (secret and
 * ignored files that were never written to disk) so coverage stays complete.
 * Symlinks are skipped: extraction never creates them, so one here means the
 * directory was not produced by `extractSnapshot`.
 */
export async function scanSnapshot(
  root: string,
  alreadyExcluded: ExcludedFile[] = [],
): Promise<SnapshotFiles> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files: SnapshotFiles["files"] = [];
  const excluded: ExcludedFile[] = [...alreadyExcluded];
  const ignoredDirs = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    const repoPath = path.relative(root, absolute).split(path.sep).join("/");

    const ignoredDir = ignoredDirOf(repoPath);
    if (ignoredDir) {
      // One entry per ignored directory keeps coverage readable.
      if (!ignoredDirs.has(ignoredDir)) {
        ignoredDirs.add(ignoredDir);
        excluded.push({ path: `${ignoredDir}/`, reason: "ignored" });
      }
      continue;
    }

    const { size } = await stat(absolute);
    let reason = classifyFile(repoPath, size);
    if (!reason) reason = classifyFile(repoPath, size, await readHead(absolute));

    if (reason) excluded.push({ path: repoPath, reason });
    else files.push({ path: repoPath, size });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  excluded.sort((a, b) => a.path.localeCompare(b.path));
  return { root, files, excluded: dedupeExcluded(excluded) };
}

function dedupeExcluded(list: ExcludedFile[]): ExcludedFile[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

/**
 * Loads the text of every allowed file once, so search, imports and context
 * building share one in-memory copy. Files are ≤ 200KB each.
 */
export async function loadSnapshotText(
  snapshot: SnapshotFiles,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const file of snapshot.files) {
    const text = await readFile(path.join(snapshot.root, file.path), "utf8");
    contents.set(file.path, text);
  }
  return contents;
}

/** A {@link FileReader} over preloaded text. Unknown paths read as null. */
export function readerFromMap(contents: Map<string, string>): FileReader {
  return (repoPath) => contents.get(repoPath) ?? null;
}
