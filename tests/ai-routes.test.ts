import { describe, expect, it } from "vitest";
import { buildAiConfig, chainFor } from "@/lib/ai/config";
import { AiConfigError } from "@/lib/ai/errors";
import { buildProviders } from "@/lib/ai/providers";
import { isValidTaskId, parseTaskRoutes } from "@/lib/ai/routes";

const env = {
  GEMINI_API_KEY: "k",
  GROQ_API_KEY: "g",
  AI_REVIEW_MODELS: "gemini:review-a,gemini:review-b",
  AI_LIGHT_MODELS: "gemini:light-a",
};

describe("task ids", () => {
  it("accepts known tasks with optional @TYPE", () => {
    for (const id of ["planner", "synthesis", "recheck", "persona.security", "persona.reliability@ISSUE", "synthesis@RELEASE"]) {
      expect(isValidTaskId(id)).toBe(true);
    }
  });

  it("rejects unknown tasks, personas and types", () => {
    for (const id of ["summary", "persona.hacker", "planner@NOPE", "persona", "planner@ASK@ASK"]) {
      expect(isValidTaskId(id)).toBe(false);
    }
  });
});

describe("parseTaskRoutes", () => {
  it("parses routes with flags", () => {
    const { routes } = parseTaskRoutes("persona.algorithms=groq:code-model|max=6000;synthesis@RELEASE=gemini:x", buildProviders(env));
    expect(routes.get("persona.algorithms")?.[0]).toMatchObject({ provider: "groq", model: "code-model", routed: true });
    expect(routes.get("persona.algorithms")?.[0].flags.max).toBe(6000);
    expect(routes.has("synthesis@RELEASE")).toBe(true);
  });

  it("ignores entries whose provider has no key, with a warning", () => {
    const { routes, warnings } = parseTaskRoutes("planner=openrouter:vendor/m:free", buildProviders(env));
    expect(routes.has("planner")).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("planner");
  });

  it("errors on unknown task ids or providers", () => {
    expect(() => parseTaskRoutes("summary=groq:m", buildProviders(env))).toThrow(AiConfigError);
    expect(() => parseTaskRoutes("planner=paid:m", buildProviders(env))).toThrow(/unknown provider/);
  });
});

describe("resolution order", () => {
  it("uses only the role chain when no routes are configured", () => {
    const config = buildAiConfig(env);
    expect(chainFor(config, "review", "persona.security", "PROJECT_HEALTH").map((e) => e.model)).toEqual([
      "review-a",
      "review-b",
    ]);
  });

  it("puts task@TYPE before task before the role chain", () => {
    const config = buildAiConfig({
      ...env,
      AI_TASK_ROUTES: "persona.reliability=groq:general;persona.reliability@ISSUE=groq:logs",
    });
    expect(chainFor(config, "review", "persona.reliability", "ISSUE").map((e) => e.model)).toEqual([
      "logs",
      "general",
      "review-a",
      "review-b",
    ]);
    expect(chainFor(config, "review", "persona.reliability", "ASK").map((e) => e.model)).toEqual([
      "general",
      "review-a",
      "review-b",
    ]);
  });
});
