# Iris Architecture

## Overview

Iris is a single-tenant, self-hosted CRM for Meridian Watch retail clienteling. It runs as a Next.js application with server-side rendering, SQLite storage, and credential-based authentication.

```
Browser
  |
  v
Next.js (App Router)
  |-- Server Components (data fetching, SSR)
  |-- Client Components (interactivity, forms)
  |-- Server Actions (mutations)
  |-- API Routes (REST endpoints)
  |
  v
Drizzle ORM
  |
  v
SQLite (better-sqlite3, WAL mode)
  File: data/iris.db
```

## Data Model

### Entity Relationship

```
employees ──────────────────────────────────────────┐
  id, name, username, passwordHash, role, active     |
    |                                                |
    | 1:N                                            | 1:N
    v                                                v
clients                                          outreach_logs
  id, firstName, lastName, phone, email             id, clientId, method, date, outcome
  employeeId ──────────> employees                   employeeId ──> employees
  status, source, heatScore, heatLevel               followUpDate, completed, templateId
  productsOfInterest (JSON string[])                 notes, purchasedModel
  tags (JSON string[])
  birthday, anniversary, onEmailList                  |
  lastOutreachAt, lastPurchaseAt                      |
    |                                                 |
    | 1:N                                            | FK
    v                                                 v
activity_events                                   outreach_templates
  id, clientId, eventType, description              id, name, subject, body, channel
  metadata (JSON), employeeId                       createdBy, isDefault

client_tags                  smart_lists
  id, name (unique), color     id, name, ownerId, filters (JSON)
  usageCount                   sort, isShared, isBuiltIn

promo_watches                promo_matches
  id, modelNumber, collection  id, clientId, promoId, matchType
  msrp, discountPercent        (model | collection)
  discountPrice
  promoStart, promoEnd

banned_customers             unsubscribe_list
  id, customerId, firstName    id, email (unique)
  lastName, email, phone       unsubscribedAt
  banReasonCategory, banDate
  address, city, state, zip

```

### Schema File

All table definitions live in `lib/db/schema.ts`. TypeScript types are inferred via Drizzle (`typeof table.$inferSelect`).

### Key Design Decisions

- **Tags and products of interest** are stored as JSON string arrays on the client row, not in junction tables. Simple for 3K clients but limits query performance.
- **Heat score** is denormalized on the client row (`heatScore`, `heatLevel`) and recalculated on relevant mutations rather than computed at query time.
- **Follow-ups** are not a separate table. They are `outreach_logs` rows where `followUpDate` is set and `completed` is false.
- **Activity events** are append-only. No edits or deletes (except the bug in H-02).
- **Soft deletes** are not used. Banning sets `status: "banned"` and creates a `banned_customers` row. Banned clients are excluded from normal queries.

## Authentication & Authorization

### Flow

```
Login page (/login)
  |
  v
NextAuth CredentialsProvider
  |-- Looks up employee by username
  |-- Verifies active status
  |-- bcrypt.compare(password, passwordHash)
  |
  v
JWT session (30-day expiry)
  |-- token.id = employee.id
  |-- token.role = employee.role
  |
  v
Middleware (middleware.ts)
  |-- Protects all routes except /login, /api/auth/*, /api/recover
  |-- Redirects unauthenticated users to /login
```

### Auth Configuration

- **File:** `lib/auth.ts`
- **Strategy:** JWT (not database sessions)
- **Session max age:** 30 days
- **Password hashing:** bcryptjs (cost factor 10)
- **Secret:** `process.env.NEXTAUTH_SECRET` (hardcoded fallback exists — see C-02)

### Role Checks

Role-based authorization is applied at the server action level, not in middleware:

| Action | Auth Check | Role Check |
|--------|------------|------------|
| Employee CRUD (create, reset password, change role, toggle active) | `getSessionUser()` + null check | `user.role === "manager"` |
| Change own password | `getSessionUser()` + null check | None (any logged-in user) |
| 16 other actions (promos, tags, templates, follow-ups, etc.) | **None** | **None** (see C-06) |
| 10 actions (clients, outreach, etc.) | `getSessionUser()` | No null check (see H-07) |

### Known Gaps

- API routes return 302 redirect (not JSON 401) for unauthenticated requests
- No CSRF protection on API routes
- No rate limiting on login or password recovery
- `/api/recover` is excluded from auth middleware entirely

## Application Layer

### Rendering Model

- **Server Components** (default): Pages in `app/(app)/` that fetch data server-side (dashboard, client detail, settings)
- **Client Components** (`"use client"`): Interactive pages (client list with filters, forms, analytics charts)
- **Suspense boundaries**: `app/(app)/layout.tsx` wraps children in `Suspense` with skeleton fallbacks

### Data Mutation Paths

Mutations go through two parallel mechanisms that have diverged:

1. **Server Actions** (`lib/actions.ts`) — 33 exported async functions. Preferred for new code.
2. **API Routes** (`app/api/`) — REST endpoints under `/api/clients`, `/api/notes`, `/api/tags`, `/api/outreach`, etc.

