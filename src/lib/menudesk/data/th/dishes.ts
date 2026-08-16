// Thailand CommonDish catalogue — the curated recipes the cache answers from.
//
// Bible §05 wants ~100 popular dishes cached, because a cache hit costs nothing
// and keeps answers consistent between restaurants: two shops selling ผัดกะเพรา
// should be compared on their prices and portions, not on two different guesses
// the model made on two different days. The cache is what makes the free hook
// close to free, and what makes benchmarking (Tier 3) mean anything at all.
//
//
// ── What a recipe here is, and is not ─────────────────────────────────────
//
// It is the STANDARD version an ordinary independent Thai restaurant cooks:
// normal portions, normal cuts, no fine dining and no home kitchen. It is not
// any particular shop's recipe — the paid tier (W8) replaces these with the
// owner's own gram-level recipes, which is exactly what the upgrade sells.
//
// Quantities are AS-PURCHASED, matching how ingredients.ts is priced. Rice is
// raw: a plate is ~75g raw jasmine (about 220g cooked), not 200g.
//
// Ingredients under ~1 THB per portion that no owner would think about — salt,
// water, a pinch of pepper — are mostly left out. They do not change a food
// cost percentage and they make a recipe harder to read and correct.
//
//
// ── Aliases carry the whole match rate ────────────────────────────────────
//
// findCommonDish does EXACT alias matching (no fuzzy matching until the
// matcher earns it), and pass 1 hands it whatever is literally printed on the
// menu. So every plausible printed spelling has to be listed: with and without
// the ข้าว prefix, the ผัด prefix, the common misspelling (กระเพรา for กะเพรา),
// the transliteration, and the English name. A dish that misses here is not
// wrong — it falls through to the model — but it costs a model call and loses
// the consistency the cache exists to provide.

import type { Recipe, RecipeLine } from '@/lib/menudesk/engine'
import { TH_INGREDIENTS } from './ingredients'

const UNIT_BY_KEY = new Map(TH_INGREDIENTS.map((i) => [i.ingredientKey, i.unit]))

/**
 * One recipe line, with the unit taken from the price catalogue.
 *
 * Writing the unit out by hand is how a recipe ends up asking for 2 "pieces"
 * of something priced per gram — the engine refuses to cost that line, and the
 * dish silently becomes uncostable. Looking it up makes the mismatch
 * impossible, and an unknown key throws at module load rather than turning
 * into a quiet `missing_ingredient_price` on somebody's menu.
 */
function q(ingredientKey: string, quantity: number): RecipeLine {
  const unit = UNIT_BY_KEY.get(ingredientKey)
  if (!unit) {
    throw new Error(
      `[menudesk] recipe references unknown ingredient '${ingredientKey}' — ` +
        'add it to ingredients.ts or fix the key.',
    )
  }
  return { ingredientKey, quantity, unit }
}

/** One portion, the overwhelmingly common case. */
function serves(...lines: RecipeLine[]): Recipe {
  return { yieldServings: 1, lines }
}

export interface SeedCommonDish {
  /** Canonical key — country-neutral, so a neighbour's pad thai can reuse it. */
  nameNormalized: string
  /** Printed spellings that resolve here. Menus spell the same dish many ways. */
  aliases: string[]
  recipe: Recipe
}

// Portion constants, so "a plate of rice" means the same thing everywhere and
// can be re-tuned in one place if the standard turns out to be off.
const RICE_PLATE = 75 // raw jasmine grams ≈ 220g cooked
const RICE_STICKY = 70
const NOODLE_FRESH = 140
const NOODLE_DRY = 70

