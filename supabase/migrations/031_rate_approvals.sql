-- Migration 031: rate_approvals
--
-- Backs the Auto Push approval flow (Pro tier). When the morning LINE
-- brief is generated for a Pro-plan branch, we create a single-use
-- approval token bound to that branch + date + suggested rate. The owner
-- taps the ✓ button in LINE, hits /api/line/approve-rate?token=…, and
-- the row is marked approved. Phase R3 (Cloudbeds adapter) will read
-- rows where approved_at IS NOT NULL AND push_status='pending' and
-- write the rate back to the PMS.
--
-- Units note: suggested_rate_thb is INTEGER (Thai baht). The spec used
-- _satang bigint; we normalised to THB to match the rest of the stack
-- (engine emits suggestedRateThb, dashboard renders ฿THB).
--
-- Auth note: the URL token is the auth — there's no session cookie when
-- LINE opens the in-app browser. The token's randomness (uuid v4) + 20h
-- expiry + idempotent approval semantics are the security model for MVP.
-- Phase R3 will move to HMAC-signed tokens or LIFF for stronger identity.

create table if not exists rate_approvals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,

  -- What rate is being approved
  room_type text not null default 'all',
  date date not null,
  suggested_rate_thb integer not null check (suggested_rate_thb >= 0),

  -- Lifecycle
  approved_at timestamptz,
  approved_via text check (approved_via in ('line', 'dashboard', 'auto')),
  expires_at timestamptz not null default (now() + interval '20 hours'),

  -- Write-back status (filled in Phase R3 when Cloudbeds is live)
  pushed_to_pms_at timestamptz,
  push_status text check (push_status in ('pending', 'success', 'failed', 'skipped')),
  push_error text,

  created_at timestamptz not null default now()
);

-- Hot path: the approve endpoint looks up by token on every tap.
-- gen_random_uuid()'s collision space makes the unique index sufficient.
create unique index if not exists rate_approvals_token_idx
  on rate_approvals(token);

-- Dashboard "approval history" reads by branch ordered by created_at.
create index if not exists rate_approvals_branch_created_idx
  on rate_approvals(branch_id, created_at desc);

-- Phase R3 worker reads pending pushes; index keeps it cheap.
create index if not exists rate_approvals_push_pending_idx
  on rate_approvals(push_status)
  where push_status = 'pending' and approved_at is not null;

alter table rate_approvals enable row level security;

-- Read: any member of the org that owns the branch can see approvals.
-- (Managers need to see "owner approved this rate" history; staff are
-- blocked by the RateDesk page-level role gate before they ever query.)
create policy "org members read approvals"
  on rate_approvals
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Insert: only the service role (morning-flash job) creates tokens.
-- Authenticated users cannot manufacture approval rows for branches
-- they don't own. Service role bypasses RLS so no policy needed for it.
create policy "no direct insert by users"
  on rate_approvals
  for insert
  with check (false);

-- Update: only the service role writes approved_at / push_status.
-- The /api/line/approve-rate route runs with the service client, so it
-- bypasses RLS. Direct user updates from the client are blocked.
create policy "no direct update by users"
  on rate_approvals
  for update
  using (false);

-- Super admin escape hatch (mirrors audit_log's pattern).
create policy "super admin all approvals"
  on rate_approvals
  for all
  using (public.is_super_admin());
