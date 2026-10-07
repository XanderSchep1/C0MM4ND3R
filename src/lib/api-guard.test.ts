import { beforeEach, describe, expect, it, vi } from "vitest";

const hit = vi.hoisted(() => vi.fn());
vi.mock("./rate-limit", () => ({ hitRateLimit: hit, describeWait: (s: number) => `${s} seconds` }));

import { API_LIMITS, limitRequest } from "./api-guard";

describe("limitRequest", () => {
  beforeEach(() => hit.mockReset());

  it("returns null while the user is under the limit, counting per user and bucket", async () => {
    hit.mockResolvedValue({ limited: false, retryAfterSeconds: 1 });
    expect(await limitRequest("user-1", "simulate")).toBeNull();
    expect(hit).toHaveBeenCalledWith("api:simulate:user-1", API_LIMITS.simulate.limit, API_LIMITS.simulate.windowSeconds);
  });

  it("answers 429 with Retry-After once the limit is hit, keeping the extra body fields", async () => {
    hit.mockResolvedValue({ limited: true, retryAfterSeconds: 42 });
    const res = await limitRequest("user-1", "search", { cards: [], hasMore: false });
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("42");
    expect(await res?.json()).toEqual({ cards: [], hasMore: false, error: "Too many requests — try again in 42 seconds." });
  });

  it("gives every user their own counter", async () => {
    hit.mockResolvedValue({ limited: false, retryAfterSeconds: 1 });
    await limitRequest("user-1", "combos");
    await limitRequest("user-2", "combos");
    expect(hit.mock.calls.map(([key]) => key)).toEqual(["api:combos:user-1", "api:combos:user-2"]);
  });
});
