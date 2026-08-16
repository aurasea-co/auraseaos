-- Migration 043: MenuDesk scan funnel
--
-- The anonymous top-of-funnel from the MenuDesk Bible §04:
--   photograph the menu → blurred result → phone/LINE unlock → paywall
--
-- No CLI migrations in this project — paste this whole file into the Supabase
-- SQL editor and run it once.
--
--
-- ── Why these tables and not the ones in the spec ──────────────────────────
--
-- The W0 spec lists `accounts`, `restaurants`, and `subscriptions`. This repo
-- already has all three under different names — organizations, branches, and
-- the billing columns behind /settings/billing — and AuraSea's CLAUDE.md is
-- explicit that the verticals never fork into separate products. So this
-- migration adds only what genuinely does not exist: the scan pipeline and the
-- country-tagged reference data behind it. A scanned restaurant becomes a real
-- `branches` row when it subscribes, which is why menu_scans.branch_id is
-- nullable rather than a second restaurant table.
--
-- `menu_items` (migration 034) is the POS catalogue for PAYING branches and is
-- deliberately not reused here. A scanned dish is an anonymous stranger's
-- photograph with an estimated cost; a menu_item is a subscriber's SKU with a
-- real price. Collapsing them would put unverified guesses in the table the
-- F&B engine trusts.
--
--
-- ── Identity: why anonymous auth instead of the service role ───────────────
--
-- Anonymous scanners have no auth.uid(), so RLS has nothing to scope rows by —
-- the obvious workaround is a service-role client, which CLAUDE.md restricts to
-- /app/superadmin and the LINE approve endpoint. Instead the scan flow calls
-- supabase.auth.signInAnonymously(): the visitor gets a real auth.uid() in a
-- cookie, sees no login UI and fills in no field (Bible §02 rule 2), and every
-- policy below is an ordinary owner check. No service-role client anywhere in
-- this funnel.
--
--   PREREQUISITE: enable Anonymous Sign-Ins in the Supabase dashboard under
--   Authentication → Providers. Until then the scan routes 4xx on sign-in.
--
-- Because this mints auth.users rows for people who are not customers,
-- src/middleware.ts treats an anonymous user as logged-OUT everywhere except
-- the scan routes, so an anonymous session can never reach the authenticated
-- app shell with zero memberships.
--
--
-- ── Money ─────────────────────────────────────────────────────────────────
--
-- THB, never satang — AURASEA_HOUSE_STYLE.md:17 ("THB integers everywhere"),
-- matching menu_items.price_thb from migration 034.
--
-- The integer/numeric split is semantic, per the same house-style rule that
-- reserves INTEGER for values that cannot be fractional:
--   * A printed menu price is whole baht          → integer
--   * A per-dish cost or per-gram ingredient price is genuinely fractional
--     (garlic is not 1 baht a gram)               → numeric
--
--
-- ── The honesty rule, enforced in the schema ──────────────────────────────
--
-- Bible §06: the free tier is an estimate and must never render as a fact.
-- dish_analyses stores cost and food-cost % ONLY as low/high pairs with a
-- confidence level. There is no single-value cost column, and adding one later
-- would let a false-precision number reach an owner's screen. §12 rates one
-- owner catching us guessing as the risk that ends the product.

-- ── Reference data (country-tagged, engine-neutral) ────────────────────────

-- Curated recipes. A cache hit costs nothing and keeps two restaurants selling
-- the same dish consistent; Bible §05 wants most dishes to land here, which is
-- what makes the free hook close to free.
create table if not exists common_dishes (
  id uuid primary key default gen_random_uuid(),

  -- ISO 3166-1 alpha-2. The column that makes a second country a data load
  -- rather than a rewrite (Bible §13).
  country_code text not null default 'TH',

  -- Canonical key, e.g. 'pad_krapao_moo'. Matches CountryDataProvider's
  -- normalizeDishName() output.
  name_normalized text not null,

  -- Printed spellings that resolve here. Menus spell the same dish many ways.
  aliases text[] not null default '{}',

  -- { yieldServings, lines: [{ ingredientKey, quantity, unit }] } — the engine's
  -- Recipe type. JSONB rather than a child table because a recipe is always
  -- read and written whole, and is never queried by ingredient.
  recipe_json jsonb not null,

  -- Bumped when a recipe is revised, so a stored analysis can be traced to the
  -- recipe version that produced it.
  version integer not null default 1,

  -- Curated rows are trusted; rows promoted from model inference are not, until
  -- someone reviews them. W2 flags cache-worthy misses instead of auto-writing.
  is_reviewed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (country_code, name_normalized)
);

create index if not exists common_dishes_aliases_idx
  on common_dishes using gin (aliases);

