import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { fullName } from "@/lib/utils";

// NEXTAUTH_SECRET must be set in production. Generate with: openssl rand -base64 32
// The check is deferred to the authorize callback so the module can be imported in
// contexts that don't trigger auth (migrations, CLI scripts) without crashing.
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set — set it in production via environment variable");
        if (!credentials?.username || !credentials?.password) return null;
        const user = db.select().from(employees).where(eq(employees.username, credentials.username)).get();
        if (!user || !user.active) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: fullName(user), email: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  callbacks: {
    /**
     * Runs once at sign-in with `user` set, and again on **every** session
     * read with only `token` — which is the reconciliation point.
     *
     * `role` and `active` live in both the JWT and `employees`, and nothing
     * else re-reads them: `requireManager()` trusts `session.user.role`
     * verbatim. Without this the token wins for SESSION_MAX_AGE_SECONDS, so a
     * demoted or deactivated employee keeps every manager capability — ban,
     * delete, purge, merge, reassign owner, reset passwords, promote
     * themselves back — for up to 30 days.
     *
     * Throwing here is how next-auth v4 invalidates a session: the session
     * route catches it, clears the session cookie, and `getServerSession`
     * returns `null`, so the next read signs the employee out.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        return token;
      }

      if (!token.id) return token;
      const row = db
        .select({ role: employees.role, active: employees.active, deletedAt: employees.deletedAt })
        .from(employees)
        .where(eq(employees.id, token.id))
        .get();

      // Gone (a JWT that outlived a re-seed), deactivated, or soft-deleted —
      // all three mean this token must stop being a session.
      if (!row || !row.active || row.deletedAt) throw new Error("Session employee is no longer active");

      token.role = row.role;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.firstName = token.firstName;
        session.user.lastName = token.lastName;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Per-request memoized session lookup. React's cache() dedupes calls within a
// single render pass so the JWT decode runs once per request even when layouts,
// pages, and server actions all need the session. Falls back to a passthrough
// when `cache` isn't available (e.g., the jsdom test environment).
const memoize = typeof cache === "function" ? cache : <T>(fn: T) => fn;
export const getSession = memoize(() => getServerSession(authOptions));
