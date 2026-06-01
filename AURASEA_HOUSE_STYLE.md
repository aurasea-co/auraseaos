# Aurasea House Style

Conventions that are actually deployed. Read this **before** adding a new
feature or translating an external spec into this codebase. Several
external specs Aurasea uses (Cloudbeds-inspired, classic RMS) assume
conventions that diverge from what's here — this doc is the source of
truth, not the spec.

Every section ends with a "Spec translation" line so the next agent / dev
can map a foreign-shape spec onto our shapes without re-discovering each
divergence.

---

## Money

- **THB integers everywhere.** No satang, no floats.
- Storage: NUMERIC columns in Postgres (`accommodation_daily_metrics.revenue`,
  `competitor_rates.rate`, `targets.adr_target`, ...) and INTEGER for
  fields that semantically can't be fractional (`rate_approvals.suggested_rate_thb`).
- Computed: integers throughout. ADR = `Math.round(revenue / rooms_sold)`.
  `Math.round` at every conversion boundary.
- Engine output: `suggestedRateThb`, `currentRateThb`, `adrThb` —
  the `Thb` suffix is the readable signal that this is THB integer, not
  satang or another unit.
- Display: `Math.round(value).toLocaleString('th-TH')` with `฿` prefix.

**Spec translation:** `_satang` → `_thb`. `* 100` / `/ 100` conversions →
delete. Any spec assuming satang storage is wrong against this codebase.

Reference: `supabase/migrations/029_competitor_rates.sql` comment block
*"Satang convention from the spec doesn't apply here — every existing
consumer reads numeric THB."*

---

## Supabase clients

Two helpers, used in narrow contexts:

- **`createClient()` from `@/lib/supabase/client`** (or `/server`) —
  RLS-enforced, runs as the logged-in user. Use in:
  - Client components (`'use client'`)
  - Server components / pages that should respect tenant boundaries
  - API routes that need to authorize the caller before doing service-role
    work (the pattern: read user identity with the user client, then
    call `createServiceClient()` for the actual write)

- **`createServiceClient()` from `@/lib/supabase/service`** —
  bypasses RLS (uses `SUPABASE_SERVICE_ROLE_KEY`). Use **only** in:
  - Cron handlers (`/api/cron/*`, `/api/notifications/*`)
  - Unauthenticated endpoints (`/api/line/approve-rate` — the LINE in-app
    browser carries no session cookie)
  - Authorized API routes after the user-identity check passes
  - Smoke / admin scripts

Never use the service client in a client component or owner-facing
server component — that defeats RLS and exposes cross-org data on
session leak.

**Spec translation:** `supabaseAdmin` → `createServiceClient()`.

---

## Capability + RBAC

- **`hasFeature(plan, feature)`** in `src/lib/auth/plan-features.ts` —
  single source of truth for "is this plan entitled to this feature?".
  Plans: `starter | growth | pro | enterprise`. Features:
  `line_brief | competitor_monitoring | auto_push`.
- **`canAccessRateDesk(role, page)`** in
  `src/lib/auth/ratedesk-permissions.ts` — page-level RateDesk gate.
- **`canSeeElement(role, element)`** in the same file — element-level
  gate (KPI cards, action buttons, settings links).
- **`canSeeRevenue(role)`** in the same file — single cross-cutting
  gate for revenue visibility on RateDesk, F&B home, exports, charts.
  Wraps `canSeeElement(role, 'total_revenue')`. Tests pin the contract
  (`ratedesk-permissions.test.ts`).

**RBAC rules baked in:**
- **Manager** can approve rate changes (auto_push) but never sees
  `total_revenue`. On RateDesk: dashboard, recommendations, competitors,
  import, auto_push pages. NOT room_settings (structural config —
  owner-only).
- **Staff** has empty page set + element set for RateDesk and MenuDesk.
- **Owner** sees everything.
- **Superadmin** mirrors owner for support purposes.

**Spec translation:** `PLAN_LIMITS` → `HOTEL_PLAN_FEATURES`.
`canSeeTotal_Revenue()` → `canSeeRevenue()`.

