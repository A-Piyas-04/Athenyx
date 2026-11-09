/** Browser-side JSON requests to our API routes; throws with the API's user-facing message. */
export async function apiRequest<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error page.
  }
  if (!response.ok) {
    const message = (payload as { message?: string } | null)?.message;
    throw new Error(message ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
