# Iris Visual & Interaction Testing Report

**Date:** 2026-04-27
**Viewports tested:** Desktop (1280x900), Mobile (375x812)
**Browser:** Chromium (Playwright)
**Pages tested:** 14 pages + dialogs, modals, and interactive components
**Last updated:** 2026-04-27 (post icon/favicon commit)

---

## Pages Tested

| Page | URL | Status |
|------|-----|--------|
| Login | `/login` | Pass |
| Dashboard | `/` | Pass |
| Clients List | `/clients` | Pass |
| New Client | `/clients/new` | Pass |
| Client Detail | `/clients/[id]` | Pass |
| Follow-Ups | `/follow-ups` | Pass |
| Smart Lists | `/smart-lists` | Pass |
| Promo Manager | `/promos` | Pass |
| Analytics | `/analytics` | Pass |
| Collections | `/analytics/collections` | Pass |
| Banned | `/banned` | Pass |
| Unsubscribed | `/unsubscribed` | Pass |
| Settings | `/settings` | Pass |
| Change Password | `/change-password` | Pass |

---

## Interactive Elements Tested

All of the following were verified on both desktop and mobile:

- Login form (username, password, show/hide, sign in, forgot password)
- Sidebar navigation links (all 10 routes)
- Topbar actions (toggle sidebar, search, theme toggle, user profile)
- Command palette (Cmd+K) — navigation and action items
- Theme toggle (light/dark mode)
- Client list: search, 4 filter dropdowns (heat, owner, status, text), sortable columns, checkboxes, action dropdowns (View/Edit), pagination
- Client detail: breadcrumbs, 6 tabs (Profile/Interests/Outreach/Timeline/Notes/Tags), copy phone/email buttons, edit client dialog, quick actions (Log Outreach, Promo Matches, Ban Customer, Unsubscribe)
- Log Outreach dialog: method toggle, outcome radio group, notes textarea, follow-up date, save/cancel
- Promo Matches dialog
- Follow-ups: complete buttons, pagination
- Smart Lists: pre-built filter buttons
- Promo Manager: promo cards
- Banned: unban buttons
- Unsubscribed: resubscribe buttons
- Settings: employee management
- Change Password: password form
- Mobile bottom navigation bar (Home, Clients, Follow, Stats, More)

---

## Critical Issues

### 1. ~~"Static route" indicator visible on every page~~ — NOT AN APP ISSUE

Initially reported as a Sonner toast on every page. Further investigation confirmed this is a Playwright MCP browser overlay injected by the testing tool -- it does **not** exist in the app's DOM and will never appear for real users. No code change needed.

**Severity:** ~~High~~ Not applicable

### 2. ~~Missing favicon (404 error in console)~~ — FIXED

Added `favicon.ico`, `favicon.svg`, `icon.svg`, and `icon.png` to `/app`. The 404 console error for `/favicon.ico` is now resolved. Next.js auto-detects these files for browser tabs and PWA metadata.

**Severity:** ~~Medium~~ Resolved
**Affects:** All pages

---

## Mobile Layout Issues

### 3. ~~Client detail page shows stacked sidebar + main content~~ — FIXED

On mobile, the client detail page now uses a collapsible "Client Info & Actions" panel that defaults to collapsed. Clicking the toggle expands the sidebar content (contact info, follow-ups, tags, quick actions). On desktop (md+), the sidebar remains visible as a persistent 280px panel. This eliminates the long-scroll problem on mobile screens.

**Severity:** ~~Medium~~ Resolved
**Affects:** Client detail page, mobile only

### 4. ~~Clients table "Contact" column cramped on mobile~~ — FIXED

Email text now truncates more aggressively on mobile (`max-w-[120px]`) vs desktop (`max-w-[200px]`). Also added null checks so empty phone/email rows don't render blank lines.

**Severity:** ~~Low~~ Resolved
**Affects:** Clients list, mobile only

### 5. ~~Dashboard stat cards readability on mobile~~ — FIXED

Stat card icons and text now use responsive sizing: `h-9 w-9` icon containers on mobile scaling to `h-10 w-10` on desktop, `text-xl` numbers on mobile scaling to `text-2xl` on desktop, and `text-[11px]` labels scaling to `text-xs`. Added `leading-tight` and `truncate` to prevent overflow.

**Severity:** ~~Low~~ Resolved
**Affects:** Dashboard, mobile only

