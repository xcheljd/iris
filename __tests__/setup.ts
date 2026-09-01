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

// jsdom doesn't implement scrollIntoView. The tour overlay calls it once per
// step to bring the spotlight target into view; a no-op is fine in tests.
if (typeof window !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// ---------------------------------------------------------------------------
// localStorage regression: expose a working Storage in the jsdom environment.
//
// The SearchInputWithHistory suite and the ClientListContent pagination suite
// call `localStorage.clear()` directly in their beforeEach hooks (and read the
// same store via `window.localStorage`). jsdom only provides a usable
// localStorage when the document runs on a non-opaque origin; on the default
// `about:blank` / `null` origin the property is inaccessible, so the bare
// global is left `undefined` and every one of those specs throws
// "localStorage is not defined" before a single assertion runs (13 tests).
//
// Install a real in-memory Storage whenever one is missing, point BOTH
// `globalThis` and `window` at the SAME instance (so the tests' bare
// `localStorage.clear()` and the components' `window.localStorage` stay in
// sync), then assert it is actually wired up — a future environment change
// that silently drops it should fail loudly here instead of as 13 cryptic
// per-spec errors downstream.
// ---------------------------------------------------------------------------
function installTestLocalStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: storage,
    });
  }
  return storage;
}

function resolveLocalStorage(): Storage {
  try {
    const existing = (globalThis as { localStorage?: Storage | undefined }).localStorage;
    if (existing && typeof existing.clear === "function") return existing;
  } catch {
    // jsdom may throw on opaque origins — fall through and install a stub.
  }
  return installTestLocalStorage();
}

// Regression assertion: the SearchInputWithHistory / ClientListContent
// pagination suites depend on a callable localStorage in beforeEach. Asserting
// it here surfaces a broken environment at suite setup rather than as the 13
// "localStorage is not defined" spec failures.
const TEST_LOCAL_STORAGE = resolveLocalStorage();
if (
  !TEST_LOCAL_STORAGE ||
  typeof TEST_LOCAL_STORAGE.clear !== "function" ||
  typeof TEST_LOCAL_STORAGE.getItem !== "function" ||
  typeof TEST_LOCAL_STORAGE.setItem !== "function"
) {
  throw new Error(
    "localStorage regression: no usable localStorage in the test environment — " +
      "SearchInputWithHistory and ClientListContent pagination suites depend on it.",
  );
}
