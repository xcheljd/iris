// Run `npx drizzle-kit push` before this script to ensure schema is up to date.
import { sqlite } from "./index";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// Clean all tables (children before parents to satisfy FK constraints)
const tables = [
  "activity_events", "promo_matches", "outreach_logs", "promo_watches",
  "outreach_templates", "smart_lists", "client_tags",
  "approval_requests", "prospects", "clients",
  "banned_customers", "unsubscribe_list", "rvx_import_batches", "employees",
];
for (const t of tables) sqlite.exec(`DELETE FROM ${t}`);

const now = Math.floor(Date.now() / 1000);
const day = 86400;

// Employees
const employees = [
  { id: randomUUID(), firstName: "Marcus", lastName: null, username: "Marcus", role: "manager", pw: "meridian" },
  { id: randomUUID(), firstName: "Jordan", lastName: null, username: "Jordan", role: "associate", pw: "meridian" },
  { id: randomUUID(), firstName: "Riley", lastName: null, username: "Riley", role: "associate", pw: "meridian" },
  { id: randomUUID(), firstName: "Cameron", lastName: null, username: "Cameron", role: "associate", pw: "meridian" },
  { id: randomUUID(), firstName: "Morgan", lastName: null, username: "Morgan", role: "associate", pw: "meridian" },
];
const insEmp = sqlite.prepare(
  "INSERT INTO employees (id,name,first_name,last_name,username,password_hash,role,active,created_at) VALUES (?,?,?,?,?,?,?,1,?)",
);
for (const e of employees) {
  const name = e.lastName ? `${e.firstName} ${e.lastName}` : e.firstName;
  insEmp.run(e.id, name, e.firstName, e.lastName, e.username, bcrypt.hashSync(e.pw, 10), e.role, now - 365 * day);
}

// After the insEmp loop, update Marcus with a secret question
const Marcus = employees.find(e => e.username === "Marcus");
if (Marcus) {
  sqlite.prepare("UPDATE employees SET secret_question = ?, secret_answer_hash = ? WHERE id = ?")
    .run("What is your favorite watch brand?", bcrypt.hashSync("meridian", 10), Marcus.id);
}

const empId = (name: string) => employees.find((e) => e.firstName === name)!.id;

// Tags
const tagData = [
  { name: "VIP", color: "gold" },
  { name: "repeat-buyer", color: "emerald" },
  { name: "high-spender", color: "purple" },
  { name: "military", color: "blue" },
  { name: "talker", color: "amber" },
  { name: "no-texts", color: "rose" },
  { name: "email-only", color: "cyan" },
  { name: "birthday-this-month", color: "pink" },
];
const insTag = sqlite.prepare(
  "INSERT INTO client_tags (id,name,color,usage_count) VALUES (?,?,?,0)",
);
for (const t of tagData) insTag.run(randomUUID(), t.name, t.color);

// Promo watches
const promos = [
  { model: "IX1002-01X", collection: "CAMBRIDGE", brand: "Meridian", s1: 4, s2: 0 },
  { model: "HX1021-01X", collection: "WAYFINDER", brand: "Meridian", s1: 2, s2: 1 },
  { model: "IX1010-01X", collection: "SOLARIS", brand: "Meridian", s1: 0, s2: 0 },
  { model: "LX1020-01X", collection: "CRIMSON ACE", brand: "Meridian", s1: 6, s2: 3 },
  { model: "IX1006-01X", collection: "SENTINEL", brand: "Meridian", s1: 1, s2: 0 },
  { model: "IX1022-01X", collection: "OCTA", brand: "Meridian", s1: 0, s2: 5 },
  { model: "70Z004", collection: "DEEPSTAR", brand: "Ashford", s1: 3, s2: 2 },
  { model: "70Z003", collection: "ARCLINE", brand: "Ashford", s1: 0, s2: 0 },
  { model: "AL-525", collection: "RIDGELINE", brand: "Voss", s1: 2, s2: 0 },
  { model: "FC-220", collection: "HERITAGE", brand: "Chamberlain", s1: 1, s2: 1 },
];
const insPromo = sqlite.prepare(
  "INSERT INTO promo_watches (id,model_number,collection,brand,size_one_qty,size_two_qty,active,date_added) VALUES (?,?,?,?,?,?,1,?)",
);
const promoIds: { id: string; model: string; collection: string; brand: string }[] = [];
for (const p of promos) {
  const id = randomUUID();
  insPromo.run(id, p.model, p.collection, p.brand, p.s1, p.s2, now - 30 * day);
  promoIds.push({ id, model: p.model, collection: p.collection, brand: p.brand });
}

