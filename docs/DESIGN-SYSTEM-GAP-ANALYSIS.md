# Design System Gap Analysis

**Date**: 2026-04-28
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
Accordion, AlertDialog, Avatar, Breadcrumb, Calendar, Card, Chart (Recharts), Checkbox, Command, Dialog, DropdownMenu, Form, HoverCard, Input, Label, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Sheet, Sidebar, Switch, Table, Tabs, Textarea, Tooltip, Sonner (toast)

**Installed but unused:** Accordion, Avatar

### Composed Components (23 files)

| Component | Wraps | Used In |
|-----------|-------|---------|
| `Topbar` | SidebarTrigger, Button, Separator, Tooltip | All 12 pages |
| `AppSidebar` | Sidebar primitives, Avatar | App layout |
| `MobileNav` | Bottom tab bar | App layout (mobile) |
| `CommandPalette` | Command | App layout |
| `HeatBadge` | Badge, lucide icons | Dashboard, Clients |
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

---

## devl.dev Reference Patterns

devl.dev is a catalog of 158 UI experiment files organized into categories: Layouts, Forms, Auth, Dashboards, Tables, Filters, Empty States, Settings, Cards, Modals, Charts, Timelines, Calendars, Profile, Toasts, Pricing, Tours, Threads.

### Key Patterns Relevant to Iris

| Pattern | devl.dev Approach | Iris Status | Gap |
|---------|-------------------|-------------|-----|
| **Stat Tile** | 4-col grid, uppercase label, large number, comparison delta badge | Local `StatCard` in Dashboard only — 4 other pages duplicate markup | Not extracted |
| **Filter Toolbar** | Single row: search + scoped selects + density toggle + saved views | Per-page ad-hoc search + Select filters in CardHeader | No unified toolbar |
| **Data Table** | Clean borders, subtle header bg, status badges, row hover, pagination footer | Raw `<Table>` + inline headers + manual pagination | No abstraction |
| **Empty State** | Centered icon in bg circle, heading, description, action buttons | `text-center py-12` with icon + text — inconsistent across pages | No shared component |
| **Confirm Delete** | Warning icon in colored circle, bold heading, danger description, red destructive button | `AlertDialog` with title/description/cancel/destructive — 12+ identical instances | Not extracted |
| **Dashboard** | Metric cards → chart → activity feed, clean sectioning | Has stat cards + tabs + activity, all inline | Stat cards should be shared |

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

## Identified Gaps

### Critical — Duplicated Code, Highest ROI

#### 1. `StatCard` — exists but locked in one file

Dashboard's `page.tsx` defines a local `StatCard` component (lines 367-388). Four other pages duplicate the same `Card > CardContent > icon + label + value` markup.

- **Action**: Extract to `components/stat-card.tsx`
- **API**: `{ icon, label, value, sublabel?, accent?, color? }`
- **Reuses**: `Card`, `CardContent`
- **Files affected**: `page.tsx` (Dashboard), `analytics-content.tsx`, `banned-content.tsx`, `promos-content.tsx`, `unsubscribed-content.tsx`

#### 2. `ConfirmDialog` — 12+ identical AlertDialog instances

Banned (unban), Follow-Ups (mark done), Promos (delete, clear all), Settings (deactivate, delete tag, delete template), Smart Lists (delete), Unsubscribed (remove, batch remove).

- **Action**: Create `components/confirm-dialog.tsx`
- **API**: `{ open, onOpenChange, title, description, confirmLabel, onConfirm, variant?: "destructive" | "warning" }`
- **Reuses**: `AlertDialog` primitives
- **Files affected**: 7 files, 12+ instances

#### 3. `getHeatBadge()` duplicated in 3 files — `HeatBadge` already exists

`follow-ups-content.tsx`, `collections-content.tsx`, `smart-lists-content.tsx` each define a local `getHeatBadge()` while `components/heat-badge.tsx` already exports a proper component.

- **Action**: Replace 3 local functions with existing `HeatBadge` import
- **Files affected**: 3 files

#### 4. `ClientForm` — ~500 lines duplicated between Add/Edit

`clients/new/page.tsx` and `clients/[id]/edit/page.tsx` share ~85% identical code (7 card sections, all form fields, tag management, product interests, date pickers).

- **Action**: Extract `components/client-form.tsx`
- **API**: `{ initialData?, onSubmit, mode: "create" | "edit" }`
- **Files affected**: `clients/new/page.tsx`, `clients/[id]/edit/page.tsx`

---

### High — Clear Pattern, Meaningful Deduplication

#### 5. `SearchInput` — 6+ identical instances

The `relative > Search icon + Input + clear X button` pattern in Clients, Promos, Settings, Banned, Unsubscribed, Smart Lists.

- **Action**: Create `components/search-input.tsx`
- **API**: `{ value, onChange, placeholder?, className? }`
- **Files affected**: 6 files

#### 6. `DatePicker` — 10 instances across 5 files

The `Popover > Button trigger with Calendar icon > Calendar` pattern for birthdays, anniversaries, date ranges, promo dates.

- **Action**: Create `components/date-picker.tsx`
- **API**: `{ value, onChange, placeholder? }`
- **Files affected**: 5 files, 10 instances

#### 7. Outreach helper functions — duplicated in 3 files

`getMethodIcon()`, `getOutcomeColor()`, `getMethodBadgeVariant()` in `analytics-content.tsx`, `follow-ups-content.tsx`, `follow-up-form.tsx`.

- **Action**: Move to `lib/outreach-helpers.ts`
- **Files affected**: 3 files

#### 8. `EmptyState` — 7+ instances, inconsistent

Each page has slightly different empty state markup. Some have CTAs, some don't.

- **Action**: Create `components/empty-state.tsx`
- **API**: `{ icon, title, description, action?: { label, onClick } }`
- **Reuses**: `Button`
- **Files affected**: 7 files

---

### Medium — Nice to Have

#### 9. `PaginationFooter` — 2 identical instances

Clients and Promos have identical Previous/Next + "Page X of Y" + count text.

- **Action**: Create `components/pagination-footer.tsx`
- **API**: `{ page, totalPages, totalItems, onPageChange }`
- **Files affected**: 2 files

#### 10. Unused installed primitives

`Accordion` and `Avatar` are installed but never used. Evaluate if needed or remove.

---

## Recommended Execution Order

| Priority | Component | Effort | Files | Impact |
|----------|-----------|--------|-------|--------|
| 🔴 1 | Extract `HeatBadge` usage | 15min | 3 | Eliminates inconsistency |
| 🔴 2 | Extract `StatCard` | 30min | 5 | Shared stat component |
| 🔴 3 | Create `ConfirmDialog` | 45min | 7 | Biggest dedup (12+ instances) |
| 🟡 4 | Create `SearchInput` | 20min | 6 | High reuse |
| 🟡 5 | Create `DatePicker` | 30min | 5 | High reuse (10 instances) |
| 🟡 6 | Create `EmptyState` | 20min | 7 | Consistency |
| 🟡 7 | Extract outreach helpers | 15min | 3 | DRY |
| 🔴 8 | Extract `ClientForm` | 1hr | 3 | Biggest line savings (~500 lines) |
| 🟢 9 | Create `PaginationFooter` | 15min | 2 | Minor dedup |

---

## Conventions

All new composed components go in `components/` (root level) — NOT in `components/ui/` which is reserved for shadcn-managed primitives. This matches the existing project convention.

Component API design should prefer semantic wrappers with typed props over className-based customization, consistent with how `HeatBadge`, `OutreachLogger`, and `Topbar` are already built.