export const TH_COMMON_DISHES: SeedCommonDish[] = [
  // ══ Rice plates: กะเพรา and friends ══════════════════════════════════════
  {
    nameNormalized: 'pad_krapao_moo',
    aliases: [
      'ผัดกะเพราหมู', 'ผัดกระเพราหมู', 'กะเพราหมู', 'กระเพราหมู', 'กะเพราหมูสับ',
      'ข้าวกะเพราหมู', 'ข้าวผัดกะเพราหมู', 'ข้าวกระเพราหมู', 'ผัดกะเพราหมูสับ',
      'pad krapao moo', 'pad kaprao moo', 'basil pork', 'stir fried basil pork',
    ],
    recipe: serves(
      q('pork_minced', 110), q('holy_basil', 15), q('garlic', 10), q('chili_birdseye', 8),
      q('oyster_sauce', 12), q('fish_sauce', 8), q('soy_sauce_light', 5), q('sugar_white', 3),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_krapao_gai',
    aliases: [
      'ผัดกะเพราไก่', 'ผัดกระเพราไก่', 'กะเพราไก่', 'กระเพราไก่', 'ข้าวกะเพราไก่',
      'ข้าวผัดกะเพราไก่', 'กะเพราไก่สับ', 'pad krapao gai', 'basil chicken',
    ],
    recipe: serves(
      q('chicken_thigh', 110), q('holy_basil', 15), q('garlic', 10), q('chili_birdseye', 8),
      q('oyster_sauce', 12), q('fish_sauce', 8), q('soy_sauce_light', 5), q('sugar_white', 3),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_krapao_moo_krob',
    aliases: [
      'กะเพราหมูกรอบ', 'ผัดกะเพราหมูกรอบ', 'ข้าวกะเพราหมูกรอบ', 'ข้าวผัดกะเพราหมูกรอบ',
      'pad krapao moo krob', 'basil crispy pork',
    ],
    recipe: serves(
      q('pork_crispy', 100), q('holy_basil', 15), q('garlic', 10), q('chili_birdseye', 8),
      q('oyster_sauce', 12), q('fish_sauce', 8), q('sugar_white', 3),
      q('vegetable_oil', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_krapao_talay',
    aliases: [
      'กะเพราทะเล', 'ผัดกะเพราทะเล', 'ข้าวกะเพราทะเล', 'กะเพราซีฟู้ด',
      'pad krapao talay', 'basil seafood',
    ],
    recipe: serves(
      q('shrimp_small', 60), q('squid', 60), q('holy_basil', 15), q('garlic', 10),
      q('chili_birdseye', 8), q('oyster_sauce', 12), q('fish_sauce', 8), q('sugar_white', 3),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'krapao_kai_dao',
    aliases: ['ไข่ดาว', 'ไข่ดาวเพิ่ม', 'kai dao', 'fried egg'],
    recipe: serves(q('egg_chicken', 1), q('vegetable_oil', 20)),
  },

  // ══ Rice plates: roasted, braised, poached ═══════════════════════════════
  {
    nameNormalized: 'khao_moo_krob',
    aliases: [
      'ข้าวหมูกรอบ', 'หมูกรอบ', 'ข้าวหมูกรอบราดซอส', 'ข้าวหมูกรอบคะน้า',
      'khao moo krob', 'crispy pork rice', 'crispy pork belly rice',
    ],
    recipe: serves(
      q('pork_belly', 150), q('vegetable_oil', 25), q('garlic', 8),
      q('soy_sauce_dark', 5), q('cucumber', 30), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_moo_daeng',
    aliases: ['ข้าวหมูแดง', 'หมูแดง', 'ข้าวหมูแดงหมูกรอบ', 'khao moo daeng', 'red pork rice'],
    recipe: serves(
      q('pork_loin', 120), q('sugar_white', 12), q('soy_sauce_light', 10),
      q('soy_sauce_dark', 5), q('corn_starch', 8), q('cucumber', 30),
      q('spring_onion', 5), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_man_gai',
    aliases: [
      'ข้าวมันไก่', 'ข้าวมันไก่ต้ม', 'ข้าวมันไก่ทอด', 'khao man gai',
      'hainanese chicken rice', 'chicken rice',
    ],
    recipe: serves(
      q('chicken_whole', 180), q('rice_jasmine', RICE_PLATE), q('garlic', 10),
      q('ginger', 10), q('soybean_paste', 12), q('chili_birdseye', 5),
      q('cucumber', 30), q('vegetable_oil', 10),
    ),
  },
  {
    nameNormalized: 'khao_ka_moo',
    aliases: ['ข้าวขาหมู', 'ขาหมู', 'ข้าวขาหมูพะโล้', 'khao ka moo', 'stewed pork leg rice'],
    recipe: serves(
      q('pork_belly', 160), q('soy_sauce_dark', 12), q('soy_sauce_light', 10),
      q('palm_sugar', 12), q('garlic', 10), q('egg_chicken', 1),
      q('kale_chinese', 40), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_khai_jiao',
    aliases: [
      'ข้าวไข่เจียว', 'ไข่เจียว', 'ข้าวไข่เจียวหมูสับ', 'ไข่เจียวหมูสับ',
      'khai jiao', 'khao khai jiao', 'thai omelette', 'omelette rice',
    ],
    recipe: serves(
      q('egg_chicken', 2), q('pork_minced', 30), q('fish_sauce', 5),
      q('vegetable_oil', 40), q('rice_jasmine', RICE_PLATE),
    ),
  },

  // ══ Fried rice ═══════════════════════════════════════════════════════════
  {
    nameNormalized: 'khao_pad_moo',
    aliases: ['ข้าวผัดหมู', 'ข้าวผัดหมูสับ', 'khao pad moo', 'pork fried rice'],
    recipe: serves(
      q('pork_sliced', 90), q('egg_chicken', 1), q('garlic', 8), q('onion', 25),
      q('tomato', 25), q('spring_onion', 8), q('soy_sauce_light', 10),
      q('oyster_sauce', 8), q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_pad_gai',
    aliases: ['ข้าวผัดไก่', 'khao pad gai', 'chicken fried rice'],
    recipe: serves(
      q('chicken_breast', 90), q('egg_chicken', 1), q('garlic', 8), q('onion', 25),
      q('tomato', 25), q('spring_onion', 8), q('soy_sauce_light', 10),
      q('oyster_sauce', 8), q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_pad_goong',
    aliases: ['ข้าวผัดกุ้ง', 'khao pad goong', 'shrimp fried rice'],
    recipe: serves(
      q('shrimp_medium', 90), q('egg_chicken', 1), q('garlic', 8), q('onion', 25),
      q('tomato', 25), q('spring_onion', 8), q('soy_sauce_light', 10),
      q('oyster_sauce', 8), q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_pad_poo',
    aliases: ['ข้าวผัดปู', 'khao pad poo', 'crab fried rice'],
    recipe: serves(
      q('crab_stick', 90), q('egg_chicken', 1), q('garlic', 8), q('onion', 25),
      q('spring_onion', 8), q('soy_sauce_light', 10), q('oyster_sauce', 8),
      q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_pad_american',
    aliases: ['ข้าวผัดอเมริกัน', 'khao pad american', 'american fried rice'],
    recipe: serves(
      q('chicken_thigh', 70), q('egg_chicken', 1), q('ketchup', 30),
      q('onion', 25), q('bacon', 20), q('vegetable_oil', 18),
      q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_pad_kai',
    aliases: ['ข้าวผัดไข่', 'khao pad kai', 'egg fried rice'],
    recipe: serves(
      q('egg_chicken', 2), q('garlic', 8), q('spring_onion', 8),
      q('soy_sauce_light', 10), q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },

  // ══ Stir-fries ═══════════════════════════════════════════════════════════
  {
    nameNormalized: 'pad_prik_gaeng_moo',
    aliases: ['ผัดพริกแกงหมู', 'พริกแกงหมู', 'ผัดเผ็ดหมู', 'pad prik gaeng moo'],
    recipe: serves(
      q('pork_sliced', 110), q('curry_paste_red', 25), q('long_bean', 50),
      q('kaffir_lime_leaf', 2), q('fish_sauce', 8), q('sugar_white', 4),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_khing_gai',
    aliases: ['ผัดขิงไก่', 'ไก่ผัดขิง', 'ผัดขิงหมู', 'pad khing gai', 'ginger chicken'],
    recipe: serves(
      q('chicken_thigh', 110), q('ginger', 45), q('mushroom_shiitake', 25),
      q('onion', 30), q('spring_onion', 10), q('soybean_paste', 12),
      q('oyster_sauce', 10), q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_med_mamuang_gai',
    aliases: [
      'ไก่ผัดเม็ดมะม่วงหิมพานต์', 'ผัดเม็ดมะม่วงหิมพานต์', 'ไก่ผัดเม็ดมะม่วง',
      'pad med mamuang', 'cashew chicken', 'chicken cashew nut',
    ],
    recipe: serves(
      q('chicken_breast', 110), q('cashew_nut', 30), q('chili_spur', 10),
      q('onion', 30), q('bell_pepper', 25), q('chili_paste_roasted', 15),
      q('oyster_sauce', 12), q('vegetable_oil', 18), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_preow_wan',
    aliases: ['ผัดเปรี้ยวหวาน', 'ผัดเปรี้ยวหวานหมู', 'pad preow wan', 'sweet and sour'],
    recipe: serves(
      q('pork_sliced', 100), q('pineapple', 50), q('tomato', 40), q('cucumber', 40),
      q('onion', 30), q('ketchup', 25), q('vinegar', 10), q('sugar_white', 10),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_pak_boong',
    aliases: [
      'ผัดผักบุ้ง', 'ผัดผักบุ้งไฟแดง', 'ผักบุ้งไฟแดง', 'pad pak boong',
      'stir fried morning glory',
    ],
    recipe: serves(
      q('morning_glory', 180), q('garlic', 12), q('chili_spur', 8),
      q('soybean_paste', 15), q('oyster_sauce', 10), q('vegetable_oil', 15),
    ),
  },
  {
    nameNormalized: 'pad_pak_ruam',
    aliases: ['ผัดผักรวม', 'ผัดผักรวมมิตร', 'pad pak ruam', 'stir fried mixed vegetables'],
    recipe: serves(
      q('cabbage', 60), q('carrot', 40), q('baby_corn', 40), q('kale_chinese', 50),
      q('mushroom_straw', 30), q('garlic', 10), q('oyster_sauce', 12),
      q('vegetable_oil', 15),
    ),
  },
  {
    nameNormalized: 'pad_gratiam_moo',
    aliases: ['หมูผัดกระเทียม', 'หมูทอดกระเทียม', 'ผัดกระเทียมหมู', 'pad gratiam moo', 'garlic pork'],
    recipe: serves(
      q('pork_sliced', 110), q('garlic', 25), q('white_pepper', 2),
      q('soy_sauce_light', 10), q('oyster_sauce', 8), q('vegetable_oil', 18),
      q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pad_kee_mao',
    aliases: ['ผัดขี้เมา', 'ผัดขี้เมาหมู', 'ขี้เมา', 'pad kee mao', 'drunken noodles'],
    recipe: serves(
      q('rice_noodle_fresh', NOODLE_FRESH), q('pork_sliced', 90), q('holy_basil', 15),
      q('chili_birdseye', 10), q('garlic', 10), q('baby_corn', 30),
      q('oyster_sauce', 12), q('fish_sauce', 8), q('vegetable_oil', 18),
    ),
  },
  {
    nameNormalized: 'pad_cha_talay',
    aliases: ['ผัดฉ่าทะเล', 'ผัดฉ่า', 'pad cha talay', 'spicy stir fried seafood'],
    recipe: serves(
      q('squid', 70), q('shrimp_small', 60), q('curry_paste_red', 20),
      q('galangal', 15), q('thai_basil', 15),
      q('chili_birdseye', 10), q('fish_sauce', 8), q('vegetable_oil', 15),
      q('rice_jasmine', RICE_PLATE),
    ),
  },

  // ══ Noodles ══════════════════════════════════════════════════════════════
  {
    nameNormalized: 'pad_thai_goong',
    aliases: [
      'ผัดไทยกุ้ง', 'ผัดไทกุ้ง', 'ผัดไทยกุ้งสด', 'pad thai goong', 'pad thai shrimp',
      'pad thai prawn',
    ],
    recipe: serves(
      q('rice_noodle_dry', NOODLE_DRY), q('shrimp_medium', 70), q('egg_chicken', 1),
      q('tofu_firm', 30), q('beansprout', 50), q('tamarind_paste', 20),
      q('palm_sugar', 15), q('fish_sauce', 12), q('peanut_roasted', 10),
      q('dried_shrimp', 5), q('vegetable_oil', 20), q('lime', 0.25),
    ),
  },
  {
    nameNormalized: 'pad_thai_moo',
    aliases: ['ผัดไทยหมู', 'ผัดไทยไก่', 'ผัดไท', 'ผัดไทย', 'pad thai', 'pad thai moo'],
    recipe: serves(
      q('rice_noodle_dry', NOODLE_DRY), q('pork_sliced', 70), q('egg_chicken', 1),
      q('tofu_firm', 30), q('beansprout', 50), q('tamarind_paste', 20),
      q('palm_sugar', 15), q('fish_sauce', 12), q('peanut_roasted', 10),
      q('vegetable_oil', 20), q('lime', 0.25),
    ),
  },
  {
    nameNormalized: 'pad_see_ew_moo',
    aliases: ['ผัดซีอิ๊วหมู', 'ผัดซีอิ๊ว', 'ผัดซีอิ้ว', 'pad see ew', 'pad siew'],
    recipe: serves(
      q('rice_noodle_fresh', NOODLE_FRESH), q('pork_sliced', 90), q('egg_chicken', 1),
      q('kale_chinese', 60), q('soy_sauce_dark', 12), q('soy_sauce_light', 10),
      q('oyster_sauce', 10), q('sugar_white', 5), q('vegetable_oil', 20),
    ),
  },
  {
    nameNormalized: 'rad_na_moo',
    aliases: ['ราดหน้าหมู', 'ราดหน้า', 'ราดหน้าทะเล', 'rad na', 'rad na moo'],
    recipe: serves(
      q('rice_noodle_fresh', NOODLE_FRESH), q('pork_sliced', 90), q('kale_chinese', 70),
      q('corn_starch', 20), q('soybean_paste', 12), q('oyster_sauce', 12),
      q('soy_sauce_dark', 8), q('vegetable_oil', 18),
    ),
  },
  {
    nameNormalized: 'guay_teow_nam_moo',
    aliases: [
      'ก๋วยเตี๋ยวหมู', 'ก๋วยเตี๋ยวน้ำหมู', 'ก๋วยเตี๋ยวน้ำใส', 'บะหมี่น้ำหมู',
      'guay teow nam', 'pork noodle soup', 'noodle soup',
    ],
    recipe: serves(
      q('rice_noodle_fresh', 120), q('pork_minced', 50), q('pork_sliced', 40),
      q('beansprout', 40), q('spring_onion', 10), q('coriander', 5),
      q('fish_sauce', 10), q('white_pepper', 1), q('garlic', 8),
    ),
  },
  {
    nameNormalized: 'guay_teow_tom_yum',
    aliases: ['ก๋วยเตี๋ยวต้มยำ', 'ต้มยำแห้ง', 'ก๋วยเตี๋ยวต้มยำหมู', 'guay teow tom yum'],
    recipe: serves(
      q('rice_noodle_fresh', 120), q('pork_minced', 50), q('pork_sliced', 40),
      q('peanut_roasted', 10), q('chili_flakes', 3), q('sugar_white', 8),
      q('fish_sauce', 10), q('lime', 0.5), q('beansprout', 40), q('spring_onion', 10),
    ),
  },
  {
    nameNormalized: 'ba_mee_moo_daeng',
    aliases: ['บะหมี่หมูแดง', 'บะหมี่แห้งหมูแดง', 'บะหมี่เกี๊ยวหมูแดง', 'ba mee moo daeng', 'egg noodle red pork'],
    recipe: serves(
      q('egg_noodle', 120), q('pork_loin', 80), q('wonton_wrapper', 3),
      q('pork_minced', 20), q('kale_chinese', 40), q('spring_onion', 8),
      q('oyster_sauce', 10), q('soy_sauce_light', 8), q('garlic', 8),
    ),
  },
  {
    nameNormalized: 'khao_soi_gai',
    aliases: ['ข้าวซอยไก่', 'ข้าวซอย', 'khao soi', 'khao soi gai', 'northern curry noodle'],
    recipe: serves(
      q('egg_noodle', 130), q('chicken_thigh', 120), q('coconut_milk', 200),
      q('curry_paste_red', 25), q('curry_powder', 5), q('palm_sugar', 8),
      q('fish_sauce', 10), q('shallot', 20), q('lime', 0.25), q('vegetable_oil', 25),
    ),
  },
  {
    nameNormalized: 'pad_woon_sen',
    aliases: ['ผัดวุ้นเส้น', 'ผัดวุ้นเส้นหมู', 'pad woon sen', 'stir fried glass noodles'],
    recipe: serves(
      q('vermicelli_glass', 70), q('pork_sliced', 80), q('egg_chicken', 1),
      q('cabbage', 40), q('carrot', 25), q('spring_onion', 10),
      q('soy_sauce_light', 12), q('oyster_sauce', 10), q('vegetable_oil', 18),
    ),
  },

  // ══ Curries ══════════════════════════════════════════════════════════════
  {
    nameNormalized: 'gaeng_keow_wan_gai',
    aliases: [
      'แกงเขียวหวานไก่', 'เขียวหวานไก่', 'แกงเขียวหวาน', 'ข้าวแกงเขียวหวานไก่',
      'gaeng keow wan gai', 'green curry chicken', 'green curry',
    ],
    recipe: serves(
      q('chicken_thigh', 120), q('coconut_milk', 200), q('curry_paste_green', 30),
      q('eggplant_thai', 50), q('thai_basil', 10), q('kaffir_lime_leaf', 2),
      q('palm_sugar', 10), q('fish_sauce', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'gaeng_keow_wan_moo',
    aliases: ['แกงเขียวหวานหมู', 'เขียวหวานหมู', 'gaeng keow wan moo', 'green curry pork'],
    recipe: serves(
      q('pork_sliced', 120), q('coconut_milk', 200), q('curry_paste_green', 30),
      q('eggplant_thai', 50), q('thai_basil', 10), q('kaffir_lime_leaf', 2),
      q('palm_sugar', 10), q('fish_sauce', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'gaeng_ped_gai',
    aliases: ['แกงเผ็ดไก่', 'แกงแดงไก่', 'gaeng ped gai', 'red curry chicken', 'red curry'],
    recipe: serves(
      q('chicken_thigh', 120), q('coconut_milk', 200), q('curry_paste_red', 30),
      q('eggplant_thai', 40), q('thai_basil', 10), q('kaffir_lime_leaf', 2),
      q('palm_sugar', 10), q('fish_sauce', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'panang_moo',
    aliases: ['พะแนงหมู', 'พะแนง', 'พแนงหมู', 'panang moo', 'panang curry'],
    recipe: serves(
      q('pork_sliced', 120), q('coconut_milk', 180), q('curry_paste_panang', 30),
      q('kaffir_lime_leaf', 3), q('palm_sugar', 12), q('fish_sauce', 12),
      q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'massaman_gai',
    aliases: ['มัสมั่นไก่', 'แกงมัสมั่น', 'มัสมั่น', 'massaman gai', 'massaman curry'],
    recipe: serves(
      q('chicken_thigh', 130), q('coconut_milk', 220), q('curry_paste_massaman', 30),
      q('potato', 80), q('onion', 40), q('peanut_roasted', 15),
      q('palm_sugar', 15), q('fish_sauce', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'gaeng_som_pla',
    aliases: ['แกงส้มปลา', 'แกงส้ม', 'แกงส้มกุ้ง', 'gaeng som', 'sour curry'],
    recipe: serves(
      q('fish_dory', 120), q('curry_paste_sour', 35), q('cabbage', 60),
      q('long_bean', 40), q('tamarind_paste', 25), q('palm_sugar', 10),
      q('fish_sauce', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'gaeng_jued_woon_sen',
    aliases: [
      'แกงจืดวุ้นเส้น', 'แกงจืด', 'แกงจืดเต้าหู้หมูสับ', 'ต้มจืด',
      'gaeng jued', 'clear soup',
    ],
    recipe: serves(
      q('vermicelli_glass', 40), q('pork_minced', 60), q('tofu_soft', 60),
      q('spring_onion', 10), q('coriander', 5), q('soy_sauce_light', 10),
      q('white_pepper', 1), q('garlic', 8),
    ),
  },

  // ══ Soups ════════════════════════════════════════════════════════════════
  {
    nameNormalized: 'tom_yum_goong',
    aliases: ['ต้มยำกุ้ง', 'ต้มยำกุ้งน้ำข้น', 'ต้มยำกุ้งน้ำใส', 'tom yum goong', 'tom yum soup'],
    recipe: serves(
      q('shrimp_medium', 120), q('mushroom_straw', 50), q('lemongrass', 15),
      q('galangal', 10), q('kaffir_lime_leaf', 3), q('chili_birdseye', 8),
      q('chili_paste_roasted', 15), q('fish_sauce', 15), q('lime', 1),
      q('milk_evaporated', 30),
    ),
  },
  {
    nameNormalized: 'tom_yum_gai',
    aliases: ['ต้มยำไก่', 'tom yum gai', 'tom yum chicken'],
    recipe: serves(
      q('chicken_thigh', 120), q('mushroom_straw', 50), q('lemongrass', 15),
      q('galangal', 10), q('kaffir_lime_leaf', 3), q('chili_birdseye', 8),
      q('chili_paste_roasted', 15), q('fish_sauce', 15), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'tom_kha_gai',
    aliases: ['ต้มข่าไก่', 'ต้มข่า', 'tom kha gai', 'tom kha', 'coconut chicken soup'],
    recipe: serves(
      q('chicken_thigh', 120), q('coconut_milk', 200), q('galangal', 20),
      q('lemongrass', 15), q('kaffir_lime_leaf', 3), q('mushroom_straw', 40),
      q('chili_birdseye', 6), q('fish_sauce', 15), q('lime', 1),
    ),
  },

  // ══ Isaan and salads ═════════════════════════════════════════════════════
  {
    nameNormalized: 'som_tam_thai',
    aliases: ['ส้มตำไทย', 'ส้มตำ', 'ตำไทย', 'som tam', 'som tam thai', 'papaya salad'],
    recipe: serves(
      q('papaya_green', 150), q('tomato', 40), q('long_bean', 30),
      q('peanut_roasted', 15), q('dried_shrimp', 10), q('garlic', 8),
      q('chili_birdseye', 8), q('palm_sugar', 15), q('fish_sauce', 12), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'tam_tang',
    aliases: ['ตำแตง', 'ตำแตงกวา', 'tam tang', 'cucumber salad'],
    recipe: serves(
      q('cucumber', 150), q('tomato', 30), q('peanut_roasted', 12),
      q('dried_shrimp', 8), q('garlic', 8), q('chili_birdseye', 8),
      q('palm_sugar', 12), q('fish_sauce', 12), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'larb_moo',
    aliases: ['ลาบหมู', 'ลาบ', 'larb moo', 'larb', 'laab moo', 'minced pork salad'],
    recipe: serves(
      q('pork_minced', 130), q('rice_powder_roasted', 10), q('chili_flakes', 4),
      q('shallot', 25), q('spring_onion', 10), q('mint', 8), q('coriander', 5),
      q('fish_sauce', 15), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'nam_tok_moo',
    aliases: ['น้ำตกหมู', 'น้ำตก', 'nam tok moo', 'nam tok', 'grilled pork salad'],
    recipe: serves(
      q('pork_neck', 130), q('rice_powder_roasted', 10), q('chili_flakes', 4),
      q('shallot', 25), q('spring_onion', 10), q('mint', 8),
      q('fish_sauce', 15), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'yam_woon_sen',
    aliases: ['ยำวุ้นเส้น', 'ยำวุ้นเส้นหมูสับ', 'yam woon sen', 'glass noodle salad'],
    recipe: serves(
      q('vermicelli_glass', 60), q('pork_minced', 50), q('shrimp_small', 40),
      q('tomato', 30), q('onion', 25), q('spring_onion', 10), q('coriander', 5),
      q('chili_birdseye', 6), q('fish_sauce', 15), q('sugar_white', 8), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'yam_talay',
    aliases: ['ยำทะเล', 'ยำรวมมิตรทะเล', 'yam talay', 'seafood salad'],
    recipe: serves(
      q('squid', 70), q('shrimp_medium', 70), q('mussel', 40), q('onion', 30),
      q('tomato', 30), q('lettuce', 30), q('coriander', 5), q('chili_birdseye', 8),
      q('fish_sauce', 15), q('sugar_white', 8), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'yam_kai_dao',
    aliases: ['ยำไข่ดาว', 'yam kai dao', 'fried egg salad'],
    recipe: serves(
      q('egg_chicken', 2), q('vegetable_oil', 30), q('onion', 30), q('tomato', 30),
      q('spring_onion', 10), q('chili_birdseye', 6), q('fish_sauce', 12),
      q('sugar_white', 6), q('lime', 1),
    ),
  },

  // ══ Grilled and fried ════════════════════════════════════════════════════
  {
    nameNormalized: 'moo_ping',
    aliases: ['หมูปิ้ง', 'หมูย่าง', 'moo ping', 'grilled pork skewer'],
    recipe: serves(
      q('pork_neck', 100), q('coconut_milk', 25), q('soy_sauce_light', 10),
      q('palm_sugar', 10), q('garlic', 8), q('white_pepper', 1),
    ),
  },
  {
    nameNormalized: 'gai_yang',
    aliases: ['ไก่ย่าง', 'ไก่ย่างวิเชียรบุรี', 'gai yang', 'grilled chicken'],
    recipe: serves(
      q('chicken_thigh', 200), q('garlic', 12), q('coriander', 8),
      q('white_pepper', 2), q('soy_sauce_light', 12), q('palm_sugar', 8),
    ),
  },
  {
    nameNormalized: 'gai_tod',
    aliases: ['ไก่ทอด', 'ไก่ทอดกระเทียม', 'gai tod', 'fried chicken'],
    recipe: serves(
      q('chicken_thigh', 180), q('wheat_flour', 40), q('corn_starch', 20),
      q('garlic', 10), q('white_pepper', 2), q('vegetable_oil', 60),
    ),
  },
  {
    nameNormalized: 'pla_tod',
    aliases: ['ปลาทอด', 'ปลาทอดกระเทียม', 'ปลานิลทอด', 'pla tod', 'fried fish'],
    recipe: serves(
      q('fish_tilapia', 300), q('wheat_flour', 25), q('garlic', 12),
      q('vegetable_oil', 70),
    ),
  },
  {
    nameNormalized: 'tod_man_pla',
    aliases: ['ทอดมันปลา', 'ทอดมัน', 'tod man pla', 'fish cake'],
    recipe: serves(
      q('fish_dory', 150), q('curry_paste_red', 25), q('long_bean', 30),
      q('kaffir_lime_leaf', 3), q('egg_chicken', 0.5), q('vegetable_oil', 50),
    ),
  },
  {
    nameNormalized: 'por_pia_tod',
    aliases: ['ปอเปี๊ยะทอด', 'ปอเปี๊ยะ', 'por pia tod', 'spring roll', 'fried spring rolls'],
    recipe: serves(
      q('spring_roll_wrapper', 4), q('vermicelli_glass', 30), q('cabbage', 40),
      q('carrot', 25), q('pork_minced', 30), q('vegetable_oil', 40),
    ),
  },
  {
    nameNormalized: 'goong_tod',
    aliases: ['กุ้งทอด', 'กุ้งชุบแป้งทอด', 'goong tod', 'fried shrimp'],
    recipe: serves(
      q('shrimp_medium', 130), q('wheat_flour', 35), q('corn_starch', 15),
      q('vegetable_oil', 60), q('mayonnaise', 20),
    ),
  },

  // ══ Rice bowls, congee, steamed ══════════════════════════════════════════
  {
    nameNormalized: 'khao_na_gai',
    aliases: ['ข้าวหน้าไก่', 'ข้าวราดหน้าไก่', 'khao na gai', 'chicken gravy rice'],
    recipe: serves(
      q('chicken_breast', 110), q('corn_starch', 15), q('oyster_sauce', 12),
      q('soy_sauce_light', 10), q('garlic', 8), q('spring_onion', 8),
      q('vegetable_oil', 12), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'khao_tom_moo',
    aliases: ['ข้าวต้มหมู', 'ข้าวต้ม', 'ข้าวต้มกุ้ง', 'khao tom', 'khao tom moo', 'rice soup'],
    recipe: serves(
      q('rice_jasmine', 60), q('pork_minced', 80), q('ginger', 10),
      q('spring_onion', 10), q('coriander', 5), q('garlic', 8),
      q('fish_sauce', 10), q('white_pepper', 1),
    ),
  },
  {
    nameNormalized: 'jok_moo',
    aliases: ['โจ๊กหมู', 'โจ๊ก', 'โจ๊กหมูไข่', 'jok', 'jok moo', 'congee'],
    recipe: serves(
      q('rice_jasmine', 50), q('pork_minced', 70), q('egg_chicken', 1),
      q('ginger', 10), q('spring_onion', 10), q('coriander', 5),
      q('soy_sauce_light', 8), q('white_pepper', 1),
    ),
  },
  {
    nameNormalized: 'khai_tun',
    aliases: ['ไข่ตุ๋น', 'ไข่ตุ๋นหมูสับ', 'khai tun', 'steamed egg'],
    recipe: serves(
      q('egg_chicken', 2), q('pork_minced', 25), q('spring_onion', 8),
      q('soy_sauce_light', 8),
    ),
  },
  {
    nameNormalized: 'khao_khai_khon',
    aliases: ['ข้าวไข่ข้น', 'ไข่ข้น', 'ข้าวไข่ข้นกุ้ง', 'khao khai khon', 'creamy omelette rice'],
    recipe: serves(
      q('egg_chicken', 3), q('shrimp_small', 50), q('milk_fresh', 30),
      q('butter', 15), q('onion', 20), q('rice_jasmine', RICE_PLATE),
    ),
  },

  // ══ More stir-fries and one-plate mains ══════════════════════════════════
  {
    nameNormalized: 'pad_kana_moo_krob',
    aliases: [
      'ผัดคะน้าหมูกรอบ', 'คะน้าหมูกรอบ', 'ข้าวผัดคะน้าหมูกรอบ',
      'pad kana moo krob', 'kale crispy pork',
    ],
    recipe: serves(
      q('kale_chinese', 120), q('pork_crispy', 80), q('garlic', 12),
      q('chili_spur', 8), q('oyster_sauce', 12), q('soy_sauce_light', 8),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'gai_pad_prik_wan',
    aliases: ['ไก่ผัดพริกหวาน', 'ผัดพริกหวานไก่', 'gai pad prik wan', 'chicken bell pepper'],
    recipe: serves(
      q('chicken_breast', 110), q('bell_pepper', 60), q('onion', 30),
      q('garlic', 10), q('oyster_sauce', 12), q('soy_sauce_light', 8),
      q('vegetable_oil', 15), q('rice_jasmine', RICE_PLATE),
    ),
  },
  {
    nameNormalized: 'pla_rad_prik',
    aliases: ['ปลาราดพริก', 'ปลาทอดราดพริก', 'ปลานิลราดพริก', 'pla rad prik', 'fried fish chili sauce'],
    recipe: serves(
      q('fish_tilapia', 300), q('chili_spur', 20), q('garlic', 15),
      q('tamarind_paste', 20), q('palm_sugar', 20), q('fish_sauce', 12),
      q('vegetable_oil', 70),
    ),
  },
  {
    nameNormalized: 'goong_ob_woon_sen',
    aliases: ['กุ้งอบวุ้นเส้น', 'goong ob woon sen', 'baked shrimp glass noodles'],
    recipe: serves(
      q('shrimp_large', 150), q('vermicelli_glass', 70), q('pork_belly', 30),
      q('ginger', 15), q('coriander', 8), q('soy_sauce_light', 12),
      q('oyster_sauce', 12), q('sesame_oil', 8), q('white_pepper', 2),
    ),
  },
  {
    nameNormalized: 'moo_satay',
    aliases: ['หมูสะเต๊ะ', 'สะเต๊ะ', 'หมูสะเต๊ต', 'moo satay', 'pork satay', 'satay'],
    recipe: serves(
      q('pork_loin', 120), q('coconut_milk', 60), q('curry_powder', 6),
      q('curry_paste_red', 10), q('palm_sugar', 12), q('peanut_roasted', 25),
    ),
  },

  // ══ More noodles and soups ═══════════════════════════════════════════════
  {
    nameNormalized: 'pad_thai_talay',
    aliases: ['ผัดไทยทะเล', 'ผัดไทซีฟู้ด', 'pad thai talay', 'seafood pad thai'],
    recipe: serves(
      q('rice_noodle_dry', NOODLE_DRY), q('shrimp_medium', 50), q('squid', 50),
      q('egg_chicken', 1), q('tofu_firm', 30), q('beansprout', 50),
      q('tamarind_paste', 20), q('palm_sugar', 15), q('fish_sauce', 12),
      q('peanut_roasted', 10), q('vegetable_oil', 20), q('lime', 0.25),
    ),
  },
  {
    nameNormalized: 'guay_teow_kua_gai',
    aliases: ['ก๋วยเตี๋ยวคั่วไก่', 'กวยเตี๋ยวคั่วไก่', 'guay teow kua gai', 'fried noodle chicken'],
    recipe: serves(
      q('rice_noodle_fresh', NOODLE_FRESH), q('chicken_thigh', 90),
      q('egg_chicken', 1), q('squid', 30), q('lettuce', 30), q('garlic', 10),
      q('soy_sauce_light', 12), q('vegetable_oil', 20),
    ),
  },
  {
    nameNormalized: 'tom_saep_moo',
    aliases: ['ต้มแซ่บ', 'ต้มแซ่บกระดูกหมู', 'ต้มแซ่บหมู', 'tom saep', 'spicy pork rib soup'],
    recipe: serves(
      q('pork_ribs', 180), q('lemongrass', 15), q('galangal', 10),
      q('chili_flakes', 4), q('rice_powder_roasted', 8), q('spring_onion', 10),
      q('fish_sauce', 15), q('lime', 1),
    ),
  },
  {
    nameNormalized: 'tom_yum_talay',
    aliases: ['ต้มยำทะเล', 'ต้มยำรวมมิตร', 'tom yum talay', 'seafood tom yum'],
    recipe: serves(
      q('shrimp_medium', 60), q('squid', 60), q('mussel', 40),
      q('mushroom_straw', 50), q('lemongrass', 15), q('galangal', 10),
      q('kaffir_lime_leaf', 3), q('chili_birdseye', 8), q('chili_paste_roasted', 15),
      q('fish_sauce', 15), q('lime', 1),
    ),
  },

  // ══ Café: pasta and western plates ═══════════════════════════════════════
  {
    nameNormalized: 'spaghetti_carbonara',
    aliases: ['สปาเก็ตตี้คาโบนาร่า', 'คาโบนาร่า', 'สปาเกตตีคาโบนาร่า', 'spaghetti carbonara', 'carbonara'],
    recipe: serves(
      q('pasta_dry', 100), q('bacon', 50), q('whipping_cream', 80),
      q('egg_chicken', 1), q('cheese_mozzarella', 25), q('butter', 10),
      q('white_pepper', 1),
    ),
  },
  {
    nameNormalized: 'spaghetti_kee_mao',
    aliases: ['สปาเก็ตตี้ขี้เมา', 'สปาเกตตีขี้เมา', 'spaghetti kee mao', 'drunken spaghetti'],
    recipe: serves(
      q('pasta_dry', 100), q('pork_minced', 80), q('holy_basil', 15),
      q('chili_birdseye', 10), q('garlic', 12), q('oyster_sauce', 12),
      q('vegetable_oil', 18),
    ),
  },
  {
    nameNormalized: 'french_fries',
    aliases: ['เฟรนช์ฟรายส์', 'เฟรนฟรายด์', 'มันฝรั่งทอด', 'french fries', 'fries'],
    recipe: serves(q('potato', 180), q('vegetable_oil', 50), q('ketchup', 25), q('salt', 2)),
  },
  {
    nameNormalized: 'toast_butter_sugar',
    aliases: ['ขนมปังปิ้ง', 'ขนมปังปิ้งเนยน้ำตาล', 'toast', 'butter sugar toast'],
    recipe: serves(q('bread_slice', 2), q('butter', 20), q('sugar_white', 15)),
  },
  {
    nameNormalized: 'honey_toast',
    aliases: ['ฮันนี่โทสต์', 'ขนมปังน้ำผึ้ง', 'honey toast'],
    recipe: serves(
      q('bread_slice', 4), q('butter', 25), q('honey', 25), q('whipping_cream', 40),
    ),
  },

  // ══ Café: coffee ═════════════════════════════════════════════════════════
  // An 18g double shot is the ordinary Thai café standard; the ice matters on
  // an iced drink and is deliberately not treated as free.
  {
    nameNormalized: 'espresso',
    aliases: ['เอสเพรสโซ่', 'เอสเปรสโซ', 'espresso', 'shot'],
    recipe: serves(q('coffee_bean_arabica', 18)),
  },
  {
    nameNormalized: 'americano_hot',
    aliases: ['อเมริกาโน่ร้อน', 'อเมริกาโน่', 'americano', 'hot americano'],
    recipe: serves(q('coffee_bean_arabica', 18)),
  },
  {
    nameNormalized: 'americano_iced',
    aliases: ['อเมริกาโน่เย็น', 'อเมริกาโน่ (เย็น)', 'iced americano'],
    recipe: serves(q('coffee_bean_arabica', 18), q('ice', 200)),
  },
  {
    nameNormalized: 'latte_hot',
    aliases: ['ลาเต้ร้อน', 'ลาเต้', 'คาเฟ่ลาเต้', 'latte', 'cafe latte', 'hot latte'],
    recipe: serves(q('coffee_bean_arabica', 18), q('milk_fresh', 180)),
  },
  {
    nameNormalized: 'latte_iced',
    aliases: ['ลาเต้เย็น', 'ลาเต้ (เย็น)', 'iced latte'],
    recipe: serves(q('coffee_bean_arabica', 18), q('milk_fresh', 150), q('ice', 200)),
  },
  {
    nameNormalized: 'cappuccino',
    aliases: ['คาปูชิโน่', 'คาปูชิโน', 'cappuccino'],
    recipe: serves(q('coffee_bean_arabica', 18), q('milk_fresh', 150)),
  },
  {
    nameNormalized: 'mocha',
    aliases: ['มอคค่า', 'ม็อคค่า', 'คาเฟ่มอคค่า', 'mocha', 'cafe mocha'],
    recipe: serves(
      q('coffee_bean_arabica', 18), q('milk_fresh', 160), q('cocoa_powder', 15),
      q('sugar_white', 10),
    ),
  },
  {
    nameNormalized: 'caramel_macchiato',
    aliases: ['คาราเมลมัคคิอาโต้', 'คาราเมลมาคิอาโต้', 'caramel macchiato'],
    recipe: serves(
      q('coffee_bean_arabica', 18), q('milk_fresh', 170), q('syrup_flavored', 20),
    ),
  },
  {
    nameNormalized: 'coffee_boran',
    aliases: ['กาแฟโบราณ', 'โอเลี้ยง', 'กาแฟเย็น', 'oliang', 'thai iced coffee'],
    recipe: serves(
      q('coffee_bean_arabica', 15), q('milk_condensed_sweet', 30),
      q('sugar_white', 10), q('ice', 200),
    ),
  },

  // ══ Café: tea, cocoa, juice ══════════════════════════════════════════════
  {
    nameNormalized: 'thai_tea_iced',
    aliases: ['ชาไทยเย็น', 'ชาเย็น', 'ชานมเย็น', 'thai tea', 'thai iced tea', 'thai milk tea'],
    recipe: serves(
      q('tea_thai_powder', 15), q('milk_condensed_sweet', 30),
      q('milk_evaporated', 40), q('sugar_white', 10), q('ice', 200),
    ),
  },
  {
    nameNormalized: 'green_tea_latte',
    aliases: ['ชาเขียวลาเต้', 'มัทฉะลาเต้', 'ชาเขียวนม', 'matcha latte', 'green tea latte'],
    recipe: serves(
      q('tea_green_powder', 8), q('milk_fresh', 180), q('sugar_white', 12),
    ),
  },
  {
    nameNormalized: 'lemon_tea',
    aliases: ['ชามะนาว', 'ชามะนาวเย็น', 'lemon tea', 'iced lemon tea'],
    recipe: serves(
      q('tea_thai_powder', 10), q('lime', 1), q('sugar_white', 20), q('ice', 200),
    ),
  },
  {
    nameNormalized: 'cocoa_iced',
    aliases: ['โกโก้เย็น', 'โกโก้', 'ช็อกโกแลตเย็น', 'cocoa', 'iced cocoa', 'chocolate'],
    recipe: serves(
      q('cocoa_powder', 20), q('milk_fresh', 150), q('sugar_white', 15), q('ice', 200),
    ),
  },
  {
    nameNormalized: 'milk_fresh_iced',
    aliases: ['นมสดเย็น', 'นมสด', 'นมชมพู', 'fresh milk', 'iced fresh milk'],
    recipe: serves(q('milk_fresh', 200), q('syrup_flavored', 20), q('ice', 200)),
  },
  {
    nameNormalized: 'orange_juice',
    aliases: ['น้ำส้มคั้น', 'น้ำส้ม', 'orange juice', 'fresh orange juice'],
    recipe: serves(q('orange', 450), q('ice', 100)),
  },
  {
    nameNormalized: 'lime_soda',
    aliases: ['น้ำมะนาวโซดา', 'มะนาวโซดา', 'น้ำมะนาว', 'lime soda', 'lemonade'],
    recipe: serves(q('lime', 2), q('sugar_white', 25), q('ice', 200)),
  },

  // ══ Desserts ═════════════════════════════════════════════════════════════
  {
    nameNormalized: 'khao_niao_mamuang',
    aliases: ['ข้าวเหนียวมะม่วง', 'ข้าวเหนียวมะม่วงน้ำดอกไม้', 'mango sticky rice', 'khao niao mamuang'],
    recipe: serves(
      q('rice_sticky', RICE_STICKY), q('mango_ripe', 200), q('coconut_milk', 120),
      q('sugar_white', 25), q('salt', 2),
    ),
  },
  {
    nameNormalized: 'roti_kluay',
    aliases: ['โรตีกล้วย', 'โรตีกล้วยไข่', 'โรตี', 'roti kluay', 'banana roti', 'banana pancake'],
    recipe: serves(
      q('wheat_flour', 80), q('banana', 100), q('egg_chicken', 1), q('butter', 20),
      q('milk_condensed_sweet', 25), q('sugar_white', 10),
    ),
  },
  {
    nameNormalized: 'brownie',
    aliases: ['บราวนี่', 'บราวนี', 'brownie', 'chocolate brownie'],
    recipe: serves(
      q('cocoa_powder', 25), q('wheat_flour', 35), q('butter', 40),
      q('sugar_white', 45), q('egg_chicken', 1),
    ),
  },
  {
    nameNormalized: 'pancake',
    aliases: ['แพนเค้ก', 'pancake', 'pancakes'],
    recipe: serves(
      q('wheat_flour', 80), q('egg_chicken', 1), q('milk_fresh', 80),
      q('butter', 20), q('honey', 20), q('sugar_white', 15),
    ),
  },
  {
    nameNormalized: 'kluay_tod',
    aliases: ['กล้วยทอด', 'กล้วยแขก', 'kluay tod', 'fried banana'],
    recipe: serves(
      q('banana', 150), q('wheat_flour', 50), q('coconut_milk', 30),
      q('sugar_white', 15), q('vegetable_oil', 60),
    ),
  },
  {
    nameNormalized: 'pork_steak',
    aliases: ['สเต็กหมู', 'สเต๊กหมู', 'pork steak', 'pork chop'],
    recipe: serves(
      q('pork_loin', 180), q('potato', 100), q('carrot', 40), q('butter', 20),
      q('ketchup', 30), q('white_pepper', 2),
    ),
  },
  {
    nameNormalized: 'green_tea_iced',
    aliases: ['ชาเขียวเย็น', 'ชาเขียว', 'iced green tea', 'green tea'],
    recipe: serves(
      q('tea_green_powder', 6), q('milk_condensed_sweet', 25),
      q('sugar_white', 12), q('ice', 200),
    ),
  },
]
