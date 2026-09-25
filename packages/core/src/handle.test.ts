import { describe, expect, it } from "vitest";
import { formatHandle, parseHandle, toAcctUri } from "./handle.ts";

describe("parseHandle", () => {
  it("parses full handles with and without the leading @", () => {
    expect(parseHandle("@mira@tilde.zone")).toEqual({ username: "mira", domain: "tilde.zone" });
    expect(parseHandle("jonah@Mastodon.Social")).toEqual({ username: "jonah", domain: "mastodon.social" });
  });

  it("resolves bare usernames against the local domain", () => {
    expect(parseHandle("sam", "pinstripe.social")).toEqual({ username: "sam", domain: "pinstripe.social" });
    expect(parseHandle("sam")).toBeNull();
  });

  it("accepts a port for local development", () => {
    expect(parseHandle("sam@localhost.test:8000")).toEqual({ username: "sam", domain: "localhost.test:8000" });
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "@", "a@b@c.d", "sp ace@x.org", "user@nodot", ".dot@x.org", "a".repeat(31) + "@x.org"]) {
      expect(parseHandle(bad, "pinstripe.social")).toBeNull();
    }
  });
});

describe("formatting", () => {
  it("round-trips", () => {
    const h = { username: "sam", domain: "pinstripe.social" };
    expect(formatHandle(h)).toBe("@sam@pinstripe.social");
    expect(parseHandle(formatHandle(h))).toEqual(h);
    expect(toAcctUri(h)).toBe("acct:sam@pinstripe.social");
  });
});
