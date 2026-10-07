import { describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({ prisma: {} }));

import { generateRecoveryCode, normalizeRecoveryCode, verifyRecoveryCode } from "./recovery-code";
import { hashPassword } from "./password";

describe("recovery codes", () => {
  it("generates four dash-separated groups without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
      expect(code).not.toMatch(/[ILO01]/);
    }
  });

  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 500 }, generateRecoveryCode));
    expect(codes.size).toBe(500);
  });

  it("normalizes pasted codes (case, spaces, dashes)", () => {
    expect(normalizeRecoveryCode("abcd-efgh jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizeRecoveryCode("  ABCD EFGH JKMN PQRS\n")).toBe("ABCDEFGHJKMNPQRS");
  });

  it("verifies a code however it was typed, and rejects others", async () => {
    const code = generateRecoveryCode();
    const hash = await hashPassword(normalizeRecoveryCode(code));
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
    expect(await verifyRecoveryCode(code.toLowerCase().replaceAll("-", " "), hash)).toBe(true);
    expect(await verifyRecoveryCode(generateRecoveryCode(), hash)).toBe(false);
    expect(await verifyRecoveryCode("", hash)).toBe(false);
  });
});
