import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/lib/projects/schemas";

describe("createProjectSchema", () => {
  it("accepts a valid body", () => {
    const parsed = createProjectSchema.parse({
      installationId: 42,
      repoId: 123,
      branch: "main",
    });
    expect(parsed).toEqual({ installationId: 42, repoId: 123, branch: "main" });
  });

  it("coerces numeric strings (query/form sources)", () => {
    const parsed = createProjectSchema.parse({
      installationId: "42",
      repoId: "123",
      branch: "develop",
    });
    expect(parsed.installationId).toBe(42);
    expect(parsed.repoId).toBe(123);
  });

  it("trims the branch name", () => {
    expect(
      createProjectSchema.parse({
        installationId: 1,
        repoId: 1,
        branch: "  feature/x  ",
      }).branch,
    ).toBe("feature/x");
  });

  it("rejects a missing branch", () => {
    expect(() =>
      createProjectSchema.parse({ installationId: 1, repoId: 1 }),
    ).toThrow();
  });

  it("rejects an empty branch", () => {
    expect(() =>
      createProjectSchema.parse({ installationId: 1, repoId: 1, branch: "   " }),
    ).toThrow();
  });

  it("rejects non-positive ids", () => {
    expect(() =>
      createProjectSchema.parse({ installationId: 0, repoId: 1, branch: "main" }),
    ).toThrow();
    expect(() =>
      createProjectSchema.parse({ installationId: 1, repoId: -5, branch: "main" }),
    ).toThrow();
  });
});

describe("updateProjectSchema", () => {
  it("accepts a branch change", () => {
    expect(updateProjectSchema.parse({ selectedBranch: "main" })).toEqual({
      selectedBranch: "main",
    });
  });

  it("rejects an empty body", () => {
    expect(() => updateProjectSchema.parse({})).toThrow();
  });

  it("ignores unknown keys", () => {
    expect(
      updateProjectSchema.parse({ selectedBranch: "main", userId: "hacker" }),
    ).toEqual({ selectedBranch: "main" });
  });
});
