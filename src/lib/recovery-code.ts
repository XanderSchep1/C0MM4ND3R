import { randomInt } from "node:crypto";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";

// No I, L, O, 0 or 1 — easy to misread when copying a code off a screen.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 4;
const GROUP_LENGTH = 4;

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let part = "";
    for (let i = 0; i < GROUP_LENGTH; i++) part += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(part);
  }
  return groups.join("-");
}

// People paste codes with spaces, lowercase, or missing dashes.
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Creates a fresh code, stores only its hash (replacing any previous code),
// and returns the plain code — the one and only time it can be shown.
export async function issueRecoveryCode(userId: string): Promise<string> {
  const code = generateRecoveryCode();
  await prisma.user.update({ where: { id: userId }, data: { recoveryCodeHash: await hashPassword(normalizeRecoveryCode(code)) } });
  return code;
}

export function verifyRecoveryCode(input: string, storedHash: string): Promise<boolean> {
  return verifyPassword(normalizeRecoveryCode(input), storedHash);
}
