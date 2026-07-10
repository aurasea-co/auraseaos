# CLAUDE.md — Aurasea OS

One app, one codebase. Shared spine (auth, orgs, branches, subscriptions, RBAC, ingestion framework, LINE scheduler, billing, morning brief) + two vertical modules that differ only in recommendation logic + dashboards: **RateDesk** (hotel) and **MenuDesk** (F&B). A branch's `type` (`hotel`|`fnb`) routes it. Never fork the verticals into separate products.

## Stack & infra
Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS, pg_cron) · Vercel · LINE Messaging API · Resend.
- Repo: this dir (`~/Desktop/aurasea/platform/auraseaos`) · Supabase `ynzcciiuodmpejasptsv` (Singapore) · GitHub `aurasea-co/auraseaos` · Vercel `main`→prod
- Org `d45b5faa-d44e-4d3d-bc46-9b444ada147c` · Crystal Resort branch `ef77c100-e27b-4f69-a930-053750b79f22` · Crystal Cafe branch `4dca5378-68a7-4eef-94f0-7572852a7744` · Owner `2fc42b21-769a-4d3c-9403-22332f885a64`

## Ground-truth schema facts (assumed values have burned us — verify, don't guess)
- Money = **integer satang**, never floats. Canonical `suggested_rate_satang` (`suggested_rate_thb` deprecated).
- `branches.organization_id` (NOT `org_id`).
- `notification_settings` = flat columns (`line_notify_enabled`, `morning_flash_email_enabled`, `line_notify_token`), not JSON.
- Platform admin role = `super_admin` (underscore).
- Per-room-type rates in `accommodation_daily_metrics`, NOT `branch_daily_metrics`.
- **No CLI migrations** — paste & run in the Supabase SQL editor. `supabase_migrations.schema_migrations` doesn't exist.
- ~90 DB objects with overlapping views → most silent 400s / wrong-column bugs trace here.

## Hard rules
- Managers NEVER see Total Revenue. `canSeeRevenue(role)` gates every page/export.
- `supabaseAdmin` (service role) only in `/app/superadmin/**` + the LINE approve endpoint. Everywhere else, use the RLS user client.
- RLS trap: policies sometimes scope rows by owner `user_id` instead of branch/org membership — verify when relocating pages between nav sections.
- Multi-room-type hotels: per-room-type suggestions in the brief; hide the Auto Push approve button.

## Working discipline
- **Discovery-first (top rule):** inspect real routes, table/column names, and role gates BEFORE editing.
- Read actual file contents before proposing a fix. Root-cause first; don't rush a patch. One clear recommendation, not a menu.

<!-- ═══ CURRENT FOCUS — update only this block ═══ -->
## Current focus (July 2026)
- **Competitor Rates** (relocated to main nav): fix `forbidden_role` for managers (role gate + RLS owner-scoping) and `wrong_business_type` 400 for Crystal Resort (enum/casing / wrong branch field). Preserve gating + tenancy.
- **LINE brief:** enumerate full room-type roster incl. Suite on zero-sales days; make "Today's action" situational; email↔LINE per-room-type parity; make rooms/settings page mutable (add/edit/delete) for owner + manager.
- **MenuDesk** MD-0→MD-5 pending; Crystal Cafe test branch; Loyverse first adapter; Cloudbeds stubbed (`supportsWriteBack=false`).
