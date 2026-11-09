import { describe, expect, it } from "vitest";
import { REDACTED, redactionLimitation, redactSecrets } from "@/lib/repo/redact";

const lineCount = (s: string) => s.split("\n").length;

describe("redactSecrets", () => {
  it.each([
    ["AWS access key", `const id = AKIAIOSFODNN7EXAMPLE;`],
    ["GitHub token", `GITHUB=ghp_${"a".repeat(36)}`],
    ["GitHub fine-grained PAT", `t = github_pat_${"A1b2".repeat(10)}`],
    ["OpenAI-style key", `key: sk-proj-${"x".repeat(30)}`],
    ["Anthropic-style key", `sk-ant-api03-${"Z".repeat(40)}`],
    ["Slack token", `xoxb-123456789012-abcdefghijkl`],
    ["Stripe live key", `stripe(sk_live_${"9".repeat(24)})`],
    ["Stripe restricted key", `rk_live_${"b".repeat(24)}`],
    ["JWT", `Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`],
  ])("redacts a %s", (_name, input) => {
    const { text, count } = redactSecrets(input);
    expect(text).toContain(REDACTED);
    expect(count).toBe(1);
  });

  it("redacts private key blocks and keeps the line count", () => {
    const input = [
      "const key = `",
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEowIBAAKCAQEA",
      "abcdefghijklmnop",
      "-----END RSA PRIVATE KEY-----",
      "`;",
      "export default key;",
    ].join("\n");
    const { text, count } = redactSecrets(input);
    expect(count).toBe(1);
    expect(text).not.toContain("MIIEowIBAAKCAQEA");
    expect(lineCount(text)).toBe(lineCount(input));
    expect(text.split("\n")[6]).toBe("export default key;");
  });

  it("keeps the key name of generic assignments and redacts only the value", () => {
    const { text, count } = redactSecrets(
      [
        `const password = "hunter2hunter2";`,
        `CLIENT_SECRET: 'abcd1234efgh5678',`,
        `"apiKey": "live-1234567890",`,
        `export const PAYMENTS_API_KEY = "pk_fixture_3f9a8b7c6d5e4f10a1b2";`,
        `authToken = "zzzzzzzzzz"`,
      ].join("\n"),
    );
    expect(count).toBe(5);
    expect(text).toContain(`const password = "${REDACTED}";`);
    expect(text).toContain(`CLIENT_SECRET: '${REDACTED}',`);
    expect(text).toContain(`"apiKey": "${REDACTED}",`);
    expect(text).toContain(`PAYMENTS_API_KEY = "${REDACTED}"`);
    expect(text).not.toMatch(/hunter2|abcd1234|live-123|pk_fixture|zzzz/);
  });

  it("does not touch ordinary code", () => {
    const code = [
      "const token = req.headers.authorization;",
      "const password = form.get('password');",
      "if (!token) throw new Error('missing token');",
      "const label = \"Enter your password\";",
      "type Secret = { value: string };",
      "const apiKey = process.env.API_KEY;",
      "const short = { token: \"abc\" };",
    ].join("\n");
    expect(redactSecrets(code)).toEqual({ text: code, count: 0 });
  });

  it("counts each secret once even when rules overlap", () => {
    const { text, count } = redactSecrets(`const token = "ghp_${"a".repeat(36)}";`);
    expect(count).toBe(1);
    expect(text).toBe(`const token = "${REDACTED}";`);
  });

  it("preserves line count across many secrets", () => {
    const input = Array.from({ length: 50 }, (_, i) => `k${i} = "sk-${"q".repeat(25)}${i}"`).join("\n");
    const { text, count } = redactSecrets(input);
    expect(count).toBe(50);
    expect(lineCount(text)).toBe(50);
  });
});

describe("redactionLimitation", () => {
  it("states the count without values", () => {
    expect(redactionLimitation(0)).toBeNull();
    expect(redactionLimitation(1)).toBe("1 possible secret redacted");
    expect(redactionLimitation(3)).toBe("3 possible secrets redacted");
  });
});
