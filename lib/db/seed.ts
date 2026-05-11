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
  { model: "IX1002-01X", collection: "CAMBRIDGE" },
  { model: "HX1021-01X", collection: "WAYFINDER" },
  { model: "IX1010-01X", collection: "SOLARIS" },
  { model: "LX1020-01X", collection: "CRIMSON ACE" },
  { model: "IX1006-01X", collection: "SENTINEL" },
  { model: "IX1022-01X", collection: "OCTA" },
  { model: "HX1013-01X", collection: "SENTINEL DEEP" },
  { model: "HX1017-01X", collection: "LUNARIS" },
  { model: "LX1024-01X", collection: "LUNARIS" },
  { model: "IX1014-01X", collection: "BRYCEN" },
];
const insPromo = sqlite.prepare(
  "INSERT INTO promo_watches (id,model_number,collection,active,date_added) VALUES (?,?,?,1,?)",
);
const promoIds: { id: string; model: string; collection: string }[] = [];
for (const p of promos) {
  const id = randomUUID();
  insPromo.run(id, p.model, p.collection, now - 30 * day);
  promoIds.push({ id, ...p });
}

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
const models = [...promos.map((p) => p.model), "KX1011-01X", "KX1007-01X", "LX1012-01X", "LX1016-01X", "HX1001-01X"];

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
  const interests = pickMany(models, 1 + Math.floor(Math.random() * 3));
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
    `Customer interested in ${interests[0]}. Prefers ${pick(["in-person","text","calls"])} contact.`,
    onEmail, status, source, birthday,
    Math.random() > 0.7 ? `2015-${String(Math.floor(Math.random()*12)+1).padStart(2,"0")}-${String(Math.floor(Math.random()*28)+1).padStart(2,"0")}` : null,
    JSON.stringify(tagList),
    heat, level, lastOutreach, lastPurchase, dateAdded, dateAdded,
  );
  clientIdsForLists.push(id);

  insActivity.run(randomUUID(), id, "created", `Client ${fn} ${ln} created`, null, owner.id, dateAdded);

  // 0-4 outreach logs per client
  const outreachCount = Math.floor(Math.random() * 5);
  for (let j = 0; j < outreachCount; j++) {
    const oid = randomUUID();
    const method = pick(["call","text","email","in-person"] as const);
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

  // Promo matches
  for (const p of promoIds) {
    if (interests.includes(p.model)) {
      insPromoMatch.run(randomUUID(), id, p.id, "model", now);
    } else if (interests.some((m) => {
      // Fake collection-match: share a prefix of the model
      return m.substring(0, 2) === p.model.substring(0, 2);
    }) && Math.random() > 0.7) {
      insPromoMatch.run(randomUUID(), id, p.id, "collection", now);
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