---

## i18n

- **next-intl.** Keys live in `messages/{en,th}.json`. Routes wrap with
  `useTranslations(namespace)`; the namespace is the top-level key in
  the JSON (e.g. `useTranslations('ratedesk')` for `messages.en.json`
  → `{"ratedesk": { "title": ... } }`).
- **No raw `lang === 'th'` conditionals in components.** Specs often
  write JSX like `{lang === 'th' ? 'ไทย' : 'EN'}` — translate every
  such case to a `t('key')` call and add the key to both locale files.
- Source code identifiers + comments: **English**. Customer-facing
  strings: in JSON files only.

**Spec translation:** `lang === 'th' ? 'ก' : 'a'` → `t('key')` +
new keys in `messages/{en,th}.json`.

---

## Hotel data model

- **`accommodation_daily_metrics`** is THE hotel table. One row per
  `(branch_id, metric_date)` (migration 018 unique constraint).
  Hotel-wide totals in flat columns: `rooms_available`, `rooms_sold`,
  `revenue`. Per-room-type detail in `room_type_breakdown` jsonb:
  `[{ roomType, totalRooms, occupiedRooms, rateThb }]`.
- **ADR, occupancy, RevPAR are computed at render time** — NOT
  stored as columns. Engine adapter: `toRecommendationInputs(rows)`.
- **Room types are derived from history**, not configured. See
  `deriveRoomTypesFromBreakdowns()` in
  `src/lib/recommendations/hotel/room-types.ts`. Single branch's room
  types = union of `roomType` across past `room_type_breakdown` rows.
- **No `branch_room_config` table.** "Our rate" per room type comes
  from `KnownRoomType.latestRateThb` (most recent observation).

**Spec translation:**
- `daily_hotel_data` → `accommodation_daily_metrics`
- `adr_satang` stored column → not stored; compute `revenue / rooms_sold`
- `branch_room_config.rackRate` → `KnownRoomType.latestRateThb`
- `rateThisNight_satang` → `rateThb`

---

## RateDesk routing

- Dashboard: `/(app)/ratedesk` — owner + manager
- Settings: `/(app)/settings/{rooms,competitors,pms,targets,...}`
- Sidebar "Pricing" nav item routes to `/ratedesk` for accommodation
  branches (see `src/components/sidebar.tsx`).
- Legacy `/(app)/pricing` page still exists for bookmarks but isn't
  the primary entry point.

**Spec translation:** `/dashboard/branches/[branchId]/hotel` → `/ratedesk`.
`/app/dashboard/branches/[branchId]/competitors` → `/(app)/settings/competitors`.

---

## PMS integration (Phase R3 architecture)

- **Provider interface:** `PmsProvider` in `src/lib/pms/types.ts`.
  Single method: `pushRate(input) → result`.
- **Factory:** `getProviderForConfig(branchPmsConfig)` in
  `src/lib/pms/factory.ts`. Resolves a `branch_pms_config` row to a
  concrete provider, falling back to `MockProvider` when no config,
  inactive, or missing credentials.
- **Worker:** `processApprovalsList()` in `src/lib/pms/worker.ts`.
  Pure orchestration — fetches pending approvals, calls provider,
  writes status back. Decoupled from the route for testability.
- **Cron:** `/api/cron/push-approved-rates` fires hourly (`0 * * * *`
  in `vercel.json`). Reads `rate_approvals` where
  `approved_at IS NOT NULL AND push_status='pending'`.
- **MVP state:** only `MockProvider` exists. Real CloudbedsProvider
  drops in as a one-file addition to `lib/pms/` + a switch arm in
  `factory.ts`. No worker / route / DB changes needed.
- **Owner UI:** `/(app)/settings/pms` writes `branch_pms_config`
  rows. Provider dropdown (cloudbeds/mews/siteminder/opera) + free-text
  `external_property_id` + active toggle. Owner-only via RLS.

---

## Cron jobs

