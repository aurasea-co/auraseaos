-- Migration 044: MenuDesk Thai reference data
--
-- GENERATED FILE — do not edit by hand.
-- Source: src/lib/menudesk/data/th/{ingredients,dishes}.ts
-- Regenerate: npm run seed:menudesk
--
-- No CLI migrations in this project: paste the whole file into the Supabase
-- SQL editor and run it. Safe to re-run — every statement upserts on the
-- table's natural key, so a price revision updates in place.
--
-- 119 ingredients · 100 dishes

begin;

-- ── Ingredient prices ─────────────────────────────────────────────────

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_minced', 'หมูสับ', 'g', 0.08, 0.13, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_sliced', 'หมูเนื้อแดงหั่น', 'g', 0.11, 0.14, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_belly', 'หมูสามชั้น', 'g', 0.12, 0.19, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_neck', 'หมูสันคอ', 'g', 0.13, 0.16, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_loin', 'หมูสันนอก', 'g', 0.12, 0.15, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_ribs', 'ซี่โครงหมู', 'g', 0.11, 0.15, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pork_crispy', 'หมูกรอบ', 'g', 0.22, 0.32, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'bacon', 'เบคอน', 'g', 0.28, 0.45, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chicken_breast', 'อกไก่', 'g', 0.068, 0.092, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chicken_thigh', 'สะโพก/น่องไก่', 'g', 0.065, 0.1, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chicken_wing', 'ปีกไก่', 'g', 0.085, 0.11, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chicken_whole', 'ไก่สดทั้งตัว', 'g', 0.05, 0.07, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'beef_flank', 'เนื้อสันแหลม', 'g', 0.16, 0.23, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'beef_sirloin', 'เนื้อสันนอก', 'g', 0.23, 0.26, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'shrimp_small', 'กุ้งขาวเล็ก', 'g', 0.16, 0.21, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'shrimp_medium', 'กุ้งขาวกลาง', 'g', 0.23, 0.27, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'shrimp_large', 'กุ้งขาวใหญ่', 'g', 0.27, 0.37, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'squid', 'ปลาหมึก', 'g', 0.15, 0.26, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'fish_tilapia', 'ปลานิล', 'g', 0.045, 0.06, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'fish_dory', 'ปลาดอรี่', 'g', 0.07, 0.095, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'fish_mackerel', 'ปลาทู', 'g', 0.06, 0.095, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mussel', 'หอยแมลงภู่', 'g', 0.06, 0.1, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'crab_stick', 'ปูอัด', 'g', 0.09, 0.13, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'egg_chicken', 'ไข่ไก่', 'piece', 3.3, 4.2, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'egg_duck', 'ไข่เป็ด', 'piece', 3.8, 5.2, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'egg_salted', 'ไข่เค็ม', 'piece', 7, 10, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'rice_jasmine', 'ข้าวหอมมะลิ (ดิบ)', 'g', 0.039, 0.055, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'rice_sticky', 'ข้าวเหนียว (ดิบ)', 'g', 0.035, 0.052, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'rice_noodle_fresh', 'เส้นก๋วยเตี๋ยวสด', 'g', 0.025, 0.04, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'rice_noodle_dry', 'เส้นจันท์แห้ง', 'g', 0.055, 0.08, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'egg_noodle', 'บะหมี่', 'g', 0.035, 0.055, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'vermicelli_glass', 'วุ้นเส้น', 'g', 0.07, 0.1, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'instant_noodle', 'บะหมี่กึ่งสำเร็จรูป', 'piece', 5, 7, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pasta_dry', 'เส้นสปาเกตตี', 'g', 0.055, 0.09, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'wheat_flour', 'แป้งสาลี', 'g', 0.025, 0.038, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'corn_starch', 'แป้งข้าวโพด', 'g', 0.03, 0.045, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'bread_slice', 'ขนมปังแผ่น', 'piece', 2.5, 4, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'spring_roll_wrapper', 'แผ่นปอเปี๊ยะ', 'piece', 1, 2, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'wonton_wrapper', 'แผ่นเกี๊ยว', 'piece', 0.5, 1, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'holy_basil', 'ใบกะเพรา', 'g', 0.06, 0.1, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'thai_basil', 'ใบโหระพา', 'g', 0.06, 0.1, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'garlic', 'กระเทียม', 'g', 0.06, 0.085, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'shallot', 'หอมแดง', 'g', 0.04, 0.065, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'onion', 'หอมใหญ่', 'g', 0.025, 0.042, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'spring_onion', 'ต้นหอม', 'g', 0.06, 0.075, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'coriander', 'ผักชี', 'g', 0.06, 0.1, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chili_birdseye', 'พริกขี้หนู', 'g', 0.035, 0.045, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chili_spur', 'พริกชี้ฟ้า', 'g', 0.09, 0.16, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'lemongrass', 'ตะไคร้', 'g', 0.03, 0.05, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'galangal', 'ข่า', 'g', 0.03, 0.05, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'kaffir_lime_leaf', 'ใบมะกรูด', 'g', 0.1, 0.2, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'ginger', 'ขิง', 'g', 0.04, 0.06, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'lime', 'มะนาว', 'piece', 1, 3, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mint', 'ใบสะระแหน่', 'g', 0.1, 0.18, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'morning_glory', 'ผักบุ้ง', 'g', 0.07, 0.085, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'kale_chinese', 'คะน้า', 'g', 0.016, 0.022, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'cabbage', 'กะหล่ำปลี', 'g', 0.015, 0.022, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'carrot', 'แครอท', 'g', 0.018, 0.026, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tomato', 'มะเขือเทศ', 'g', 0.025, 0.042, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'cucumber', 'แตงกวา', 'g', 0.02, 0.032, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'beansprout', 'ถั่วงอก', 'g', 0.02, 0.032, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'long_bean', 'ถั่วฝักยาว', 'g', 0.03, 0.047, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'papaya_green', 'มะละกอดิบ', 'g', 0.02, 0.032, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'eggplant_thai', 'มะเขือเปราะ', 'g', 0.035, 0.052, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'baby_corn', 'ข้าวโพดอ่อน', 'g', 0.04, 0.062, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'bell_pepper', 'พริกหวาน', 'g', 0.06, 0.095, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mushroom_straw', 'เห็ดฟาง', 'g', 0.08, 0.125, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mushroom_shiitake', 'เห็ดหอม', 'g', 0.12, 0.19, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'lettuce', 'ผักกาดหอม', 'g', 0.04, 0.065, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'potato', 'มันฝรั่ง', 'g', 0.025, 0.038, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'pineapple', 'สับปะรด', 'g', 0.025, 0.042, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mango_ripe', 'มะม่วงสุก', 'g', 0.045, 0.085, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'banana', 'กล้วย', 'g', 0.02, 0.032, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'orange', 'ส้มคั้นน้ำ', 'g', 0.035, 0.055, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tofu_firm', 'เต้าหู้แข็ง', 'g', 0.04, 0.062, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tofu_soft', 'เต้าหู้อ่อน', 'g', 0.035, 0.052, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'vegetable_oil', 'น้ำมันพืช', 'ml', 0.048, 0.062, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'sesame_oil', 'น้ำมันงา', 'ml', 0.15, 0.26, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'fish_sauce', 'น้ำปลา', 'ml', 0.035, 0.055, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'soy_sauce_light', 'ซีอิ๊วขาว', 'ml', 0.03, 0.048, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'soy_sauce_dark', 'ซีอิ๊วดำ', 'ml', 0.035, 0.055, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'seasoning_sauce', 'ซอสปรุงรส', 'ml', 0.04, 0.065, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'oyster_sauce', 'ซอสหอยนางรม', 'ml', 0.045, 0.075, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'vinegar', 'น้ำส้มสายชู', 'ml', 0.015, 0.026, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'ketchup', 'ซอสมะเขือเทศ', 'ml', 0.04, 0.065, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'sriracha', 'ซอสพริกศรีราชา', 'ml', 0.045, 0.075, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'mayonnaise', 'มายองเนส', 'ml', 0.08, 0.13, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'palm_sugar', 'น้ำตาลปี๊บ', 'g', 0.045, 0.075, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'sugar_white', 'น้ำตาลทราย', 'g', 0.022, 0.032, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'salt', 'เกลือ', 'g', 0.008, 0.016, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'white_pepper', 'พริกไทยขาว', 'g', 0.3, 0.5, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_powder', 'ผงกะหรี่', 'g', 0.15, 0.26, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chili_flakes', 'พริกป่น', 'g', 0.12, 0.2, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tamarind_paste', 'น้ำมะขามเปียก', 'g', 0.06, 0.095, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'coconut_milk', 'กะทิ', 'ml', 0.045, 0.07, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_paste_green', 'พริกแกงเขียวหวาน', 'g', 0.09, 0.145, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_paste_red', 'พริกแกงเผ็ด', 'g', 0.09, 0.145, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_paste_massaman', 'พริกแกงมัสมั่น', 'g', 0.12, 0.19, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_paste_panang', 'พริกแกงพะแนง', 'g', 0.1, 0.16, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'curry_paste_sour', 'พริกแกงส้ม', 'g', 0.09, 0.145, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'chili_paste_roasted', 'น้ำพริกเผา', 'g', 0.09, 0.145, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'soybean_paste', 'เต้าเจี้ยว', 'g', 0.05, 0.085, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'peanut_roasted', 'ถั่วลิสงคั่ว', 'g', 0.1, 0.17, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'cashew_nut', 'เม็ดมะม่วงหิมพานต์', 'g', 0.35, 0.6, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'dried_shrimp', 'กุ้งแห้ง', 'g', 0.25, 0.42, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'rice_powder_roasted', 'ข้าวคั่ว', 'g', 0.08, 0.13, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'milk_fresh', 'นมสด', 'ml', 0.05, 0.068, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'milk_condensed_sweet', 'นมข้นหวาน', 'ml', 0.07, 0.1, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'milk_evaporated', 'นมข้นจืด', 'ml', 0.06, 0.09, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'whipping_cream', 'วิปครีม', 'ml', 0.15, 0.23, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'butter', 'เนย', 'g', 0.25, 0.42, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'cheese_mozzarella', 'ชีสมอสซาเรลล่า', 'g', 0.25, 0.37, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'coffee_bean_arabica', 'เมล็ดกาแฟอาราบิก้า', 'g', 0.4, 0.72, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tea_thai_powder', 'ผงชาไทย', 'g', 0.13, 0.21, 'market_survey_2026_08')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'tea_green_powder', 'ผงชาเขียว/มัทฉะ', 'g', 0.5, 1.2, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'cocoa_powder', 'ผงโกโก้', 'g', 0.25, 0.46, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'honey', 'น้ำผึ้ง', 'ml', 0.2, 0.36, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'syrup_flavored', 'ไซรัป', 'ml', 0.12, 0.21, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

