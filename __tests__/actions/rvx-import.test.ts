/**
 * Action-level tests for the RVX import path (TEST-03).
 *
 * Previously only the CSV parser was tested; the persistence actions
 * (analyzeRvxImport / importProspectsFromRvx) — the primary money-adjacent
 * ingestion path — had zero coverage. These pin: fresh import, re-import
 * dedupe, banned/unsubscribed suppression, within-import dedupe, and
 * manager-only authorization (requireManager rejects associates).
 */
import { vi, describe, it, expect, beforeAll, afterAll } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({}));

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { analyzeRvxImport, importProspectsFromRvx } from "@/lib/actions/rvx-import";
import { db } from "@/lib/db";
import { prospects, bannedCustomers, unsubscribeList } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";

const managerSession: Session = {
  user: { id: MANAGER_ID, name: "Test Manager", role: "manager" as const, firstName: "Test", lastName: "Manager" },
  expires: "2099-12-31T23:59:59.000Z",
};
const associateSession: Session = {
  user: { id: ASSOCIATE_ID, name: "Test Associate", role: "associate" as const, firstName: "Test", lastName: "Associate" },
  expires: "2099-12-31T23:59:59.000Z",
};

// Synthetic Meridian-world data. Unique-ish identifiers keep these tests
// independent of seed data (categorization matches by email/phone).
const EMAILS = {
  nova: "rvxtest.nova@example.com",
  quill: "rvxtest.quill@example.com",
  brix: "rvxtest.brix@example.com",
  dup: "rvxtest.dup@example.com",
  banned: "rvxtest.banned@example.com",
  unsub: "rvxtest.unsub@example.com",
};
const PHONES = {
  nova: "7025550101",
  quill: "7025550102",
  brix: "7025550103",
  dup: "7025550104",
  banned: "7025550105",
  unsub: "7025550106",
};

function buildCsv(rows: Array<[string, string, string, string, string]>): string {
  const header = "STORE #,CUST #,FIRST NAME,LAST NAME,TELEPHONE,EMAIL ADDRESS,TOTAL SALES";
  const data = rows.map(([store, cust, first, last, phoneEmail]) => {
    const [phone, email] = phoneEmail.split("|");
    return `100,${cust},${first},${last},${phone},${email},120.50`;
  });
  return ["SALES BY CUSTOMER", "FROM 01/01/25 TO 12/31/25", "", header, ...data].join("\n");
}

function countByPhone(phone: string): number {
  return db.select().from(prospects).where(eq(prospects.phone, phone)).all().length;
}

let bannedId: string;
let unsubId: string;

beforeAll(async () => {
  vi.mocked(getServerSession).mockResolvedValue(managerSession);
  bannedId = randomUUID();
  unsubId = randomUUID();
  db.insert(bannedCustomers)
    .values({ id: bannedId, firstName: "Banned", lastName: "Test", email: EMAILS.banned, phone: PHONES.banned })
    .run();
  db.insert(unsubscribeList).values({ id: unsubId, email: EMAILS.unsub }).run();
});

const TEST_PHONES = new Set(Object.values(PHONES));

afterAll(() => {
  const rows = db.select({ id: prospects.id, phone: prospects.phone }).from(prospects).all();
  const ids = rows.filter((r) => r.phone && TEST_PHONES.has(r.phone)).map((r) => r.id);
  if (ids.length) db.delete(prospects).where(inArray(prospects.id, ids)).run();
  db.delete(bannedCustomers).where(eq(bannedCustomers.id, bannedId)).run();
  db.delete(unsubscribeList).where(eq(unsubscribeList.id, unsubId)).run();
});

describe("importProspectsFromRvx", () => {
  it("imports a fresh batch of unknown customers", async () => {
    const csv = buildCsv([
      ["100", "9001", "Nova", "Bright", `${PHONES.nova}|${EMAILS.nova}`],
      ["100", "9002", "Quill", "Fern", `${PHONES.quill}|${EMAILS.quill}`],
      ["100", "9003", "Brix", "Stone", `${PHONES.brix}|${EMAILS.brix}`],
    ]);
    const res = await importProspectsFromRvx(csv);
    expect("error" in res).toBe(false);
    if ("error" in res) throw new Error(res.error);
    expect(res.importedCount).toBe(3);
    expect(countByPhone(PHONES.nova)).toBe(1);
    // Spot-check persisted fields on one row.
    const row = db.select().from(prospects).where(eq(prospects.phone, PHONES.nova)).get();
    expect(row?.firstName).toBe("Nova");
    expect(row?.lastName).toBe("Bright");
    expect(row?.email).toBe(EMAILS.nova);
  });

  it("re-importing the same CSV creates no duplicates", async () => {
    const csv = buildCsv([
      ["100", "9001", "Nova", "Bright", `${PHONES.nova}|${EMAILS.nova}`],
      ["100", "9002", "Quill", "Fern", `${PHONES.quill}|${EMAILS.quill}`],
    ]);
    const res = await importProspectsFromRvx(csv);
    expect("error" in res).toBe(false);
    if ("error" in res) throw new Error(res.error);
    expect(res.importedCount).toBe(0);
    expect(countByPhone(PHONES.nova)).toBe(1);
  });

  it("suppresses banned and unsubscribed emails", async () => {
    const csv = buildCsv([
      ["100", "9004", "Bad", "Actor", `${PHONES.banned}|${EMAILS.banned}`],
      ["100", "9005", "Opted", "Out", `7025550106|${EMAILS.unsub}`],
    ]);
    const analysis = await analyzeRvxImport(csv);
    expect("error" in analysis).toBe(false);
    if ("error" in analysis) throw new Error(analysis.error);
    expect(analysis.bannedCount).toBe(1);
    expect(analysis.unsubscribedCount).toBe(1);
    expect(analysis.newCount).toBe(0);

    const res = await importProspectsFromRvx(csv);
    expect("error" in res).toBe(false);
    if ("error" in res) throw new Error(res.error);
    expect(res.importedCount).toBe(0);
    expect(countByPhone(PHONES.banned)).toBe(0);
  });

  it("dedupes repeated customers within one import (keeps best record)", async () => {
    const csv = buildCsv([
      ["100", "9006", "Dua", "Pet", `${PHONES.dup}|${EMAILS.dup}`],
      ["100", "9006", "Dua", "Pet", `${PHONES.dup}|${EMAILS.dup}`],
    ]);
    const res = await importProspectsFromRvx(csv);
    expect("error" in res).toBe(false);
    if ("error" in res) throw new Error(res.error);
    expect(res.importedCount).toBe(1);
    expect(countByPhone(PHONES.dup)).toBe(1);
  });
});

describe("importProspectsFromRvx authorization + failure modes", () => {
  it("rejects associates (requireManager) without creating anything", async () => {
    vi.mocked(getServerSession).mockResolvedValue(associateSession);
    const csv = buildCsv([["100", "9007", "Solo", "Reader", "7025550107|rvxtest.solo@example.com"]]);
    const before = countByPhone("7025550107");
    await expect(importProspectsFromRvx(csv)).rejects.toThrow();
    await expect(analyzeRvxImport(csv)).rejects.toThrow();
    expect(countByPhone("7025550107")).toBe(before);
  });

  it("returns a result (never throws) for an unparseable CSV, importing nothing", async () => {
    vi.mocked(getServerSession).mockResolvedValue(managerSession);
    const res = await importProspectsFromRvx("SALES BY CUSTOMER\n\n\n");
    expect("error" in res).toBe(false);
    if ("error" in res) throw new Error(res.error);
    expect(res.importedCount).toBe(0);
  });
});