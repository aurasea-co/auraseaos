# AuraSea OS

One app, one codebase. A shared spine — auth, orgs, branches, subscriptions,
RBAC, ingestion, the LINE scheduler, billing, the morning brief — plus two
vertical modules that differ only in recommendation logic and dashboards:

- **RateDesk** — hotels (`business_type = 'accommodation'`)
- **MenuDesk** — F&B (`business_type = 'fnb'`)

A branch's `business_type` routes it. The verticals are never forked into
separate products.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS,
pg_cron) · Vercel · LINE Messaging API · Resend · Anthropic.

## Local setup

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

Then start the dev server:

```bash
npm run dev
```

The app runs at http://localhost:3000.

## Checks

```bash
npm run typecheck && npm run lint && npm test
```

`npm run build` is worth running before any push to `main`: the boundary
between browser and server code is enforced by webpack, and typecheck, lint and
tests all pass while a broken bundle sits in the tree.

## Migrations

**There is no CLI migration flow in this project.** `supabase/migrations/*.sql`
files are applied by hand: open the Supabase SQL editor, paste the whole file,
run it once. Files are numbered and applied in order; the
`supabase_migrations.schema_migrations` table does not exist here, so nothing
tracks which have run — check the tables before assuming.

## Conventions worth knowing before you edit

- **Money is THB integers.** No satang, no floats. See `AURASEA_HOUSE_STYLE.md`.
  Columns that can genuinely be fractional (per-gram ingredient prices, per-dish
  costs) are `numeric`; whole-baht values are `integer`.
- **`supabaseAdmin` (service role) is restricted** to `/app/superadmin/**` and
  the LINE approve endpoint. Everywhere else, use the RLS user client.
- **Managers never see Total Revenue.** `canSeeRevenue(role)` gates every page
  and export.
- Column names that have burned people: `branches.organization_id` (not
  `org_id`), `branches.business_type` (not `type`), values `accommodation` |
  `fnb` (not `hotel`).

---

## MenuDesk

The anonymous scan funnel — photograph a menu, get a food-cost ranking, unlock
with a phone or LINE identity — **moved to its own repo** at
`platform/menudesk/` in August 2026, per Bible Addendum v2.1 §17. Its engine,
Thai catalogue, capture pipeline and funnel routes all live there now.

What remains in this repo is the **subscriber** F&B vertical: the `/menudesk`
dashboard for branches with `business_type = 'fnb'`, `fnb_daily_metrics`, the
F&B recommendation engine, and POS ingestion. That is part of the shared spine
and is not the same surface as the public funnel.