All schedules in `vercel.json`. All authenticate via
`Authorization: Bearer $CRON_SECRET` OR `x-vercel-cron: 1` header.

Current:
- `0 0 * * *` — `/api/notifications/morning-flash` (daily 07:00 BKK)
- `0 0 * * 0` — `/api/notifications/weekly-report` (Sundays)
- `0 1 * * *` — `/api/notifications/trial-reminder` (daily)
- `0 * * * *` — `/api/cron/push-approved-rates` (hourly)

`CRON_SECRET` rotation: changing the env var requires a redeploy for
the new value to take effect on serverless function instances.

---

## Multi-tenancy + RLS

- **Every domain table has RLS enabled** with org-scoped policies
  joining through `organization_members`.
- New migrations MUST include:
  1. `alter table ... enable row level security;`
  2. Read policy for org members
  3. Write policy with appropriate role gate (`role = 'owner'` for
     config changes; permissive for staff-writeable tables)
  4. Super-admin escape hatch policy
- The service role (`createServiceClient`) bypasses RLS by design,
  so service-role writes need their own authz check in the API route.

---

## CSV ingestion

- **Hotel daily data:** `src/lib/ingestion/csv-hotel.ts`
  (`parseHotelCsv`). Tolerant date parsing, per-line warnings, never
  aborts on first bad row.
- **Competitor rates:** `src/lib/ingestion/csv-competitor.ts`
  (`parseCompetitorCsv`). Same shape — pure function, structured
  result with `rows` + `warnings` + `totalDataLines`. Companion
  `buildCompetitorCsvTemplate()` generates the upload template from
  the branch's known competitors × room types.
- **API contract:** `/api/branches/[branchId]/{import-hotel,competitor-rates/import}/route.ts`.
  Accept multipart upload OR JSON `{ csv: string }`. Return
  `{ imported, skipped, warnings }`.

---

## Engine + recommendations

- `src/lib/recommendations/hotel/engine.ts` — pure functions, no I/O.
- Inputs: `RecommendationInput[]` (date, occupancyRate, adrThb,
  optional competitorRates, optional roomTypeBreakdown).
- Output: `HotelRecommendation[]` with optional `roomType` field for
  per-room-type signals.
- Signals: `suggestRates` (blended OR per-room dispatch),
  `detectLowOccupancy`, `detectWeekendOpportunity`,
  `detectCompetitorUndercutting` (OTA-only filter via channel),
  `detectOverpricing`.
- Composer: `generateDailyRecommendations()` dedupes by
  `(type, roomType)` so per-room recs survive side-by-side.
- Forecast: `forecastTomorrow()` returns
  `{ expectedOccupancy, suggestedRateThb }` or `null`.

---

## Pre-push verification

Every commit must pass the triple:

```bash
npx tsc --noEmit
npx eslint <changed files>
npx vitest run
```

`next build` runs ESLint in strict mode on Vercel, so a `@typescript-eslint/no-unused-vars` violation that local eslint missed will break the build. The repo's config does NOT honor the leading-underscore "intentionally unused" convention — either remove unused params entirely (TS allows fewer params on interface implementations via contravariant rules) or add an explicit `// eslint-disable-next-line` comment.

---

## What does NOT exist (despite spec assumptions)

If a spec references any of these, treat as a translation signal:

- ❌ `daily_hotel_data` table — see `accommodation_daily_metrics`
- ❌ `branch_room_config` table — see `KnownRoomType` derivation
- ❌ `subscriptions` table — plan lives on `organizations.plan`
- ❌ `organizations.owner_id` column — owner via
  `organization_members.role = 'owner'`
- ❌ `profiles.org_id` column — org membership via
  `organization_members(organization_id, user_id, role)`
- ❌ `PLAN_LIMITS`, `NOTIFICATION_PREFERENCES` constants
- ❌ `supabaseAdmin` export — see `createServiceClient()`
- ❌ Satang storage anywhere
- ❌ Recharts (the chart lib) — see `SparklineChart` custom component
- ❌ `/dashboard/branches/[id]/...` route group — see `/(app)/...`