Some operations exist in both places with different behavior (tag management, outreach logging). This is tracked in CODE-AUDIT-FINDINGS.md H-17.

### Heat Scoring Algorithm

Defined in `lib/heat-score.ts`. Score range: 0-100.

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

Levels: Hot (70+), Warm (40-69), Cold (<40).

Recalculated via `recalcHeat()` on: outreach logged, purchase recorded, tag change, email list toggle.

### Promo Matching

When a promo watch is added (`createPromo`, `importPromos`), the system:
1. Loads all active clients
2. Checks each client's `productsOfInterest` against the promo's `modelNumber` and `collection`
3. Creates `promo_matches` rows (matchType: "model" or "collection")

Matches are cached, not computed at query time. They are regenerated on promo changes but not on client interest changes.

## Database

- **Engine:** SQLite via better-sqlite3
- **Connection:** `lib/db/index.ts` — single file `data/iris.db`
- **PRAGMA settings:** WAL mode (concurrent reads), foreign keys ON
- **Migrations:** Schema-first via `drizzle-kit push` (`npm run db:push`)
- **Seeding:** `lib/db/seed.ts` — creates employees, sample clients, outreach logs, tags, templates, promos
- **Indexes:** None (see C-04)

## UI Architecture

### Component Library

34+ shadcn/ui components installed in `components/ui/`. New York style (compact, professional). Dark theme default with light mode toggle via `next-themes`.

### Layout Structure

```
app/(app)/layout.tsx
  SidebarProvider
    AppSidebar          -- Navigation sidebar (collapsible)
    SidebarInset
      main
        {children}      -- Page content
    CommandPalette      -- Ctrl+K global search/actions
    MobileNav           -- Bottom nav bar on mobile
```

### Key Shared Components

| Component | Purpose |
|-----------|---------|
| `app-sidebar.tsx` | Sidebar navigation with role-aware links |
| `topbar.tsx` | Sticky header with sidebar toggle, search, theme toggle |
| `command-palette.tsx` | Global search and quick actions (cmdk) |
| `mobile-nav.tsx` | Bottom navigation for mobile |
| `client-sidebar.tsx` | Client detail page sidebar (contact info, quick actions) |
| `client-detail-tabs.tsx` | Tabbed interface on client detail |
| `skeletons.tsx` | Loading skeletons for SSR streaming |
| `iris-icon.tsx` | Brand icon component |

### State Management

No global state library. State flows via:
- Server Components: Direct database queries, passed as props
- Client Components: React `useState`/`useEffect` for local UI state
- URL params: Filter state on client list
- Context: `next-auth/react` session context for auth state
- Revalidation: `revalidatePath()` after mutations

## API Surface

### REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/clients` | List clients (with optional employee filter) |
| POST | `/api/clients` | Create client |
| PUT | `/api/clients/[id]` | Update client |
| POST | `/api/clients/check-duplicates` | Check for duplicate clients |
| GET | `/api/employees` | List employees |
| GET/POST | `/api/notes` | List/create notes (activity events) |
| DELETE | `/api/notes?id=` | Delete a note |
| GET/POST | `/api/outreach` | List/create outreach logs |
| GET/POST/DELETE | `/api/tags` | Tag management |
| GET/POST | `/api/templates` | List/create outreach templates |
| GET/POST/DELETE | `/api/promos/matches` | Promo match management |
| GET | `/api/search?q=` | Client search |
| POST | `/api/recover` | Password recovery (unauthenticated) |
| POST | `/api/auth/[...nextauth]` | NextAuth handler |

### Server Actions

33 exported functions in `lib/actions.ts`. See the file for the full list. Key groups:
- **Client mutations:** createClient, updateClient, transferClient
- **Outreach:** logOutreach, markFollowUpComplete, rescheduleFollowUp
- **Tags:** addTag, removeTag, createTag, deleteTag
- **Promos:** createPromo, importPromos, clearAllPromos, deletePromo
- **Lists:** createSmartList, deleteSmartList, duplicateSmartList, renameSmartList
- **Employee management:** createEmployee, resetEmployeePassword, updateEmployeeRole, toggleEmployeeActive, changeOwnPassword
- **Compliance:** banClient, unsubscribeClient, unbanCustomer, addUnsubscribeEmail, removeUnsubscribe, resubscribeClient

## Security Considerations

See [CODE-AUDIT-FINDINGS.md](CODE-AUDIT-FINDINGS.md) for the full list of 72 issues. The most critical:

1. **Password hashes exposed** via employee API endpoint (C-01)
2. **Hardcoded JWT secret fallback** allows session forgery (C-02)
3. **Mass assignment** on client update paths (C-03)
4. **16 server actions with zero auth checks** (C-06)
5. **No input validation** on any API route (H-09)

Positive findings: SQL injection is prevented (Drizzle parameterized queries), passwords are bcrypt-hashed, foreign keys and WAL mode are enabled.
