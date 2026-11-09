import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://athenyx:athenyx@localhost:5432/athenyx",
  AUTH_SECRET: "test-secret",
  AUTH_GITHUB_ID: "Iv1.test",
  AUTH_GITHUB_SECRET: "test-client-secret",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_SLUG: "athenyx-test",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
};

describe("parseEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv({ ...validEnv });

    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.MAX_PERSONAS_PER_RUN).toBe(3);
    expect(env.MAX_REVIEWS_PER_USER_PER_DAY).toBe(5);
    expect(env.WORKER_CONCURRENCY).toBe(1);
  });

  it("lists every missing key in one error", () => {
    expect(() => parseEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrowError(
      /AUTH_SECRET[\s\S]*GITHUB_APP_PRIVATE_KEY/,
    );
  });

  it("treats an empty value as missing so defaults still apply", () => {
    const env = parseEnv({ ...validEnv, MAX_SNAPSHOT_MB: "" });
    expect(env.MAX_SNAPSHOT_MB).toBe(50);
  });

  it('converts a "\\n"-escaped private key into real newlines', () => {
    const env = parseEnv({
      ...validEnv,
      GITHUB_APP_PRIVATE_KEY:
        '"-----BEGIN RSA PRIVATE KEY-----\\nline1\\nline2\\n-----END RSA PRIVATE KEY-----"',
    });

    expect(env.GITHUB_APP_PRIVATE_KEY).toBe(
      "-----BEGIN RSA PRIVATE KEY-----\nline1\nline2\n-----END RSA PRIVATE KEY-----",
    );
    expect(env.GITHUB_APP_PRIVATE_KEY).not.toContain("\\n");
  });

  it("keeps a PEM that already has real newlines unchanged", () => {
    const env = parseEnv({ ...validEnv });
    expect(env.GITHUB_APP_PRIVATE_KEY).toBe(validEnv.GITHUB_APP_PRIVATE_KEY);
  });

  it("coerces numeric limits from strings", () => {
    const env = parseEnv({ ...validEnv, MAX_REVIEWS_PER_USER_PER_DAY: "12" });
    expect(env.MAX_REVIEWS_PER_USER_PER_DAY).toBe(12);
  });

  it("rejects an invalid APP_URL", () => {
    expect(() => parseEnv({ ...validEnv, APP_URL: "not-a-url" })).toThrowError(/APP_URL/);
  });
});
