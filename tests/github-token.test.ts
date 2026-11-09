import { describe, expect, it } from "vitest";
import { isTokenUsable } from "@/lib/github/user";

const NOW = 1_700_000_000;

describe("isTokenUsable", () => {
  it("rejects a missing access token", () => {
    expect(
      isTokenUsable({ access_token: null, refresh_token: "r", expires_at: null }, NOW),
    ).toBe(false);
  });

  it("accepts a token with no recorded expiry", () => {
    expect(
      isTokenUsable({ access_token: "t", refresh_token: null, expires_at: null }, NOW),
    ).toBe(true);
  });

  it("accepts a token that expires comfortably in the future", () => {
    expect(
      isTokenUsable(
        { access_token: "t", refresh_token: "r", expires_at: NOW + 3600 },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects an already expired token", () => {
    expect(
      isTokenUsable(
        { access_token: "t", refresh_token: "r", expires_at: NOW - 1 },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a token inside the 60s refresh margin", () => {
    expect(
      isTokenUsable(
        { access_token: "t", refresh_token: "r", expires_at: NOW + 30 },
        NOW,
      ),
    ).toBe(false);
  });

  it("treats the exact margin boundary as not usable", () => {
    expect(
      isTokenUsable(
        { access_token: "t", refresh_token: "r", expires_at: NOW + 60 },
        NOW,
      ),
    ).toBe(false);
  });
});
