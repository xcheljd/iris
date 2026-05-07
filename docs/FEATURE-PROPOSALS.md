# Iris — Feature Proposals
## Inspired by Industry CRM Research (BSPK, Endear, Tulip, Proximity Insight, Salesforce Retail Cloud)

**Date:** April 23, 2026  
**Last updated:** May 7, 2026  
**Status:** Implementation tracking — 13 of 17 features shipped (all Tier 1 + Tier 2 complete)

---

After researching the top retail clienteling platforms (BSPK, Endear, Tulip, Proximity Insight, Salesforce Retail Cloud, HubSpot Retail, Lightspeed), here are features worth adding to Iris that go beyond the base PRD. Grouped by priority.

---

## 🔥 Tier 1 — High Impact, Feasible for V1

### 1. Smart Lists / Saved Filters — ✅ SHIPPED
**Implemented:** `app/(app)/smart-lists/`, `lib/db/schema.ts` (`smartLists` table), server actions in `lib/actions.ts`  
**What's live:** Create, rename, duplicate, delete smart lists. Pre-built filters (My Clients, Promo Match, Stale Leads, Hot Clients, Birthdays This Month). Filter builder with employee/tag/status/heat/date/promo criteria. Persisted per-user with shared option.

---

### 2. Follow-Up Reminders — ✅ SHIPPED
**Implemented:** `app/(app)/follow-ups/`, `lib/queries.ts` (`getUpcomingFollowUps`, `getOverdueFollowUps`), server actions `markFollowUpComplete`, `rescheduleFollowUp`  
**What's live:** Set follow-up date when logging outreach. Dedicated `/follow-ups` page with Overdue/Upcoming/All tabs. Dashboard widgets for today's and overdue follow-ups. Complete and reschedule actions. Color-coded badges (green/amber/red).

---

### 3. Customer Tags / Labels — ✅ SHIPPED
**Implemented:** `lib/db/schema.ts` (`clientTags` table), `components/tags-tab.tsx`, server actions `addTag`, `removeTag`, `createTag`, `deleteTag`  
**What's live:** Freeform tags with autocomplete. Color-coded badges. Tag management in Settings. Filterable in client list. Tags on client detail profile.

---

### 4. Duplicate Detection & Merge Tool — ✅ SHIPPED
**Implemented:** `app/api/clients/check-duplicates/`, `components/merge-client-dialog.tsx`, `components/merge-from-form-dialog.tsx`, server action `mergeClients` in `lib/actions.ts`  
**What's live:** Real-time duplicate checking on client create/edit (name + phone/email matching). Warning shown before save. Full field-by-field merge UI: two-step flow — debounced search → resolution panel (pick winner per field) → confirm. All FK references (outreach logs, activity events, promo matches) migrated to winner before hard-deleting loser. Merge accessible from client detail actions menu (manager-only) and from the new client form duplicate warning. Merge event recorded on activity timeline.

---

### 5. Outreach Performance Dashboard (Per Employee) — ✅ SHIPPED
**Implemented:** `app/(app)/analytics/`, `app/(app)/analytics/collections/`  
**What's live:** Per-employee outreach counts, response rates, conversion rates, purchase tracking. Team leaderboard. Date range filtering. Collection interest analytics with promo cross-reference. Bar charts, pie charts, progress bars.

---

### 6. Quick-Add from Anywhere (Global Command Palette) — ✅ SHIPPED
**Implemented:** `components/command-palette.tsx` (uses `cmdk`), triggered via `Ctrl+K` or search icon  
**What's live:** Search clients by name/phone/email/model. Navigate to any page. Quick actions (Add Client, Log Outreach). Works on mobile via search icon tap.

---

## ⚡ Tier 2 — Valuable, Could Be V1.5

### 7. Birthday & Anniversary Tracking — ✅ SHIPPED
**Implemented:** `lib/db/schema.ts` (`birthday`, `anniversary` fields on clients), client create/edit forms  
**What's live:** Birthday and anniversary date fields on client profile. "Upcoming Birthdays" dashboard widget. "Birthdays This Month" smart list.

---

### 8. Client Scoring / Heat Level — ✅ SHIPPED
**Implemented:** `lib/heat-score.ts`, `lib/db/schema.ts` (`heatScore`, `heatLevel` on clients), server action `recalcHeat`  
**What's live:** Auto-calculated score (0-100) based on purchase history, outreach response, email list, interests, stale periods, unsubscribe status. Displayed as Hot (70+)/Warm (40-69)/Cold (<40) with color badges. Recalculated on outreach, purchase, tag, and email list changes.

---

### 9. Outreach Templates — ✅ SHIPPED
**Implemented:** `lib/db/schema.ts` (`outreachTemplates` table), `app/(app)/settings/`, server actions `createTemplate`, `deleteTemplate`  
**What's live:** Template CRUD in Settings. Templates available in outreach logger. Variable support for personalization. Copy-to-clipboard workflow.

