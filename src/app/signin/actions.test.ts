import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  issueRecoveryCode: vi.fn(),
  hitRateLimit: vi.fn(),
}));

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: mocks.findFirst, create: mocks.create, update: mocks.update } } }));
vi.mock("@/lib/recovery-code", () => ({ issueRecoveryCode: mocks.issueRecoveryCode }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: mocks.hitRateLimit,
  clientIp: () => "203.0.113.9",
  describeWait: (s: number) => `${s} seconds`,
}));

import { registerAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const signup = (email: string) => form({ name: "Eve", email, password: "a-long-enough-password" });

describe("registerAction", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.hitRateLimit.mockResolvedValue({ limited: false, retryAfterSeconds: 1 });
    mocks.issueRecoveryCode.mockResolvedValue("ABCD-EFGH-JKMN-PQRS");
    mocks.create.mockResolvedValue({ id: "new-user" });
    mocks.signIn.mockResolvedValue(undefined);
  });

  it("cannot be used to take over an existing account that has no password", async () => {
    mocks.findFirst.mockResolvedValue({ id: "old-user" });
    const result = await registerAction({}, signup("xander@example.com"));
    expect(result.error).toMatch(/already exists/);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.issueRecoveryCode).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("looks emails up case-insensitively", async () => {
    mocks.findFirst.mockResolvedValue({ id: "old-user" });
    await registerAction({}, signup("  Xander@Example.COM "));
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({ email: { equals: "xander@example.com", mode: "insensitive" } });
  });

  it("creates a new account, issues a recovery code and signs in", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const result = await registerAction({}, signup("New@Example.com"));
    expect(result).toEqual({ recoveryCode: "ABCD-EFGH-JKMN-PQRS" });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.email).toBe("new@example.com");
    expect(data.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(data.passwordHash).not.toContain("a-long-enough-password");
    expect(mocks.issueRecoveryCode).toHaveBeenCalledWith("new-user");
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ email: "new@example.com", redirect: false }));
  });

  it("reports a duplicate when two sign-ups race for the same email", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const result = await registerAction({}, signup("racer@example.com"));
    expect(result.error).toMatch(/already exists/);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("stops before touching the database when rate limited", async () => {
    mocks.hitRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 30 });
    const result = await registerAction({}, signup("new@example.com"));
    expect(result.error).toMatch(/Too many sign-up attempts/);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects bad emails and weak passwords", async () => {
    expect((await registerAction({}, signup("not-an-email"))).error).toMatch(/valid email/);
    expect((await registerAction({}, form({ email: "a@b.co", password: "short" }))).error).toMatch(/at least 8/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
