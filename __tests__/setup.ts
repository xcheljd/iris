import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";

process.env.NEXTAUTH_SECRET = "test-secret-for-vitest";

// Test fixture: many action/api tests reference these hardcoded employee
// UUIDs in their mock sessions, but seed.ts generates random UUIDs. Without
// these rows in the employees table, foreign-key constraints on importedBy,
// employeeId, etc. fail with "FOREIGN KEY constraint failed". Insert once
// with INSERT OR IGNORE so re-running the suite is idempotent.
const TEST_MANAGER_ID = "2d7a352d-53a0-4544-b515-902e7dd59206";
const TEST_ASSOCIATE_ID = "590628cf-d623-456d-bdad-d16ab0ec2b23";
const TEST_CLIENT_ID = "e18e3ba8-b3b1-4bc1-b0f2-f13a219dd30b";

beforeAll(async () => {
  // Lazy import — `@/lib/db` triggers SQLite setup that we only need for
  // tests that actually touch the DB. Many component tests run without it.
  try {
    const { sqlite } = await import("@/lib/db");
    sqlite
      .prepare(`
        INSERT OR IGNORE INTO employees (id, name, first_name, last_name, username, password_hash, role, active, created_at)
        VALUES (?, 'Test Manager', 'Test', 'Manager', 'test-manager', 'test-hash', 'manager', 1, unixepoch())
      `)
      .run(TEST_MANAGER_ID);
    sqlite
      .prepare(`
        INSERT OR IGNORE INTO employees (id, name, first_name, last_name, username, password_hash, role, active, created_at)
        VALUES (?, 'Test Associate', 'Test', 'Associate', 'test-associate', 'test-hash', 'associate', 1, unixepoch())
      `)
      .run(TEST_ASSOCIATE_ID);
    sqlite
      .prepare(`
        INSERT OR IGNORE INTO clients (id, first_name, last_name, employee_id, date_added)
        VALUES (?, 'Test', 'Client', ?, unixepoch())
      `)
      .run(TEST_CLIENT_ID, TEST_ASSOCIATE_ID);
  } catch {
    // DB unavailable in this test file's environment — fine, tests that
    // don't touch the DB still run.
  }
});

// Polyfill matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
