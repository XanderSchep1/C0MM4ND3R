"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { clientIp, describeWait, hitRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export interface FormState {
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

// Only a genuine wrong password gets the "incorrect" wording; config or database
// failures also surface as AuthError and must not be reported as a bad login.
function authErrorMessage(err: AuthError): string {
  if (err.type === "CredentialsSignin") {
    return (err as { code?: string }).code === "rate_limited"
      ? "Too many sign-in attempts. Please wait a few minutes and try again."
      : "Incorrect email or password.";
  }
  return "Sign-in is temporarily unavailable. Please try again shortly.";
}

const REGISTER_WINDOW_SECONDS = 60 * 60;
const REGISTER_LIMIT_PER_IP = 6;

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  try {
    await signIn("credentials", { email, password, redirectTo: "/decks" });
  } catch (err) {
    if (err instanceof AuthError) return { error: authErrorMessage(err) };
    throw err; // the redirect on success is thrown and must propagate
  }
  return {};
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const limit = await hitRateLimit(`register:ip:${clientIp(await headers())}`, REGISTER_LIMIT_PER_IP, REGISTER_WINDOW_SECONDS);
  if (limit.limited) return { error: `Too many sign-up attempts from your network. Try again in ${describeWait(limit.retryAfterSeconds)}.` };

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  if (password.length > MAX_PASSWORD) return { error: "Password is too long." };

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing?.passwordHash) return { error: "An account with this email already exists — sign in instead." };

  const passwordHash = await hashPassword(password);
  if (existing) {
    // A passwordless account is a pre-password-era (dev-login) one; whoever
    // registers its email first claims it and keeps its decks.
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, ...(name ? { name } : {}) } });
  } else {
    await prisma.user.create({ data: { email, name: name || email.split("@")[0], passwordHash } });
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/decks" });
  } catch (err) {
    if (err instanceof AuthError) return { error: `Account created, but sign-in failed: ${authErrorMessage(err)}` };
    throw err;
  }
  return {};
}
