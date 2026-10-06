"use server";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { issueRecoveryCode } from "@/lib/recovery-code";
import { describeWait, hitRateLimit } from "@/lib/rate-limit";

export interface AccountState {
  error?: string;
  message?: string;
  recoveryCode?: string;
}

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const WINDOW_SECONDS = 15 * 60;
const LIMIT = 8;

// Every sensitive action re-checks the current password (a stolen session
// alone shouldn't be enough) and is rate-limited per user.
async function authorize(formData: FormData, action: string): Promise<{ error: string } | { userId: string; email: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You need to be signed in." };

  const limit = await hitRateLimit(`account:${action}:${session.user.id}`, LIMIT, WINDOW_SECONDS);
  if (limit.limited) return { error: `Too many attempts. Try again in ${describeWait(limit.retryAfterSeconds)}.` };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.passwordHash) return { error: "This account has no password yet." };
  const current = String(formData.get("currentPassword") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Your current password is incorrect." };
  return { userId: user.id, email: user.email ?? "" };
}

export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < MIN_PASSWORD) return { error: `New password must be at least ${MIN_PASSWORD} characters.` };
  if (next.length > MAX_PASSWORD) return { error: "New password is too long." };

  const result = await authorize(formData, "password");
  if ("error" in result) return result;
  await prisma.user.update({ where: { id: result.userId }, data: { passwordHash: await hashPassword(next) } });
  return { message: "Password changed." };
}

export async function regenerateRecoveryCodeAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const result = await authorize(formData, "recovery");
  if ("error" in result) return result;
  return { recoveryCode: await issueRecoveryCode(result.userId) };
}

export async function deleteAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const result = await authorize(formData, "delete");
  if ("error" in result) return result;

  const typed = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (typed !== result.email.toLowerCase()) return { error: "Type your email address exactly to confirm." };

  // Decks, owned cards, and linked records cascade with the user.
  await prisma.user.delete({ where: { id: result.userId } });
  await signOut({ redirectTo: "/" });
  return {};
}