// Full known model → collection set (promos + a few non-promo models).
// Drives the durable model_catalog and structured client interests.
const productCatalog = [
  ...promos,
  { model: "KX1011-01X", collection: "SOLARIS" },
  { model: "KX1007-01X", collection: "SOLARIS" },
  { model: "LX1012-01X", collection: "SENTINEL" },
  { model: "LX1016-01X", collection: "SOLARIS" },
  { model: "HX1001-01X", collection: "VERTEX" },
];
const knownCollections = Array.from(new Set(productCatalog.map((p) => p.collection)));

const insCatalog = sqlite.prepare(
  "INSERT OR REPLACE INTO model_catalog (model,collection,source,first_seen_at,updated_at) VALUES (?,?,?,?,?)",
);
for (const p of productCatalog) {
  insCatalog.run(p.model.toUpperCase(), p.collection, "promo", now - 30 * day, now - 30 * day);
}
// One manager-curated row, and one curated row with a pending promo
// conflict flag — so the /catalog screen has data to exercise.
sqlite
  .prepare("UPDATE model_catalog SET source='curated', updated_at=? WHERE model=?")
  .run(now - 5 * day, "IX1014-01X");
sqlite
  .prepare(
    "UPDATE model_catalog SET source='curated', flagged_collection=?, flagged_source='promo', flagged_at=? WHERE model=?",
  )
  .run("SENTINEL", now - 1 * day, "IX1006-01X");

// Templates
const templates = [
  { name: "New Promo Blast", channel: "text", body: "Hey {{first_name}}! {{collection}} watches are on promo this week — want me to set one aside?" },
  { name: "Watch Arrived", channel: "text", body: "Hi {{first_name}}, your {{model}} is here! Stop by whenever — {{employee_name}}" },
  { name: "Birthday Outreach", channel: "text", body: "Happy Birthday, {{first_name}}! We've got a special offer just for you this month." },
  { name: "Re-engagement", channel: "text", body: "Haven't seen you in a while, {{first_name}}! Anything you've been eyeing lately?" },
  { name: "Thank You After Purchase", channel: "email", body: "Thank you for your purchase, {{first_name}}! Your {{model}} is a beautiful piece. — {{employee_name}}" },
];
const insTpl = sqlite.prepare(
  "INSERT INTO outreach_templates (id,name,body,channel,is_default,created_by,created_at) VALUES (?,?,?,?,1,?,?)",
);
for (const t of templates) {
  insTpl.run(randomUUID(), t.name, t.body, t.channel, empId("Marcus"), now - 60 * day);
}

// Clients
const firstNames = ["Michael","Sarah","James","Jennifer","Robert","Patricia","John","Linda","David","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Charles","Nancy","Christopher","Lisa","Daniel","Margaret"];
const lastNames = ["Rivera","Chen","Martinez","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Wilson","Anderson","Taylor","Thomas","Moore","Jackson","White","Harris","Martin","Thompson","Lee"];
const sources = ["Client Log", "Customer Report", "Walk-in", "Referral"];
const statuses: ("active" | "inactive")[] = ["active", "active", "active", "active", "active", "inactive"];
const clientTagPool = ["VIP", "repeat-buyer", "high-spender", "military", "talker", "no-texts", "email-only"];
const models = productCatalog.map((p) => p.model);

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickMany<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function randomPhone() {
  return `(${Math.floor(200 + Math.random()*800)}) ${Math.floor(200 + Math.random()*800)}-${String(Math.floor(Math.random()*10000)).padStart(4,"0")}`;
}

