# Soft-launch runbook

Operational checklist for the Founding Partner / Early Adopter launch.
Captures the steps that require external access (Supabase Dashboard,
LINE OA, Resend, real email accounts) — i.e. things Claude cannot do
autonomously.

Today's session shipped the underlying code for all of this; what
follows are the steps to actually flip the switches.

---

## 1 · Apply pending migrations on Supabase

Two migrations from this session are not yet on the live DB:

| File | What it does | Required? |
|---|---|---|
| `supabase/migrations/000_baseline.sql` | Restates the foundational tables so fresh envs can replay history. **No-op on live DB** (every statement uses `IF NOT EXISTS`). | Optional but recommended — protects future environment bootstraps. |
| `supabase/migrations/026_add_vertical_type_to_organizations.sql` | Adds the missing `organizations.vertical_type` column. Without this, the column read by `settings/company` and `superadmin/companies/[orgId]` returns NULL on new orgs. The owner-setup route already stopped writing to it, so this is now hygiene rather than blocker. | Recommended. |

**How to apply:**
- Supabase Dashboard → SQL Editor → paste the file contents → Run, or
- `supabase db push` if your local Supabase CLI is linked.

**Verify:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name = 'vertical_type';
-- Expect 1 row.
```

---

## 2 · Multi-tenant smoke test (the Phase 0 invariant)

Confirms the central platform guarantee: Account B cannot see Org A's data.

1. **Send invitation A.** `/superadmin/invite-owner` → Tier: Founding Partner → email A → promo code `FOUNDING-1`.
2. **Accept invitation A** in an incognito window. Walk through `/owner-setup`. Create "Resort A" with a hotel branch.
3. **Send invitation B.** Tier: Early Adopter → email B → promo code `EARLY-1`. Accept in a *different* incognito profile, create "Cafe B" with an F&B branch.
4. **Cross-check from Account A's dashboard:**
   - `/home` shows only Resort A's metrics.
   - `/settings/branches` lists only Resort A's branches.
   - Direct-navigate to `/cost`, `/labour`, `/portfolio` — every page should be scoped to Resort A.
5. **Cross-check from Account B's dashboard** — same checks, scoped to Cafe B. Cafe B must not see *any* Resort A data anywhere.

If anything leaks across tenants, **stop the launch** and file an incident. Multi-tenant boundary breaches are not soft-fixable.

---

## 3 · Tiered invitation email smoke test

The email template was redesigned this session ([commit 6074a67](https://github.com/aurasea-co/auraseaos/commit/6074a67)).

For each tier, send one test invitation to a real inbox you control and verify:

| Tier | Subject | Badge | Trial offer box | Urgency footer |
|---|---|---|---|---|
| Founding (`FOUNDING-test`) | `คุณได้รับเชิญเป็น Founding Partner ของ Aurasea OS` | Gold "Founding Partner #test" | 90 d trial · ฿X/mo · 50% off | Amber discount note visible |
| Early Adopter (`EARLY-test`) | `คุณได้รับเชิญให้ลองใช้ Aurasea OS ก่อนใคร — ฟรี 60 วัน` | Teal "Early Adopter #test" | 60 d trial · ฿X/mo · 30% off | Amber discount note visible |
| Standard | `คุณได้รับเชิญให้ลองใช้ Aurasea OS` | No badge | 30 d trial · ฿X/mo | No urgency footer |

**What to look for in real clients (not just the dev preview):**
- Gmail web + Gmail Android (most Thai users)
- Outlook web (corporate recipients)
- LINE-in-app browser (recipients who click LINE links)
- The `{organizationName}` substitution in the intro paragraph renders the real org name, not the placeholder.

---

## 4 · Morning-flash end-to-end

We tightened the morning-flash route twice this session: branch managers now appear in the role filter ([commit 6899a07](https://github.com/aurasea-co/auraseaos/commit/6899a07)) and only see branches they're assigned to ([commit 79a69a3](https://github.com/aurasea-co/auraseaos/commit/79a69a3)).

**Smoke test:**

1. As Account A, invite a branch manager via `/settings/team` → assign to one of Resort A's branches.
2. Have the manager accept, connect LINE via `/settings/notifications`, and opt in to email.
3. Manually trigger the morning flash:
   ```bash
   curl -X POST https://auraseaos.com/api/notifications/morning-flash \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"organizationId":"<org_a_id>","force":true}'
   ```
4. Verify the manager receives **only the branch they're assigned to**, not every Resort A branch. Verify Cafe B's owner receives Cafe B branches only.
5. Check `notification_log` table for one `sent` row per channel per recipient.

**Force-rerun any failed delivery** by adding `?force=true` to the URL — bypasses the per-day dedup.

---

## 5 · LINE OA + Vercel cron

- **LINE OA**: confirm the webhook URL points to `https://auraseaos.com/api/line/webhook` and that the bot's basic ID matches the `LINE_CONTACT_URL` constant in `src/app/(app)/settings/billing/page.tsx` (`@270cokmy`).
- **Vercel cron**: confirm the morning-flash schedule fires at 06:55 Asia/Bangkok (= 23:55 UTC the previous day) so messages land at 07:00 sharp. The route enforces auth via the `x-vercel-cron: 1` header set by Vercel — verify it's set in the cron job config.

