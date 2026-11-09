import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Minimal ustar writer for tests. It lets tests craft archives that `tar.c`
 * would refuse to produce (symlinks pointing outside, `../` names, absolute
 * paths), mirroring what a hostile repository tarball could contain.
 */

export type TarEntry =
  | { type: "file"; name: string; content: string | Buffer }
  | { type: "dir"; name: string }
  | { type: "symlink"; name: string; target: string }
  | { type: "hardlink"; name: string; target: string };

const TYPE_FLAGS = { file: "0", hardlink: "1", symlink: "2", dir: "5" } as const;

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

function header(entry: TarEntry, size: number): Buffer {
  const block = Buffer.alloc(512, 0);
  const write = (text: string, offset: number, length: number) =>
    block.write(text.slice(0, length), offset, length, "utf8");

  const name = entry.type === "dir" && !entry.name.endsWith("/") ? `${entry.name}/` : entry.name;
  if (Buffer.byteLength(name) > 100) throw new Error(`tar test helper: name too long: ${name}`);

  write(name, 0, 100);
  write(octal(entry.type === "dir" ? 0o755 : 0o644, 8), 100, 8);
  write(octal(0, 8), 108, 8);
  write(octal(0, 8), 116, 8);
  write(octal(size, 12), 124, 12);
  write(octal(1_700_000_000, 12), 136, 12);
  write("        ", 148, 8); // checksum placeholder
  write(TYPE_FLAGS[entry.type], 156, 1);
  if (entry.type === "symlink" || entry.type === "hardlink") write(entry.target, 157, 100);
  write("ustar\0", 257, 6);
  write("00", 263, 2);

  let sum = 0;
  for (const byte of block) sum += byte;
  write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return block;
}

/** Builds a gzipped tarball from entries, in order. */
export function makeTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const content =
      entry.type === "file"
        ? Buffer.isBuffer(entry.content)
          ? entry.content
          : Buffer.from(entry.content)
        : Buffer.alloc(0);
    parts.push(header(entry, content.length));
    if (content.length > 0) {
      parts.push(content);
      const pad = (512 - (content.length % 512)) % 512;
      parts.push(Buffer.alloc(pad, 0));
    }
  }
  parts.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(parts));
}

/** Every file under `dir` as tar entries below `prefix/` (like GitHub's `owner-repo-sha/`). */
export function entriesFromDir(dir: string, prefix: string): TarEntry[] {
  const entries: TarEntry[] = [{ type: "dir", name: `${prefix}/` }];
  const walk = (current: string) => {
    for (const item of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const absolute = path.join(current, item.name);
      const relative = path.relative(dir, absolute).split(path.sep).join("/");
      if (item.isDirectory()) {
        entries.push({ type: "dir", name: `${prefix}/${relative}/` });
        walk(absolute);
      } else if (item.isFile()) {
        entries.push({ type: "file", name: `${prefix}/${relative}`, content: readFileSync(absolute) });
      }
    }
  };
  walk(dir);
  return entries;
}
