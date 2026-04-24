import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "data", "iris.db");
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export function runMigrations() {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const sql = `
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT, phone TEXT, email TEXT,
    employee_id TEXT REFERENCES employees(id),
    date_added INTEGER NOT NULL DEFAULT (unixepoch()),
    products_of_interest TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    on_email_list INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'Walk-in',
    birthday TEXT, anniversary TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    heat_score INTEGER NOT NULL DEFAULT 0,
    heat_level TEXT NOT NULL DEFAULT 'cold',
    last_outreach_at INTEGER, last_purchase_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS outreach_logs (
    id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
    method TEXT NOT NULL, date INTEGER NOT NULL DEFAULT (unixepoch()),
    outcome TEXT NOT NULL, purchased_model TEXT, notes TEXT,
    employee_id TEXT REFERENCES employees(id),
    follow_up_date INTEGER, template_id TEXT,
    completed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS smart_lists (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    owner_id TEXT REFERENCES employees(id),
    filters TEXT NOT NULL DEFAULT '{}', sort TEXT,
    is_shared INTEGER NOT NULL DEFAULT 0,
    is_built_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS client_tags (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'blue',
    usage_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS outreach_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT, body TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'general',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES employees(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS promo_watches (
    id TEXT PRIMARY KEY, model_number TEXT NOT NULL, collection TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    date_added INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS promo_matches (
    id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
    promo_id TEXT NOT NULL REFERENCES promo_watches(id),
    match_type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS banned_customers (
    id TEXT PRIMARY KEY, customer_id TEXT, first_name TEXT NOT NULL, last_name TEXT,
    email TEXT, phone TEXT, address TEXT, city TEXT, state TEXT, zip TEXT,
    ban_reason_category TEXT NOT NULL DEFAULT 'Other',
    specific_ban_reason TEXT, business_name TEXT,
    ban_date INTEGER NOT NULL DEFAULT (unixepoch()), notes TEXT
  );
  CREATE TABLE IF NOT EXISTS unsubscribe_list (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
    unsubscribed_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id),
    event_type TEXT NOT NULL, description TEXT NOT NULL,
    metadata TEXT, employee_id TEXT REFERENCES employees(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  `;
  sqlite.exec(sql);

  // Add secret question columns to employees (idempotent)
  const cols = sqlite.prepare("PRAGMA table_info(employees)").all() as { name: string }[];
  if (!cols.some(c => c.name === "secret_question")) {
    sqlite.exec("ALTER TABLE employees ADD COLUMN secret_question TEXT");
  }
  if (!cols.some(c => c.name === "secret_answer_hash")) {
    sqlite.exec("ALTER TABLE employees ADD COLUMN secret_answer_hash TEXT");
  }

  sqlite.close();
}