---

## 6 · Recommendation rotation sanity check

We added 3 wording variants for every rule and made `pickVariantForDate` timezone-safe ([commit pending — variant rotation + bugfix]). Easy on-the-wire check:

- Fire the morning flash on day N. Note the wording.
- Edit the metrics row to force the same condition to fire on day N+1 (or just wait 24 h).
- The wording should rotate to a different variant. After 3 days, all three variants should have appeared.

If wording repeats within 3 consecutive days, the bug is back — file an issue and run the test suite.

---

## 7 · Billing page visual QA

[Commit 06195a0](https://github.com/aurasea-co/auraseaos/commit/06195a0) added the RateDesk / MenuDesk add-on cards and the bundle callout. Visual check on `/settings/billing`:

- [ ] Plan cards show new prices: Starter ฿199 / Growth ฿399 / Pro ฿699
- [ ] Monthly/Annual toggle correctly swaps prices and annotation
- [ ] "Power up with RateDesk and MenuDesk" section appears below plans
- [ ] Teal RateDesk card + amber MenuDesk card both have working LINE CTAs
- [ ] "Bundle and save" teal callout shows the three bundle rows
- [ ] FAQ has the two new entries (RateDesk/MenuDesk + integrations free?)
- [ ] Mixed-portfolio note is the single new sentence (no Pro Mixed reference)
- [ ] Standalone upgrade CTA card hidden on Pro accounts, visible on Starter/Growth

---

## 8 · Founding Partner / Early Adopter sequence

When the smoke tests pass:

1. Compile the Founding cohort (target: 5–10 hotel/F&B operators in your network).
2. For each, `/superadmin/invite-owner` → Tier: Founding Partner → promo code `FOUNDING-N` (N = ordinal).
3. Track invite acceptance in the recent-invitations list on the same page.
4. After Founding cohort accepts, repeat for Early Adopter cohort with `EARLY-N`.
5. Monitor `notification_log` table daily for the first week — confirm delivery rate.

---

## Known gaps Claude can't close without external resources

| Gap | What's needed | Owner |
|---|---|---|
| `*_daily_metrics` tables missing from `000_baseline.sql` | Run `supabase db dump --schema=public --data=false`, paste the missing `CREATE TABLE` blocks into the baseline. | You |
| `supabase/types.ts` declares roles that disagree with the live CHECK constraints | Regenerate via `supabase gen types typescript` (or accept the divergence — it's documented in `api/invite/accept`). | You |
| Email deliverability into Thai inboxes | Resend's domain reputation + SPF/DKIM verification under `auraseaos.com`. | You |
| End-of-trial billing flow | Phase 2 work (Omise integration). Out of scope for soft launch. | Roadmap |
