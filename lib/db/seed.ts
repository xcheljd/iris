// Run `npx drizzle-kit push` before this script to ensure schema is up to date.
import { sqlite } from "./index";
import { SAMPLE_BRANDS } from "./schema";
import { calcHeatScore } from "../heat-score";
import { HEAT_LOOKBACK_DAYS } from "../constants";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// Deterministic PRNG (mulberry32) so a seed run is reproducible — the demo
// must not change between runs. Override with SEED=<number> to generate a
// different demo on purpose. The heat score is deliberately NOT randomised:
// it is a pure function of the generated client data, mirroring production.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(Number(process.env.SEED) || 20260814);

// Clean all tables (children before parents to satisfy FK constraints)
const tables = [
  "activity_events", "promo_matches", "outreach_logs", "promo_items",
  "smart_lists", "client_tags",
  "approval_requests", "prospects", "clients",
  "banned_customers", "unsubscribe_list", "import_batches", "employees",
  "brands",
];
for (const t of tables) sqlite.exec(`DELETE FROM ${t}`);

// The sample store: a fictional sunglasses shop (Settings → Store).
sqlite
  .prepare("INSERT INTO meta (key, value) VALUES ('store_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
  .run("Sol & Shade Eyewear");

// The sample store's brand list (Settings → Brands).
{
  const insBrand = sqlite.prepare("INSERT INTO brands (id, name) VALUES (?, ?)");
  for (const b of SAMPLE_BRANDS) insBrand.run(randomUUID(), b);
}

const now = Math.floor(Date.now() / 1000);
const day = 86400;

// Employees
const employees = [
  { id: randomUUID(), firstName: "Marcus", lastName: null, username: "Marcus", role: "manager", pw: "irisdemo" },
  { id: randomUUID(), firstName: "Jordan", lastName: null, username: "Jordan", role: "associate", pw: "irisdemo" },
  { id: randomUUID(), firstName: "Riley", lastName: null, username: "Riley", role: "associate", pw: "irisdemo" },
  { id: randomUUID(), firstName: "Cameron", lastName: null, username: "Cameron", role: "associate", pw: "irisdemo" },
  { id: randomUUID(), firstName: "Morgan", lastName: null, username: "Morgan", role: "associate", pw: "irisdemo" },
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
    .run("What was the name of your first school?", bcrypt.hashSync("irisdemo", 10), Marcus.id);
}

const empId = (name: string) => employees.find((e) => e.firstName === name)!.id;

// Tags
const tagData = [
  { name: "VIP" },
  { name: "repeat-buyer" },
  { name: "high-spender" },
  { name: "military" },
  { name: "talker" },
  { name: "no-texts" },
  { name: "email-only" },
  { name: "birthday-this-month" },
];
const insTag = sqlite.prepare(
  "INSERT INTO client_tags (id,name,usage_count) VALUES (?,?,0)",
);
for (const t of tagData) insTag.run(randomUUID(), t.name);

// Promo items — the sample store sells sunglasses.
const promos = [
  { model: "MV-2102-BLK", collection: "CANYON", brand: "Maravista", msrp: 245, discountPercent: 15 },
  { model: "MV-1121-TOR", collection: "WINDWARD", brand: "Maravista", msrp: 215, discountPercent: 20 },
  { model: "MV-2110-GLD", collection: "SUNDRIFT", brand: "Maravista", msrp: 295, discountPercent: 10 },
  { model: "MV-3120-BLU", collection: "COPPER COVE", brand: "Maravista", msrp: 185, discountPercent: 25 },
  { model: "MV-2106-BLK", collection: "SHORELINE", brand: "Maravista", msrp: 225, discountPercent: 15 },
  { model: "MV-2122-SLV", collection: "ORBIT", brand: "Maravista", msrp: 265, discountPercent: 10 },
  { model: "AD-8404", collection: "DRIFTWOOD", brand: "Aldermoor", msrp: 320, discountPercent: 20 },
  { model: "AD-8403", collection: "ALTITUDE", brand: "Aldermoor", msrp: 280, discountPercent: 15 },
  { model: "VL-525", collection: "RIPTIDE", brand: "Vellamy", msrp: 175, discountPercent: 25 },
  { model: "CW-220", collection: "HARBOR", brand: "Coastwell", msrp: 150, discountPercent: 15 },
];
const insPromo = sqlite.prepare(
  "INSERT INTO promo_items (id,model_number,collection,brand,msrp,discount_percent,discount_price,date_added) VALUES (?,?,?,?,?,?,?,?)",
);
const promoIds: { id: string; model: string; collection: string; brand: string }[] = [];
for (const p of promos) {
  const id = randomUUID();
  const discountPrice = p.discountPercent
    ? Math.round(p.msrp * (1 - p.discountPercent / 100) / 5) * 5
    : null;
  insPromo.run(id, p.model, p.collection, p.brand, p.msrp, p.discountPercent, discountPrice, now - 30 * day);
  promoIds.push({ id, model: p.model, collection: p.collection, brand: p.brand });
}

// Full known model → collection set (promos + a few non-promo models).
// Drives the durable model_catalog and structured client interests.
const productCatalog = [
  ...promos,
  { model: "MV-4111-BLK", collection: "SUNDRIFT" },
  { model: "MV-4107-TOR", collection: "SUNDRIFT" },
  { model: "MV-3112-GRN", collection: "SHORELINE" },
  { model: "MV-3116-BLK", collection: "SUNDRIFT" },
  { model: "MV-1101-BLK", collection: "VISTA" },
];
const knownCollections = Array.from(new Set(productCatalog.map((p) => p.collection)));
// A model's real brand, where the sample data has one (the promo list).
const brandOfModel = new Map(promos.map((p) => [p.model, p.brand as typeof SAMPLE_BRANDS[number]]));

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
  .run(now - 5 * day, "MV-2114-BLK");
sqlite
  .prepare(
    "UPDATE model_catalog SET source='curated', flagged_collection=?, flagged_source='promo', flagged_at=? WHERE model=?",
  )
  // The promo's collection must differ from the row's own (SHORELINE), or the
  // card shows a "conflict" between two identical names.
  .run("SHORELINE DEEP", now - 1 * day, "MV-2106-BLK");

// Clients
const firstNames = ["Michael","Sarah","James","Jennifer","Robert","Patricia","John","Linda","David","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Karen","Charles","Nancy","Christopher","Lisa","Daniel","Margaret"];
const lastNames = ["Rivera","Chen","Martinez","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Wilson","Anderson","Taylor","Thomas","Moore","Jackson","White","Harris","Martin","Thompson","Lee"];
const sources = ["Client Log", "Customer Report", "Walk-in", "Referral"];
const clientTagPool = ["VIP", "repeat-buyer", "high-spender", "military", "talker", "no-texts", "email-only"];
const models = productCatalog.map((p) => p.model);

function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }
function pickMany<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}
function randomPhone() {
  return `(${Math.floor(200 + rand()*800)}) ${Math.floor(200 + rand()*800)}-${String(Math.floor(rand()*10000)).padStart(4,"0")}`;
}

