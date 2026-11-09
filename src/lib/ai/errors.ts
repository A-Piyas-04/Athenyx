/**
 * AI client errors. Messages are user-safe: they never contain prompts, keys
 * or provider response bodies.
 */

/** Every configured model is rate-limited, out of quota, or unavailable. */
export class AiUnavailableError extends Error {
  constructor(
    message = "All configured AI models are rate-limited or unavailable. Try again later.",
    readonly resetAt: number | null = null,
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** The AI configuration in the environment is invalid. */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

/** No configured model accepts an input of this size; the engine shrinks context and retries. */
export class AiContextTooLargeError extends Error {
  constructor(message = "The review context is too large for every configured AI model.") {
    super(message);
    this.name = "AiContextTooLargeError";
  }
}

/** The model kept returning output that did not match the schema. */
export class AiInvalidOutputError extends Error {
  constructor(message = "The AI model returned invalid output.") {
    super(message);
    this.name = "AiInvalidOutputError";
  }
}

/** A request was rejected as malformed (programming or configuration problem). */
export class AiBadRequestError extends Error {
  constructor(message = "The AI provider rejected the request.") {
    super(message);
    this.name = "AiBadRequestError";
  }
}

/** Input exceeded the role's budget — the context builder should have prevented this. */
export class AiBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBudgetError";
  }
}

export function isAiError(error: unknown): boolean {
  return (
    error instanceof AiUnavailableError ||
    error instanceof AiConfigError ||
    error instanceof AiContextTooLargeError ||
    error instanceof AiInvalidOutputError ||
    error instanceof AiBadRequestError ||
    error instanceof AiBudgetError
  );
}