---

### 10. Stale Lead Alerts — ✅ SHIPPED
**Implemented:** Heat score penalizes 90+ day inactivity (-15 pts) and 180+ day (-10 additional). Dashboard shows stale count. Built-in smart list "Stale Leads (90+ days)".  
**What's live:** Automatic detection via heat scoring. Dashboard widget. Filterable smart list. Stale clients go Cold.

---

### 11. Activity Feed / Timeline on Client Profile — ✅ SHIPPED
**Implemented:** `lib/db/schema.ts` (`activityEvents` table), `components/activity-timeline-tab.tsx`  
**What's live:** Chronological timeline tracking 11 event types (created, edited, outreach, purchase, tag changes, transfers, merges, status changes, notes). Event icons, employee attribution, expandable details. Filterable on client detail page.

---

### 12. Collection Interest Analytics — ✅ SHIPPED
**Implemented:** `app/(app)/analytics/collections/`  
**What's live:** Most requested collections chart, top model numbers table, cross-reference with current promos, interest trends. Dedicated `/analytics/collections` page.

---

## 🚀 Tier 3 — Future / V2

### 13. SMS Integration (Twilio)
**Seen in:** Endear, Tulip, BSPK, Proximity Insight

Send texts directly from the CRM. Track delivery, responses. Auto-log to outreach history.

**Why wait:** Adds cost (Twilio per-message fees), needs phone number provisioning. Start with copy-to-clipboard.

---

### 14. Appointment Booking
**Seen in:** Tulip, Endear, Proximity Insight

In-store appointment scheduling with calendar view. Associates set availability, clients book (or associates book on their behalf).

**Why wait:** Complex UX. Not core to your current workflow which is outreach-driven, not appointment-driven.

---

### 15. Email Campaign Builder
**Seen in:** Endear (Campaigns), HubSpot

Build and send email campaigns to segmented lists. Track opens, clicks, unsubscribes.

**Why wait:** Wednesday promo blasts could use this, but email delivery is a whole compliance rabbit hole (CAN-SPAM, unsubscribe management). Start with templates + copy-to-clipboard.

---

### 16. AI-Powered Outreach Suggestions
**Seen in:** BSPK, Endear (AI Notetaker), Tulip AI

AI suggests:
- Which clients to contact today
- What to say based on their interests + current promos
- Predict purchase likelihood

**Why wait:** Cool but not necessary at 3K clients. The manual workflows need to be solid first.

---

### 17. Shoppable Lookbooks (Endear Stories-style)
**Seen in:** Endear

Create curated product lookbooks with watch images + details that associates can share with clients via link.

**Why wait:** Needs product image management. Future feature when Meridian provides digital assets.

---

## Feature Priority Matrix

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Smart Lists | ✅ Shipped | Full CRUD + pre-built filters |
| 2 | Follow-Up Reminders | ✅ Shipped | Tabbed view, complete/reschedule |
| 3 | Customer Tags | ✅ Shipped | Color-coded, autocomplete, filterable |
| 4 | Duplicate Detection | ✅ Shipped | Real-time check + full field-by-field merge UI |
| 5 | Employee Analytics | ✅ Shipped | Per-employee metrics + charts |
| 6 | Command Palette | ✅ Shipped | Ctrl+K, client search, navigation |
| 7 | Birthday Tracking | ✅ Shipped | Date fields, dashboard widget, smart list |
| 8 | Client Scoring | ✅ Shipped | Heat score 0-100, Hot/Warm/Cold |
| 9 | Outreach Templates | ✅ Shipped | CRUD in Settings, variable support |
| 10 | Stale Lead Alerts | ✅ Shipped | Heat penalty + smart list + dashboard |
| 11 | Activity Timeline | ✅ Shipped | 11 event types, filterable |
| 12 | Collection Analytics | ✅ Shipped | Dedicated page with charts |
| 13 | SMS Integration | 🔲 Not started | V2 |
| 14 | Appointment Booking | 🔲 Not started | V2 |
| 15 | Email Campaigns | 🔲 Not started | V2 |
| 16 | AI Suggestions | 🔲 Not started | V2 |
| 17 | Shoppable Lookbooks | 🔲 Not started | V2 |

---

## Key Industry Stats That Validate These Features

- **50-70%** increase in order frequency with clienteling tools (BSPK)
- **18-30%** growth in average order value (Endear)
- **62%** more orders after implementing clienteling (Tulip)
- **3x** higher prospect conversion rates (industry average)
- Engaged customers spend **2x** as much as non-engaged (industry average)
- **82%** of retailers see increased repeat business through personalized rewards

---

*Last reviewed May 7, 2026. 13 of 17 features fully shipped, 0 partially shipped, 4 deferred to V2.*
