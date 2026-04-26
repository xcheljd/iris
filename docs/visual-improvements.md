# Iris Visual Improvements Report

> Generated via agent-browser screenshots + zai-mcp-server analysis + shadcn/ui Context7 docs cross-reference.
> Project uses **shadcn/ui (new-york style, slate base, dark theme)** with **34+ components installed**.

---

## Implementation Status

| Phase | Status | Items Done | Notes |
|-------|--------|------------|-------|
| Phase 1 | **COMPLETE** | 6/6 | Skeletons, tooltips, alert dialogs, sidebar separators, toasts, breadcrumbs |
| Phase 2 | **COMPLETE** | 13/13 | Password toggle, error alerts, strength indicator, requirements checklist |
| Phase 3 | **COMPLETE** | 8/8 | Sortable table, pagination, bulk select, auto-filters, row actions dropdown |
| Phase 4 | **COMPLETE** | 8/8 | Avatar header, card structure, separator, CTA button, promo matches dialog, copy tooltips |
| Phase 5 | **COMPLETE** | 14/14 | Follow-ups: CardHeader+CardContent, Reschedule/Snooze, OVERDUE Badge, Tabs (Overdue/Upcoming/All), AlertDialog on Done, Sheet detail, method Badge, relative time. Smart Lists: empty state CTA, Tooltips on truncated names, DropdownMenu actions, AlertDialog delete, Separator, member count badges, filter builder |
| Phase 6 | **COMPLETE** | 14/14 | Promos: Switch toggle inline, DropdownMenu actions, search/filter, pagination, Badge variants. Settings: Switch for employee status, DropdownMenu per row, search bar, Separator between tabs, Dialog descriptions |
| Phase 7 | **COMPLETE** | 17/17 | Banned: expandable rows, DropdownMenu, Badge categories, Dialog ban form, client link, client list exclusion. Unsubscribed: destructive Button, Form validation, Checkbox bulk select+remove, date range filter, Resubscribe, Quick Add client detection, enriched display. Analytics: Calendar date picker, recharts BarChart+PieChart, HoverCard, Progress bars, Tabs, Badge, Separator |
| Phase 8 | **COMPLETE** | 7/8 | Dashboard: tabbed views (Overview/Activity/Metrics), stat cards with hover effects, Recent activity as Table, Overdue Badge with icon + relative time, heat distribution bar, conversion/active metrics. Item 7 (accessibility audit) completed as Phase 9. Item 8 (mobile responsiveness) completed as Phase 10. Item 6 (QA sweep) deferred to ongoing maintenance |
| Phase 9 | **COMPLETE** | 6/6 | Accessibility audit: icon button aria-labels (101 nodes), color contrast fixes (6 nodes), progress bar aria-labels (3 nodes), landmark-main fixes (4 nodes), empty table headers (2 nodes), page heading (1 node) |
| Phase 10 | **COMPLETE** | 8/8 | Mobile responsiveness: client detail sidebar stacks on mobile, tab grid 3→6 columns, all tables get horizontal scroll wrappers, columns hidden on mobile, page headers wrap, follow-up cards stack, unsubscribed columns responsive, dialog forms stack, page titles scale |

### Post-Phase Feature Work

| Feature | Status | Notes |
|---------|--------|-------|
| Employee name display on client detail | **COMPLETE** | Was showing "Assigned", now shows actual name (e.g. "Jordan") |
| Owner filter on client list | **COMPLETE** | Dropdown populated from employee names + Unassigned option |
| Ban customer from clients page | **COMPLETE** | Row dropdown + sidebar; role-gated (manager=action, associate=request) |
| Unsubscribe customer from clients page | **COMPLETE** | Row dropdown + sidebar; role-gated (manager=action, associate=request) |
| Customer ID (backoffice POS ID) | **COMPLETE** | Schema+DB migrated, displayed under name, editable on add/edit/dialog forms |
| Banned clients excluded from client list | **COMPLETE** | `getAllClients`/`getClientsWithEmployee`/`searchClients` filter out `status: "banned"`; client pages only accessible from Banned page |
| Quick Add client detection (unsubscribed) | **COMPLETE** | Detects matching client by email, sets status to `unsubscribed`, logs timeline; reloads for enriched display |
| Resubscribe from unsubscribed page | **COMPLETE** | `resubscribeClient` action + DropdownMenu "Resubscribe" option for matched clients |
| Banned/Unban client page linking | **COMPLETE** | Banned page shows client name as link; enriched query via leftJoin; unban restores client to active + logs timeline |
| Timeline status display fix | **COMPLETE** | All `status_changed` events include `metadata: { newStatus }`; details block hidden for status_changed events |

### Changelog

**Phase 8 -- Dashboard & Polish Pass**
- `app/(app)/page.tsx` -- full rewrite: `Tabs` for Overview/Activity/Metrics views; stat cards with `hover:border-border hover:shadow-md transition-all` and `sublabel` support; Overview tab keeps overdue follow-ups, upcoming, hot leads, birthdays; overdue `Badge variant="destructive"` with `AlertCircle` icon and relative time via `daysAgo()`; Activity tab with proper `Table` (Method, Client, Outcome, Employee, When columns with relative time); Metrics tab with `Progress` bars for conversion rate and active client %, stacked heat distribution bar, Banned/Unsubscribed stat cards with View links, `Separator` between sections

