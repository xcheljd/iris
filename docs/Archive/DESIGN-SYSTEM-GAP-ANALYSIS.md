# Design System Gap Analysis

**Date**: 2026-04-29 (updated)
**Reference**: [devl.dev](https://devl.dev) — Sean's UI experiments built on coss-ui (Tailwind v4 + Base UI)
**Scope**: Shadcn setup, tokens, UI primitives, composed components, and recurring page-level patterns

---

## Current State

### Shadcn Configuration

| Setting | Value |
|---------|-------|
| Style | `new-york` |
| Base color | `slate` |
| CSS variables | `true` |
| TSX | `true` |
| RSC | `true` |

### Theme Tokens (`tailwind.config.ts` + `app/globals.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `meridian.navy` | `#1e3a5f` | Brand navy, approximates `--primary` |
| `meridian.gold` | `#c9a84c` | Brand gold, matches `--accent` |
| `--primary` (light) | `213 52% 25%` (~`#1e3a5f`) | Navy — buttons, links, rings |
| `--accent` (light) | `43 55% 54%` (~`#c9a84c`) | Gold — sidebar highlights, gold variant |
| `--background` (light) | `0 0% 100%` | White |
| `--background` (dark) | `222 47% 6%` | Deep navy |
| `--radius` | `0.5rem` (8px) | All border radii derive from this |
| `--chart-1` through `--chart-5` | Blue, Gold, Green, Orange, Purple | Recharts palette |
| `--sidebar-*` | 6 tokens | Dark navy sidebar with gold accent |

**Minor issue**: `meridian.navy` is only in `tailwind.config.ts`, not as a CSS variable. `--primary` approximates it but isn't guaranteed to stay in sync. Consider adding `--meridian-navy` as a CSS variable.

### Primitive Inventory (33 shadcn components)

**With custom variants:**
- `Button` — 7 variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, **`gold`**)
- `Badge` — 15 variants (`default`, `secondary`, `destructive`, `outline`, **`hot`**, **`warm`**, **`cold`**, **`gold`**, **`emerald`**, **`rose`**, **`purple`**, **`cyan`**, **`blue`**, **`pink`**, **`amber`**)
- `Alert` — 4 variants (`default`, `destructive`, **`warning`**, **`success`**)

**Standard wrappers (no custom variants):**
Accordion, AlertDialog, Avatar, Calendar, Card, Chart (Recharts), Checkbox, Command, Dialog, DropdownMenu, Form, HoverCard, Input, Label, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Sidebar, Switch, Table, Tabs, Textarea, Tooltip, Sonner (toast)

**All installed primitives now in use.**

**Previously listed as unused:** Avatar — actually used in 3 components (app-sidebar, client-detail-tabs, activity-timeline-tab). Accordion — now used in Banned page for expandable customer details.

### Composed Components (30 files)

| Component | Wraps | Used In |
|-----------|-------|---------|
| `Topbar` | SidebarTrigger, Button, Separator, Tooltip | All 12 pages |
| `AppSidebar` | Sidebar primitives, Avatar | App layout |
| `MobileNav` | Bottom tab bar | App layout (mobile) |
| `CommandPalette` | Command | App layout |
| `HeatBadge` | Badge, lucide icons | Dashboard, Clients, Follow-ups, Smart Lists, Collections |
| `HeatScoreBar` | Progress | Client detail |
| `StatCardSkeleton` | Card, Skeleton | All skeleton components |
| `ClientProvider` | React context | Client detail |
| `ClientDetailTabs` | Tabs, Avatar, HeatBadge | Client detail |
| `ClientSidebar` | Card, Button, Badge, Separator | Client detail |
| `EditClientDialog` | Dialog, form primitives | Client sidebar |
| `OutreachLogger` | Dialog, form primitives | Client sidebar |
| `FollowUpForm` | Dialog, form primitives | Client sidebar |
| `BanCustomerDialog` | Dialog, form primitives | Client list/sidebar |
| `UnsubscribeCustomerDialog` | Dialog, form primitives | Client list/sidebar |
| `ProfileTab` | Card, Button, Tooltip | Client detail |
| `InterestsTab` | Tabs, Card, Button | Client detail |
| `OutreachHistoryTab` | Card, Badge, ScrollArea | Client detail |
| `ActivityTimelineTab` | Card, Badge, ScrollArea | Client detail |
| `NotesTab` | ScrollArea, Button | Client detail |
| `TagsTab` | ScrollArea, Badge, Button | Client detail |
| `Skeletons` (12) | Card, Skeleton | All page Suspense fallbacks |
| `IrisIcon` | SVG | Topbar, login |
| **`ConfirmDialog`** | AlertDialog primitives | Banned, Promos, Settings, Smart Lists, Unsubscribed (9 instances) |
| **`SearchInput`** | Input, lucide Search/X | Collections, Banned, Clients, Promos, Settings, Smart Lists, Unsubscribed (7 instances) |
| **`DatePicker`** | Popover, Calendar, Button | Analytics, Promos, ClientForm (10 instances) |
| **`EmptyState`** | Card, Button, lucide icons | Collections, Banned, Promos, Settings, Smart Lists, Unsubscribed (8 instances) |
| **`ClientForm`** | Card, Input, Select, Switch, DatePicker, Badge, Textarea, Button | Clients new, Clients edit |
| **`PaginationFooter`** | Button, lucide ChevronLeft/Right | Clients, Promos |

**Shared helpers:**

