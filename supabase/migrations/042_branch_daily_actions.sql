-- Migration 042: branch_daily_actions
--
-- Persists the resolved "Today's action" line the morning-flash brief
-- shows (LINE Flex block E + email DailyActionCallout) — either the
-- LLM-generated line (see src/lib/recommendations/hotel/llm-action.ts)
-- or the deterministic renderBaseAction() template fallback when the
-- LLM call fails, times out, or produces invalid output.
--
-- One row per (branch, night). The morning-flash job's per-branch loader
-- reads this FIRST and reuses it across every recipient of that branch
-- (owner + any assigned managers) so a branch with 3 recipients gets at
-- most one LLM call per morning, not three, and so the line is
-- inspectable after the fact rather than purely ephemeral in-memory
-- output.
--
-- No CLI migrations in this project — paste this whole file into the
-- Supabase SQL editor and run it once. Until it's applied, the feature
-- still works (action-persistence.ts soft-fails on a missing table —
-- see its file comment) — it just runs without cross-recipient caching
-- or a persisted record for that period.

create table if not exists branch_daily_actions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,

  -- Bangkok-day this action line applies to — same semantics as
  -- branch_rate_recommendations.metric_date (migration 037).
  metric_date date not null,

  message_th text not null,
  message_en text not null,

  -- 'llm' when the Anthropic call succeeded and passed validation;
  -- 'template' when it wasn't attempted (no context), failed, timed
  -- out, or was rejected by validateGeneratedText() — message_th/en
  -- are then the deterministic renderBaseAction() output either way,
  -- never empty.
  source text not null check (source in ('llm', 'template')),

  -- Model id when source='llm' (e.g. 'claude-haiku-4-5-20251001'); null
  -- when source='template'. Free text, not a foreign key — models get
  -- retired/renamed and this is a log field, not a join key.
  model text,

  -- Wall-clock time of the generation attempt, ms. Null when
  -- source='template' because no context was available (no attempt was
  -- made at all, vs. an attempt that failed after N ms).
  latency_ms integer,

  created_at timestamptz not null default now(),

  -- One resolved action per (branch, night) — the morning-flash job's
  -- first recipient for that branch writes it; every later recipient
  -- that same morning reads it back instead of generating again.
  unique (branch_id, metric_date)
);

create index if not exists branch_daily_actions_branch_date_idx
  on branch_daily_actions(branch_id, metric_date desc);

alter table branch_daily_actions enable row level security;

-- Read: any org member of the branch's organization can see the action
-- line that was actually sent — mirrors branch_rate_recommendations
-- (migration 037). No revenue figure is ever stored here (see
-- llm-action.ts — TodaysActionFacts never carries total revenue), so
-- this doesn't need tighter RLS than the rate recs it narrates.
create policy "org members read daily actions"
  on branch_daily_actions
  for select
  using (
    branch_id in (
      select b.id
      from branches b
      join organization_members m on m.organization_id = b.organization_id
      where m.user_id = auth.uid()
    )
  );

-- Write: only the service role (morning-flash job) writes these rows.
create policy "no direct insert by users"
  on branch_daily_actions
  for insert
  with check (false);

create policy "no direct update by users"
  on branch_daily_actions
  for update
  using (false);

create policy "no direct delete by users"
  on branch_daily_actions
  for delete
  using (false);

-- Super admin escape hatch (mirrors branch_rate_recommendations).
create policy "super admin all daily actions"
  on branch_daily_actions
  for all
  using (public.is_super_admin());
