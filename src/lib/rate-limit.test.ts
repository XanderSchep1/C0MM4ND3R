import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("./prisma", () => ({ prisma: { $queryRaw: queryRaw, rateLimit: { deleteMany: vi.fn() } } }));

import { clientIp, describeWait, hitRateLimit } from "./rate-limit";

describe("hitRateLimit", () => {
  beforeEach(() => queryRaw.mockReset());

  it("lets requests through up to the limit and blocks the one after", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 5, windowStart: new Date() }]);
    expect((await hitRateLimit("k", 5, 60)).limited).toBe(false);
    queryRaw.mockResolvedValueOnce([{ count: 6, windowStart: new Date() }]);
    expect((await hitRateLimit("k", 5, 60)).limited).toBe(true);
  });

  it("reports how long until the window rolls over", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 99, windowStart: new Date(Date.now() - 20_000) }]);
    const { retryAfterSeconds } = await hitRateLimit("k", 5, 60);
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(39);
    expect(retryAfterSeconds).toBeLessThanOrEqual(41);
  });

  it("never reports a wait shorter than a second", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 99, windowStart: new Date(Date.now() - 120_000) }]);
    expect((await hitRateLimit("k", 5, 60)).retryAfterSeconds).toBe(1);
  });
});

describe("clientIp", () => {
  it("takes the first address Vercel put in x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to a placeholder", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("describeWait", () => {
  it("uses seconds for short waits and minutes for long ones", () => {
    expect(describeWait(45)).toBe("45 seconds");
    expect(describeWait(119)).toBe("119 seconds");
    expect(describeWait(120)).toBe("2 minutes");
    expect(describeWait(601)).toBe("11 minutes");
  });
});
