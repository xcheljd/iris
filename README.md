# Iris — Meridian Customer Relationship Management

A lightweight, self-hosted web CRM purpose-built for Meridian Watch retail clienteling. Replaces a sprawling Excel workbook with a fast, mobile-friendly web app built on Next.js and shadcn/ui.

## Quick Start

```bash
# Install dependencies
npm install

# Set up the database
npm run db:push
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Default credentials are displayed on the login page.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, React Server Components) |
| UI | shadcn/ui (New York style) + Tailwind CSS |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| Auth | NextAuth.js (Credentials provider, JWT sessions) |
| Forms | react-hook-form + zod |
| Charts | Recharts (via shadcn Chart) |
| Tests | Vitest + Testing Library |

## Project Structure

```
app/                  # Next.js App Router pages
  (app)/              # Authenticated app layout (sidebar, command palette)
    analytics/        # Outreach analytics + collection insights
    approvals/        # Manager approval queue (ban, unsubscribe, delete)
    banned/           # Banned customer management
    change-password/  # Self-service password change
    clients/          # Client list, detail, new, edit
    follow-ups/       # Follow-up manager
    promos/           # Promo watch management
    prospects/        # RVX prospect import + graduation flow
    settings/         # Employee, tag, template, and backup management
    smart-lists/      # Saved filter management
    unsubscribed/     # Unsubscribe list management
  api/                # REST API routes
    backup/           # Backup download + restore endpoints
  login/              # Authentication page
components/           # React components (non-shadcn)
  ui/                 # shadcn/ui primitives (34+ components)
lib/                  # Shared logic
  actions.ts          # Server actions (mutations)
  auth.ts             # NextAuth configuration
  backup-client.ts    # Backup download + localStorage reminder logic
  db/                 # Schema, migrations, seed, connection
  heat-score.ts       # Client engagement scoring algorithm
  rvx-parser.ts       # RVX CSV parser (dedup, normalization, export)
  queries.ts          # Database query functions
  utils.ts            # Utility functions
  validation/         # Zod schemas (client, outreach, rvx)
data/                 # SQLite database file (gitignored)
docs/                 # Project documentation
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema changes to database |
| `npm run db:seed` | Seed database with sample data |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Roles

| Role | Access |
|------|--------|
| **Manager** | Full CRUD, dashboard, employee management, promo config, analytics, banned/unsubscribed, approval queue, RVX import, database backup/restore |
| **Associate** | CRUD on own clients, view all clients, outreach logging, personal smart lists, prospect graduation/reject/unsubscribe |

## Backup & Restore

The Settings → Backup tab (managers only) provides:

- **Download** — exports `iris.db` via the browser's native save dialog (Chrome/Edge File System Access API, with `<a download>` fallback)
- **Restore** — uploads a `.db` file, validates SQLite magic bytes, atomically swaps in the new file, and saves the previous database as `iris.db.bak` before restarting the server
- **Weekly reminder** — a dialog appears every Monday when the last backup is more than 7 days ago; stored in `localStorage`

The restore endpoint calls `process.exit(0)` after a short delay so that PM2 or systemd restarts the process automatically with the new database in place.

## Onboarding

The app includes a built-in onboarding system (no external tour libraries) that guides new users through key features on first login.

### Guided Tour

- Auto-triggers on first login with a step-by-step spotlight walkthrough
- **8 base steps** for associates, **12 for managers** (4 extra: Approvals, Employee Management, Backup, Analytics)
- Supports Next / Back / Skip navigation
- Tour progress is persisted in the database (`onboarding_state` JSON column on the `employees` table via Drizzle ORM) so it resumes across browsers and sessions
- Replayable at any time from **Settings → Onboarding**

### Contextual Hints

After completing the tour, one-time hints appear for four secondary features:

| Hint | Trigger Page |
|------|-------------|
| Add Client | `/clients` |
| Edit Client | `/clients/[id]` |
| Log Outreach | `/clients/[id]` |
| Command Palette | Any page |

Hints are dismissed permanently on first interaction.

### Settings Onboarding Tab

A new **Onboarding** tab in Settings shows:

- Tour completion status
- Per-step progress breakdown
- **Replay Tour** button to restart the walkthrough

### Architecture

Built entirely with shadcn/ui primitives:

- **OnboardingProvider** — React context that manages tour and hint state
- **TourOverlay** — full-screen backdrop with a spotlight cutout around the target element
- **TourTooltip** — positioned tooltip with step content and navigation controls
- **HintManager** — renders contextual hints based on the current route

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes | JWT signing secret. Must be set in production. |
| `NEXTAUTH_URL` | No | Base URL (auto-detected in dev) |

## License

Private — internal use only.
