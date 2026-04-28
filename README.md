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
    banned/           # Banned customer management
    change-password/  # Self-service password change
    clients/          # Client list, detail, new, edit
    follow-ups/       # Follow-up manager
    promos/           # Promo watch management
    settings/         # Employee, tag, template management
    smart-lists/      # Saved filter management
    unsubscribed/     # Unsubscribe list management
  api/                # REST API routes
  login/              # Authentication page
components/           # React components (non-shadcn)
  ui/                 # shadcn/ui primitives (34+ components)
lib/                  # Shared logic
  actions.ts          # Server actions (mutations)
  auth.ts             # NextAuth configuration
  db/                 # Schema, migrations, seed, connection
  heat-score.ts       # Client engagement scoring algorithm
  queries.ts          # Database query functions
  utils.ts            # Utility functions
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
| **Manager** | Full CRUD, dashboard, employee management, promo config, analytics, banned/unsubscribed |
| **Associate** | CRUD on own clients, view all clients, outreach logging, personal smart lists |

## Documentation

See [docs/README.md](docs/README.md) for the full documentation index.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes | JWT signing secret. Must be set in production. |
| `NEXTAUTH_URL` | No | Base URL (auto-detected in dev) |

## License

Private — internal use only.
