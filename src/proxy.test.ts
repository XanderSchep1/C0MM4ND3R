import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildCsp, proxy } from "./proxy";

describe("buildCsp", () => {
  const csp = buildCsp("abc123", false);
  const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("only lets scripts with the request's nonce run", () => {
    const scripts = directive("script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development", () => {
    expect(directive("script-src")).not.toContain("unsafe-eval");
    expect(buildCsp("abc123", true)).toContain("'unsafe-eval'");
  });

  it("blocks framing, plugins and foreign form targets", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("form-action")).toBe("form-action 'self'");
  });

  it("only loads images from this site and Scryfall", () => {
    expect(directive("img-src")).toBe("img-src 'self' data: blob: https://cards.scryfall.io https://svgs.scryfall.io");
    expect(directive("connect-src")).toBe("connect-src 'self'");
  });
});

describe("proxy", () => {
  it("sets a CSP carrying a fresh nonce on every request", () => {
    const nonces = [1, 2, 3].map(() => {
      const csp = proxy(new NextRequest("http://localhost/decks")).headers.get("content-security-policy") ?? "";
      const match = csp.match(/'nonce-([^']+)'/);
      expect(match).not.toBeNull();
      return match![1];
    });
    expect(new Set(nonces).size).toBe(3);
  });
});
