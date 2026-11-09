import { NextResponse } from "next/server";
import { z } from "zod";
import { describeError } from "@/lib/review/run-helpers";

/** An error that maps directly onto an HTTP response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = () =>
  new ApiError(401, "unauthorized", "You must be signed in.");

export const notFoundError = (what = "Resource") =>
  new ApiError(404, "not_found", `${what} not found.`);

export const forbidden = (message: string) =>
  new ApiError(403, "forbidden", message);

export const conflict = (message: string) =>
  new ApiError(409, "conflict", message);

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Parses and validates a JSON request body. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "validation_error", "Request body must be JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      400,
      "validation_error",
      "The request body is invalid.",
      z.treeifyError(result.error),
    );
  }
  return result.data;
}

/**
 * Wraps a route handler so thrown errors become consistent JSON responses.
 * Unexpected errors are logged server-side and reported as a generic 500 —
 * never leaking internals to the client.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            error: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
          { status: error.status },
        );
      }

      console.error(`[athenyx] Unhandled route error: ${describeError(error)}`);
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Something went wrong. Please try again.",
        },
        { status: 500 },
      );
    }
  };
}