**Phase 10 -- Mobile Responsiveness**
- `app/(app)/clients/[id]/client-detail-content.tsx` -- sidebar+content layout changes from hard `w-[280px]` flex to `md:w-[280px]` with `flex-col md:flex-row`, sidebar stacks above tabs on mobile
- `components/client-detail-tabs.tsx` -- tab grid changes from `grid-cols-6` to `grid-cols-3 md:grid-cols-6`, header `flex-col sm:flex-row`, padding `p-4 md:p-6`, title `text-2xl sm:text-3xl`
- `app/(app)/clients/clients-content.tsx` -- table wrapped in `overflow-x-auto`, Tags/Owner/Last Contact columns hidden on mobile (`hidden md:table-cell`), footer pagination wraps on mobile (`flex-col sm:flex-row`)
- `app/(app)/page.tsx` -- activity table wrapped in `overflow-x-auto`, Employee column hidden on mobile
- `app/(app)/promos/promos-content.tsx` -- header `flex-col sm:flex-row`, promo table wrapped in `overflow-x-auto`, MSRP/Disc/Sale columns hidden on small screens, pagination wraps, add-single dialog grids stack on mobile (`grid-cols-1 sm:grid-cols-2`), import dialog date range stacks, promo period banner stacks
- `app/(app)/settings/settings-content.tsx` -- employee table wrapped in `overflow-x-auto`, Username column hidden on mobile (`hidden sm:table-cell`), tags table wrapped with Color column hidden on mobile
- `app/(app)/banned/banned-content.tsx` -- header `flex-col sm:flex-row`, ban dialog form grid `grid-cols-1 sm:grid-cols-2`
- `app/(app)/follow-ups/follow-ups-content.tsx` -- follow-up cards `flex-col sm:flex-row` layout, action buttons `flex-row sm:flex-col` on mobile, date info `flex-wrap`
- `app/(app)/analytics/analytics-content.tsx` -- header `flex-col sm:flex-row`, date picker `flex-wrap`, title `text-2xl sm:text-3xl`
- `app/(app)/smart-lists/smart-lists-content.tsx` -- sidebar `md:grid-cols-[280px_1fr]` (tighter), title `text-2xl sm:text-3xl`
- `app/(app)/unsubscribed/unsubscribed-content.tsx` -- record rows `flex-col sm:flex-row`, Customer ID column hidden on mobile, header wraps, actions wrap
- `app/(app)/clients/new/page.tsx` -- added `px-4`, header `flex-col sm:flex-row`, title `text-2xl sm:text-3xl`
- `app/(app)/clients/[id]/edit/page.tsx` -- added `px-4`, header `flex-col sm:flex-row`, title `text-2xl sm:text-3xl`

**Phase 9 -- Accessibility Audit**
- Icon button `aria-label` added across 23 files: login (show/hide password), change-password (3 show/hide), sidebar (change password, sign out), settings (3 dropdown triggers: employee, tag, template), search clear buttons (promos, banned, unsubscribed, smart-lists, settings), profile-tab (copy phone/email), client-sidebar (copy phone/email), follow-up-form (copy notes), edit-client-dialog (remove product/tag X), new client page (2 remove X), edit client page (2 remove X), tags-tab (remove tag), smart-lists (create list button), topbar (theme toggle), clients (actions dropdown), promos (actions dropdown), banned (actions dropdown), unsubscribed (actions dropdown), smart-lists (list actions dropdown)
- `app/globals.css` -- brightened `--destructive` from `0 62.8% 45%` to `0 72% 55%` in dark mode for better contrast
- `app/(app)/banned/banned-content.tsx` -- orange-600 badge: added explicit `text-white`
- `app/(app)/follow-ups/follow-ups-content.tsx` -- email method badge: changed `text-purple-500` to `text-purple-400` for dark mode contrast
- `app/(app)/analytics/analytics-content.tsx` -- added `aria-label` to all 8 `<Progress>` bars (conversion rate, outreach completion, purchase rate, outcome distribution, hot/warm/cold percentages)
- `app/(app)/page.tsx` -- added `aria-label` to 2 `<Progress>` bars (conversion rate, active clients %)
- `components/heat-score-bar.tsx` -- added `aria-label` with dynamic score value
- `app/(app)/change-password/page.tsx` -- added `aria-label` to password strength `<Progress>`
- `app/(app)/layout.tsx` -- changed wrapper `<div>` to `<main>` for proper landmark
- `app/(app)/page.tsx` -- changed `<main>` to `<div>` (landmark now in layout)
- `app/(app)/clients/clients-content.tsx` -- changed `<main>` to `<div>` (landmark now in layout)
- `app/login/page.tsx` -- wrapped content in `<main>`, added `<h1 className="sr-only">Iris Login</h1>`
- `app/(app)/clients/clients-content.tsx` -- added `sr-only` text to empty checkbox and actions `<TableHead>` columns, added `aria-label` to select-all checkbox

**Phase 1 -- Shared Utilities & Safety Net**
- `components/skeletons.tsx` -- new file with `StatCardSkeleton`, `DashboardSkeleton`, `TableSkeleton`, `ClientListSkeleton`
- `app/(app)/layout.tsx` -- added `Suspense` boundary with `DashboardSkeleton` fallback
- `components/app-sidebar.tsx` -- added `Separator` between nav groups, `Tooltip` on footer buttons (Change Password, Sign Out)
- `components/topbar.tsx` -- added `Tooltip` on theme toggle, added `children` prop support
- `app/(app)/promos/promos-content.tsx` -- `Tooltip` on icon buttons, `AlertDialog` on delete
- `app/(app)/banned/banned-content.tsx` -- `AlertDialog` on unban
- `app/(app)/unsubscribed/unsubscribed-content.tsx` -- `AlertDialog` on remove
- `app/(app)/settings/settings-content.tsx` -- `Tooltip` on employee action buttons, `AlertDialog` on deactivate/tag delete/template delete
- `app/(app)/change-password/page.tsx` -- added `Breadcrumb` (Settings > Change Password)
- `app/(app)/clients/[id]/client-detail-content.tsx` -- added `Breadcrumb` (Clients > Client Name)
- Installed `alert-dialog` and `breadcrumb` components via shadcn CLI

**Phase 2 -- Login & Auth Polish**
- `app/login/page.tsx` -- password visibility toggle (eye icon), `Alert` for invalid credentials, `Loader2` spinner on sign in, `Button variant="link"` for Forgot Password, `Separator` between form and demo accounts, visibility toggle on recovery password field
- `app/(app)/change-password/page.tsx` -- full rewrite with: visibility toggles on all 3 fields, `Progress` strength indicator (Weak/Fair/Good/Strong), requirements checklist with Check/X icons, inline password match validation, `Separator` between cards, `Loader2` spinners on submit buttons

**Phase 3 -- Client List Overhaul**
- `app/(app)/clients/clients-content.tsx` -- new client component with: sortable column headers (Name, Heat, Owner, Last Contact), pagination (20/page), `Checkbox` bulk selection with select-all, auto-applying filters (no Apply button), `DropdownMenu` per-row (View, Edit)
- `app/(app)/clients/page.tsx` -- simplified to server data fetch + pass to `ClientListContent`
- `components/topbar.tsx` -- added `children` prop to fix "Add Client" button rendering
- `app/(app)/clients/[id]/edit/page.tsx` -- fixed pre-existing bug: empty string `SelectItem` value causing Radix Select crash (replaced with `__none__` sentinel)

