import { ArrowUpRight } from "lucide-react";
import type { EvidenceItem } from "@/lib/review/types";

export function blobUrl(owner: string, repo: string, item: Pick<EvidenceItem, "path" | "startLine" | "endLine" | "commitSha">) {
  const path = item.path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repo}/blob/${item.commitSha}/${path}#L${item.startLine}-L${item.endLine}`;
}

/** One validated evidence item: a GitHub link at the reviewed SHA plus the snapshot lines. */
export function EvidenceBlock({ item, owner, repo }: { item: EvidenceItem; owner: string; repo: string }) {
  const lines = item.snippet.split("\n");
  const width = String(item.startLine + lines.length - 1).length;
  return (
    <figure className="overflow-hidden rounded-md border border-border bg-card">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <a
          href={blobUrl(owner, repo, item)}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex min-w-0 items-center gap-1 font-mono text-foreground"
        >
          <span className="link-underline truncate">
            {item.path}:{item.startLine}
            {item.endLine !== item.startLine ? `–${item.endLine}` : ""}
          </span>
          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
        <span className="font-mono text-muted-foreground">
          {item.symbol ? `${item.symbol}  ` : ""}
          {item.commitSha.slice(0, 7)}
        </span>
      </figcaption>
      <pre className="overflow-x-auto bg-muted/50 p-0 text-[0.8125rem] leading-6">
        <code className="block min-w-max py-2.5 font-mono">
          {lines.map((line, i) => (
            <span key={i} className="flex">
              <span className="px-3 text-right text-subtle tabular-nums select-none" style={{ minWidth: `${width + 2}ch` }}>
                {item.startLine + i}
              </span>
              <span className="pr-4 whitespace-pre">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
