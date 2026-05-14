import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const CLIENT_SOURCE_VALUES = ["Client Log", "Customer Report", "Walk-in", "Referral"] as const;
export type ClientSource = typeof CLIENT_SOURCE_VALUES[number];

export const OUTREACH_METHOD_VALUES = ["call", "text", "email", "in-person"] as const;
export type OutreachMethod = typeof OUTREACH_METHOD_VALUES[number];

export const OUTREACH_OUTCOME_VALUES = [
  "no_answer", "voicemail", "voicemail_full",
  "responded", "not_interested", "wants_to_come_in", "purchased",
] as const;
export type OutreachOutcome = typeof OUTREACH_OUTCOME_VALUES[number];

export const ACTIVITY_EVENT_TYPE_VALUES = [
  "created", "edited", "outreach_logged", "purchase", "tag_added", "tag_removed",
  "transferred", "promoted", "note_added", "status_changed", "merged",
  "ban_requested", "ban_approved", "ban_rejected",
  "unsub_requested", "unsub_approved", "unsub_rejected",
  "delete_requested", "delete_approved", "delete_rejected",
] as const;
export type ActivityEventType = typeof ACTIVITY_EVENT_TYPE_VALUES[number];

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["manager", "associate"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  secretQuestion: text("secret_question"),
  secretAnswerHash: text("secret_answer_hash"),
  onboardingState: text("onboarding_state"),
  /** Manual sort order for the Employees settings tab — lower comes first. */
  sortOrder: integer("sort_order").notNull().default(0),
  /** Soft-delete timestamp. Non-null rows are hidden from listings but kept for audit-trail integrity. */
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  employeeId: text("employee_id").references(() => employees.id),
  dateAdded: integer("date_added", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  productsOfInterest: text("products_of_interest", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  notes: text("notes"),
  onEmailList: integer("on_email_list", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["active", "inactive", "banned", "unsubscribed", "deleted"] }).notNull().default("active"),
  source: text("source", { enum: CLIENT_SOURCE_VALUES }).notNull().default("Walk-in"),
  birthday: text("birthday"),
  anniversary: text("anniversary"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  heatScore: integer("heat_score").notNull().default(0),
  heatLevel: text("heat_level", { enum: ["hot", "warm", "cold"] }).notNull().default("cold"),
  lastOutreachAt: integer("last_outreach_at", { mode: "timestamp" }),
  lastPurchaseAt: integer("last_purchase_at", { mode: "timestamp" }),
  /** Global last-viewed timestamp — bumped when any user opens the detail page. Used to nudge search ranking. */
  lastViewedAt: integer("last_viewed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  deletedBy: text("deleted_by"),
  previousStatus: text("previous_status", { enum: ["active", "inactive", "banned", "unsubscribed"] }),
}, (table) => ({
  clientsEmployeeIdIdx: index("clients_employee_id_idx").on(table.employeeId),
  clientsStatusIdx: index("clients_status_idx").on(table.status),
  clientsHeatScoreIdx: index("clients_heat_score_idx").on(table.heatScore),
  clientsEmailIdx: index("clients_email_idx").on(table.email),
  clientsPhoneIdx: index("clients_phone_idx").on(table.phone),
}));

export const outreachLogs = sqliteTable("outreach_logs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  method: text("method", { enum: OUTREACH_METHOD_VALUES }).notNull(),
  date: integer("date", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  outcome: text("outcome", { enum: OUTREACH_OUTCOME_VALUES }).notNull(),
  purchasedModel: text("purchased_model"),
  notes: text("notes"),
  employeeId: text("employee_id").references(() => employees.id),
  followUpDate: integer("follow_up_date", { mode: "timestamp" }),
  templateId: text("template_id"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
}, (table) => ({
  outreachLogsClientIdIdx: index("outreach_logs_client_id_idx").on(table.clientId),
  outreachLogsDateIdx: index("outreach_logs_date_idx").on(table.date),
  outreachLogsFollowUpDateIdx: index("outreach_logs_follow_up_date_idx").on(table.followUpDate),
  outreachLogsCompletedIdx: index("outreach_logs_completed_idx").on(table.completed),
}));

export const smartLists = sqliteTable("smart_lists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").references(() => employees.id),
  filters: text("filters", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  sort: text("sort"),
  isShared: integer("is_shared", { mode: "boolean" }).notNull().default(false),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const clientTags = sqliteTable("client_tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("blue"),
  usageCount: integer("usage_count").notNull().default(0),
});

export const outreachTemplates = sqliteTable("outreach_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  channel: text("channel", { enum: ["text", "email", "general"] }).notNull().default("general"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => employees.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const promoWatches = sqliteTable("promo_watches", {
  id: text("id").primaryKey(),
  modelNumber: text("model_number").notNull(),
  collection: text("collection").notNull(),
  msrp: real("msrp"),
  discountPercent: real("discount_percent"),
  discountPrice: real("discount_price"),
  promoStart: text("promo_start"),
  promoEnd: text("promo_end"),
  dateAdded: integer("date_added", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const promoMatches = sqliteTable("promo_matches", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  promoId: text("promo_id").notNull().references(() => promoWatches.id),
  matchType: text("match_type", { enum: ["model", "collection"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  uniqClientPromo: unique().on(table.clientId, table.promoId),
}));

export const bannedCustomers = sqliteTable("banned_customers", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  banReasonCategory: text("ban_reason_category", { enum: ["Reselling", "Gift Card Fraud", "Other"] }).notNull().default("Other"),
  specificBanReason: text("specific_ban_reason"),
  businessName: text("business_name"),
  banDate: integer("ban_date", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  notes: text("notes"),
});

export const unsubscribeList = sqliteTable("unsubscribe_list", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const activityEvents = sqliteTable("activity_events", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  eventType: text("event_type", {
    enum: ACTIVITY_EVENT_TYPE_VALUES,
  }).notNull(),
  description: text("description").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  employeeId: text("employee_id").references(() => employees.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  activityEventsClientIdIdx: index("activity_events_client_id_idx").on(table.clientId),
  activityEventsCreatedAtIdx: index("activity_events_created_at_idx").on(table.createdAt),
}));

export const approvalRequests = sqliteTable("approval_requests", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["ban", "unsubscribe", "delete"] }).notNull(),
  clientId: text("client_id").notNull().references(() => clients.id),
  requestorId: text("requestor_id").notNull().references(() => employees.id),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewedById: text("reviewed_by_id").references(() => employees.id),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const rvxImportBatches = sqliteTable("rvx_import_batches", {
  id: text("id").primaryKey(),
  reportStartDate: integer("report_start_date", { mode: "timestamp" }).notNull(),
  reportEndDate: integer("report_end_date", { mode: "timestamp" }).notNull(),
  totalRows: integer("total_rows").notNull(),
  importedCount: integer("imported_count").notNull(),
  importedBy: text("imported_by").notNull().references(() => employees.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  importedByIdx: index("rvx_import_batches_imported_by_idx").on(t.importedBy),
}));

export const prospects = sqliteTable("prospects", {
  id: text("id").primaryKey(),
  rvxCustomerId: text("rvx_customer_id").notNull(),
  rvxStoreId: text("rvx_store_id").notNull(),
  rvxSpend: real("rvx_spend"),
  importBatchId: text("import_batch_id").notNull().references(() => rvxImportBatches.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  status: text("status", { enum: ["active", "graduated", "unsubscribed", "rejected"] }).notNull().default("active"),
  productsOfInterest: text("products_of_interest", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  notes: text("notes"),
  birthday: text("birthday"),
  anniversary: text("anniversary"),
  graduatedToClientId: text("graduated_to_client_id").references(() => clients.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  prospectsBatchIdx: index("prospects_import_batch_id_idx").on(t.importBatchId),
  prospectsStatusIdx: index("prospects_status_idx").on(t.status),
  prospectsEmailIdx: index("prospects_email_idx").on(t.email),
  prospectsPhoneIdx: index("prospects_phone_idx").on(t.phone),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type OutreachLog = typeof outreachLogs.$inferSelect;
export type PromoMatch = typeof promoMatches.$inferSelect;
export type PromoWatch = typeof promoWatches.$inferSelect;
export type BannedCustomer = typeof bannedCustomers.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type ClientTag = typeof clientTags.$inferSelect;
export type OutreachTemplate = typeof outreachTemplates.$inferSelect;
export type SmartList = typeof smartLists.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type RvxImportBatch = typeof rvxImportBatches.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
