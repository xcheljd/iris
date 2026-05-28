# Product Requirements Document
## Iris — Every thread, remembered

**Author:** Friday  
**Date:** April 23, 2026  
**Status:** Draft — Features Approved  
**Target:** Meridian Watch — Metro South (scalable to other locations)

---

## 1. Overview

### Problem
The current client database lives in a sprawling Excel workbook with 2,991+ active customers across multiple sheets, formula-driven promo matching, inconsistent data entry (e.g., "STORE" vs "Store" vs "store"), free-text fields that mix dates, notes, and outcomes, and no real search or filter capability. It works, but it's fragile and slow.

### Solution
A lightweight, self-hosted web CRM purpose-built for Meridian Watch retail clienteling. shadcn/ui components throughout. Fast, mobile-friendly, opinionated about the data — so the team spends less time fighting spreadsheets and more time selling watches.

### Design Principles
- **shadcn/ui first** — every component from the shadcn registry
- **Opinionated fields** — dropdowns and tags over free-text wherever possible
- **Mobile-first** — associates use phones on the floor
- **Data integrity** — validation, dedup detection, consistent enums
- **Import-ready** — absorbs the existing Excel data on day one
- **Proactive, not reactive** — reminders, alerts, and smart lists surface what matters before it's urgent

---

## 2. User Roles

| Role | Access |
|------|--------|
| **Store Manager** (Marcus) | Full CRUD, dashboard, employee management, promo config, bulk actions, exports, smart list management, outreach templates |
| **Associate** (Jordan, Riley, Cameron, Morgan, etc.) | CRUD on own clients, view all clients (read-only for others), outreach logging, personal smart lists |
| **Area Manager** (Scott) | Read-only dashboard, reports (future) |

---

## 3. Data Model