-- Local market prices. Bands are wide on purpose: Bible §06 puts free-tier
-- ingredient accuracy at ±20–40%, and a narrow band we cannot defend is worse
-- than a wide band we can.
create table if not exists ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'TH',

  -- Country-neutral key ('pork_belly'), so a recipe travels between countries
  -- and only the price attached to it changes.
  ingredient_key text not null,

  -- Local display name, for the paid tier's cost breakdown.
  name_local text,

  -- 'g' | 'ml' | 'piece' — must match the recipe line's unit.
  unit text not null,

  -- Numeric, not integer: per-gram prices are fractional.
  price_low numeric(10,4) not null check (price_low >= 0),
  price_high numeric(10,4) not null check (price_high >= 0),
  check (price_high >= price_low),

  -- Where the figure came from ('makro', 'market_survey', 'owner_reported').
  source text,

  updated_at timestamptz not null default now(),

  unique (country_code, ingredient_key)
);

-- ── Scan identity ─────────────────────────────────────────────────────────

-- The phone or LINE identity captured at unlock (Bible §04 step 3) — one
-- field, no email, no password.
--
-- Separate from auth.users because these are different things: the anonymous
-- auth user is one browser session, while an identity is a person who may scan
-- from a phone today and a laptop tomorrow. The free-scan limit has to bind to
-- the person, or clearing cookies resets it.
create table if not exists scan_identities (
  id uuid primary key default gen_random_uuid(),

  identity_type text not null check (identity_type in ('phone', 'line')),

  -- Normalized before insert (E.164 for phone, LINE user id for line).
  identity_value text not null,

  country_code text not null default 'TH',

  -- Set once this person subscribes and becomes a real user, linking the
  -- funnel to the spine. Null for everyone who never converts.
  user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  -- Bible §04: one COMPLETE free analysis per identity — the limit is on
  -- re-running, not on the first result being whole.
  unique (identity_type, identity_value)
);

-- ── Scans ─────────────────────────────────────────────────────────────────

create table if not exists menu_scans (
  id uuid primary key default gen_random_uuid(),

  -- The anonymous (or, post-conversion, real) auth user who owns this scan.
  -- Every RLS policy below scopes on this column.
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  -- Set at unlock. Null while the result is still blurred.
  identity_id uuid references scan_identities(id) on delete set null,

  -- Set only if this scan is later attached to a paying branch. Nullable
  -- because the whole point of the funnel is that it works before any of the
  -- spine's org/branch records exist.
  branch_id uuid references branches(id) on delete set null,

  country_code text not null default 'TH',

  -- uploading → reading (pass 1) → costing (pass 2) → complete
  -- failed is terminal; partial means some pages were unreadable but the scan
  -- still produced a usable result.
  status text not null default 'uploading'
    check (status in ('uploading', 'reading', 'costing', 'complete', 'partial', 'failed')),

  -- When the identity was captured and the full result revealed.
  unlocked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_scans_owner_idx
  on menu_scans(owner_user_id, created_at desc);
create index if not exists menu_scans_identity_idx
  on menu_scans(identity_id) where identity_id is not null;

create table if not exists menu_scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references menu_scans(id) on delete cascade,

  -- Path in the `menu-scans` storage bucket. First path segment is the owner's
  -- auth.uid(), which is what the bucket policies at the bottom check.
  storage_path text not null,

  -- Display order, so "page 2 of 4" means the same thing to the owner and us.
  page_index integer not null,

  status text not null default 'pending'
    check (status in ('pending', 'read', 'unreadable')),

  -- Why a page failed, for the retry prompt. Never shown raw to the owner.
  failure_reason text,

  created_at timestamptz not null default now(),

  unique (scan_id, page_index)
);

create index if not exists menu_scan_pages_scan_idx
  on menu_scan_pages(scan_id, page_index);

-- One dish as printed. The price is READ from the photograph, never typed —
-- Bible §02 rule 2, and every field an owner must fill is a place the funnel
-- leaks.
create table if not exists scanned_dishes (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references menu_scans(id) on delete cascade,
  scan_page_id uuid references menu_scan_pages(id) on delete set null,

  -- Exactly as printed, in the menu's own spelling.
  name_raw text not null,

  -- CountryDataProvider.normalizeDishName(name_raw) — the CommonDish match key.
  name_normalized text,

  -- Printed selling price, whole baht. Nullable: a dish whose price we could
  -- not read is recorded rather than dropped, so "we found 24 dishes and could
  -- not price 3" stays honest.
  menu_price_thb integer check (menu_price_thb is null or menu_price_thb >= 0),

  created_at timestamptz not null default now()
);