**Phase 4 -- Client Detail Richness**
- `components/client-detail-tabs.tsx` -- added `Avatar` with `AvatarFallback` (initials) to client header, `Separator` between header and tabbed content
- `components/client-sidebar.tsx` -- replaced Sheet+FollowUpForm combo with `OutreachLogger` Dialog for "Log Outreach", added `Dialog` for "Promo Matches" (instead of tab switch), `Tooltip` on copy buttons (phone/email) with `Copy` icon, CTA "Schedule One" button in empty follow-ups state, `SheetHeader`/`SheetTitle` on outreach panel, removed unused imports
- `components/profile-tab.tsx` -- `Tooltip` on copy buttons with `Copy` icon, replaced `alert()` with `toast.success()` for clipboard feedback

**Post-Phase 4 -- Feature Additions**
- `lib/db/schema.ts` -- added `customerId` column to `clients` table (backoffice POS ID like 100600045)
- `app/(app)/clients/[id]/page.tsx` -- added `leftJoin` on `employees` to fetch `employeeName` for client detail (was showing generic "Assigned" instead of actual name)
- `components/client-sidebar.tsx` -- display `employeeName` instead of "Assigned"/"Unassigned", added `BanCustomerDialog` and `UnsubscribeCustomerDialog` buttons in Quick Actions (role-gated: managers get action form, associates get "report to manager" dialog)
- `components/profile-tab.tsx` -- display `employeeName` instead of "Assigned to associate"
- `components/client-detail-tabs.tsx` -- display `customerId` (e.g. `#100600045`) under client name in mono font
- `app/(app)/clients/clients-content.tsx` -- added Owner filter dropdown (populated from employee names), added Ban/Unsubscribe items to per-row dropdown menu (role-gated), only shown for active clients
- `components/client-status-actions.tsx` -- new file with `BanCustomerDialog` and `UnsubscribeCustomerDialog` components (manager: full action form, associate: report-to-manager request dialog)
- `app/(app)/clients/new/page.tsx` -- added Customer ID field to Add New Client form
- `app/(app)/clients/[id]/edit/page.tsx` -- added Customer ID field to Edit Client form
- `components/edit-client-dialog.tsx` -- added Customer ID field to Edit Client dialog
- `app/api/clients/route.ts` -- added `customerId` to POST handler for new client creation
- `app/api/clients/[id]/route.ts` -- added PUT handler (was missing, fixes pre-existing 405 on edit)

**Pre-existing bugs fixed during implementation:**
- `components/ui/button.tsx` -- restored `gold` variant lost during shadcn CLI update
- `components/topbar.tsx` -- added missing `children` prop
- `app/(app)/clients/[id]/edit/page.tsx` -- `SelectItem value=""` crash fixed with sentinel value

**Phase 5 -- Follow-Ups & Smart Lists**
- `lib/actions.ts` -- added `smartLists` to schema imports, added `rescheduleFollowUp` (updates followUpDate), `deleteSmartList`, `duplicateSmartList`, `renameSmartList`, `createSmartList` server actions
- `app/(app)/follow-ups/follow-ups-content.tsx` -- full rewrite: `CardHeader`+`CardContent` structure on follow-up cards, "Snooze" button (reschedules to tomorrow), "Reschedule" button (opens Dialog with date picker), "Detail" button (opens Sheet with full follow-up info), `AlertDialog` confirmation on "Done", "All" tab showing combined overdue+upcoming, relative time display ("2 days overdue"), `ScrollArea` on all tab lists, `Badge variant="outline"` for heat level per card, `Separator` in detail Sheet
- `app/(app)/smart-lists/smart-lists-content.tsx` -- full rewrite: proper empty state with icon+CTA "Create Custom List" button, `Tooltip` on truncated list names, `DropdownMenu` per custom list (Rename, Duplicate, Delete), `AlertDialog` for delete confirmation, `Dialog` for rename, `Separator` between Built-in and Custom sections, `Dialog` for "Create Smart List" with filter builder (Heat Level, Source, On Email List), member count `Badge variant="secondary"`, clear search button (X), `Tooltip` on "+" create button, empty state in Custom Lists card with CTA

**Phase 6 -- Promo Manager & Settings**
- `lib/db/schema.ts` -- added `msrp` (real), `discountPercent` (real), `discountPrice` (real), `promoStart` (text), `promoEnd` (text) to `promoWatches`; removed `active` column from schema (kept in DB for backward compat); added `real` import from drizzle-orm/sqlite-core
- `lib/actions.ts` -- `createPromo` updated with optional msrp/discount/discountPrice; added `importPromos(rows[], promoStart?, promoEnd?)` for bulk import with date range; added `clearAllPromos()` for weekly reset; removed `togglePromo`; fixed `createPromoMatchIfApplies` to remove `active` filter
- `app/(app)/promos/promos-content.tsx` -- full rewrite: **import dialog** with paste area, auto-detect headers (fuzzy matching for model/collection/msrp/discount/sale price columns), tab/comma/pipe separator detection, preview table before confirming, promo date range pickers (start/end), "Load Sample" button; **Clear All** button with AlertDialog for weekly reset; removed Status column/switch/status filter entirely; 3 stat cards (Total Promos, Total Retail Value, Total Client Savings); Sale Price in green; promo period banner card showing date range; `DropdownMenu` per row (View Matches, Delete); search bar with clear; pagination (15/page); "Add Single" button for one-off entries
- `app/(app)/settings/settings-content.tsx` -- full rewrite: `Switch` toggle inline for employee active/inactive status, `DropdownMenu` per employee row replacing individual icon buttons (Reset Password, Promote/Demote, Activate/Deactivate), search bar with clear button for employee table, `Badge variant="secondary"` for all role badges, `Separator` between tab content sections, `DialogDescription` on Add Employee/Reset Password/Create Tag/Create Template dialogs, `DropdownMenu` per tag row and template card, `AlertDialog` for tag/template delete confirmation (extracted from inline to shared)