const insClient = sqlite.prepare(`
  INSERT INTO clients (id,first_name,last_name,phone,email,employee_id,date_added,
    products_of_interest,notes,on_email_list,status,source,birthday,anniversary,tags,
    heat_score,heat_level,last_outreach_at,last_purchase_at,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const insOutreach = sqlite.prepare(`
  INSERT INTO outreach_logs (id,client_id,method,date,outcome,purchased_model,notes,employee_id,follow_up_date,completed)
  VALUES (?,?,?,?,?,?,?,?,?,0)
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
  const brands = SAMPLE_BRANDS;
  const interestRoll = rand();
  const interests: { model: string | null; collection: string | null; brand: typeof brands[number] | null; intent: "interested" | "promo" | "arrival" }[] =
    interestRoll < 0.15
      ? []
      : interestRoll < 0.3
        ? [{ model: null, collection: pick(knownCollections), brand: null, intent: pick([...intents]) }]
        : interestRoll < 0.4
          ? [{ model: null, collection: null, brand: pick([...brands]), intent: pick([...intents]) }]
          : pickMany(productCatalog, 1 + Math.floor(rand() * 3)).map((p) => ({
              model: p.model,
              collection: p.collection,
              // Some interests note the brand; it's always the model's own
              // brand. (The pick stays so the rest of the seed comes out the same.)
              brand: rand() < 0.25 ? (pick([...brands]), brandOfModel.get(p.model) ?? null) : null,
              intent: pick([...intents]),
            }));
  const tagList = rand() > 0.4 ? pickMany(clientTagPool, 1 + Math.floor(rand() * 2)) : [];
  // Every seeded client is active. The draw that used to pick a status
  // stays, so the rest of the seeded data comes out the same.
  rand();
  const status = "active" as const;
  const source = pick(sources);
  const onEmail = rand() > 0.3 ? 1 : 0;
  const dateAdded = now - Math.floor(rand() * 600) * day;
  // Fallback only: used when a client ends up with no outreach logs at all.
  const outreachFallback = rand() > 0.25 ? now - Math.floor(rand() * 180) * day : null;
  const lastPurchase = rand() > 0.6 ? now - Math.floor(rand() * 365) * day : null;
  const birthdayMonth = Math.floor(rand() * 12) + 1;
  const birthdayDay = Math.floor(rand() * 28) + 1;
  const birthday = `2000-${String(birthdayMonth).padStart(2,"0")}-${String(birthdayDay).padStart(2,"0")}`;

  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;

  // Plan outreach logs BEFORE the client insert: heat scoring depends on them
  // and production (recalcHeat) reads logs after insert. The stored score must
  // be exactly what calcHeatScore computes from the generated data — no jitter.
  const outreachCount = Math.floor(rand() * 5);
  const plannedLogs: { method: "call" | "text" | "email" | "in-person"; outcome: "no_answer" | "voicemail" | "responded" | "wants_to_come_in" | "not_interested" | "purchased"; oDate: number; purchasedModel: string | null; followUpDate: number | null }[] = [];
  for (let j = 0; j < outreachCount; j++) {
    const method = pick(["call","text","email","in-person"] as const);
    const outcome = pick(["no_answer","voicemail","responded","wants_to_come_in","not_interested","purchased"] as const);
    const oDate = now - Math.floor(rand() * 150) * day;
    const purchasedModel = outcome === "purchased" ? pick(models) : null;
    const followUpDate = rand() > 0.6 ? now + Math.floor(rand() * 14 - 3) * day : null;
    plannedLogs.push({ method, outcome, oDate, purchasedModel, followUpDate });
  }

  // Hero-client pin for the demo video: Lisa Chen's newest follow-up is due
  // "today" so the follow-ups scene reads as an active due item, not an
  // upcoming one. Deterministic given `now` (seed run date).
  if (fn === "Lisa" && ln === "Chen" && plannedLogs.length) {
    const newest = plannedLogs.reduce((a, b) => (b.oDate > a.oDate ? b : a));
    newest.followUpDate = now;
  }

  // logOutreach stamps clients.last_outreach_at on every log it writes, so a
  // client with logs must show its newest log as the last contact — seeding a
  // log without this left "Last contact" blank on the dossier.
  const lastOutreach = plannedLogs.length
    ? Math.max(...plannedLogs.map((l) => l.oDate))
    : outreachFallback;

  const last90 = plannedLogs
    .filter((l) => now - l.oDate <= HEAT_LOOKBACK_DAYS * day)
    .map((l) => ({ outcome: l.outcome, date: new Date(l.oDate * 1000) }));
  const { score: heat, level } = calcHeatScore(
    {
      onEmailList: onEmail === 1,
      productsOfInterest: interests,
      birthday,
      status,
      lastOutreachAt: lastOutreach ? new Date(lastOutreach * 1000) : null,
      lastPurchaseAt: lastPurchase ? new Date(lastPurchase * 1000) : null,
    },
    last90,
  );

  insClient.run(
    id, fn, ln, randomPhone(), email, owner.id, dateAdded,
    JSON.stringify(interests),
    `${interests[0] ? `Interested in ${interests[0].model ?? interests[0].collection}. ` : ""}Prefers ${pick(["in-person","text","calls"])} contact.`,
    onEmail, status, source, birthday,
    rand() > 0.7 ? `2015-${String(Math.floor(rand()*12)+1).padStart(2,"0")}-${String(Math.floor(rand()*28)+1).padStart(2,"0")}` : null,
    JSON.stringify(tagList),
    heat, level, lastOutreach, lastPurchase, dateAdded, dateAdded,
  );
  clientIdsForLists.push(id);

  insActivity.run(randomUUID(), id, "created", `Client ${fn} ${ln} created`, null, owner.id, dateAdded);

  const methodsUsed: string[] = [];
  for (const { method, outcome, oDate, purchasedModel, followUpDate } of plannedLogs) {
    const oid = randomUUID();
    methodsUsed.push(method);
    insOutreach.run(
      oid, id, method, oDate, outcome, purchasedModel,
      `${method.charAt(0).toUpperCase()+method.slice(1)} — outcome: ${outcome.replace(/_/g," ")}.`,
      owner.id, followUpDate,
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

  // Keep the client's note consistent with the computed preferred contact —
  // the note text renders on the dossier, and "Prefers in-person" on an
  // email-only client reads as a data bug on screen.
  const contactLabel =
    preferred === "email" ? "email" : preferred === "text" ? "text" : "calls";
  const note = `${interests[0] ? `Interested in ${interests[0].model ?? interests[0].collection}. ` : ""}Prefers ${contactLabel} contact.`;
  sqlite.prepare("UPDATE clients SET notes=? WHERE id=?").run(note, id);

  // Promo matches — mirrors the runtime matcher (lib/promo-match.ts): exact
  // model, else exact collection. A brand never makes a match.
  for (const p of promoIds) {
    const pm = p.model.toUpperCase();
    const pc = p.collection.toUpperCase();
    if (interests.some((it) => (it.model ?? "").toUpperCase() === pm)) {
      insPromoMatch.run(randomUUID(), id, p.id, "model", now);
    } else if (interests.some((it) => (it.collection ?? "").toUpperCase() === pc)) {
      insPromoMatch.run(randomUUID(), id, p.id, "collection", now);
    }
  }
}

// Imported prospects — the /prospects page needs demo data to exercise the
// tabbed views and the graduate/reject/unsubscribe flows. Previously the
// seed only truncated prospects (never inserted), leaving the whole
// prospect pipeline empty.
const insBatch = sqlite.prepare(`
  INSERT INTO import_batches (id,total_rows,imported_count,imported_by,created_at)
  VALUES (?,?,?,?,?)
`);
const importBatchId = randomUUID();
insBatch.run(importBatchId, 10, 6, empId("Marcus"), now - 45 * day);

const insProspect = sqlite.prepare(`
  INSERT INTO prospects (id,import_customer_id,import_batch_id,first_name,last_name,phone,email,status,products_of_interest,notes,birthday,anniversary,graduated_to_client_id,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const prospectData: {
  importCustomerId: string; firstName: string; lastName: string | null;
  phone: string | null; email: string | null; status: "active" | "graduated" | "unsubscribed" | "rejected";
  productsOfInterest: string[]; notes: string | null; birthday: string | null; anniversary: string | null;
  graduatedToClientId: string | null;
}[] = [
  { importCustomerId: "CUST-1001", firstName: "Elena", lastName: "Vargas", phone: "(702) 555-0141", email: "elena.vargas@example.com", status: "active", productsOfInterest: ["DRIFTWOOD"], notes: "Asked about DRIFTWOOD on the August promo.", birthday: "1988-04-12", anniversary: null, graduatedToClientId: null },
  { importCustomerId: "CUST-1002", firstName: "Marcus", lastName: "Webb", phone: "(702) 555-0177", email: "marcus.webb@example.com", status: "active", productsOfInterest: [], notes: null, birthday: null, anniversary: "2015-09-03", graduatedToClientId: null },
  { importCustomerId: "CUST-1003", firstName: "Priya", lastName: "Patel", phone: "(702) 555-0122", email: "priya.patel@example.com", status: "active", productsOfInterest: ["CANYON"], notes: "Prefers text contact.", birthday: "1995-11-30", anniversary: null, graduatedToClientId: null },
  { importCustomerId: "CUST-1004", firstName: "Tom", lastName: "Okafor", phone: "(702) 555-0198", email: "tom.okafor@example.com", status: "active", productsOfInterest: [], notes: null, birthday: null, anniversary: null, graduatedToClientId: null },
  { importCustomerId: "CUST-1005", firstName: "Grace", lastName: "Liu", phone: null, email: null, status: "active", productsOfInterest: ["SUNDRIFT"], notes: "Sparse record — no phone or email on file.", birthday: null, anniversary: null, graduatedToClientId: null },
  { importCustomerId: "CUST-1006", firstName: "Sam", lastName: "Rivera", phone: "(702) 555-0166", email: "sam.rivera@example.com", status: "active", productsOfInterest: [], notes: "Repeat buyer.", birthday: "1982-02-27", anniversary: "2012-06-18", graduatedToClientId: null },
  { importCustomerId: "CUST-1007", firstName: "Aisha", lastName: "Khan", phone: "(702) 555-0133", email: "aisha.khan@example.com", status: "graduated", productsOfInterest: [], notes: "Graduated after August promo visit.", birthday: null, anniversary: null, graduatedToClientId: clientIdsForLists[0] },
  { importCustomerId: "CUST-1008", firstName: "Leo", lastName: "Fischer", phone: "(702) 555-0110", email: "leo.fischer@example.com", status: "graduated", productsOfInterest: [], notes: null, birthday: null, anniversary: null, graduatedToClientId: clientIdsForLists[1] },
  { importCustomerId: "CUST-1009", firstName: "Nina", lastName: "Petrova", phone: "(702) 555-0155", email: "nina.petrova@example.com", status: "unsubscribed", productsOfInterest: [], notes: "Opted out of outreach.", birthday: null, anniversary: null, graduatedToClientId: null },
  { importCustomerId: "CUST-1010", firstName: "Owen", lastName: "Byrne", phone: "(702) 555-0188", email: "owen.byrne@example.com", status: "rejected", productsOfInterest: [], notes: "Duplicate of an existing client record.", birthday: null, anniversary: null, graduatedToClientId: null },
];
for (const p of prospectData) {
  insProspect.run(
    randomUUID(), p.importCustomerId, importBatchId,
    p.firstName, p.lastName, p.phone, p.email, p.status,
    JSON.stringify(p.productsOfInterest), p.notes, p.birthday, p.anniversary,
    p.graduatedToClientId, now - 45 * day, now - 45 * day,
  );
}

// Banned customers
const insBan = sqlite.prepare(`
  INSERT INTO banned_customers (id,customer_id,first_name,last_name,email,phone,address,city,state,zip,ban_reason_category,specific_ban_reason,business_name,ban_date,notes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
insBan.run(randomUUID(), "CUST12345", "Alex", "Smith", "alex@example.com", "(555) 123-4567", "123 Main St", "Lakeshore", "ST", "00000", "Reselling", "Caught reselling on eBay", "Smith Resale LLC", now - 90*day, "Flagged by loss prevention");
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