create index if not exists scanned_dishes_scan_idx on scanned_dishes(scan_id);

-- ── The verdict ───────────────────────────────────────────────────────────

create table if not exists dish_analyses (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references scanned_dishes(id) on delete cascade,

  -- Estimated cost per portion, THB. A PAIR — see the honesty note in the
  -- header. Never add a single-value cost column to this table.
  cost_low numeric(10,2) not null check (cost_low >= 0),
  cost_high numeric(10,2) not null check (cost_high >= 0),
  check (cost_high >= cost_low),

  -- cost ÷ menu price, as a percentage band.
  food_cost_pct_low numeric(6,2) not null check (food_cost_pct_low >= 0),
  food_cost_pct_high numeric(6,2) not null check (food_cost_pct_high >= 0),
  check (food_cost_pct_high >= food_cost_pct_low),

  confidence text not null check (confidence in ('high', 'medium', 'low')),
  traffic_light text not null check (traffic_light in ('green', 'amber', 'red')),

  -- False when the band straddles a traffic-light threshold — the colour is
  -- then the midpoint's, and the UI should present it as leaning rather than
  -- settled instead of painting confident red over a coin flip.
  band_certain boolean not null default true,

  -- 'cache' = curated CommonDish recipe; 'inferred' = the model guessed one for
  -- this run. The weaker claim, and the UI says so.
  recipe_source text not null check (recipe_source in ('cache', 'inferred')),

  -- 'estimate' for every free scan. 'measured' only once a paying owner has
  -- confirmed real recipes and real purchase prices (W8) — it is a claim about
  -- where the inputs came from, so an upgrade alone can never set it.
  basis text not null default 'estimate' check (basis in ('estimate', 'measured')),

  -- The recipe the cost was computed from, snapshotted. Kept so an old analysis
  -- stays explainable after the CommonDish entry is revised.
  recipe_json jsonb,

  -- Log fields, not join keys — models get renamed and retired.
  model text,

  created_at timestamptz not null default now(),

  -- One current analysis per dish; a re-run replaces it.
  unique (dish_id)
);

-- Dishes we read but could not cost. Recorded explicitly instead of silently
-- dropped — quietly analysing 21 of 24 invents a menu the owner doesn't have.
create table if not exists uncosted_dishes (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references scanned_dishes(id) on delete cascade,
  reason text not null
    check (reason in ('no_recipe', 'missing_ingredient_price', 'unreadable_price')),
  created_at timestamptz not null default now(),
  unique (dish_id)
);

-- Owner corrections (Bible §07: one-tap correct a recipe or price). Both the
-- feedback loop that improves the CommonDish set and the audit trail for how
-- an analysis changed.
create table if not exists dish_corrections (
  id uuid primary key default gen_random_uuid(),
  dish_id uuid not null references scanned_dishes(id) on delete cascade,
  identity_id uuid references scan_identities(id) on delete set null,

  -- Which field was corrected, e.g. 'menu_price_thb', 'recipe_json'.
  field text not null,
  old_value text,
  new_value text,

  created_at timestamptz not null default now()
);

create index if not exists dish_corrections_dish_idx on dish_corrections(dish_id);

-- ── Cost accounting ───────────────────────────────────────────────────────

-- Bible §16 makes AI cost per free analysis a tracked KPI, and a KPI nobody can
-- compute is a KPI nobody manages. One row per model call.
create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references menu_scans(id) on delete set null,

  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,

  -- Nullable rather than 0 for an unpriced model: a fabricated cost looks like
  -- data, while a null is visibly missing. See estimateCostUsd().
  cost_usd numeric(10,6),

  -- CommonDish lookups served without a model call — the number that should
  -- climb as the cache fills.
  cache_hits integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists ai_usage_scan_idx on ai_usage(scan_id);