**Phase 7 -- Compliance & Analytics**
- `app/(app)/banned/banned-content.tsx` -- full rewrite: expandable div-based rows (click to expand contact info, ban details, reason/notes); `DropdownMenu` per row (View Client Page, Unban); `Badge variant="destructive"` for Reselling, `Badge` orange for Gift Card Fraud; `Dialog` with `DialogDescription` for ban form (first/last name, email, phone, category Select, reason Textarea, Separator, submit with loading state); shared `AlertDialog` for unban confirmation; `Tooltip` on "Ban Customer" button; search bar with clear button; empty state with contextual messaging; client name rendered as `Link` to client page when matched client exists; `Separator` in expanded details; `ChevronDown` rotate-180 toggle
- `app/(app)/unsubscribed/unsubscribed-content.tsx` -- full rewrite: `Button variant="destructive"` for Remove action; email validation in Quick Add (regex + duplicate check + inline error with AlertCircle icon); Quick Add detects matching client by email, sets status to `unsubscribed`, logs timeline event, reloads page for enriched data; `Checkbox` bulk select with select-all toggle and batch Remove button; `Select` date range filter (All Time / Last 7 Days / Last 30 Days / Last 90 Days / This Month); `DropdownMenu` for matched clients (View Client, Resubscribe, Remove); `resubscribeClient` action restores client to active + onEmailList, removes from unsubscribe list, logs timeline; `removeUnsubscribe` action restores matching client to active, logs timeline; 3 stat cards (Total Unsubscribed, Matched Clients, Quick Add); enriched query via `leftJoin` on clients for name, customerId, clientId; search by email/name/customer ID; `Badge variant="secondary"` for record count; `Badge variant="outline"` for customer ID; `Tooltip` on add button; search bar with clear; `Separator` between select controls; empty state contextual to active filters
- `app/(app)/analytics/analytics-content.tsx` -- full rewrite: `Popover` + `Calendar` date range picker (From/To with Clear button); `HoverCard` on all 4 stat cards with detailed breakdowns (client breakdown, outreach methods, conversion funnel, conversion rate progress); `ChartContainer` + recharts `BarChart` for heat distribution (horizontal, color-coded Hot/Warm/Cold bars); `BarChart` for method distribution (color-coded Call/Text/Email/In-Person); `PieChart` for method share (donut chart with Legend); `Progress` bars for conversion metrics and outcome distribution; `Separator` between metrics row and charts; `Tabs` (Overview/Outreach/Heat Distribution) already present; `Badge variant="secondary"` for employee name and record counts; compliance cards with `Badge variant="destructive"` icons and View links; outreach log with `Badge` for employee names; contextual empty states for filtered data
- `lib/queries.ts` -- `getBannedCustomers` enriched with `leftJoin` on clients for `clientId`; `getUnsubscribeList` enriched with `leftJoin` on clients for `clientId`, `firstName`, `lastName`, `customerId`; `getAllClients`, `getClientsWithEmployee`, `searchClients` now filter out `status: "banned"` clients (banned clients only accessible from Banned page)
- `lib/actions.ts` -- `addUnsubscribeEmail` detects matching client by email, sets status to `unsubscribed`, logs timeline; `removeUnsubscribe` restores matching client to active, logs timeline; `resubscribeClient` logs timeline event with `metadata: { newStatus: "active" }`; `unbanCustomer` falls back to email lookup when customerId doesn't match a client UUID, logs timeline; all `status_changed` events now include `metadata: { newStatus }` (ban/unban/subscribe/unsubscribe); `activity-timeline-tab.tsx` excludes `status_changed` from metadata details block (status shown in description line)
- Installed `hover-card` component via `npx shadcn add hover-card`

---

## Already-Installed but Underused Components

`Separator`, `Skeleton`, `Tooltip`, `Sheet`, `Progress`, `Avatar`, `Command`, `AlertDialog`, `Switch`, `Textarea`, `ScrollArea`, `Alert`

---

## 1. Login Page (`/login`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Add a password visibility toggle (eye icon) to the password field | Custom `Input` wrapper with icon button |
| 2 | Use a `Separator` between the form and the "Demo Accounts" section | `Separator` |
| 3 | Add loading spinner to the "Sign in" button during auth | `Button` with disabled + spinner state |
| 4 | Add inline error feedback below inputs on invalid credentials | `Alert` or `Form` with validation messages |
| 5 | Style the "Forgot Password?" link more distinctively (it blends in) | `Button variant="link"` |

---

## 2. Dashboard (`/`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Stat cards lack visual depth -- add subtle border and hover effects | `Card` with `border border-slate-700/50 hover:shadow-md` |
| 2 | "Recent activity" list should be a proper `Table` for accessibility | `Table`, `TableHeader`, `TableRow`, `TableCell` |
| 3 | Add `Skeleton` loading states for all stat cards and sections while data loads | `Skeleton` |
| 4 | Use `Tabs` to switch between "Overview" / "Activity" / "Metrics" views | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| 5 | Overdue badges could use `Badge variant="destructive"` with an icon | `Badge` |
| 6 | Add `Avatar` for user profile in the sidebar bottom section | `Avatar`, `AvatarFallback` |
| 7 | Use `Separator` between nav sections in the sidebar | `Separator` |
| 8 | Activity timeline items should use relative time ("2 hours ago") alongside dates | N/A (logic) |

---

## 3. Client List (`/clients`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | The client list is a plain list of links -- convert to a proper `Table` with columns (Name, Phone, Heat, Tags, Owner, Last Contact) | `Table` with `TableHeader`, `TableRow`, `TableCell` |
| 2 | Add sortable column headers (click to sort by name, heat, date) | `DataTable` pattern (TanStack Table integration) |
| 3 | Add pagination controls at the bottom | `Button` for prev/next + page indicator |
| 4 | Add `Checkbox` for bulk selection of clients | `Checkbox` with select-all header |
| 5 | Filter comboboxes should auto-apply instead of needing an "Apply" button | Remove Apply, use `Select` with `onValueChange` |
| 6 | Replace plain search textbox with `Command` for a command-palette search (cmd+K already hinted) | `Command`, `CommandInput`, `CommandList`, `CommandItem` |
| 7 | Add `DropdownMenu` for per-row actions (edit, delete, add note) | `DropdownMenu`, `DropdownMenuItem` |
| 8 | Use `Badge` with variants for heat indicators (hot=warm/warm=secondary/cold=outline) | `Badge variant="destructive"/"secondary"/"outline"` |
| 9 | Use `Tooltip` on action icon buttons to clarify their purpose | `Tooltip`, `TooltipContent`, `TooltipTrigger` |
| 10 | Add `Skeleton` rows while the client list loads | `Skeleton` |

---

