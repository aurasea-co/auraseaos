# CLAUDE.md — Aurasea OS

One app, one codebase. Shared spine (auth, orgs, branches, subscriptions, RBAC, ingestion framework, LINE scheduler, billing, morning brief) + two vertical modules that differ only in recommendation logic + dashboards: **RateDesk** (hotel) and **MenuDesk** (F&B). A branch's `business_type` (`accommodation`|`fnb`) routes it. Never fork the verticals into separate products.

## Stack & infra
Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS, pg_cron) · Vercel · LINE Messaging API · Resend.
- Repo: this dir (`~/Desktop/aurasea/platform/auraseaos`) · Supabase `ynzcciiuodmpejasptsv` (Singapore) · GitHub `aurasea-co/auraseaos` · Vercel `main`→prod
- Org `d45b5faa-d44e-4d3d-bc46-9b444ada147c` · Crystal Resort branch `ef77c100-e27b-4f69-a930-053750b79f22` · Crystal Cafe branch `4dca5378-68a7-4eef-94f0-7572852a7744` · Owner `2fc42b21-769a-4d3c-9403-22332f885a64`

## Ground-truth schema facts (assumed values have burned us — verify, don't guess)
- Money = **integer satang**, never floats. Canonical `suggested_rate_satang` (`suggested_rate_thb` deprecated).
- `branches.organization_id` (NOT `org_id`).
- `branches.business_type` (NOT `type`), values `accommodation`|`fnb` (NOT `hotel`|`fnb`) — verified against ~30 call sites, client and server.
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
- **RateDesk hygiene:** `competitor-rates` routes (`route.ts` + `import/route.ts`) use `createServiceClient()` for the actual GET/POST/DELETE data ops instead of the RLS user client — violates the supabaseAdmin rule above. Fix without breaking manager writes: `owner_write_competitor_rates` RLS policy is currently owner-only, so widen it to branch-scoped managers before dropping the service-role client. (`forbidden_role` for managers + `wrong_business_type` 400 on this same page were already fixed same-day as the relocation — commits `4096ee5`/`c959235` — confirmed via live diagnostic; no longer open.)
- **LINE brief:** enumerate full room-type roster incl. Suite on zero-sales days (unverified this pass — may already be covered by `recommendPerRoomTypeRates`'s roster invariant); email↔LINE per-room-type rate-sheet parity beyond the action line (the "today's action" line itself is now situational — pace-vs-weekday-norm classifier + competitor-gap freshness/channel-aware gating — and already shared verbatim across both channels, fixed); make rooms/settings page mutable (add/edit/delete) for owner + manager.
- **MenuDesk** W0–W3 done: scan funnel scaffold, anonymous upload, two-pass engine (`npm run analyze`), and the Thai catalogue (~120 ingredients + 100 dishes in `data/th/`, `npm run seed:menudesk` → migration 044). Believability gate passes — a café menu now ranks 1 red / 6 amber / 2 green at ~$0.006, not the placeholder era's uniform red. **Open item before any restaurant sees output:** verify the cost-dominant ingredients against real invoices; entries tagged `wholesale_estimate` (vs `market_survey_2026_08`) are the unverified ones. **Next: W4–W7** funnel (blurred result → phone/LINE unlock → full result → paywall). Crystal Cafe test branch; Loyverse first adapter; Cloudbeds stubbed (`supportsWriteBack=false`).