| Module | Exports | Used In |
|--------|---------|---------|
| **`lib/outreach-helpers.tsx`** | `getMethodIcon`, `getMethodBadgeVariant`, `getOutcomeColor` | Analytics, Follow-ups, Follow-up-form |

---

## devl.dev Reference Patterns

devl.dev is a catalog of 158 UI experiment files organized into categories: Layouts, Forms, Auth, Dashboards, Tables, Filters, Empty States, Settings, Cards, Modals, Charts, Timelines, Calendars, Profile, Toasts, Pricing, Tours, Threads.

### Key Patterns — Now Resolved

| Pattern | devl.dev Approach | Iris Status | Resolution |
|---------|-------------------|-------------|------------|
| **Stat Tile** | 4-col grid, uppercase label, large number, comparison delta badge | Local `StatCard` in Dashboard only — analytics uses a different layout (HoverCards) | ✅ Evaluated — two distinct designs, no duplication, extraction not worthwhile |
| **Filter Toolbar** | Single row: search + scoped selects + density toggle + saved views | Per-page ad-hoc search + Select filters in CardHeader | No unified toolbar — filters are simple enough per-page |
| **Data Table** | Clean borders, subtle header bg, status badges, row hover, pagination footer | Raw `<Table>` + inline headers + manual pagination | No table abstraction needed — PaginationFooter extracted |
| **Empty State** | Centered icon in bg circle, heading, description, action buttons | `text-center py-12` with icon + text — inconsistent across pages | ✅ `EmptyState` component extracted (8 instances) |
| **Confirm Delete** | Warning icon in colored circle, bold heading, danger description, red destructive button | `AlertDialog` with title/description/cancel/destructive — 12+ identical instances | ✅ `ConfirmDialog` component extracted (9 instances) |
| **Dashboard** | Metric cards → chart → activity feed, clean sectioning | Has stat cards + tabs + activity, all inline | StatCard stays local — only 1 consumer per design |

### Patterns NOT Applicable to Iris

| Pattern | Why Skip |
|---------|----------|
| Filter sidebar rail | Filters are simple enough for inline selects |
| Faceted popover filters | Overkill for current filter complexity |
| Complex chart types (funnel, heatmap, gauge, waterfall) | Recharts area/bar is sufficient |
| Tours & coachmarks | No onboarding flow |
| Threads & comments | Not a collaborative app |
| Pricing tiers | Internal tool, no billing |
| Calendar views | Promo calendar uses a simple picker |

---

## Gap Resolution Summary

### ✅ Completed

| # | Item | Component | Files Changed | Commit |
|---|------|-----------|---------------|--------|
| 1 | HeatBadge dedup | `HeatBadge` (existing) | 3 files (follow-ups, collections, smart-lists) | `c863837` |
| 3 | ConfirmDialog | `components/confirm-dialog.tsx` | 5 files, 9 instances | `c863837` |
| 4 | SearchInput | `components/search-input.tsx` | 6 files, 7 instances | `40d8cd0` |
| 5 | DatePicker | `components/date-picker.tsx` | 4 files, 10 instances | `40d8cd0` |
| 6 | EmptyState | `components/empty-state.tsx` | 6 files, 8 instances | `40d8cd0` |
| 7 | Outreach helpers | `lib/outreach-helpers.tsx` | 3 files | `e3f81ce` |
| 8 | ClientForm | `components/client-form.tsx` | 3 files, -188 lines | `e3f81ce` |
| 9 | PaginationFooter | `components/pagination-footer.tsx` | 2 files | `74cd89b` |
| — | Accordion adoption | Radix `Accordion` | Banned page (replaced hand-built expand/collapse) | uncommitted |
| — | Mobile tabs fix | Scrollable `TabsList` | Client detail tabs (`flex overflow-x-auto`) | uncommitted |

### ❌ Evaluated and Skipped

| # | Item | Reason |
|---|------|--------|
| 2 | StatCard extraction | Dashboard and analytics use structurally different stat card layouts (horizontal icon box vs stacked with HoverCards). Only 1 consumer per pattern — no duplication. Extraction would require so many optional props it'd be harder to read than inline JSX. |

### Remaining (not addressed)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 10 | Unused installed primitives | ✅ Resolved | `Avatar` was incorrectly listed — actively used in 3 components. `Accordion` now used in Banned page. All installed primitives are in use. |

---

## Post-Gap Analysis Features

### Client Deletion & Recovery (Manager-only)

Added after the gap analysis was completed. Soft-delete system for client records with full recovery.

**Schema changes:**
- Added `"deleted"` to client status enum
- Added `deletedAt`, `deletedBy`, `previousStatus` columns to `clients` table

**Server actions** (all manager-gated via `requireManager()`):
- `deleteClient` — soft delete, saves previous status for restoration
- `restoreClient` — restores to previous status (or `active`)
- `purgeClient` — hard delete, removes client + outreach logs + activity events

**Query exclusions:**
- All client queries (`getAllClients`, `getClientsWithEmployee`, `getStats`, `searchClients`) exclude `status=deleted`
- New `getDeletedClients()` query for trash view

**UI touchpoints:**
- Client sidebar — "Delete Client" button in Quick Actions (managers only)
- Client list — "Delete Client" dropdown option (managers only)
- Settings — new "Deleted" tab with table showing name, previous status, deleted date, and Restore/Purge actions

---

## Conventions

All new composed components go in `components/` (root level) — NOT in `components/ui/` which is reserved for shadcn-managed primitives. This matches the existing project convention.

Component API design should prefer semantic wrappers with typed props over className-based customization, consistent with how `HeatBadge`, `OutreachLogger`, and `Topbar` are already built.
