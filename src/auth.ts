import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, verifyPassword } from "@/lib/password";
import { clientIp, hitRateLimit } from "@/lib/rate-limit";

// Thrown from authorize() when someone has tried too often; the sign-in form
// recognizes the code and shows a "try again later" message instead of
// "incorrect password".
export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const SIGNIN_WINDOW_SECONDS = 15 * 60;
const SIGNIN_LIMIT_PER_EMAIL = 8;
const SIGNIN_LIMIT_PER_IP = 30;

// Email + password accounts, created in-app (see src/app/signin/actions.ts).
// Credentials providers force JWT sessions, so no database sessions or
// OAuth adapter are involved.
const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw, request) {
      const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
      const password = typeof raw?.password === "string" ? raw.password : "";
      if (!email || !password) return null;

      // Enforced here (not just in the form's server action) so calling the
      // sign-in endpoint directly can't bypass it.
      const [byEmail, byIp] = await Promise.all([
        hitRateLimit(`signin:email:${email}`, SIGNIN_LIMIT_PER_EMAIL, SIGNIN_WINDOW_SECONDS),
        hitRateLimit(`signin:ip:${clientIp(request.headers)}`, SIGNIN_LIMIT_PER_IP, SIGNIN_WINDOW_SECONDS),
      ]);
      if (byEmail.limited || byIp.limited) throw new RateLimitedError();

      const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
      const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !user.passwordHash || !ok) return null;
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (process.env.NODE_ENV !== "production") {
  // Dev-only "sign in as anyone" provider, so accounts that predate password
  // sign-up (no passwordHash) stay reachable locally. Never registered in
  // production builds since the check above runs at module load time.
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email.trim() : "";
        if (!email) return null;
        const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : email.split("@")[0];
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, name },
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