create index if not exists ai_usage_created_idx on ai_usage(created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table menu_scans enable row level security;
alter table menu_scan_pages enable row level security;
alter table scanned_dishes enable row level security;
alter table dish_analyses enable row level security;
alter table uncosted_dishes enable row level security;
alter table dish_corrections enable row level security;
alter table scan_identities enable row level security;
alter table common_dishes enable row level security;
alter table ingredient_prices enable row level security;
alter table ai_usage enable row level security;

-- Scans: strictly the owner's, anonymous or not. auth.uid() is populated for
-- anonymous sessions too, which is what lets this be an ordinary owner check
-- rather than a service-role bypass.
create policy "owners read own scans"
  on menu_scans for select using (owner_user_id = auth.uid());

create policy "owners create own scans"
  on menu_scans for insert with check (owner_user_id = auth.uid());

create policy "owners update own scans"
  on menu_scans for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Children inherit the parent scan's ownership.
create policy "owners read own scan pages"
  on menu_scan_pages for select
  using (scan_id in (select id from menu_scans where owner_user_id = auth.uid()));

create policy "owners create own scan pages"
  on menu_scan_pages for insert
  with check (scan_id in (select id from menu_scans where owner_user_id = auth.uid()));

create policy "owners read own dishes"
  on scanned_dishes for select
  using (scan_id in (select id from menu_scans where owner_user_id = auth.uid()));

create policy "owners read own analyses"
  on dish_analyses for select
  using (
    dish_id in (
      select d.id from scanned_dishes d
      join menu_scans s on s.id = d.scan_id
      where s.owner_user_id = auth.uid()
    )
  );

create policy "owners read own uncosted"
  on uncosted_dishes for select
  using (
    dish_id in (
      select d.id from scanned_dishes d
      join menu_scans s on s.id = d.scan_id
      where s.owner_user_id = auth.uid()
    )
  );

create policy "owners write own corrections"
  on dish_corrections for insert
  with check (
    dish_id in (
      select d.id from scanned_dishes d
      join menu_scans s on s.id = d.scan_id
      where s.owner_user_id = auth.uid()
    )
  );

create policy "owners read own corrections"
  on dish_corrections for select
  using (
    dish_id in (
      select d.id from scanned_dishes d
      join menu_scans s on s.id = d.scan_id
      where s.owner_user_id = auth.uid()
    )
  );

-- Identities: readable only through a scan you own. There is deliberately no
-- policy letting a client look up an identity by phone number — that would turn
-- the table into a phone-number oracle for anyone with an anonymous session.
create policy "owners read linked identity"
  on scan_identities for select
  using (id in (select identity_id from menu_scans where owner_user_id = auth.uid()));

-- Reference data: world-readable, because it is a price list, and every scanner
-- needs it to get a result. Writes are server-side only.
create policy "anyone reads common dishes"
  on common_dishes for select using (true);

create policy "anyone reads ingredient prices"
  on ingredient_prices for select using (true);

-- Writes users must never make directly: analyses and costing are the engine's
-- output, and a client that could insert its own dish_analyses row could paint
-- its menu green. Reference data and usage rows are likewise server-owned.
create policy "no direct analysis writes"
  on dish_analyses for insert with check (false);
create policy "no direct analysis updates"
  on dish_analyses for update using (false);
create policy "no direct uncosted writes"
  on uncosted_dishes for insert with check (false);
create policy "no direct common dish writes"
  on common_dishes for insert with check (false);
create policy "no direct common dish updates"
  on common_dishes for update using (false);
create policy "no direct ingredient price writes"
  on ingredient_prices for insert with check (false);
create policy "no direct ingredient price updates"
  on ingredient_prices for update using (false);
create policy "no direct identity writes"
  on scan_identities for insert with check (false);
create policy "no direct usage writes"
  on ai_usage for insert with check (false);
create policy "no usage reads"
  on ai_usage for select using (false);

-- Super admin escape hatch, mirroring migration 042.
create policy "super admin all scans" on menu_scans for all using (public.is_super_admin());
create policy "super admin all scan pages" on menu_scan_pages for all using (public.is_super_admin());
create policy "super admin all dishes" on scanned_dishes for all using (public.is_super_admin());
create policy "super admin all analyses" on dish_analyses for all using (public.is_super_admin());
create policy "super admin all uncosted" on uncosted_dishes for all using (public.is_super_admin());
create policy "super admin all corrections" on dish_corrections for all using (public.is_super_admin());
create policy "super admin all identities" on scan_identities for all using (public.is_super_admin());
create policy "super admin all common dishes" on common_dishes for all using (public.is_super_admin());
create policy "super admin all ingredient prices" on ingredient_prices for all using (public.is_super_admin());
create policy "super admin all usage" on ai_usage for all using (public.is_super_admin());

-- ── Storage ───────────────────────────────────────────────────────────────

-- Private bucket for menu photographs. Paths are {owner_uid}/{scan_id}/{n}.jpg,
-- which is what makes the folder-name check below a real ownership check.
--
-- 8 MB ceiling: the client downscales to the model's 1568px long edge before
-- upload (see maxImageEdgeFor), so anything approaching this cap did not go
-- through the downscaler.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-scans',
  'menu-scans',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "owners upload own menu photos"
  on storage.objects for insert
  with check (
    bucket_id = 'menu-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners read own menu photos"
  on storage.objects for select
  using (
    bucket_id = 'menu-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners delete own menu photos"
  on storage.objects for delete
  using (
    bucket_id = 'menu-scans'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