### 3.1 Client (Primary Entity)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `first_name` | string | Required |
| `last_name` | string | Optional |
| `phone` | string | Formatted (XXX) XXX-XXXX |
| `email` | string | Validated |
| `employee_id` | FK → Employee | Who owns this client |
| `date_added` | date | Auto-set on creation |
| `products_of_interest` | string[] | Model numbers, tag-based input |
| `notes` | text | Rich text with date-stamped entries |
| `on_email_list` | boolean | YES/NO — clean boolean |
| `status` | enum | `active` / `inactive` / `banned` / `unsubscribed` |
| `source` | enum | `Client Log` / `Customer Report` / `Walk-in` / `Referral` |
| `birthday` | date | Optional — month/day for outreach |
| `anniversary` | date | Optional — for gift-giving opportunities |
| `tags` | string[] | Freeform labels (#VIP, #repeat-buyer, #military, etc.) |
| `heat_score` | integer | Auto-calculated engagement score (0-100) |
| `heat_level` | enum | `hot` / `warm` / `cold` — derived from score |
| `last_outreach_at` | timestamp | Auto-updated when outreach logged |
| `last_purchase_at` | timestamp | Auto-updated when purchase logged |
| `created_at` | timestamp | Auto |
| `updated_at` | timestamp | Auto |

### 3.2 Outreach Log

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `client_id` | FK → Client | |
| `method` | enum | `call` / `text` / `email` / `in-person` |
| `date` | date | |
| `outcome` | enum | `no_answer` / `voicemail` / `voicemail_full` / `responded` / `not_interested` / `wants_to_come_in` / `purchased` |
| `purchased_model` | string | Model number if outcome = purchased |
| `notes` | text | Free text |
| `employee_id` | FK → Employee | Who made the outreach |
| `follow_up_date` | date | When to follow up next |
| `template_id` | FK → Outreach Template | Which template was used (if any) |

### 3.3 Follow-Up (Derived from Outreach Log)

Follow-ups are outreach logs where `follow_up_date` is set. The system surfaces these as:
- **Today's Follow-Ups** — due today
- **Overdue** — past due, not yet completed
- **Upcoming** — due in next 7 days

Completing a follow-up = logging a new outreach entry on that client, which clears the follow-up.

### 3.4 Employee

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Display name (e.g., "Marcus") |
| `role` | enum | `manager` / `associate` |
| `active` | boolean | For deactivating without deleting |
| `created_at` | timestamp | Auto |

### 3.5 Smart List (Saved Filters)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | e.g., "Crimson Ace Prospects — Not Contacted" |
| `owner_id` | FK → Employee | Who created it (or null = shared) |
| `filters` | JSON | Serialized filter state (employee, tags, status, promo match, date range, etc.) |
| `sort` | string | Sort field + direction |
| `is_shared` | boolean | Visible to all users or just owner |
| `created_at` | timestamp | Auto |

### 3.6 Client Tag

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Unique, e.g., "VIP", "repeat-buyer" |
| `color` | string | Badge color (hex or tailwind class) |
| `usage_count` | integer | Auto-calculated |

Tags are auto-created on first use. Autocomplete when typing. Managed in Settings.

### 3.7 Outreach Template

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | e.g., "New Promo Blast", "Watch Arrived" |
| `subject` | string | Optional (for email templates) |
| `body` | text | Message body with variable support: `{{first_name}}`, `{{collection}}`, `{{model}}`, `{{employee_name}}` |
| `channel` | enum | `text` / `email` / `general` |
| `is_default` | boolean | System template vs. custom |
| `created_by` | FK → Employee | |
| `created_at` | timestamp | Auto |

### 3.8 Promo Watch

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `model_number` | string | e.g., "IX1002-01X" |
| `collection` | string | e.g., "CAMBRIDGE" |
| `active` | boolean | Currently on promo? |
| `date_added` | date | |

### 3.9 Promo Match (Cached)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `client_id` | FK → Client | |
| `promo_id` | FK → Promo Watch | |
| `match_type` | enum | `model` (⭐) / `collection` (♦) |
| `created_at` | timestamp | Auto — recalculated when promos or interests change |

### 3.10 Banned Customer

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `customer_id` | string | Original RVX Customer ID (if known) |
| `first_name` | string | |
| `last_name` | string | |
| `email` | string | |
| `phone` | string | |
| `address` | text | Full address |
| `city` | string | |
| `state` | string | |
| `zip` | string | |
| `ban_reason_category` | enum | `Reselling` / `Gift Card Fraud` / `Other` |
| `specific_ban_reason` | string | |
| `business_name` | string | |
| `ban_date` | date | |
| `notes` | text | |

### 3.11 Unsubscribe List

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `email` | string | Unique, validated |
| `unsubscribed_at` | timestamp | Auto-set |

### 3.12 Activity Event (Timeline)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `client_id` | FK → Client | |
| `event_type` | enum | `created` / `edited` / `outreach_logged` / `purchase` / `tag_added` / `tag_removed` / `transferred` / `promoted` / `note_added` / `status_changed` / `merged` |
| `description` | string | Human-readable summary |
| `metadata` | JSON | Event-specific data (field changes, etc.) |
| `employee_id` | FK → Employee | Who triggered it |
| `created_at` | timestamp | Auto |

---

## 4. Features

### 4.1 Dashboard (`/`)
The landing page. At-a-glance metrics + actionable widgets.

**Stat Cards:**
- Total Active Clients
- Clients on Email List
- Outreach This Week
- Purchases This Month
- 🔥 Hot Clients (heat score ≥ 70)
- ⚠️ Stale Leads (no outreach 90+ days)

**Charts:**
- Client growth over time (line)
- Top collections by interest (bar)
- Outreach by employee (bar)
- Outreach → Purchase conversion rate (line)

**Action Widgets:**
- **Today's Follow-Ups** — list of clients due for follow-up today
- **Overdue Follow-Ups** — past due, needs attention
- **Promo Matches** — clients matched to current promos, not yet contacted
- **Upcoming Birthdays** — this month's birthdays
- **Stale Lead Alert** — count + "View All" link

**shadcn/ui:** `Card`, `Chart`, `Table`, `Badge`, `ScrollArea`

### 4.2 Client List (`/clients`)
The workhorse view. Searchable, filterable, sortable data table.

**Search:** By name, phone, email, model number (global `Ctrl+K` command palette)

**Filters:**
- Employee (dropdown)
- Email list status (toggle)
- Promo match (⭐ model / ♦ collection / any / none)
- Outreach status (contacted / not contacted / stale)
- Tags (multi-select)
- Heat level (🔥 Hot / 🟡 Warm / ❄️ Cold)
- Date range (added, last outreach)
- Source

**Sort:** Name, date added, last outreach date, heat score

**Client row badges:**
- ⭐ Model promo match
- ♦ Collection promo match
- 🔥🟡❄️ Heat level
- Tag badges (color-coded)

**Quick actions (per row):**
- Log outreach
- Mark purchased
- Add/remove tag
- Set follow-up

**Bulk actions:** Select multiple → add to email list, assign to employee, add tag, export, log outreach

**Smart Lists:** Dropdown of saved filter combos. "My VIPs", "Promo Match — Not Contacted", "This Month's Birthdays", etc.

**shadcn/ui:** `DataTable`, `Input`, `Select`, `Badge`, `Button`, `DropdownMenu`, `Command`, `Popover`

### 4.3 Client Detail (`/clients/:id`)
Full client profile with tabbed interface.

**Tabs:**
1. **Profile** — Name, contact, employee, status, source, birthday, anniversary, date added, heat score visualization
2. **Interests** — Tag-based model numbers, auto-matched collections, promo match status
3. **Outreach History** — Chronological log of all outreach with method/outcome/notes, follow-up status
4. **Activity Timeline** — Combined feed of all events (outreach, purchases, edits, tag changes, transfers, merges) — the single source of truth for "what happened with this client"
5. **Notes** — Date-stamped notes with ability to add new entries
6. **Tags** — All tags, clickable to see other clients with same tag

**Quick sidebar:**
- Follow-up status (next due date or "No follow-up scheduled")
- Copy phone / copy email buttons
- Copy outreach template (personalized) to clipboard

**shadcn/ui:** `Tabs`, `Card`, `Avatar`, `Badge`, `Separator`, `Sheet`, `Dialog`, `Form`, `ScrollArea`, `Tooltip`

### 4.4 Add/Edit Client (`/clients/new`, `/clients/:id/edit`)
Modal or full-page form with validation.

**Fields:**
- First name (required), Last name
- Phone, Email (at least one required)
- Employee assignment (dropdown)
- Products of interest (tag input, autocomplete from existing model numbers)
- Birthday, Anniversary (date pickers)
- Tags (multi-select autocomplete)
- Source (dropdown)
- On email list (switch)
- Notes (textarea)

**Validation:**
- Phone format
- Email format
- Duplicate detection: warn if similar name + phone/email exists, show side-by-side comparison, option to merge

**shadcn/ui:** `Form`, `Input`, `Label`, `Select`, `Switch`, `Textarea`, `Button`, `Toast`, `AlertDialog`, `DatePicker`, `TagInput`

### 4.5 Outreach Logger
Quick action accessible from client list, detail page, or command palette.

**Flow:**
1. Select method (call/text/email/in-person)
2. Select outcome (dropdown)
3. If purchased → enter model number
4. Optional: select outreach template → auto-fill notes with personalized copy
5. Optional: set follow-up date ("Remind me in 3 days" quick presets)
6. Optional notes
7. Save → updates client's last outreach date, recalculates heat score, logs activity event

**shadcn/ui:** `Dialog`, `Select`, `Input`, `Textarea`, `Button`, `RadioGroup`, `Calendar`

### 4.6 Follow-Up System
Integrated into dashboard, client list, and client detail.

**Sources:**
- Manual: set when logging outreach
- Auto: configurable rules (e.g., "No response → auto-follow-up in 7 days")

**Views:**
- Dashboard widget: today's + overdue follow-ups
- Dedicated `/follow-ups` page with calendar-style or list view
- Client detail: next follow-up date + history
- Color coding: green (today), amber (upcoming), red (overdue)

**shadcn/ui:** `Card`, `Badge`, `Calendar`, `ScrollArea`

### 4.7 Smart Lists (`/smart-lists`)
Save, manage, and share filter combinations.

**Built-in smart lists (system):**
- "My Clients" — filtered to current user
- "Promo Match — Not Contacted" — ⭐/♦ clients with no outreach on current promo
- "Stale Leads (90+ days)"
- "🔥 Hot Clients"
- "This Month's Birthdays"

**Custom smart lists:**
- Save any filter combination from client list
- Name it, make it shared or personal
- One-click access from sidebar navigation

**shadcn/ui:** `Card`, `Button`, `Dialog`, `Input`, `Switch`

### 4.8 Customer Tags
Flexible labeling system for segmentation.

**Behavior:**
- Tags auto-created on first use (type to create)
- Autocomplete from existing tags when adding
- Color-coded badges (auto-assigned or customizable)
- Click tag → see all clients with that tag
- Filterable in client list
- Bulk add/remove tags from client list

**Common tags:**
`#VIP` `#repeat-buyer` `#high-spender` `#military` `#birthday-this-month` `#talker` `#no-texts` `#email-only`

**shadcn/ui:** `Badge`, `Command` (autocomplete), `Popover`

### 4.9 Duplicate Detection & Merge Tool (`/settings/duplicates`)
Automated scanning + guided merge.

**Detection:**
- Auto-scan on client creation (real-time warning)
- Periodic full scan (configurable: weekly)
- Match on: similar name + same phone, same email, or same phone + email
- Fuzzy name matching (handle typos, nicknames)

**Merge workflow:**
1. Side-by-side comparison of two records
2. Select which field values to keep (or merge arrays like tags/interests)
3. Outreach logs and activity events from both → merged into winner
4. Loser record soft-deleted, redirect to winner
5. Merge logged as activity event

**shadcn/ui:** `Card`, `Table`, `Button`, `Dialog`, `Checkbox`, `ScrollArea`

### 4.10 Outreach Performance Dashboard (`/analytics`)
Per-employee outreach metrics for 1:1s and performance reviews.

**Metrics per employee:**
- Outreaches this week / this month
- Response rate (% of outreach that got a response)
- Conversion rate (% of outreach that led to purchase)
- Average time from client creation to first contact
- Stale leads owned (90+ days no contact)
- Follow-up completion rate

**Team view:**
- Leaderboard (outreach count, conversion rate)
- Trend over time (4-week rolling)

**shadcn/ui:** `Card`, `Chart`, `Table`, `Select`, `DatePicker`

### 4.11 Command Palette (`Ctrl+K`)
Global search + actions from anywhere.

**Actions:**
- Search clients (by name, phone, email, model)
- Add new client
- Log outreach (select client → outreach dialog)
- Navigate to any page
- Apply a smart list
- Search tags

**shadcn/ui:** `Command` (Dialog + CommandInput + CommandList + CommandGroup + CommandItem)

### 4.12 Client Heat Scoring
Auto-calculated engagement score displayed on client list and profile.

**Scoring signals:**

| Signal | Points |
|--------|--------|
| Purchased (ever) | +15 |
| Purchased (last 90 days) | +10 |
| Responded to outreach (last 90 days) | +10 |
| On email list | +5 |
| Has products of interest | +5 |
| Has birthday filled in | +3 |
| No outreach in 90+ days | -15 |
| No outreach in 180+ days | -10 (additional) |
| Unsubscribed | -20 |

**Levels:**
- 🔥 **Hot** (70+): Priority outreach targets
- 🟡 **Warm** (40-69): Active interest, nurture
- ❄️ **Cold** (<40): Re-engagement needed or deprioritize

Score recalculated on: outreach logged, purchase logged, tag change, email list change, scheduled nightly refresh.

**shadcn/ui:** `Badge` with color variants, mini progress bar on client cards

### 4.13 Birthday & Anniversary Tracking
Structured date fields for personalized outreach.

**Features:**
- Birthday & anniversary fields on client profile
- "Upcoming Birthdays" dashboard widget (this month)
- "Birthdays This Week" smart list
- Outreach template variable: `{{birthday}}`
- Optional auto-reminder (configurable: 2 weeks before)

**shadcn/ui:** `DatePicker`, `Card`, `Badge`

### 4.14 Outreach Templates (`/settings/templates`)
Pre-written messages for common scenarios.

**Built-in templates:**
- "New Promo: {{collection}} watches on sale!"
- "Your watch {{model}} has arrived!"
- "Happy Birthday, {{first_name}}! 🎂 Special offer inside"
- "We haven't seen you in a while, {{first_name}}"
- "Thank you for your purchase, {{first_name}}!"

**Custom templates:**
- Manager creates templates with variables (`{{first_name}}`, `{{last_name}}`, `{{model}}`, `{{collection}}`, `{{employee_name}}`)
- Associates select template → preview with client data → copy to clipboard

**shadcn/ui:** `Card`, `Textarea`, `Input`, `Button`, `Select`, `Dialog`, `Preview` (rendered template)

### 4.15 Stale Lead Alerts
Automated detection + surfacing of neglected clients.

**Behavior:**
- Configurable threshold (default: 90 days no outreach)
- "Stale Leads" count badge in sidebar
- Smart list auto-generated: "Stale Leads (90+ days)"
- Dashboard widget showing stale count trend (are we improving?)
- Option to batch-assign stale leads to associates for re-engagement
- Affects heat score (clients go ❄️ Cold)

**shadcn/ui:** `Badge`, `Card`, `Alert`

### 4.16 Activity Timeline
Chronological feed on every client profile.

**Event types tracked:**
- Client created
- Profile edited (with diff: "Phone changed from X to Y")
- Outreach logged (method + outcome)
- Purchase recorded
- Tag added/removed
- Employee transferred
- Follow-up set/completed
- Client merged
- Status changed
- Note added

**Display:**
- Timeline format with icons per event type
- Filterable by event type
- Employee attribution on each event
- Expandable details

**shadcn/ui:** `ScrollArea`, `Avatar`, `Separator`, `Badge`

### 4.17 Collection Interest Analytics (`/analytics/collections`)
Which collections and models are most in-demand.

**Views:**
- Most requested collections (bar chart)
- Top model numbers (table with count)
- Cross-reference with promos: "33 clients interested in CRIMSON ACE — currently on promo"
- Interest trends over time

**shadcn/ui:** `Card`, `Chart`, `Table`

### 4.18 Promo Manager (`/promos`)
Manage which watches/collections are currently on promo.

**Capabilities:**
- Add/remove promo watches (model number + collection)
- Toggle active/inactive
- See matched client count for each promo item
- Bulk import from corporate promo list (paste model numbers)
- "Promo Outreach View": all matched clients, one-click to start outreach

**shadcn/ui:** `Table`, `Input`, `Button`, `Switch`, `Dialog`, `Badge`

### 4.19 Client Transfer
When two employees have the same client, reassign cleanly.

- Search client → change employee assignment
- Log the transfer in activity timeline
- Both employees can view (read-only) transferred client

### 4.20 Banned Customers (`/banned`)
Separate view for the banned list.

- Search, filter by ban reason category
- Add new banned customer
- Check against banned list when adding new client (warn if match by name/email/phone)

### 4.21 Unsubscribe Management (`/unsubscribed`)
Simple email list management.

- Add email to unsubscribe list
- Prevent sending to unsubscribed emails
- Auto-flag if client email is on unsubscribe list
- Client status auto-updates to `unsubscribed`

### 4.22 Data Import (`/settings/import`)
One-time and repeatable import from Excel.

- Upload the current workbook
- Map columns to fields
- Handle data cleanup: normalize employee names, parse free-text contacted/purchased into structured outreach logs
- Preview before committing
- Dedup detection during import
- Post-import: show stats, flag records needing manual review

**shadcn/ui:** `Card`, `Table`, `Button`, `Progress`, `Dialog`

### 4.23 Export
- Export client list to CSV/Excel
- Filtered export (e.g., only clients matching current promo)
- Outreach report by date range and employee
- Smart list export (export the current view)

### 4.24 Settings (`/settings`)
- Employee management (add/deactivate)
- User account management (login credentials)
- Tag management (rename, merge, delete, set colors)
- Outreach template management
- Smart list management
- Duplicate scanner (manual trigger)
- Data cleanup tools
- Heat score threshold configuration
- Stale lead threshold configuration
- Promo keyword management

---

## 5. Promo Matching System (⭐♦ Replacement)

The current Excel uses complex `SUMPRODUCT` + `SEARCH` formulas to detect if a client's product interests match promo models/collections. This gets replaced with:

1. When a promo watch is added → system scans all active clients' `products_of_interest` and `notes` fields
2. Matches cached in `promo_matches` table (recalculated on promo/client changes)
3. Client list shows ⭐ (model match) or ♦ (collection match) badges
4. Dedicated "Promo Outreach" smart list: matched clients, not yet contacted
5. Promo detail page shows all matched clients with one-click outreach

---

## 6. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | Next.js 15 (App Router) | SSR, file-based routing, React Server Components |
| **UI** | shadcn/ui + Tailwind CSS 4 | Marcus's preference — beautiful, accessible, customizable |
| **Database** | SQLite (Turso or local) | Simple deployment, no server to manage, 3K clients is tiny |
| **ORM** | Drizzle ORM | Type-safe, lightweight, great SQLite support |
| **Auth** | NextAuth.js (Credentials) | Simple username/password, role-based access |
| **Forms** | react-hook-form + zod | Validation, type safety |
| **Tables** | TanStack Table | Sorting, filtering, pagination — the shadcn DataTable standard |
| **Charts** | Recharts (via shadcn Chart) | Dashboard metrics |
| **Search** | Fuse.js (client-side) | Fast fuzzy search over 3K records, no server needed |
| **Deployment** | Vercel or self-hosted (Docker) | Zero-config or full control |

---

## 7. Screens / Routes

| Route | Page | Access |
|-------|------|--------|
| `/` | Dashboard | All |
| `/clients` | Client list with search/filter/smart lists | All |
| `/clients/new` | Add client form | All |
| `/clients/:id` | Client detail + tabs (profile, interests, outreach, timeline, notes, tags) | All |
| `/clients/:id/edit` | Edit client | All |
| `/follow-ups` | Follow-up manager (today, overdue, upcoming) | All |
| `/smart-lists` | Smart list management | All |
| `/promos` | Promo management + promo outreach view | Manager |
| `/banned` | Banned customers | Manager |
| `/unsubscribed` | Unsubscribe list | Manager |
| `/analytics` | Outreach performance (employee metrics) | Manager |
| `/analytics/collections` | Collection interest analytics | Manager |
| `/settings` | Settings overview | Manager |
| `/settings/employees` | Employee management | Manager |
| `/settings/tags` | Tag management | Manager |
| `/settings/templates` | Outreach templates | Manager |
| `/settings/import` | Data import wizard | Manager |
| `/settings/duplicates` | Duplicate scanner + merge tool | Manager |

---

## 8. Mobile Considerations

- **Bottom nav:** Dashboard, Clients, Follow-Ups, Add (+), Menu
- **Floating action button:** Quick client add, quick outreach log
- **Swipe actions:** Log outreach, mark purchased, set follow-up
- **Responsive tables** → card layout on small screens
- **Touch-friendly** form inputs and dropdowns
- **Command palette:** Tap search icon → full-screen command palette on mobile
- **Follow-up notifications:** Badge count on nav icon

---

## 9. Data Migration Plan

### Phase 1: Clean Import
1. Normalize employee names to canonical values (STORE/Store/store → Store; Marcus/Marcus → Marcus; Jordan/Jordan → Jordan; Morgan/Morgan → Morgan)
2. Normalize `Email List` (YES/yes/Yes → true, NO → false)
3. Parse free-text `Contacted` and `Purchased` fields into structured outreach log entries (best-effort — dates, methods, outcomes extracted from text patterns)
4. Extract tags from notes (birthday mentions, "talkative", "65% promo", etc.)
5. Import `Banned Customers` sheet as-is
6. Import `Unsubscribed` sheet (email-only) as-is
7. Import `promo` sheet into Promo Watch table
8. Auto-calculate initial heat scores
9. Generate initial activity events from parsed data

### Phase 2: Verification
1. Show import summary: row counts, unmatched data, parsing failures
2. Manual review of flagged records
3. Run duplicate scanner on imported data
4. Confirm totals match source

### Phase 3: Ongoing
1. Excel becomes read-only archive
2. All new entries in CRM only
3. Weekly export backup available

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Data entry time per client | < 30 seconds |
| Search and find a client | < 5 seconds |
| Log an outreach action | < 15 seconds |
| Set a follow-up | < 10 seconds |
| Promo match visibility | Instant (vs. formula recalc in Excel) |
| Duplicate rate | < 1% (vs. current unknown rate) |
| Follow-up completion rate | > 80% |
| Mobile usability | Full functionality on phone |
| Stale lead reduction | 50% reduction in 90+ day stale within first quarter |

---

## 11. Non-Goals (V1)

- Email sending integration (copy to clipboard instead)
- SMS integration
- Calendar/scheduling
- Multi-store sync (single store only)
- Customer portal
- RVX system integration
- Real-time collaboration
- Shoppable lookbooks
- AI-powered suggestions

---

## 12. Future Considerations (V2+)

- Email campaign builder with delivery tracking
- SMS outreach via Twilio
- Appointment booking with calendar view
- Client lifetime value tracking
- Multi-store support for area/regional managers
- RVX API integration (customer ID lookup, purchase history sync)
- PWA with offline support
- Bulk email blast with unsubscribe tracking
- Photo upload for client preferences
- AI-powered outreach suggestions
- Shoppable lookbooks (Endear Stories-style)

---

## 13. Design Moodboard

**Vibe:** Clean, premium, professional — like a Meridian showroom. Dark mode default with light mode toggle.

**Color palette:**
- Primary: Deep navy (#1e3a5f) — Meridian brand-adjacent
- Accent: Gold (#c9a84c) — luxury watch energy
- Background: Slate-900/950
- Success: Emerald
- Warning: Amber
- Danger: Rose
- Hot: Orange-500 🔥
- Warm: Amber-500 🟡
- Cold: Blue-300 ❄️

**Typography:**
- Headings: Inter or Geist (clean, modern)
- Body: Same — one font family, consistent weights

**shadcn Theme:** New York style (more compact, professional) over Default (more spacious)

---

*This PRD is a living document. Updated April 23, 2026 — Tier 1 & Tier 2 features approved and integrated.*