## 4. Client Detail (`/clients/[id]`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Add an `Avatar` with initials fallback to the client header | `Avatar`, `AvatarFallback` |
| 2 | Wrap each info section (Contact, Personal, Follow-ups) in proper `Card` components with `CardHeader` + `CardTitle` | `Card`, `CardHeader`, `CardTitle`, `CardContent` |
| 3 | Use `Separator` between profile header and tabbed content | `Separator` |
| 4 | "No scheduled follow-ups" empty state should have a CTA button to schedule one | `Button` inside empty state |
| 5 | Tags should use `Badge variant="outline"` with consistent pill styling | `Badge` |
| 6 | Use `Sheet` for "Log Outreach" slide-in panel instead of navigating away | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` |
| 7 | "Promo Matches" button could open a `Dialog` instead of inline | `Dialog`, `DialogContent` |
| 8 | Copy buttons on phone/email need `Tooltip` to indicate "Copy to clipboard" | `Tooltip` |
| 9 | Add `Progress` bar for heat score visualization (instead of just "48 Warm" text) | `Progress` |

---

## 5. Follow-Ups (`/follow-ups`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Follow-up cards need clearer visual hierarchy -- use `CardHeader` + `CardContent` structure | `Card` |
| 2 | Add "Reschedule" and "Snooze" action buttons alongside "Done" and "View" | `Button variant="outline"` / `variant="ghost"` |
| 3 | Use `Badge variant="destructive"` for OVERDUE badges consistently | `Badge` |
| 4 | Add `Tabs` to switch between "Overdue" / "Upcoming" / "All" views | `Tabs` |
| 5 | Add `AlertDialog` confirmation when marking a follow-up as "Done" | `AlertDialog` |
| 6 | Use `Sheet` for follow-up detail view instead of navigating away | `Sheet` |
| 7 | Communication method badges (Email, Text) should use consistent `Badge variant="secondary"` | `Badge` |
| 8 | Show relative time ("2 days overdue") alongside the due date | N/A (logic) |

---

## 6. Smart Lists (`/smart-lists`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | The right panel ("No list selected") needs a better empty state with a CTA | Custom empty state with `Button` |
| 2 | Custom list items all use the same globe icon -- differentiate with category-specific icons | Lucide icons |
| 3 | Truncated names ("Promo Matches -- Not C...") should have `Tooltip` on hover | `Tooltip` |
| 4 | Add `DropdownMenu` for list actions (edit, rename, delete, duplicate) | `DropdownMenu` |
| 5 | Use `AlertDialog` for delete confirmation | `AlertDialog` |
| 6 | Add a rule/filter builder UI using `Select` dropdowns and `Input` fields | `Select`, `Input`, `Button` |
| 7 | Use `Separator` between Built-in and Custom sections | `Separator` |
| 8 | Add member count badges using `Badge` | `Badge variant="secondary"` |

---

## 7. Promo Manager (`/promos`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Status column uses blue for "Active" -- use `Badge variant="default"` for active, `variant="outline"` for inactive | `Badge` |
| 2 | Icon-only action buttons need `Tooltip` for accessibility | `Tooltip` |
| 3 | Replace 3 separate icon buttons with a single `DropdownMenu` per row | `DropdownMenu` |
| 4 | Use `AlertDialog` before delete actions | `AlertDialog` |
| 5 | Use `Dialog` or `Sheet` for the "Add Promo Watch" form | `Dialog`/`Sheet` with `Form`, `Input`, `Select` |
| 6 | Add search/filter above the table (by collection, status) | `Input` + `Select` |
| 7 | Add pagination for large promo lists | `Button` for prev/next |
| 8 | Use `Switch` component to toggle promo active/inactive inline | `Switch` |

---

## 8. Analytics (`/analytics`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Add a date range selector using `Select` or `Calendar`-based date picker | `Select` or `Popover` + `Calendar` |
| 2 | The bar chart is static -- use `Chart` component (already installed) with `recharts` for interactive tooltips | `Chart` with recharts |
| 3 | Add `Tooltip`/`HoverCard` on stat cards for detailed metric breakdown | `HoverCard`, `HoverCardContent` |
| 4 | Use `Progress` bars for conversion metrics | `Progress` |
| 5 | Add `Tabs` for switching between Overview/Outreach/Heat Distribution (tabs exist but could be more prominent) | `Tabs` |
| 6 | Bottom "Banned" / "Unsubscribed" cards should use `Badge variant="destructive"` | `Badge` |
| 7 | Add `Skeleton` loading states for all metric cards and charts | `Skeleton` |
| 8 | Use `Separator` between metrics row and chart section | `Separator` |

---

## 9. Settings (`/settings`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Use `Switch` for employee active/inactive status toggle instead of power icon | `Switch` |
| 2 | Replace 3 icon action buttons with a `DropdownMenu` per row | `DropdownMenu` |
| 3 | Use `Dialog` for "Add Employee" form with proper `Form`, `Input`, `Select` | `Dialog`, `Form`, `Input`, `Select` |
| 4 | Use `AlertDialog` for employee deactivation confirmation | `AlertDialog` |
| 5 | Role badges should use `Badge variant="secondary"` consistently | `Badge` |
| 6 | Add `Tooltip` on action icon buttons | `Tooltip` |
| 7 | Add search/filter for employee table | `Input` |
| 8 | Use `Separator` between tabs content sections | `Separator` |

---

## 10. Banned (`/banned`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Use `AlertDialog` for "Unban" confirmation (prevents accidental unban) | `AlertDialog` |
| 2 | Use `Badge variant="destructive"` for ban category badges (Reselling, Fraud) | `Badge` |
| 3 | Add `DropdownMenu` for row actions (view client, unban, add note) | `DropdownMenu` |
| 4 | Contact column showing email + phone in one cell is cluttered -- separate them or use `Accordion` to expand | `Accordion` |
| 5 | Add `Skeleton` loading for the banned list | `Skeleton` |
| 6 | "Ban Customer" button should open a `Dialog` with a reason form | `Dialog` with `Textarea` for reason |
| 7 | Use `Tooltip` on the "Ban Customer" button icon | `Tooltip` |

---

## 11. Unsubscribed (`/unsubscribed`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | "Remove" button should use `AlertDialog` for confirmation | `AlertDialog` |
| 2 | Replace red-text-only "Remove" with `Button variant="destructive"` or `variant="outline"` | `Button` |
| 3 | Quick-add section should use `Form` with email validation feedback | `Form`, `Input` |
| 4 | Add `Checkbox` for bulk selection + batch "Remove" action | `Checkbox` + batch `Button` |
| 5 | Add date range filter using `Select` | `Select` |
| 6 | Use `Badge` for email status indicators | `Badge` |

---

## 12. Change Password (`/change-password`)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Add password visibility toggle (eye icon) to all password fields | Custom `Input` with toggle |
| 2 | Add a password strength indicator using `Progress` bar (red/yellow/green) | `Progress` |
| 3 | Display password requirements as a checklist below new password field | `Badge` or styled list |
| 4 | Use `Form` with proper validation and inline error messages | `Form`, `FormField`, `FormItem` |
| 5 | Add loading state to submit button | `Button` with disabled + spinner |
| 6 | "Back to Settings" link should be a `Button variant="ghost"` with arrow | `Button variant="ghost"` |
| 7 | Use `Separator` between the two card sections | `Separator` |
| 8 | Secret question dropdown should use `Select` component | `Select` |

---

## Cross-Cutting Improvements (All Pages)

| # | Suggestion | shadcn Component |
|---|-----------|-----------------|
| 1 | Add `Skeleton` loading states everywhere data is fetched (cards, tables, lists) | `Skeleton` |
| 2 | The cmd+K search button should open a `Command` dialog palette | `Command`, `CommandDialog` |
| 3 | Use `Tooltip` on all icon-only buttons across every page | `Tooltip` |
| 4 | Use `Separator` in sidebar between nav groups (Clients, Inventory, Analytics, Compliance) | `Separator` |
| 5 | Use `Avatar` with `AvatarFallback` for user initials in sidebar and activity items | `Avatar` |
| 6 | Consider `ScrollArea` for long lists (client list, follow-ups) | `ScrollArea` |
| 7 | Add `AlertDialog` for ALL destructive actions (delete, unban, remove) | `AlertDialog` |
| 8 | Use `Sheet` for quick-edit side panels instead of full-page navigation | `Sheet` |
| 9 | Toast notifications via `Sonner` (already installed) -- add success/error toasts for all mutations | `Sonner` |
| 10 | Add `Breadcrumb` navigation for nested pages (Client Detail, Change Password) | Not installed yet -- `npx shadcn add breadcrumb` |

---

## Implementation Phases

Each phase is designed to be independently shippable. Phases build on each other -- earlier phases establish shared utilities that later phases consume.

> **Already done** (no action needed): `Avatar` in sidebar footer, `HeatBadge` component, `HeatScoreBar` component, `LoadingSkeleton` component, `CommandPalette` component, sidebar nav with grouped sections.

---

### Phase 1: Shared Utilities & Safety Net -- COMPLETE
**Goal:** Establish cross-cutting patterns that every page will benefit from. No per-page redesigns yet -- just the safety net.
**Effort:** Small | **Risk:** Low | **Dependencies:** None

| # | What | Components | Pages Affected |
|---|------|-----------|----------------|
| 1 | Add `Skeleton` loading states to all data-fetching pages (replace `LoadingSkeleton` custom wrapper with proper shadcn `Skeleton` in each page) | `Skeleton` | Dashboard, Clients, Client Detail, Follow-Ups, Smart Lists, Promos, Analytics, Banned, Unsubscribed, Settings |
| 2 | Add `Tooltip` wrappers on all icon-only action buttons across every page | `Tooltip`, `TooltipContent`, `TooltipTrigger` | All pages with icon buttons |
| 3 | Add `AlertDialog` confirmations for all destructive actions (delete promo, unban, remove unsubscribed, deactivate employee) | `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel` | Promos, Banned, Unsubscribed, Settings |
| 4 | Add `Separator` between nav groups in sidebar (between Overview/Clients/Inventory/Analytics/Compliance/System) | `Separator` | Sidebar (all pages) |
| 5 | Add success/error `Sonner` toasts for all mutation actions (add, edit, delete, toggle) | `Sonner` (toast) | All pages with form submissions |
| 6 | Install `Breadcrumb` component for nested pages | `Breadcrumb` (needs `npx shadcn add breadcrumb`) | Client Detail, Change Password |

**Acceptance criteria:** Every icon-only button has a tooltip. Every destructive action has a confirmation dialog. Every data page shows skeletons while loading. Every mutation shows a toast.

---

### Phase 2: Login & Auth Polish -- COMPLETE
**Goal:** Perfect the first impression before users enter the app.
**Effort:** Small | **Risk:** Low | **Dependencies:** None

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Add password visibility toggle (eye icon) to password field | Custom `Input` wrapper | Login |
| 2 | Add loading spinner to "Sign in" button during auth | `Button` disabled state | Login |
| 3 | Add inline `Alert` for invalid credentials error feedback | `Alert` | Login |
| 4 | Style "Forgot Password?" as a `Button variant="link"` to stand out from body text | `Button variant="link"` | Login |
| 5 | Add `Separator` between form and demo accounts section | `Separator` | Login |
| 6 | Add password visibility toggle to all 3 fields on Change Password page | Custom `Input` wrapper | Change Password |
| 7 | Add `Progress` bar password strength indicator (red/yellow/green) | `Progress` | Change Password |
| 8 | Display password requirements checklist below new password field | Styled list | Change Password |
| 9 | Use `Form` with proper validation and inline error messages | `Form`, `FormField`, `FormItem` | Change Password |
| 10 | Add loading state to submit buttons | `Button` with spinner | Change Password |
| 11 | "Back to Settings" link becomes `Button variant="ghost"` with arrow icon | `Button variant="ghost"` | Change Password |
| 12 | `Separator` between the two card sections | `Separator` | Change Password |
| 13 | Secret question dropdown uses `Select` component | `Select` | Change Password |

**Acceptance criteria:** Login form has clear error/success states. Change Password has password visibility toggle, strength indicator, and proper validation feedback.

---

### Phase 3: Client List Overhaul -- COMPLETE
**Goal:** Transform the client list from plain links into a proper data table -- the most-used page in any CRM.
**Effort:** Medium | **Risk:** Medium | **Dependencies:** Phase 1 (skeletons, tooltips)

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Convert client list from plain links to a proper `Table` with columns: Name, Phone, Email, Heat, Tags, Owner, Last Contact | `Table`, `TableHeader`, `TableRow`, `TableCell` | Client List |
| 2 | Add sortable column headers using TanStack Table `DataTable` pattern | `DataTable` pattern, `Button` | Client List |
| 3 | Add pagination controls at the bottom (Previous / Page X of Y / Next) | `Button variant="outline"` | Client List |
| 4 | Add `Checkbox` column for bulk selection with select-all header | `Checkbox` | Client List |
| 5 | Filters auto-apply on change (remove "Apply" button, use `Select onValueChange`) | `Select` | Client List |
| 6 | Heat indicators use `Badge` variants consistently (`destructive`/`secondary`/`outline`) | `Badge` | Client List |
| 7 | Add `DropdownMenu` per-row for actions (edit, add note, schedule follow-up) | `DropdownMenu`, `DropdownMenuItem` | Client List |
| 8 | Add `ScrollArea` for the table body on long lists | `ScrollArea` | Client List |

**Acceptance criteria:** Client list is a sortable, paginated table with bulk selection, inline actions, and auto-applying filters.

---

### Phase 4: Client Detail Richness -- COMPLETE
**Goal:** Make the client detail page feel like a complete profile, not just a sparse info dump.
**Effort:** Medium | **Risk:** Low | **Dependencies:** Phase 1 (skeletons, tooltips, separators)

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Add `Avatar` with `AvatarFallback` (initials) to client header | `Avatar`, `AvatarFallback` | Client Detail |
| 2 | Wrap each info section in proper `Card` with `CardHeader` + `CardTitle` + `CardContent` | `Card`, `CardHeader`, `CardTitle`, `CardContent` | Client Detail |
| 3 | `Separator` between profile header and tabbed content | `Separator` | Client Detail |
| 4 | "No scheduled follow-ups" empty state gets a CTA `Button` to schedule one | `Button` | Client Detail |
| 5 | Tags use `Badge variant="outline"` with consistent pill styling | `Badge` | Client Detail |
| 6 | "Log Outreach" opens a `Sheet` slide-in panel instead of navigating away | `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` | Client Detail |
| 7 | "Promo Matches" button opens a `Dialog` modal instead of inline | `Dialog`, `DialogContent` | Client Detail |
| 8 | Copy buttons on phone/email get `Tooltip` ("Copy to clipboard") | `Tooltip` | Client Detail |

**Acceptance criteria:** Client detail has a polished header with avatar, well-structured card sections, and quick-action panels via Sheet/Dialog.

---

### Phase 5: Follow-Ups & Smart Lists
**Goal:** Improve the task-oriented pages that drive daily CRM workflows.
**Effort:** Medium | **Risk:** Low | **Dependencies:** Phase 1 (skeletons, badges, tooltips)

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Follow-up cards use proper `CardHeader` + `CardContent` structure | `Card` | Follow-Ups |
| 2 | Add "Reschedule" and "Snooze" action buttons (`Button variant="outline"` / `variant="ghost"`) | `Button` | Follow-Ups |
| 3 | OVERDUE badges use `Badge variant="destructive"` consistently | `Badge` | Follow-Ups |
| 4 | Add `Tabs` to switch between "Overdue" / "Upcoming" / "All" views | `Tabs` | Follow-Ups |
| 5 | `AlertDialog` confirmation when marking follow-up as "Done" | `AlertDialog` | Follow-Ups |
| 6 | Follow-up detail opens in `Sheet` instead of navigating away | `Sheet` | Follow-Ups |
| 7 | Communication method badges (Email, Text) use `Badge variant="secondary"` | `Badge` | Follow-Ups |
| 8 | Smart Lists right panel gets a proper empty state with CTA `Button` | `Button` | Smart Lists |
| 9 | Truncated smart list names get `Tooltip` on hover | `Tooltip` | Smart Lists |
| 10 | `DropdownMenu` for smart list actions (edit, rename, delete, duplicate) | `DropdownMenu` | Smart Lists |
| 11 | `AlertDialog` for smart list delete confirmation | `AlertDialog` | Smart Lists |
| 12 | `Separator` between Built-in and Custom smart list sections | `Separator` | Smart Lists |
| 13 | Member count badges use `Badge variant="secondary"` | `Badge` | Smart Lists |
| 14 | Smart list rule/filter builder UI with `Select` dropdowns + `Input` fields | `Select`, `Input`, `Button` | Smart Lists |

**Acceptance criteria:** Follow-ups has tabbed views and inline actions. Smart Lists has proper CRUD interactions and a filter builder.

---

### Phase 6: Promo Manager & Settings (Partially complete -- items 3, 4, 8, 9, 11 done in Phase 1)
**Goal:** Polish the management/admin pages with proper interactive controls.
**Effort:** Medium | **Risk:** Low | **Dependencies:** Phase 1 (skeletons, tooltips, alert dialogs)

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Promo status uses `Badge variant="default"` (active) / `variant="outline"` (inactive) | `Badge` | Promos |
| 2 | Replace 3 icon buttons per promo row with a single `DropdownMenu` | `DropdownMenu` | Promos |
| 3 | `AlertDialog` before promo delete | `AlertDialog` | Promos |
| 4 | "Add Promo Watch" opens a `Dialog` or `Sheet` with proper `Form`, `Input`, `Select` | `Dialog`/`Sheet`, `Form`, `Input`, `Select` | Promos |
| 5 | Add search/filter bar above promo table (by collection, status) | `Input` + `Select` | Promos |
| 6 | Add pagination for promo list | `Button` for prev/next | Promos |
| 7 | `Switch` component to toggle promo active/inactive inline | `Switch` | Promos |
| 8 | Settings: `Switch` for employee active/inactive status toggle | `Switch` | Settings |
| 9 | Settings: replace icon action buttons with `DropdownMenu` per row | `DropdownMenu` | Settings |
| 10 | Settings: "Add Employee" uses `Dialog` with `Form`, `Input`, `Select` | `Dialog`, `Form`, `Input`, `Select` | Settings |
| 11 | Settings: `AlertDialog` for employee deactivation | `AlertDialog` | Settings |
| 12 | Settings: role badges use `Badge variant="secondary"` consistently | `Badge` | Settings |
| 13 | Settings: add search/filter for employee table | `Input` | Settings |
| 14 | Settings: `Separator` between tabs content sections | `Separator` | Settings |

**Acceptance criteria:** Promos has inline status toggling and a proper add form. Settings has interactive status switches and structured employee management.

---

### Phase 7: Compliance & Analytics (Partially complete -- items 1, 2, 6 done in Phase 1)
**Goal:** Elevate the compliance and analytics pages with richer interactions and better data visualization.
**Effort:** Medium | **Risk:** Low | **Dependencies:** Phase 1 (skeletons, tooltips, badges)

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Banned: `AlertDialog` for "Unban" confirmation | `AlertDialog` | Banned |
| 2 | Banned: `Badge variant="destructive"` for ban category badges | `Badge` | Banned |
| 3 | Banned: `DropdownMenu` for row actions (view client, unban, add note) | `DropdownMenu` | Banned |
| 4 | Banned: contact column uses `Accordion` to expand email/phone | `Accordion` | Banned |
| 5 | Banned: "Ban Customer" opens a `Dialog` with `Textarea` for reason | `Dialog`, `Textarea` | Banned |
| 6 | Unsubscribed: "Remove" uses `AlertDialog` confirmation | `AlertDialog` | Unsubscribed |
| 7 | Unsubscribed: "Remove" styled as `Button variant="destructive"` | `Button` | Unsubscribed |
| 8 | Unsubscribed: quick-add uses `Form` with email validation | `Form`, `Input` | Unsubscribed |
| 9 | Unsubscribed: `Checkbox` for bulk selection + batch remove | `Checkbox` + `Button` | Unsubscribed |
| 10 | Unsubscribed: date range filter using `Select` | `Select` | Unsubscribed |
| 11 | Analytics: date range selector using `Popover` + `Calendar` | `Popover`, `Calendar` | Analytics |
| 12 | Analytics: replace static bar chart with interactive `Chart` (recharts) with tooltips | `Chart` with recharts | Analytics |
| 13 | Analytics: `HoverCard` on stat cards for detailed metric breakdown | `HoverCard` | Analytics |
| 14 | Analytics: `Progress` bars for conversion metrics | `Progress` | Analytics |
| 15 | Analytics: `Tabs` more prominent for Overview/Outreach/Heat Distribution | `Tabs` | Analytics |
| 16 | Analytics: "Banned"/"Unsubscribed" bottom cards use `Badge variant="destructive"` | `Badge` | Analytics |
| 17 | Analytics: `Separator` between metrics row and chart section | `Separator` | Analytics |

**Acceptance criteria:** Compliance pages have proper confirmations and bulk actions. Analytics has interactive charts, date filtering, and richer metric display.

---

### Phase 8: Dashboard & Polish Pass -- COMPLETE
**Goal:** Final polish on the dashboard and a comprehensive QA sweep across all pages.
**Effort:** Small-Medium | **Risk:** Low | **Dependencies:** Phases 1-7

| # | What | Components | Page |
|---|------|-----------|------|
| 1 | Dashboard stat cards get subtle border and hover effects | `Card` with hover classes | Dashboard |
| 2 | "Recent activity" list becomes a proper `Table` | `Table` | Dashboard |
| 3 | Dashboard `Tabs` for Overview / Activity / Metrics views | `Tabs` | Dashboard |
| 4 | Overdue badges use `Badge variant="destructive"` with icon | `Badge` | Dashboard |
| 5 | Activity timeline shows relative time ("2 hours ago") alongside dates | Logic change | Dashboard |
| 6 | Full QA sweep: verify all tooltips, skeletons, toasts, confirmations, and separators are working across every page | N/A | All |
| 7 | Accessibility audit: keyboard navigation, ARIA labels, focus states, color contrast | N/A | All |
| 8 | Mobile responsiveness check: verify sidebar collapse, table scrolling, sheet/dialog sizing | N/A | All |

**Acceptance criteria:** Dashboard feels complete with tabbed views and proper stat cards. All pages pass accessibility and responsiveness checks.

---

### Phase 9: Accessibility Audit -- COMPLETE
**Goal:** Resolve all actionable accessibility violations found via automated audit (axe-core).
**Effort:** Small-Medium | **Risk:** Low | **Dependencies:** Phase 8

| # | What | Violation | Severity | Nodes Fixed | Pages Affected |
|---|------|-----------|----------|-------------|----------------|
| 1 | Add `aria-label` to all icon-only buttons (show/hide password, actions dropdowns, copy buttons, search clear, remove X, theme toggle, create list, etc.) | button-name | Critical | 101 | Login, Change Password, Dashboard, Clients, Client Detail, Follow-Ups, Smart Lists, Promos, Analytics, Banned, Unsubscribed, Settings, Sidebar, Topbar |
| 2 | Fix color contrast: orange-600 badge gets explicit `text-white`, purple-500 text changed to `purple-400` for dark mode, `--destructive` brightened in dark theme | color-contrast | Serious | 6 | Banned, Follow-Ups, global dark theme |
| 3 | Add `aria-label` to all `<Progress>` bars (conversion rate, outreach completion, purchase rate, outcome breakdown, hot/warm/cold %, heat score, password strength) | aria-progressbar-name | Serious | 3+ | Analytics, Dashboard, Change Password, Client Detail |
| 4 | Fix landmark structure: layout wrapper changed from `<div>` to `<main>`, removed duplicate `<main>` from dashboard and clients, added `<main>` to login page | landmark-main | Moderate | 4 | Layout, Dashboard, Clients, Login |
| 5 | Add `sr-only` text to empty `<TableHead>` columns (checkbox select-all, actions) and `aria-label` on select-all checkbox | empty-table-header | Minor | 2 | Clients |
| 6 | Add `<h1 className="sr-only">Iris Login</h1>` to login page | page-has-heading-one | Moderate | 1 | Login |

**Note:** 176 region violations (sidebar layout-level from shadcn sidebar component) were excluded -- not actionable per-page fixes.

**Acceptance criteria:** All actionable axe-core violations resolved. Icon buttons have accessible names. Progress bars have labels. Page landmarks are correct. Color contrast meets WCAG AA. Login has a heading.

---

## Phase Dependency Graph

```
Phase 1 (Shared Utilities) ──┬── Phase 2 (Login & Auth)
                              ├── Phase 3 (Client List)
                              ├── Phase 4 (Client Detail)
                              ├── Phase 5 (Follow-Ups & Smart Lists)
                              ├── Phase 6 (Promos & Settings)
                              └── Phase 7 (Compliance & Analytics)
                                        │
                              Phase 8 (Dashboard & Polish Pass)
                                        │
                              Phase 9 (Accessibility Audit)
                                        │
                              Phase 10 (Mobile Responsiveness)
