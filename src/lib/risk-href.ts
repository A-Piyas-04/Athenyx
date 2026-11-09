/** Risk Center query; the URL (searchParams) is the single source of truth (07). */
export type RiskQuery = { status?: string; severity: string[]; persona: string | null; classification: string | null; q: string };

/** Builds a Risk Center URL. Shared by the server page (status tabs) and the client filters. */
export function riskHref(base: string, query: RiskQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.severity.length > 0) params.set("severity", query.severity.join(","));
  if (query.persona) params.set("persona", query.persona);
  if (query.classification) params.set("classification", query.classification);
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}