---

## Visual Polish Issues

### 6. ~~Duplicate client names in dashboard lists~~ — FIXED

Follow-up lists now show outreach context below each client name: either the notes text (if present) or the method + outcome (e.g., "Email — voicemail"). This differentiates duplicate entries for the same client (e.g., "Richard Lee — Email — voicemail" vs "Richard Lee — Call — voicemail").

**Severity:** ~~Low~~ Resolved
**Affects:** Dashboard Overview tab

### 7. ~~Activity tab shows repetitive data~~ — FIXED

The employee column now shows actual employee names instead of "—". This was caused by all seed outreach logs having `null` employee_id. A data backfill was run to copy the client's assigned employee_id to each outreach log (53 rows updated). New outreach logs correctly set employee_id from the session user.

**Severity:** ~~Low~~ Resolved
**Affects:** Dashboard Activity tab

### 8. ~~Outreach tab has no pagination or "load more"~~ — FIXED

The client detail Outreach tab now shows 10 records initially with a "Load more (N remaining)" button. Removed the fixed-height `ScrollArea` in favor of natural height with progressive loading. A total record count is shown at the bottom.

**Severity:** ~~Medium~~ Resolved
**Affects:** Client detail Outreach tab, both viewports

### 9. ~~Quick Actions buttons may overflow on mobile sidebar~~ — FIXED

Quick Actions buttons now use `justify-start` alignment with `shrink-0` on icons and `truncate` on text. The "Promo Matches (3)" text was shortened to "Promos (3)" to prevent wrapping at 375px.

**Severity:** ~~Low~~ Resolved
**Affects:** Client detail sidebar, mobile only

### 10. ~~Pagination counter contradicts page count~~ — FIXED

The client list footer now shows a range (e.g. "1–20 of 66 clients") alongside "Page 1 of 4", which is consistent. When filters narrow the results, it appends `(66 total)` to indicate the broader dataset. Previously showed the contradictory "66 of 66 clients".

**Severity:** ~~Medium~~ Resolved
**Affects:** Clients list, both viewports

---

## Things Working Well

- Theme toggle (light/dark) works correctly with proper color transitions
- Command palette (Cmd+K) opens, searches, and navigates correctly
- All sidebar and bottom navigation links work and show active state
- Sidebar collapses/expands properly on desktop
- Mobile bottom nav bar appears correctly on small screens
- Dialogs (Edit Client, Log Outreach, Promo Matches) open and close correctly
- Copy buttons for phone/email work with toast feedback
- Tab switching is responsive on all pages
- Sort columns work in data tables
- Filter dropdowns open, select, and filter correctly
- Pagination Next/Previous buttons function properly
- Breadcrumb navigation works on client detail page
- All forms render properly with proper labels and placeholders
- Dark mode renders consistently across all pages with good contrast
- Brand icon renders correctly in sidebar (32px), login page (48px), and as favicon — no hydration errors, no console errors

---

## Recommended Fixes by Priority

1. ~~**Remove/hide the "Static route" Sonner toast** — appears on every page~~ **NOT AN APP ISSUE** — Playwright MCP browser overlay, not rendered by the app
2. ~~**Add a `favicon.ico`** — eliminates 404 console error~~ **DONE** — favicon and icon files added
3. ~~**Fix pagination counter** — "66 of 66" contradicts "Page 1 of 4"~~ **DONE** — now shows "1–20 of 66 clients"
4. ~~**Mobile client detail** — collapse sidebar into accordion/tabs on small screens~~ **DONE** — collapsible "Client Info & Actions" panel on mobile
5. ~~**Outreach history pagination** — add "Load more" or page controls for long lists~~ **DONE** — shows 10 initially, load more button for remaining
6. ~~**Activity tab employee column** — show actual employee name instead of "—"~~ **DONE** — backfilled 53 outreach logs with employee_id
7. ~~**Duplicate follow-up entries** — add context/note to differentiate identical items~~ **DONE** — shows method/outcome below each entry
8. ~~**Dashboard stat cards readability** — improve sizing on mobile~~ **DONE** — responsive icon/text sizing
9. ~~**Clients table Contact column** — cramped on mobile~~ **DONE** — responsive truncation
10. ~~**Quick Actions button overflow** — "Promo Matches (3)" wraps at 375px~~ **DONE** — shortened text + truncation

All 10 issues resolved.
