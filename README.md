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
npm run typecheck && npm run lint && npm run check:boundaries && npm run seed:menudesk -- --check && npm test
```

`check:boundaries` is not optional — see the MenuDesk section below. Neither is
`npm run build`: the boundary between browser and server code is enforced by
webpack, and typecheck, lint, and tests all pass while a broken bundle sits in
the tree.

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

## MenuDesk scan funnel

The anonymous top-of-funnel — photograph a menu, get an estimated food-cost
ranking, unlock the full result with a phone or LINE identity — lives in this
repo alongside the subscriber dashboard, not in a separate app.

Routes: `/scan` and `/r/[scanId]`. Both are public; `src/middleware.ts`
short-circuits them before any session gating.

### The layer rule

`src/lib/menudesk/` is split so that expanding to a second country is a data
change rather than a rewrite:

| Directory | Role |
|---|---|
| `engine/` | Country-neutral analysis. Pure TypeScript. Declares the interfaces it needs in `engine/ports.ts` and receives implementations by injection. |
| `data/` | `CountryDataProvider` implementations, one per country. `data/th/` is the first. |
| `delivery/` | `ChannelAdapter` implementations — LINE in Thailand, something else everywhere else. Selected by `CHANNEL_ADAPTER`. |
| `ai/` | Model choice, pricing, and the port implementations that call Anthropic. |
| `capture/` | On-device photo screening. Browser-side, but the analysis in `quality.ts` and `crop.ts` is pure and unit-tested. |

The arrow points inward: `data/`, `delivery/`, and `ai/` all depend on
`engine/`, and `engine/` depends on none of them. `npm run check:boundaries`
fails the build if that inverts, or if a Thai string or baht sign appears inside
`engine/` — a hardcoded Thai string is a hardcoded country.

### Two prerequisites before the funnel works

1. **Apply `supabase/migrations/043_menudesk_scan_funnel.sql`** in the SQL
   editor. It creates the scan tables, their RLS policies, and the `menu-scans`
   storage bucket.

2. **Enable anonymous sign-ins** in the Supabase dashboard under
   *Authentication → Providers → Anonymous Sign-Ins*. The scan flow calls
   `supabase.auth.signInAnonymously()` so that scanners have a real `auth.uid()`
   and every policy can be an ordinary owner check — that is what keeps the
   service-role client out of this path. The visitor sees no login UI and fills
   in no field. Until this is enabled, the scan routes fail at sign-in.

   Because this creates `auth.users` rows for non-customers, `src/middleware.ts`
   treats an anonymous session as logged out everywhere except `/scan` and
   `/r/`, so one can never reach the authenticated app shell.

### On-device screening

Every photo is decoded, trimmed, downscaled and judged in the browser before a
byte is uploaded, so an unreadable photo never becomes a model call — and the
owner is told what to fix while the menu is still in front of them.

Four verdicts, in this order, because only one instruction can be the right one:
`too_small` → `blank` (a palm, a worktop) → `blurred` → `duplicate`.

Two details are load-bearing and easy to undo by accident:

- **Sharpness is contrast-normalized** (`sharpness().normalized`), not raw
  Laplacian variance. Raw variance conflates blur with lighting: on the same
  page at the same focus, it reads 270 in good light and 34 in dim light. A raw
  threshold would reject photographs for being badly lit, and a dim kitchen is
  the target environment, not an edge case. The normalized figure is identical
  across both to three decimal places.
- **Cropping only removes provably uniform edges**, capped at 25% per side.
  Detecting the page outline and cropping to it would save more, but its failure
  mode is silently amputating a column of dishes — invisible to us and fatal to
  trust. On a test page with a 140px border this still cut billed image area by
  37%.

Greyscale is applied for analysis only; the upload keeps its colour. Greyscaling
the upload saves no tokens (image cost is a function of dimensions, not
channels) and discards the colour menus use to mark price columns and specials.

Thresholds live at the bottom of `capture/quality.ts` with the measurements
behind them. They are calibrated against synthetic fixtures and want re-tuning
once real kitchen photos come back from the concierge restaurants.

### The two-pass engine

`analyzeMenu()` (`engine/analyze.ts`) is the whole analysis: hand it pages and a
set of ports, get costed dishes back.

1. **Read** — one vision call *per page* returns `[dish name, printed price]`.
   The page, not the dish, is the unit: a page of 30 dishes is one image either
   way, and a per-dish loop costs 20–40× for identical output.
2. **Cost** — the CommonDish cache answers what it can; everything it misses
   goes to the model in *one batched call*, and every recipe is then priced
   against the country's ingredient table.

Both passes use structured outputs (`output_config.format`) rather than forced
tool use, and both re-validate every field afterwards: a schema guarantees the
shape, not the truth. The model can still return a price of 0 or a dish that
isn't on the page.

Pass 2 is given the country's ingredient keys and told to write recipes only in
those terms. A dish needing something the table can't price is **omitted** by
the model and reported as `no_recipe` — substituting a different protein would
produce a confident wrong cost, which is worse than admitting the gap.

Failure is always local and always reported. An unreadable page doesn't lose
the scan, a missing ingredient price doesn't lose the dish beside it, and
nothing is silently dropped: `AnalyzeMenuResult` carries `uncosted` dishes and
`unreadablePages` alongside the answers.

To run a real menu through it from the terminal:

```bash
npm run analyze -- path/to/menu.jpg
```

It prints the ranking worst-first, then what it could not cost, then what the
run spent. This is the W2 gate — point it at a real café menu and judge whether
the ranking is believable before any of it reaches an owner.

### The Thai reference catalogue

`data/th/ingredients.ts` prices ~120 ingredients; `data/th/dishes.ts` holds 100
curated recipes. Together they are what makes most dishes a free cache lookup
instead of a model call, and what makes two restaurants comparable — two shops
selling ผัดกะเพรา should differ on price and portion, not on two different
guesses the model made on two different days.

Four things about this data are load-bearing:

- **Quantities are as-purchased, and so are prices.** Rice is counted raw
  (~75g a plate, not 200g cooked). Getting this backwards over-costs every
  rice dish by about 2.5×.
- **Every price is a band, and every band has a provenance.** `source` is
  either `market_survey_2026_08` (read off dated Thai market listings) or
  `wholesale_estimate` (typical pricing, wider band). Bible §06 puts free-tier
  accuracy at ±20–40% and says so to the owner: the ranking is trustworthy,
  the exact baht figure is an estimate.
- **Recipes are written with `q()`**, which looks the unit up from the price
  catalogue. Hand-written units are how a recipe ends up asking for 2 "pieces"
  of something priced per gram, which the engine then refuses to cost.
- **Aliases carry the match rate.** Matching is exact, against whatever is
  literally printed, so each dish lists its ข้าว-prefixed form, its common
  misspelling (กระเพรา for กะเพรา), its transliteration and its English name.
  `catalogue.test.ts` fails if two dishes ever claim the same spelling — that
  would silently file one dish's recipe under another.

Re-survey the volatile lines (pork, chicken, eggs, shrimp, chilli, herbs) each
quarter. Thai protein prices move fast, and a stale catalogue reports a
confident wrong number.

`npm run seed:menudesk` regenerates
`supabase/migrations/044_menudesk_th_reference_data.sql` from these files, for
migration 043's `common_dishes` / `ingredient_prices` tables. TypeScript is the
source of truth today — it is code-reviewed, needs no round trip while a
scanner waits, and lets `npm run analyze` work with no database credentials.
The SQL exists so the concierge admin (W9) can correct data without a deploy;
at that point the DB becomes authoritative and these files become its
bootstrap.

### The honesty rule

Free-tier costs are estimated from an inferred recipe priced against market
ingredient ranges. They are genuinely uncertain, and the types enforce that:
`DishAnalysis` carries `cost` and `foodCostPct` as low/high bands plus a
`Confidence`, and `dish_analyses` has no single-value cost column. Do not add
one. A single number on screen is a promise we cannot keep.

### Build order

W0 scaffold ✅ → W1 anonymous scan + upload ✅ → W2 the two-pass engine and
`analyze` CLI ✅ → W3 Thai reference data ✅ → **W4–W7 funnel** → W8–W9 paid
flow and concierge admin.

The believability gate now passes on a 10-dish café menu at ~$0.006: the
ranking discriminates (one red, several amber, two green) instead of the
uniform red wall the placeholder catalogue produced, and the numbers land where
an owner would expect — a 65฿ กะเพรา at 24–37%, a 60฿ latte at 27–42%, and an
imported-ingredient carbonara at 120฿ as the one genuine bleeder.

Before this is shown to a real restaurant, someone in Thailand should verify
the cost-dominant ingredients against actual invoices — see the catalogue
section above for which entries are surveyed and which are estimated.