const insClient = sqlite.prepare(`
  INSERT INTO clients (id,first_name,last_name,phone,email,employee_id,date_added,
    products_of_interest,notes,on_email_list,status,source,birthday,anniversary,tags,
    heat_score,heat_level,last_outreach_at,last_purchase_at,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const insOutreach = sqlite.prepare(`
  INSERT INTO outreach_logs (id,client_id,method,date,outcome,purchased_model,notes,employee_id,follow_up_date,template_id,completed)
  VALUES (?,?,?,?,?,?,?,?,?,?,0)
`);
const insActivity = sqlite.prepare(`
  INSERT INTO activity_events (id,client_id,event_type,description,metadata,employee_id,created_at)
  VALUES (?,?,?,?,?,?,?)
`);
const insPromoMatch = sqlite.prepare(`
  INSERT INTO promo_matches (id,client_id,promo_id,match_type,created_at) VALUES (?,?,?,?,?)
`);

const clientIdsForLists: string[] = [];

for (let i = 0; i < 22; i++) {
  const id = randomUUID();
  const fn = pick(firstNames);
  const ln = pick(lastNames);
  const owner = pick(employees);
  // Mix of interest shapes: ~15% none (email-only), ~15% collection-only,
  // rest 1-3 structured {model, collection} pairs.
  const intents = ["interested", "promo", "arrival"] as const;
  const brands = ["Meridian", "Ashford", "Voss", "Chamberlain"] as const;
  const interestRoll = Math.random();
  const interests: { model: string | null; collection: string | null; brand: typeof brands[number] | null; intent: "interested" | "promo" | "arrival" }[] =
    interestRoll < 0.15
      ? []
      : interestRoll < 0.3
        ? [{ model: null, collection: pick(knownCollections), brand: null, intent: pick([...intents]) }]
        : interestRoll < 0.4
          ? [{ model: null, collection: null, brand: pick([...brands]), intent: pick([...intents]) }]
          : pickMany(productCatalog, 1 + Math.floor(Math.random() * 3)).map((p) => ({
              model: p.model,
              collection: p.collection,
              brand: Math.random() < 0.25 ? pick([...brands]) : null,
              intent: pick([...intents]),
            }));
  const tagList = Math.random() > 0.4 ? pickMany(clientTagPool, 1 + Math.floor(Math.random() * 2)) : [];
  const status = pick(statuses);
  const source = pick(sources);
  const onEmail = Math.random() > 0.3 ? 1 : 0;
  const dateAdded = now - Math.floor(Math.random() * 600) * day;
  const lastOutreach = Math.random() > 0.25 ? now - Math.floor(Math.random() * 180) * day : null;
  const lastPurchase = Math.random() > 0.6 ? now - Math.floor(Math.random() * 365) * day : null;
  const birthdayMonth = Math.floor(Math.random() * 12) + 1;
  const birthdayDay = Math.floor(Math.random() * 28) + 1;
  const birthday = `2000-${String(birthdayMonth).padStart(2,"0")}-${String(birthdayDay).padStart(2,"0")}`;

  let heat = 0;
  if (lastPurchase) heat += 15;
  if (lastPurchase && (now - lastPurchase) < 90 * day) heat += 10;
  if (onEmail) heat += 5;
  if (interests.length > 0) heat += 5;
  if (birthday) heat += 3;
  if (lastOutreach && (now - lastOutreach) < 30 * day) heat += 15;
  if (!lastOutreach || (now - lastOutreach) > 90 * day) heat -= 15;
  heat = Math.max(0, Math.min(100, heat + Math.floor(Math.random() * 30)));
  const level = heat >= 70 ? "hot" : heat >= 40 ? "warm" : "cold";

  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;

  insClient.run(
    id, fn, ln, randomPhone(), email, owner.id, dateAdded,
    JSON.stringify(interests),
    `${interests[0] ? `Interested in ${interests[0].model ?? interests[0].collection}. ` : ""}Prefers ${pick(["in-person","text","calls"])} contact.`,
    onEmail, status, source, birthday,
    Math.random() > 0.7 ? `2015-${String(Math.floor(Math.random()*12)+1).padStart(2,"0")}-${String(Math.floor(Math.random()*28)+1).padStart(2,"0")}` : null,
    JSON.stringify(tagList),
    heat, level, lastOutreach, lastPurchase, dateAdded, dateAdded,
  );
  clientIdsForLists.push(id);

  insActivity.run(randomUUID(), id, "created", `Client ${fn} ${ln} created`, null, owner.id, dateAdded);

  // 0-4 outreach logs per client
  const outreachCount = Math.floor(Math.random() * 5);
  const methodsUsed: string[] = [];
  for (let j = 0; j < outreachCount; j++) {
    const oid = randomUUID();
    const method = pick(["call","text","email","in-person"] as const);
    methodsUsed.push(method);
    const outcome = pick(["no_answer","voicemail","responded","wants_to_come_in","not_interested","purchased"] as const);
    const oDate = now - Math.floor(Math.random() * 150) * day;
    const purchasedModel = outcome === "purchased" ? pick(models) : null;
    const followUpDate = Math.random() > 0.6 ? now + Math.floor(Math.random() * 14 - 3) * day : null;
    insOutreach.run(
      oid, id, method, oDate, outcome, purchasedModel,
      `${method.charAt(0).toUpperCase()+method.slice(1)} — outcome: ${outcome.replace(/_/g," ")}.`,
      owner.id, followUpDate, null,
    );
    insActivity.run(randomUUID(), id, "outreach_logged",
      `${method} — ${outcome.replace(/_/g," ")}`, JSON.stringify({ method, outcome }), owner.id, oDate);
    if (outcome === "purchased") {
      insActivity.run(randomUUID(), id, "purchase",
        `Purchased ${purchasedModel}`, JSON.stringify({ model: purchasedModel }), owner.id, oDate);
    }
  }

  // Preferred contact: most-frequent logged method excluding in-person;
  // fall back to a random of call/text/email when there's no usable history.
  const tally = new Map<string, number>();
  for (const m of methodsUsed) {
    if (m === "in-person") continue;
    tally.set(m, (tally.get(m) ?? 0) + 1);
  }
  let preferred: string;
  if (tally.size > 0) {
    preferred = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else {
    preferred = pick(["call", "text", "email"] as const);
  }
  sqlite.prepare("UPDATE clients SET preferred_contact=? WHERE id=?").run(preferred, id);

  // Promo matches — mirrors the runtime matcher (exact model, else exact
  // collection, else exact brand), consistent with createPromo/importPromos.
  for (const p of promoIds) {
    const pm = p.model.toUpperCase();
    const pc = p.collection.toUpperCase();
    const pb = p.brand.toUpperCase();
    if (interests.some((it) => (it.model ?? "").toUpperCase() === pm)) {
      insPromoMatch.run(randomUUID(), id, p.id, "model", now);
    } else if (interests.some((it) => (it.collection ?? "").toUpperCase() === pc)) {
      insPromoMatch.run(randomUUID(), id, p.id, "collection", now);
    } else if (interests.some((it) => (it.brand ?? "").toUpperCase() === pb)) {
      insPromoMatch.run(randomUUID(), id, p.id, "brand", now);
    }
  }
}

// Banned customers
const insBan = sqlite.prepare(`
  INSERT INTO banned_customers (id,customer_id,first_name,last_name,email,phone,address,city,state,zip,ban_reason_category,specific_ban_reason,business_name,ban_date,notes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
insBan.run(randomUUID(), "RVX12345", "Alex", "Smith", "alex@example.com", "(555) 123-4567", "123 Main St", "Lakeshore", "ST", "00000", "Reselling", "Caught reselling on eBay", "Smith Resale LLC", now - 90*day, "Flagged by loss prevention");
insBan.run(randomUUID(), null, "Jamie", "Doe", "jamie@example.com", "(555) 987-6543", null, "Lakeshore", "ST", null, "Gift Card Fraud", "Gift card manipulation attempts", null, now - 200*day, "Multiple incidents");
insBan.run(randomUUID(), null, "Pat", "Nguyen", null, "(555) 555-1212", null, null, null, null, "Other", "Aggressive behavior with associates", null, now - 30*day, null);

// Unsubscribe list
const insUnsub = sqlite.prepare("INSERT INTO unsubscribe_list (id,email,unsubscribed_at) VALUES (?,?,?)");
["unsubscribed1@example.com","unsubscribed2@example.com","optout@example.com"].forEach((e,i) => {
  insUnsub.run(randomUUID(), e, now - (i+1)*10*day);
});

// Built-in smart lists
const insSL = sqlite.prepare(`
  INSERT INTO smart_lists (id,name,owner_id,filters,sort,is_shared,is_built_in,created_at)
  VALUES (?,?,?,?,?,?,?,?)
`);
const builtInLists = [
  { name: "Hot Clients", filters: { heatLevel: "hot" } },
  { name: "Stale Leads (90+ days)", filters: { stale: true } },
  { name: "Promo Matches — Not Contacted", filters: { promoMatch: "any", stale: true } },
  { name: "On Email List", filters: { onEmailList: true } },
  { name: "This Month's Birthdays", filters: { birthdayMonth: new Date().getMonth() + 1 } },
  { name: "VIPs", filters: { tags: ["VIP"] } },
];
for (const sl of builtInLists) {
  insSL.run(randomUUID(), sl.name, null, JSON.stringify(sl.filters), "heat_score_desc", 1, 1, now - 60*day);
}

console.log("Seed complete.");
console.log(`  Employees: ${employees.length}`);
console.log(`  Clients: ${clientIdsForLists.length}`);
console.log(`  Promos: ${promoIds.length}`);
sqlite.close();
