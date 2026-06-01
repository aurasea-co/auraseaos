# Aurasea OS Platform

Active platform development for Aurasea OS — operational intelligence for
Southeast Asian small business owners.

## Stack
- Next.js + TypeScript
- Tailwind CSS
- Supabase (auth, database)
- Vercel (deployment)

## Development
```bash
npm install
npm run dev
```

Visit http://localhost:3000

## Deployment
Auto-deploys to Vercel on push to main branch.

## Conventions
Before adding a new feature or translating an external spec, read
[`AURASEA_HOUSE_STYLE.md`](./AURASEA_HOUSE_STYLE.md). It documents the
actual deployed conventions (THB-only money, `createServiceClient` over
`supabaseAdmin`, `accommodation_daily_metrics` over `daily_hotel_data`,
`canSeeRevenue` for revenue gating, etc.) and the most common
spec-vs-reality translations Claude has had to apply mid-session.
