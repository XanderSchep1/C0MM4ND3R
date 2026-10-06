"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, hashPassword } from "@/lib/password";
import { issueRecoveryCode, verifyRecoveryCode } from "@/lib/recovery-code";
import { clientIp, describeWait, hitRateLimit } from "@/lib/rate-limit";

export interface ResetState {
  error?: string;
  // The replacement recovery code, shown once after a successful reset.
  newRecoveryCode?: string;
}

const WINDOW_SECONDS = 15 * 60;
const LIMIT_PER_EMAIL = 5;
const LIMIT_PER_IP = 20;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !code || !password) return { error: "Fill in every field." };

  const ip = clientIp(await headers());
  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(`reset:email:${email}`, LIMIT_PER_EMAIL, WINDOW_SECONDS),
    hitRateLimit(`reset:ip:${ip}`, LIMIT_PER_IP, WINDOW_SECONDS),
  ]);
  if (byEmail.limited || byIp.limited) {
    return { error: `Too many attempts. Try again in ${describeWait(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds))}.` };
  }

  if (password.length < MIN_PASSWORD) return { error: `New password must be at least ${MIN_PASSWORD} characters.` };
  if (password.length > MAX_PASSWORD) return { error: "New password is too long." };

  // Same message for "no such account", "no code set" and "wrong code" so this
  // form can't be used to find out which emails have accounts.
  const failure = { error: "That email and recovery code don't match. Check both and try again." };
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  const ok = await verifyRecoveryCode(code, user?.recoveryCodeHash ?? DUMMY_HASH);
  if (!user || !user.recoveryCodeHash || !ok) return failure;

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  // Recovery codes are single-use: issue a new one.
  return { newRecoveryCode: await issueRecoveryCode(user.id) };
}