insert into ingredient_prices
  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)
values ('TH', 'ice', 'น้ำแข็ง', 'g', 0.0015, 0.003, 'wholesale_estimate')
on conflict (country_code, ingredient_key) do update set
  name_local = excluded.name_local,
  unit = excluded.unit,
  price_low = excluded.price_low,
  price_high = excluded.price_high,
  source = excluded.source,
  updated_at = now();

-- ── Common dishes ─────────────────────────────────────────────────────

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_krapao_moo', array['ผัดกะเพราหมู', 'ผัดกระเพราหมู', 'กะเพราหมู', 'กระเพราหมู', 'กะเพราหมูสับ', 'ข้าวกะเพราหมู', 'ข้าวผัดกะเพราหมู', 'ข้าวกระเพราหมู', 'ผัดกะเพราหมูสับ', 'pad krapao moo', 'pad kaprao moo', 'basil pork', 'stir fried basil pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_minced","quantity":110,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":5,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":3,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_krapao_gai', array['ผัดกะเพราไก่', 'ผัดกระเพราไก่', 'กะเพราไก่', 'กระเพราไก่', 'ข้าวกะเพราไก่', 'ข้าวผัดกะเพราไก่', 'กะเพราไก่สับ', 'pad krapao gai', 'basil chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":110,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":5,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":3,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_krapao_moo_krob', array['กะเพราหมูกรอบ', 'ผัดกะเพราหมูกรอบ', 'ข้าวกะเพราหมูกรอบ', 'ข้าวผัดกะเพราหมูกรอบ', 'pad krapao moo krob', 'basil crispy pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_crispy","quantity":100,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":3,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_krapao_talay', array['กะเพราทะเล', 'ผัดกะเพราทะเล', 'ข้าวกะเพราทะเล', 'กะเพราซีฟู้ด', 'pad krapao talay', 'basil seafood']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_small","quantity":60,"unit":"g"},{"ingredientKey":"squid","quantity":60,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":3,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'krapao_kai_dao', array['ไข่ดาว', 'ไข่ดาวเพิ่ม', 'kai dao', 'fried egg']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_moo_krob', array['ข้าวหมูกรอบ', 'หมูกรอบ', 'ข้าวหมูกรอบราดซอส', 'ข้าวหมูกรอบคะน้า', 'khao moo krob', 'crispy pork rice', 'crispy pork belly rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_belly","quantity":150,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":25,"unit":"ml"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_dark","quantity":5,"unit":"ml"},{"ingredientKey":"cucumber","quantity":30,"unit":"g"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_moo_daeng', array['ข้าวหมูแดง', 'หมูแดง', 'ข้าวหมูแดงหมูกรอบ', 'khao moo daeng', 'red pork rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_loin","quantity":120,"unit":"g"},{"ingredientKey":"sugar_white","quantity":12,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"soy_sauce_dark","quantity":5,"unit":"ml"},{"ingredientKey":"corn_starch","quantity":8,"unit":"g"},{"ingredientKey":"cucumber","quantity":30,"unit":"g"},{"ingredientKey":"spring_onion","quantity":5,"unit":"g"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_man_gai', array['ข้าวมันไก่', 'ข้าวมันไก่ต้ม', 'ข้าวมันไก่ทอด', 'khao man gai', 'hainanese chicken rice', 'chicken rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_whole","quantity":180,"unit":"g"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"ginger","quantity":10,"unit":"g"},{"ingredientKey":"soybean_paste","quantity":12,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":5,"unit":"g"},{"ingredientKey":"cucumber","quantity":30,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":10,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_ka_moo', array['ข้าวขาหมู', 'ขาหมู', 'ข้าวขาหมูพะโล้', 'khao ka moo', 'stewed pork leg rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_belly","quantity":160,"unit":"g"},{"ingredientKey":"soy_sauce_dark","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"palm_sugar","quantity":12,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"kale_chinese","quantity":40,"unit":"g"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_khai_jiao', array['ข้าวไข่เจียว', 'ไข่เจียว', 'ข้าวไข่เจียวหมูสับ', 'ไข่เจียวหมูสับ', 'khai jiao', 'khao khai jiao', 'thai omelette', 'omelette rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":2,"unit":"piece"},{"ingredientKey":"pork_minced","quantity":30,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":5,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":40,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_moo', array['ข้าวผัดหมู', 'ข้าวผัดหมูสับ', 'khao pad moo', 'pork fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"tomato","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_gai', array['ข้าวผัดไก่', 'khao pad gai', 'chicken fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_breast","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"tomato","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_goong', array['ข้าวผัดกุ้ง', 'khao pad goong', 'shrimp fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_medium","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"tomato","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_poo', array['ข้าวผัดปู', 'khao pad poo', 'crab fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"crab_stick","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_american', array['ข้าวผัดอเมริกัน', 'khao pad american', 'american fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":70,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"ketchup","quantity":30,"unit":"ml"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"bacon","quantity":20,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_pad_kai', array['ข้าวผัดไข่', 'khao pad kai', 'egg fried rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":2,"unit":"piece"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_prik_gaeng_moo', array['ผัดพริกแกงหมู', 'พริกแกงหมู', 'ผัดเผ็ดหมู', 'pad prik gaeng moo']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":110,"unit":"g"},{"ingredientKey":"curry_paste_red","quantity":25,"unit":"g"},{"ingredientKey":"long_bean","quantity":50,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":2,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":4,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_khing_gai', array['ผัดขิงไก่', 'ไก่ผัดขิง', 'ผัดขิงหมู', 'pad khing gai', 'ginger chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":110,"unit":"g"},{"ingredientKey":"ginger","quantity":45,"unit":"g"},{"ingredientKey":"mushroom_shiitake","quantity":25,"unit":"g"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"soybean_paste","quantity":12,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_med_mamuang_gai', array['ไก่ผัดเม็ดมะม่วงหิมพานต์', 'ผัดเม็ดมะม่วงหิมพานต์', 'ไก่ผัดเม็ดมะม่วง', 'pad med mamuang', 'cashew chicken', 'chicken cashew nut']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_breast","quantity":110,"unit":"g"},{"ingredientKey":"cashew_nut","quantity":30,"unit":"g"},{"ingredientKey":"chili_spur","quantity":10,"unit":"g"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"bell_pepper","quantity":25,"unit":"g"},{"ingredientKey":"chili_paste_roasted","quantity":15,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_preow_wan', array['ผัดเปรี้ยวหวาน', 'ผัดเปรี้ยวหวานหมู', 'pad preow wan', 'sweet and sour']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":100,"unit":"g"},{"ingredientKey":"pineapple","quantity":50,"unit":"g"},{"ingredientKey":"tomato","quantity":40,"unit":"g"},{"ingredientKey":"cucumber","quantity":40,"unit":"g"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"ketchup","quantity":25,"unit":"ml"},{"ingredientKey":"vinegar","quantity":10,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":10,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_pak_boong', array['ผัดผักบุ้ง', 'ผัดผักบุ้งไฟแดง', 'ผักบุ้งไฟแดง', 'pad pak boong', 'stir fried morning glory']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"morning_glory","quantity":180,"unit":"g"},{"ingredientKey":"garlic","quantity":12,"unit":"g"},{"ingredientKey":"chili_spur","quantity":8,"unit":"g"},{"ingredientKey":"soybean_paste","quantity":15,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_pak_ruam', array['ผัดผักรวม', 'ผัดผักรวมมิตร', 'pad pak ruam', 'stir fried mixed vegetables']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"cabbage","quantity":60,"unit":"g"},{"ingredientKey":"carrot","quantity":40,"unit":"g"},{"ingredientKey":"baby_corn","quantity":40,"unit":"g"},{"ingredientKey":"kale_chinese","quantity":50,"unit":"g"},{"ingredientKey":"mushroom_straw","quantity":30,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_gratiam_moo', array['หมูผัดกระเทียม', 'หมูทอดกระเทียม', 'ผัดกระเทียมหมู', 'pad gratiam moo', 'garlic pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":110,"unit":"g"},{"ingredientKey":"garlic","quantity":25,"unit":"g"},{"ingredientKey":"white_pepper","quantity":2,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_kee_mao', array['ผัดขี้เมา', 'ผัดขี้เมาหมู', 'ขี้เมา', 'pad kee mao', 'drunken noodles']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":140,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":90,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":10,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"baby_corn","quantity":30,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_cha_talay', array['ผัดฉ่าทะเล', 'ผัดฉ่า', 'pad cha talay', 'spicy stir fried seafood']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"squid","quantity":70,"unit":"g"},{"ingredientKey":"shrimp_small","quantity":60,"unit":"g"},{"ingredientKey":"curry_paste_red","quantity":20,"unit":"g"},{"ingredientKey":"galangal","quantity":15,"unit":"g"},{"ingredientKey":"thai_basil","quantity":15,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_thai_goong', array['ผัดไทยกุ้ง', 'ผัดไทกุ้ง', 'ผัดไทยกุ้งสด', 'pad thai goong', 'pad thai shrimp', 'pad thai prawn']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_dry","quantity":70,"unit":"g"},{"ingredientKey":"shrimp_medium","quantity":70,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"tofu_firm","quantity":30,"unit":"g"},{"ingredientKey":"beansprout","quantity":50,"unit":"g"},{"ingredientKey":"tamarind_paste","quantity":20,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"peanut_roasted","quantity":10,"unit":"g"},{"ingredientKey":"dried_shrimp","quantity":5,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"},{"ingredientKey":"lime","quantity":0.25,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_thai_moo', array['ผัดไทยหมู', 'ผัดไทยไก่', 'ผัดไท', 'ผัดไทย', 'pad thai', 'pad thai moo']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_dry","quantity":70,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":70,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"tofu_firm","quantity":30,"unit":"g"},{"ingredientKey":"beansprout","quantity":50,"unit":"g"},{"ingredientKey":"tamarind_paste","quantity":20,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"peanut_roasted","quantity":10,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"},{"ingredientKey":"lime","quantity":0.25,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_see_ew_moo', array['ผัดซีอิ๊วหมู', 'ผัดซีอิ๊ว', 'ผัดซีอิ้ว', 'pad see ew', 'pad siew']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":140,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"kale_chinese","quantity":60,"unit":"g"},{"ingredientKey":"soy_sauce_dark","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":5,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'rad_na_moo', array['ราดหน้าหมู', 'ราดหน้า', 'ราดหน้าทะเล', 'rad na', 'rad na moo']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":140,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":90,"unit":"g"},{"ingredientKey":"kale_chinese","quantity":70,"unit":"g"},{"ingredientKey":"corn_starch","quantity":20,"unit":"g"},{"ingredientKey":"soybean_paste","quantity":12,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_dark","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'guay_teow_nam_moo', array['ก๋วยเตี๋ยวหมู', 'ก๋วยเตี๋ยวน้ำหมู', 'ก๋วยเตี๋ยวน้ำใส', 'บะหมี่น้ำหมู', 'guay teow nam', 'pork noodle soup', 'noodle soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":120,"unit":"g"},{"ingredientKey":"pork_minced","quantity":50,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":40,"unit":"g"},{"ingredientKey":"beansprout","quantity":40,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'guay_teow_tom_yum', array['ก๋วยเตี๋ยวต้มยำ', 'ต้มยำแห้ง', 'ก๋วยเตี๋ยวต้มยำหมู', 'guay teow tom yum']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":120,"unit":"g"},{"ingredientKey":"pork_minced","quantity":50,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":40,"unit":"g"},{"ingredientKey":"peanut_roasted","quantity":10,"unit":"g"},{"ingredientKey":"chili_flakes","quantity":3,"unit":"g"},{"ingredientKey":"sugar_white","quantity":8,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"lime","quantity":0.5,"unit":"piece"},{"ingredientKey":"beansprout","quantity":40,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'ba_mee_moo_daeng', array['บะหมี่หมูแดง', 'บะหมี่แห้งหมูแดง', 'บะหมี่เกี๊ยวหมูแดง', 'ba mee moo daeng', 'egg noodle red pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_noodle","quantity":120,"unit":"g"},{"ingredientKey":"pork_loin","quantity":80,"unit":"g"},{"ingredientKey":"wonton_wrapper","quantity":3,"unit":"piece"},{"ingredientKey":"pork_minced","quantity":20,"unit":"g"},{"ingredientKey":"kale_chinese","quantity":40,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":8,"unit":"ml"},{"ingredientKey":"garlic","quantity":8,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_soi_gai', array['ข้าวซอยไก่', 'ข้าวซอย', 'khao soi', 'khao soi gai', 'northern curry noodle']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_noodle","quantity":130,"unit":"g"},{"ingredientKey":"chicken_thigh","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":200,"unit":"ml"},{"ingredientKey":"curry_paste_red","quantity":25,"unit":"g"},{"ingredientKey":"curry_powder","quantity":5,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":8,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"shallot","quantity":20,"unit":"g"},{"ingredientKey":"lime","quantity":0.25,"unit":"piece"},{"ingredientKey":"vegetable_oil","quantity":25,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_woon_sen', array['ผัดวุ้นเส้น', 'ผัดวุ้นเส้นหมู', 'pad woon sen', 'stir fried glass noodles']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"vermicelli_glass","quantity":70,"unit":"g"},{"ingredientKey":"pork_sliced","quantity":80,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"cabbage","quantity":40,"unit":"g"},{"ingredientKey":"carrot","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":12,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gaeng_keow_wan_gai', array['แกงเขียวหวานไก่', 'เขียวหวานไก่', 'แกงเขียวหวาน', 'ข้าวแกงเขียวหวานไก่', 'gaeng keow wan gai', 'green curry chicken', 'green curry']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":200,"unit":"ml"},{"ingredientKey":"curry_paste_green","quantity":30,"unit":"g"},{"ingredientKey":"eggplant_thai","quantity":50,"unit":"g"},{"ingredientKey":"thai_basil","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":2,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gaeng_keow_wan_moo', array['แกงเขียวหวานหมู', 'เขียวหวานหมู', 'gaeng keow wan moo', 'green curry pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":200,"unit":"ml"},{"ingredientKey":"curry_paste_green","quantity":30,"unit":"g"},{"ingredientKey":"eggplant_thai","quantity":50,"unit":"g"},{"ingredientKey":"thai_basil","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":2,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gaeng_ped_gai', array['แกงเผ็ดไก่', 'แกงแดงไก่', 'gaeng ped gai', 'red curry chicken', 'red curry']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":200,"unit":"ml"},{"ingredientKey":"curry_paste_red","quantity":30,"unit":"g"},{"ingredientKey":"eggplant_thai","quantity":40,"unit":"g"},{"ingredientKey":"thai_basil","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":2,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'panang_moo', array['พะแนงหมู', 'พะแนง', 'พแนงหมู', 'panang moo', 'panang curry']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_sliced","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":180,"unit":"ml"},{"ingredientKey":"curry_paste_panang","quantity":30,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":12,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'massaman_gai', array['มัสมั่นไก่', 'แกงมัสมั่น', 'มัสมั่น', 'massaman gai', 'massaman curry']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":130,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":220,"unit":"ml"},{"ingredientKey":"curry_paste_massaman","quantity":30,"unit":"g"},{"ingredientKey":"potato","quantity":80,"unit":"g"},{"ingredientKey":"onion","quantity":40,"unit":"g"},{"ingredientKey":"peanut_roasted","quantity":15,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gaeng_som_pla', array['แกงส้มปลา', 'แกงส้ม', 'แกงส้มกุ้ง', 'gaeng som', 'sour curry']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"fish_dory","quantity":120,"unit":"g"},{"ingredientKey":"curry_paste_sour","quantity":35,"unit":"g"},{"ingredientKey":"cabbage","quantity":60,"unit":"g"},{"ingredientKey":"long_bean","quantity":40,"unit":"g"},{"ingredientKey":"tamarind_paste","quantity":25,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gaeng_jued_woon_sen', array['แกงจืดวุ้นเส้น', 'แกงจืด', 'แกงจืดเต้าหู้หมูสับ', 'ต้มจืด', 'gaeng jued', 'clear soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"vermicelli_glass","quantity":40,"unit":"g"},{"ingredientKey":"pork_minced","quantity":60,"unit":"g"},{"ingredientKey":"tofu_soft","quantity":60,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tom_yum_goong', array['ต้มยำกุ้ง', 'ต้มยำกุ้งน้ำข้น', 'ต้มยำกุ้งน้ำใส', 'tom yum goong', 'tom yum soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_medium","quantity":120,"unit":"g"},{"ingredientKey":"mushroom_straw","quantity":50,"unit":"g"},{"ingredientKey":"lemongrass","quantity":15,"unit":"g"},{"ingredientKey":"galangal","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"chili_paste_roasted","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"},{"ingredientKey":"milk_evaporated","quantity":30,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tom_yum_gai', array['ต้มยำไก่', 'tom yum gai', 'tom yum chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":120,"unit":"g"},{"ingredientKey":"mushroom_straw","quantity":50,"unit":"g"},{"ingredientKey":"lemongrass","quantity":15,"unit":"g"},{"ingredientKey":"galangal","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"chili_paste_roasted","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tom_kha_gai', array['ต้มข่าไก่', 'ต้มข่า', 'tom kha gai', 'tom kha', 'coconut chicken soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":200,"unit":"ml"},{"ingredientKey":"galangal","quantity":20,"unit":"g"},{"ingredientKey":"lemongrass","quantity":15,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"mushroom_straw","quantity":40,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":6,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'som_tam_thai', array['ส้มตำไทย', 'ส้มตำ', 'ตำไทย', 'som tam', 'som tam thai', 'papaya salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"papaya_green","quantity":150,"unit":"g"},{"ingredientKey":"tomato","quantity":40,"unit":"g"},{"ingredientKey":"long_bean","quantity":30,"unit":"g"},{"ingredientKey":"peanut_roasted","quantity":15,"unit":"g"},{"ingredientKey":"dried_shrimp","quantity":10,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tam_tang', array['ตำแตง', 'ตำแตงกวา', 'tam tang', 'cucumber salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"cucumber","quantity":150,"unit":"g"},{"ingredientKey":"tomato","quantity":30,"unit":"g"},{"ingredientKey":"peanut_roasted","quantity":12,"unit":"g"},{"ingredientKey":"dried_shrimp","quantity":8,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":12,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'larb_moo', array['ลาบหมู', 'ลาบ', 'larb moo', 'larb', 'laab moo', 'minced pork salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_minced","quantity":130,"unit":"g"},{"ingredientKey":"rice_powder_roasted","quantity":10,"unit":"g"},{"ingredientKey":"chili_flakes","quantity":4,"unit":"g"},{"ingredientKey":"shallot","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"mint","quantity":8,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'nam_tok_moo', array['น้ำตกหมู', 'น้ำตก', 'nam tok moo', 'nam tok', 'grilled pork salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_neck","quantity":130,"unit":"g"},{"ingredientKey":"rice_powder_roasted","quantity":10,"unit":"g"},{"ingredientKey":"chili_flakes","quantity":4,"unit":"g"},{"ingredientKey":"shallot","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"mint","quantity":8,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'yam_woon_sen', array['ยำวุ้นเส้น', 'ยำวุ้นเส้นหมูสับ', 'yam woon sen', 'glass noodle salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"vermicelli_glass","quantity":60,"unit":"g"},{"ingredientKey":"pork_minced","quantity":50,"unit":"g"},{"ingredientKey":"shrimp_small","quantity":40,"unit":"g"},{"ingredientKey":"tomato","quantity":30,"unit":"g"},{"ingredientKey":"onion","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":6,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":8,"unit":"g"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'yam_talay', array['ยำทะเล', 'ยำรวมมิตรทะเล', 'yam talay', 'seafood salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"squid","quantity":70,"unit":"g"},{"ingredientKey":"shrimp_medium","quantity":70,"unit":"g"},{"ingredientKey":"mussel","quantity":40,"unit":"g"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"tomato","quantity":30,"unit":"g"},{"ingredientKey":"lettuce","quantity":30,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":8,"unit":"g"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'yam_kai_dao', array['ยำไข่ดาว', 'yam kai dao', 'fried egg salad']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":2,"unit":"piece"},{"ingredientKey":"vegetable_oil","quantity":30,"unit":"ml"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"tomato","quantity":30,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":6,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":6,"unit":"g"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'moo_ping', array['หมูปิ้ง', 'หมูย่าง', 'moo ping', 'grilled pork skewer']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_neck","quantity":100,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":25,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"palm_sugar","quantity":10,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gai_yang', array['ไก่ย่าง', 'ไก่ย่างวิเชียรบุรี', 'gai yang', 'grilled chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":200,"unit":"g"},{"ingredientKey":"garlic","quantity":12,"unit":"g"},{"ingredientKey":"coriander","quantity":8,"unit":"g"},{"ingredientKey":"white_pepper","quantity":2,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":12,"unit":"ml"},{"ingredientKey":"palm_sugar","quantity":8,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gai_tod', array['ไก่ทอด', 'ไก่ทอดกระเทียม', 'gai tod', 'fried chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_thigh","quantity":180,"unit":"g"},{"ingredientKey":"wheat_flour","quantity":40,"unit":"g"},{"ingredientKey":"corn_starch","quantity":20,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"white_pepper","quantity":2,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":60,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pla_tod', array['ปลาทอด', 'ปลาทอดกระเทียม', 'ปลานิลทอด', 'pla tod', 'fried fish']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"fish_tilapia","quantity":300,"unit":"g"},{"ingredientKey":"wheat_flour","quantity":25,"unit":"g"},{"ingredientKey":"garlic","quantity":12,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":70,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tod_man_pla', array['ทอดมันปลา', 'ทอดมัน', 'tod man pla', 'fish cake']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"fish_dory","quantity":150,"unit":"g"},{"ingredientKey":"curry_paste_red","quantity":25,"unit":"g"},{"ingredientKey":"long_bean","quantity":30,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":0.5,"unit":"piece"},{"ingredientKey":"vegetable_oil","quantity":50,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'por_pia_tod', array['ปอเปี๊ยะทอด', 'ปอเปี๊ยะ', 'por pia tod', 'spring roll', 'fried spring rolls']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"spring_roll_wrapper","quantity":4,"unit":"piece"},{"ingredientKey":"vermicelli_glass","quantity":30,"unit":"g"},{"ingredientKey":"cabbage","quantity":40,"unit":"g"},{"ingredientKey":"carrot","quantity":25,"unit":"g"},{"ingredientKey":"pork_minced","quantity":30,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":40,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'goong_tod', array['กุ้งทอด', 'กุ้งชุบแป้งทอด', 'goong tod', 'fried shrimp']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_medium","quantity":130,"unit":"g"},{"ingredientKey":"wheat_flour","quantity":35,"unit":"g"},{"ingredientKey":"corn_starch","quantity":15,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":60,"unit":"ml"},{"ingredientKey":"mayonnaise","quantity":20,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_na_gai', array['ข้าวหน้าไก่', 'ข้าวราดหน้าไก่', 'khao na gai', 'chicken gravy rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_breast","quantity":110,"unit":"g"},{"ingredientKey":"corn_starch","quantity":15,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":10,"unit":"ml"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":12,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_tom_moo', array['ข้าวต้มหมู', 'ข้าวต้ม', 'ข้าวต้มกุ้ง', 'khao tom', 'khao tom moo', 'rice soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_jasmine","quantity":60,"unit":"g"},{"ingredientKey":"pork_minced","quantity":80,"unit":"g"},{"ingredientKey":"ginger","quantity":10,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"garlic","quantity":8,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":10,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'jok_moo', array['โจ๊กหมู', 'โจ๊ก', 'โจ๊กหมูไข่', 'jok', 'jok moo', 'congee']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_jasmine","quantity":50,"unit":"g"},{"ingredientKey":"pork_minced","quantity":70,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"ginger","quantity":10,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"coriander","quantity":5,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":8,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khai_tun', array['ไข่ตุ๋น', 'ไข่ตุ๋นหมูสับ', 'khai tun', 'steamed egg']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":2,"unit":"piece"},{"ingredientKey":"pork_minced","quantity":25,"unit":"g"},{"ingredientKey":"spring_onion","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":8,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_khai_khon', array['ข้าวไข่ข้น', 'ไข่ข้น', 'ข้าวไข่ข้นกุ้ง', 'khao khai khon', 'creamy omelette rice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"egg_chicken","quantity":3,"unit":"piece"},{"ingredientKey":"shrimp_small","quantity":50,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":30,"unit":"ml"},{"ingredientKey":"butter","quantity":15,"unit":"g"},{"ingredientKey":"onion","quantity":20,"unit":"g"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_kana_moo_krob', array['ผัดคะน้าหมูกรอบ', 'คะน้าหมูกรอบ', 'ข้าวผัดคะน้าหมูกรอบ', 'pad kana moo krob', 'kale crispy pork']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"kale_chinese","quantity":120,"unit":"g"},{"ingredientKey":"pork_crispy","quantity":80,"unit":"g"},{"ingredientKey":"garlic","quantity":12,"unit":"g"},{"ingredientKey":"chili_spur","quantity":8,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'gai_pad_prik_wan', array['ไก่ผัดพริกหวาน', 'ผัดพริกหวานไก่', 'gai pad prik wan', 'chicken bell pepper']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"chicken_breast","quantity":110,"unit":"g"},{"ingredientKey":"bell_pepper","quantity":60,"unit":"g"},{"ingredientKey":"onion","quantity":30,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"soy_sauce_light","quantity":8,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":15,"unit":"ml"},{"ingredientKey":"rice_jasmine","quantity":75,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pla_rad_prik', array['ปลาราดพริก', 'ปลาทอดราดพริก', 'ปลานิลราดพริก', 'pla rad prik', 'fried fish chili sauce']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"fish_tilapia","quantity":300,"unit":"g"},{"ingredientKey":"chili_spur","quantity":20,"unit":"g"},{"ingredientKey":"garlic","quantity":15,"unit":"g"},{"ingredientKey":"tamarind_paste","quantity":20,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":20,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":70,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'goong_ob_woon_sen', array['กุ้งอบวุ้นเส้น', 'goong ob woon sen', 'baked shrimp glass noodles']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_large","quantity":150,"unit":"g"},{"ingredientKey":"vermicelli_glass","quantity":70,"unit":"g"},{"ingredientKey":"pork_belly","quantity":30,"unit":"g"},{"ingredientKey":"ginger","quantity":15,"unit":"g"},{"ingredientKey":"coriander","quantity":8,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":12,"unit":"ml"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"sesame_oil","quantity":8,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":2,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'moo_satay', array['หมูสะเต๊ะ', 'สะเต๊ะ', 'หมูสะเต๊ต', 'moo satay', 'pork satay', 'satay']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_loin","quantity":120,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":60,"unit":"ml"},{"ingredientKey":"curry_powder","quantity":6,"unit":"g"},{"ingredientKey":"curry_paste_red","quantity":10,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":12,"unit":"g"},{"ingredientKey":"peanut_roasted","quantity":25,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pad_thai_talay', array['ผัดไทยทะเล', 'ผัดไทซีฟู้ด', 'pad thai talay', 'seafood pad thai']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_dry","quantity":70,"unit":"g"},{"ingredientKey":"shrimp_medium","quantity":50,"unit":"g"},{"ingredientKey":"squid","quantity":50,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"tofu_firm","quantity":30,"unit":"g"},{"ingredientKey":"beansprout","quantity":50,"unit":"g"},{"ingredientKey":"tamarind_paste","quantity":20,"unit":"g"},{"ingredientKey":"palm_sugar","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"peanut_roasted","quantity":10,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"},{"ingredientKey":"lime","quantity":0.25,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'guay_teow_kua_gai', array['ก๋วยเตี๋ยวคั่วไก่', 'กวยเตี๋ยวคั่วไก่', 'guay teow kua gai', 'fried noodle chicken']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_noodle_fresh","quantity":140,"unit":"g"},{"ingredientKey":"chicken_thigh","quantity":90,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"squid","quantity":30,"unit":"g"},{"ingredientKey":"lettuce","quantity":30,"unit":"g"},{"ingredientKey":"garlic","quantity":10,"unit":"g"},{"ingredientKey":"soy_sauce_light","quantity":12,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":20,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tom_saep_moo', array['ต้มแซ่บ', 'ต้มแซ่บกระดูกหมู', 'ต้มแซ่บหมู', 'tom saep', 'spicy pork rib soup']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_ribs","quantity":180,"unit":"g"},{"ingredientKey":"lemongrass","quantity":15,"unit":"g"},{"ingredientKey":"galangal","quantity":10,"unit":"g"},{"ingredientKey":"chili_flakes","quantity":4,"unit":"g"},{"ingredientKey":"rice_powder_roasted","quantity":8,"unit":"g"},{"ingredientKey":"spring_onion","quantity":10,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'tom_yum_talay', array['ต้มยำทะเล', 'ต้มยำรวมมิตร', 'tom yum talay', 'seafood tom yum']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"shrimp_medium","quantity":60,"unit":"g"},{"ingredientKey":"squid","quantity":60,"unit":"g"},{"ingredientKey":"mussel","quantity":40,"unit":"g"},{"ingredientKey":"mushroom_straw","quantity":50,"unit":"g"},{"ingredientKey":"lemongrass","quantity":15,"unit":"g"},{"ingredientKey":"galangal","quantity":10,"unit":"g"},{"ingredientKey":"kaffir_lime_leaf","quantity":3,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":8,"unit":"g"},{"ingredientKey":"chili_paste_roasted","quantity":15,"unit":"g"},{"ingredientKey":"fish_sauce","quantity":15,"unit":"ml"},{"ingredientKey":"lime","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'spaghetti_carbonara', array['สปาเก็ตตี้คาโบนาร่า', 'คาโบนาร่า', 'สปาเกตตีคาโบนาร่า', 'spaghetti carbonara', 'carbonara']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pasta_dry","quantity":100,"unit":"g"},{"ingredientKey":"bacon","quantity":50,"unit":"g"},{"ingredientKey":"whipping_cream","quantity":80,"unit":"ml"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"cheese_mozzarella","quantity":25,"unit":"g"},{"ingredientKey":"butter","quantity":10,"unit":"g"},{"ingredientKey":"white_pepper","quantity":1,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'spaghetti_kee_mao', array['สปาเก็ตตี้ขี้เมา', 'สปาเกตตีขี้เมา', 'spaghetti kee mao', 'drunken spaghetti']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pasta_dry","quantity":100,"unit":"g"},{"ingredientKey":"pork_minced","quantity":80,"unit":"g"},{"ingredientKey":"holy_basil","quantity":15,"unit":"g"},{"ingredientKey":"chili_birdseye","quantity":10,"unit":"g"},{"ingredientKey":"garlic","quantity":12,"unit":"g"},{"ingredientKey":"oyster_sauce","quantity":12,"unit":"ml"},{"ingredientKey":"vegetable_oil","quantity":18,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'french_fries', array['เฟรนช์ฟรายส์', 'เฟรนฟรายด์', 'มันฝรั่งทอด', 'french fries', 'fries']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"potato","quantity":180,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":50,"unit":"ml"},{"ingredientKey":"ketchup","quantity":25,"unit":"ml"},{"ingredientKey":"salt","quantity":2,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'toast_butter_sugar', array['ขนมปังปิ้ง', 'ขนมปังปิ้งเนยน้ำตาล', 'toast', 'butter sugar toast']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"bread_slice","quantity":2,"unit":"piece"},{"ingredientKey":"butter","quantity":20,"unit":"g"},{"ingredientKey":"sugar_white","quantity":15,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'honey_toast', array['ฮันนี่โทสต์', 'ขนมปังน้ำผึ้ง', 'honey toast']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"bread_slice","quantity":4,"unit":"piece"},{"ingredientKey":"butter","quantity":25,"unit":"g"},{"ingredientKey":"honey","quantity":25,"unit":"ml"},{"ingredientKey":"whipping_cream","quantity":40,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'espresso', array['เอสเพรสโซ่', 'เอสเปรสโซ', 'espresso', 'shot']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'americano_hot', array['อเมริกาโน่ร้อน', 'อเมริกาโน่', 'americano', 'hot americano']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'americano_iced', array['อเมริกาโน่เย็น', 'อเมริกาโน่ (เย็น)', 'iced americano']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'latte_hot', array['ลาเต้ร้อน', 'ลาเต้', 'คาเฟ่ลาเต้', 'latte', 'cafe latte', 'hot latte']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":180,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'latte_iced', array['ลาเต้เย็น', 'ลาเต้ (เย็น)', 'iced latte']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":150,"unit":"ml"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'cappuccino', array['คาปูชิโน่', 'คาปูชิโน', 'cappuccino']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":150,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'mocha', array['มอคค่า', 'ม็อคค่า', 'คาเฟ่มอคค่า', 'mocha', 'cafe mocha']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":160,"unit":"ml"},{"ingredientKey":"cocoa_powder","quantity":15,"unit":"g"},{"ingredientKey":"sugar_white","quantity":10,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'caramel_macchiato', array['คาราเมลมัคคิอาโต้', 'คาราเมลมาคิอาโต้', 'caramel macchiato']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":18,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":170,"unit":"ml"},{"ingredientKey":"syrup_flavored","quantity":20,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'coffee_boran', array['กาแฟโบราณ', 'โอเลี้ยง', 'กาแฟเย็น', 'oliang', 'thai iced coffee']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"coffee_bean_arabica","quantity":15,"unit":"g"},{"ingredientKey":"milk_condensed_sweet","quantity":30,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":10,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'thai_tea_iced', array['ชาไทยเย็น', 'ชาเย็น', 'ชานมเย็น', 'thai tea', 'thai iced tea', 'thai milk tea']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"tea_thai_powder","quantity":15,"unit":"g"},{"ingredientKey":"milk_condensed_sweet","quantity":30,"unit":"ml"},{"ingredientKey":"milk_evaporated","quantity":40,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":10,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'green_tea_latte', array['ชาเขียวลาเต้', 'มัทฉะลาเต้', 'ชาเขียวนม', 'matcha latte', 'green tea latte']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"tea_green_powder","quantity":8,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":180,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":12,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'lemon_tea', array['ชามะนาว', 'ชามะนาวเย็น', 'lemon tea', 'iced lemon tea']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"tea_thai_powder","quantity":10,"unit":"g"},{"ingredientKey":"lime","quantity":1,"unit":"piece"},{"ingredientKey":"sugar_white","quantity":20,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'cocoa_iced', array['โกโก้เย็น', 'โกโก้', 'ช็อกโกแลตเย็น', 'cocoa', 'iced cocoa', 'chocolate']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"cocoa_powder","quantity":20,"unit":"g"},{"ingredientKey":"milk_fresh","quantity":150,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":15,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'milk_fresh_iced', array['นมสดเย็น', 'นมสด', 'นมชมพู', 'fresh milk', 'iced fresh milk']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"milk_fresh","quantity":200,"unit":"ml"},{"ingredientKey":"syrup_flavored","quantity":20,"unit":"ml"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'orange_juice', array['น้ำส้มคั้น', 'น้ำส้ม', 'orange juice', 'fresh orange juice']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"orange","quantity":450,"unit":"g"},{"ingredientKey":"ice","quantity":100,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'lime_soda', array['น้ำมะนาวโซดา', 'มะนาวโซดา', 'น้ำมะนาว', 'lime soda', 'lemonade']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"lime","quantity":2,"unit":"piece"},{"ingredientKey":"sugar_white","quantity":25,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'khao_niao_mamuang', array['ข้าวเหนียวมะม่วง', 'ข้าวเหนียวมะม่วงน้ำดอกไม้', 'mango sticky rice', 'khao niao mamuang']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"rice_sticky","quantity":70,"unit":"g"},{"ingredientKey":"mango_ripe","quantity":200,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":120,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":25,"unit":"g"},{"ingredientKey":"salt","quantity":2,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'roti_kluay', array['โรตีกล้วย', 'โรตีกล้วยไข่', 'โรตี', 'roti kluay', 'banana roti', 'banana pancake']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"wheat_flour","quantity":80,"unit":"g"},{"ingredientKey":"banana","quantity":100,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"butter","quantity":20,"unit":"g"},{"ingredientKey":"milk_condensed_sweet","quantity":25,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":10,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'brownie', array['บราวนี่', 'บราวนี', 'brownie', 'chocolate brownie']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"cocoa_powder","quantity":25,"unit":"g"},{"ingredientKey":"wheat_flour","quantity":35,"unit":"g"},{"ingredientKey":"butter","quantity":40,"unit":"g"},{"ingredientKey":"sugar_white","quantity":45,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pancake', array['แพนเค้ก', 'pancake', 'pancakes']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"wheat_flour","quantity":80,"unit":"g"},{"ingredientKey":"egg_chicken","quantity":1,"unit":"piece"},{"ingredientKey":"milk_fresh","quantity":80,"unit":"ml"},{"ingredientKey":"butter","quantity":20,"unit":"g"},{"ingredientKey":"honey","quantity":20,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":15,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'kluay_tod', array['กล้วยทอด', 'กล้วยแขก', 'kluay tod', 'fried banana']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"banana","quantity":150,"unit":"g"},{"ingredientKey":"wheat_flour","quantity":50,"unit":"g"},{"ingredientKey":"coconut_milk","quantity":30,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":15,"unit":"g"},{"ingredientKey":"vegetable_oil","quantity":60,"unit":"ml"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'pork_steak', array['สเต็กหมู', 'สเต๊กหมู', 'pork steak', 'pork chop']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"pork_loin","quantity":180,"unit":"g"},{"ingredientKey":"potato","quantity":100,"unit":"g"},{"ingredientKey":"carrot","quantity":40,"unit":"g"},{"ingredientKey":"butter","quantity":20,"unit":"g"},{"ingredientKey":"ketchup","quantity":30,"unit":"ml"},{"ingredientKey":"white_pepper","quantity":2,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

insert into common_dishes
  (country_code, name_normalized, aliases, recipe_json, is_reviewed)
values ('TH', 'green_tea_iced', array['ชาเขียวเย็น', 'ชาเขียว', 'iced green tea', 'green tea']::text[], '{"yieldServings":1,"lines":[{"ingredientKey":"tea_green_powder","quantity":6,"unit":"g"},{"ingredientKey":"milk_condensed_sweet","quantity":25,"unit":"ml"},{"ingredientKey":"sugar_white","quantity":12,"unit":"g"},{"ingredientKey":"ice","quantity":200,"unit":"g"}]}'::jsonb, true)
on conflict (country_code, name_normalized) do update set
  aliases = excluded.aliases,
  recipe_json = excluded.recipe_json,
  is_reviewed = true,
  version = common_dishes.version + 1,
  updated_at = now();

commit;