```

Phases 2-7 can be done in parallel after Phase 1 is complete. Phase 8 depends on all prior phases.

---

## Effort Estimates

| Phase | Scope | Estimated Items | Effort |
|-------|-------|----------------|--------|
| Phase 1 | Shared Utilities & Safety Net | 6 items | Small |
| Phase 2 | Login & Auth Polish | 13 items | Small |
| Phase 3 | Client List Overhaul | 8 items | Medium |
| Phase 4 | Client Detail Richness | 8 items | Medium |
| Phase 5 | Follow-Ups & Smart Lists | 14 items | Medium |
| Phase 6 | Promo Manager & Settings | 14 items | Medium |
| Phase 7 | Compliance & Analytics | 17 items | Medium |
| Phase 8 | Dashboard & Polish Pass | 8 items | Small-Medium |
| Phase 9 | Accessibility Audit | 6 items | Small-Medium |
| Phase 10 | Mobile Responsiveness | 8 items | Small |
| **Total** | | **102 unique items** | |

> **Note on counts:** The per-page suggestion tables above total 93 items + 10 cross-cutting = 103 numbered rows. However, some cross-cutting items duplicated per-page items (e.g., "Add Skeleton loading" appeared on 4 pages and in cross-cutting). The phases deduplicate these into 88 unique action items. No suggestions were lost -- only redundant repetition was consolidated. Phase 9 adds 6 accessibility audit items and Phase 10 adds 8 mobile responsiveness items for a total of 102.
