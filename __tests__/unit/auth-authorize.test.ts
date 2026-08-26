import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireManager, isSessionEmployeeStale } from "@/lib/actions/_shared";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// next-auth v4's CredentialsProvider() returns a wrapper whose user-supplied
// callbacks live under `.options`; NextAuth merges them at runtime. Reach in
// directly so we can call authorize() without booting NextAuth.
type Authorize = (
  credentials: Record<"username" | "password", string> | undefined,
) => Promise<{ id: string; role: string } | null>;
const authorize = (
  authOptions.providers[0] as unknown as { options: { authorize: Authorize } }
).options.authorize;

// Own fixtures: other suites mutate the seeded employees' password hashes and
// active flags, so ambient rows are not a stable contract here.
const ACTIVE_ID = randomUUID();
const INACTIVE_ID = randomUUID();
const ACTIVE_USERNAME = `auth-active-${ACTIVE_ID.slice(0, 8)}`;
const INACTIVE_USERNAME = `auth-inactive-${INACTIVE_ID.slice(0, 8)}`;
const PASSWORD = "correct-horse";

beforeAll(() => {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  db.insert(employees).values([
    {
      id: ACTIVE_ID,
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      username: ACTIVE_USERNAME,
      passwordHash: hash,
      role: "associate",
      active: true,
    },
    {
      id: INACTIVE_ID,
      name: "Inactive",
      firstName: "Inactive",
      lastName: "Person",
      username: INACTIVE_USERNAME,
      passwordHash: hash,
      role: "associate",
      active: false,
    },
  ]).run();
});

afterAll(() => {
  db.delete(employees).where(eq(employees.id, ACTIVE_ID)).run();
  db.delete(employees).where(eq(employees.id, INACTIVE_ID)).run();
});

describe("authOptions credentials authorize()", () => {
  it("returns the user payload for correct credentials", async () => {
    const user = await authorize({ username: ACTIVE_USERNAME, password: PASSWORD });

    expect(user).toEqual({
      id: ACTIVE_ID,
      name: "Ada Lovelace",
      email: ACTIVE_USERNAME,
      role: "associate",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("returns null for a wrong password", async () => {
    expect(await authorize({ username: ACTIVE_USERNAME, password: "wrong" })).toBeNull();
  });

  it("returns null for an unknown username", async () => {
    expect(await authorize({ username: "no-such-user-at-all", password: PASSWORD })).toBeNull();
  });

  it("returns null for an inactive employee even with the right password", async () => {
    // `active` is an integer 0/1 column mapped to boolean; 0 means deactivated
    // via toggleEmployeeActive and must not be able to sign in.
    expect(await authorize({ username: INACTIVE_USERNAME, password: PASSWORD })).toBeNull();
  });

  it("returns null when credentials are missing", async () => {
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize({ username: "", password: PASSWORD })).toBeNull();
    expect(await authorize({ username: ACTIVE_USERNAME, password: "" })).toBeNull();
  });

  it("throws when NEXTAUTH_SECRET is unset", async () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    try {
      await expect(
        authorize({ username: ACTIVE_USERNAME, password: PASSWORD }),
      ).rejects.toThrow(/NEXTAUTH_SECRET is not set/);
    } finally {
      process.env.NEXTAUTH_SECRET = saved;
    }
  });

});

describe("isSessionEmployeeStale", () => {
  it("is false while the session's employee row exists", async () => {
    await expect(isSessionEmployeeStale(ACTIVE_ID)).resolves.toBe(false);
  });

  it("is true for a session id whose employee row is gone (JWT outlived a re-seed)", async () => {
    await expect(isSessionEmployeeStale(randomUUID())).resolves.toBe(true);
  });
});

describe("requireManager", () => {
  const session = (role: "manager" | "associate", id: string): Session => ({
    user: { id, name: "Test", role, firstName: "Test", lastName: null },
    expires: "2099-12-31T23:59:59.000Z",
  });

  it("passes the session user through for a manager", async () => {
    const s = session("manager", ACTIVE_ID);
    vi.mocked(getServerSession).mockResolvedValue(s);

    await expect(requireManager()).resolves.toEqual(s.user);
  });

  it("throws 'Manager access required' for an associate", async () => {
    vi.mocked(getServerSession).mockResolvedValue(session("associate", ACTIVE_ID));

    await expect(requireManager()).rejects.toThrow("Manager access required");
  });

  it("throws 'Not authenticated' when there is no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    await expect(requireManager()).rejects.toThrow("Not authenticated");
  });
});
