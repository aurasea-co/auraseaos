// Thailand ingredient price catalogue.
//
// Every price is a BAND, not a figure. Bible §06 sets the free tier's honest
// accuracy at ±20–40% on ingredient prices and says so to the owner every
// time: the ranking is trustworthy, the exact baht number is an estimate. A
// narrow band we cannot defend is worse than a wide band we can.
//
//
// ── Two conventions that are easy to get wrong and expensive to miss ───────
//
// 1. PRICES ARE AS-PURCHASED, and so are recipe quantities. Rice is priced
//    and counted RAW. A plate of rice is ~75g raw (it roughly triples cooked),
//    not 200g — the placeholder catalogue this replaces counted cooked grams
//    against raw prices and over-costed every rice dish by ~2.5×.
//
// 2. Prices are WHOLESALE / fresh-market level — what an independent
//    restaurant pays at Makro or a wet market buying in kilos, not the
//    supermarket shelf price. Bible §03's ICP is exactly that buyer.
//
//
// ── Provenance ────────────────────────────────────────────────────────────
//
// `source` says where each figure came from, because a catalogue whose
// accuracy nobody can audit rots silently:
//
//   'market_survey_2026_08' — read off Thai fresh-market and wholesale price
//     listings dated 7–16 August 2026 (TrueID daily fresh-food list, CheckRaka
//     multi-market pork index, Makro rice listings). Centre and spread come
//     from the published high/low across sources.
//
//   'wholesale_estimate' — no dated listing found; set from typical Thai
//     wholesale pricing with a deliberately wider band. These are the entries
//     to check first, and they are mostly seasonings used in millilitres,
//     where a 30% error moves a dish's food cost by well under a point.
//
// Re-survey the volatile lines (pork, chicken, eggs, shrimp, chilli, herbs)
// each quarter — Thai protein prices move fast, and a stale catalogue reports
// a confident wrong number, which §12 rates as the risk that ends the product.

import type { EstimateRange } from '@/lib/menudesk/engine'

export type IngredientSource = 'market_survey_2026_08' | 'wholesale_estimate'

export interface SeedIngredient {
  /** Country-neutral key. A recipe travels; only the price attached changes. */
  ingredientKey: string
  unit: 'g' | 'ml' | 'piece'
  /** Thai name, for the paid tier's cost breakdown and the concierge admin. */
  nameLocal: string
  /** THB per `unit`. Genuinely fractional at this granularity. */
  price: EstimateRange
  source: IngredientSource
}

const survey = 'market_survey_2026_08' as const
const estimate = 'wholesale_estimate' as const

export const TH_INGREDIENTS: SeedIngredient[] = [
  // ── Pork ────────────────────────────────────────────────────────────────
  // Aug 2026 market: minced 80–130/kg, belly 120–185, loin 126–148,
  // neck 140, ribs 110–145, lean 126.
  { ingredientKey: 'pork_minced', unit: 'g', nameLocal: 'หมูสับ', price: { low: 0.08, high: 0.13 }, source: survey },
  { ingredientKey: 'pork_sliced', unit: 'g', nameLocal: 'หมูเนื้อแดงหั่น', price: { low: 0.11, high: 0.14 }, source: survey },
  { ingredientKey: 'pork_belly', unit: 'g', nameLocal: 'หมูสามชั้น', price: { low: 0.12, high: 0.19 }, source: survey },
  { ingredientKey: 'pork_neck', unit: 'g', nameLocal: 'หมูสันคอ', price: { low: 0.13, high: 0.16 }, source: survey },
  { ingredientKey: 'pork_loin', unit: 'g', nameLocal: 'หมูสันนอก', price: { low: 0.12, high: 0.15 }, source: survey },
  { ingredientKey: 'pork_ribs', unit: 'g', nameLocal: 'ซี่โครงหมู', price: { low: 0.11, high: 0.15 }, source: survey },
  { ingredientKey: 'pork_crispy', unit: 'g', nameLocal: 'หมูกรอบ', price: { low: 0.22, high: 0.32 }, source: estimate },
  { ingredientKey: 'bacon', unit: 'g', nameLocal: 'เบคอน', price: { low: 0.28, high: 0.45 }, source: estimate },

  // ── Chicken ─────────────────────────────────────────────────────────────
  // Breast 68–90/kg, drumstick 85–100, leg quarter 80–90, whole 60–75 each.
  { ingredientKey: 'chicken_breast', unit: 'g', nameLocal: 'อกไก่', price: { low: 0.068, high: 0.092 }, source: survey },
  { ingredientKey: 'chicken_thigh', unit: 'g', nameLocal: 'สะโพก/น่องไก่', price: { low: 0.065, high: 0.1 }, source: survey },
  { ingredientKey: 'chicken_wing', unit: 'g', nameLocal: 'ปีกไก่', price: { low: 0.085, high: 0.11 }, source: survey },
  { ingredientKey: 'chicken_whole', unit: 'g', nameLocal: 'ไก่สดทั้งตัว', price: { low: 0.05, high: 0.07 }, source: survey },

  // ── Beef ────────────────────────────────────────────────────────────────
  { ingredientKey: 'beef_flank', unit: 'g', nameLocal: 'เนื้อสันแหลม', price: { low: 0.16, high: 0.23 }, source: survey },
  { ingredientKey: 'beef_sirloin', unit: 'g', nameLocal: 'เนื้อสันนอก', price: { low: 0.23, high: 0.26 }, source: survey },

  // ── Seafood ─────────────────────────────────────────────────────────────
  // Shrimp small 160–200/kg, medium 230–250, large 270–360; squid 145–260.
  { ingredientKey: 'shrimp_small', unit: 'g', nameLocal: 'กุ้งขาวเล็ก', price: { low: 0.16, high: 0.21 }, source: survey },
  { ingredientKey: 'shrimp_medium', unit: 'g', nameLocal: 'กุ้งขาวกลาง', price: { low: 0.23, high: 0.27 }, source: survey },
  { ingredientKey: 'shrimp_large', unit: 'g', nameLocal: 'กุ้งขาวใหญ่', price: { low: 0.27, high: 0.37 }, source: survey },
  { ingredientKey: 'squid', unit: 'g', nameLocal: 'ปลาหมึก', price: { low: 0.15, high: 0.26 }, source: survey },
  { ingredientKey: 'fish_tilapia', unit: 'g', nameLocal: 'ปลานิล', price: { low: 0.045, high: 0.06 }, source: survey },
  { ingredientKey: 'fish_dory', unit: 'g', nameLocal: 'ปลาดอรี่', price: { low: 0.07, high: 0.095 }, source: survey },
  { ingredientKey: 'fish_mackerel', unit: 'g', nameLocal: 'ปลาทู', price: { low: 0.06, high: 0.095 }, source: estimate },
  { ingredientKey: 'mussel', unit: 'g', nameLocal: 'หอยแมลงภู่', price: { low: 0.06, high: 0.1 }, source: survey },
  { ingredientKey: 'crab_stick', unit: 'g', nameLocal: 'ปูอัด', price: { low: 0.09, high: 0.13 }, source: estimate },

  // ── Eggs ────────────────────────────────────────────────────────────────
  // A tray is 30 eggs; size 3 runs 100–110 THB/tray, size 2 115–120.
  { ingredientKey: 'egg_chicken', unit: 'piece', nameLocal: 'ไข่ไก่', price: { low: 3.3, high: 4.2 }, source: survey },
  { ingredientKey: 'egg_duck', unit: 'piece', nameLocal: 'ไข่เป็ด', price: { low: 3.8, high: 5.2 }, source: survey },
  { ingredientKey: 'egg_salted', unit: 'piece', nameLocal: 'ไข่เค็ม', price: { low: 7, high: 10 }, source: estimate },

  // ── Rice, noodles, flour ────────────────────────────────────────────────
  // Jasmine rice 5kg at 195–260 THB. RAW weight — see the header.
  { ingredientKey: 'rice_jasmine', unit: 'g', nameLocal: 'ข้าวหอมมะลิ (ดิบ)', price: { low: 0.039, high: 0.055 }, source: survey },
  { ingredientKey: 'rice_sticky', unit: 'g', nameLocal: 'ข้าวเหนียว (ดิบ)', price: { low: 0.035, high: 0.052 }, source: estimate },
  { ingredientKey: 'rice_noodle_fresh', unit: 'g', nameLocal: 'เส้นก๋วยเตี๋ยวสด', price: { low: 0.025, high: 0.04 }, source: estimate },
  { ingredientKey: 'rice_noodle_dry', unit: 'g', nameLocal: 'เส้นจันท์แห้ง', price: { low: 0.055, high: 0.08 }, source: estimate },
  { ingredientKey: 'egg_noodle', unit: 'g', nameLocal: 'บะหมี่', price: { low: 0.035, high: 0.055 }, source: estimate },
  { ingredientKey: 'vermicelli_glass', unit: 'g', nameLocal: 'วุ้นเส้น', price: { low: 0.07, high: 0.1 }, source: estimate },
  { ingredientKey: 'instant_noodle', unit: 'piece', nameLocal: 'บะหมี่กึ่งสำเร็จรูป', price: { low: 5, high: 7 }, source: estimate },
  { ingredientKey: 'pasta_dry', unit: 'g', nameLocal: 'เส้นสปาเกตตี', price: { low: 0.055, high: 0.09 }, source: estimate },
  { ingredientKey: 'wheat_flour', unit: 'g', nameLocal: 'แป้งสาลี', price: { low: 0.025, high: 0.038 }, source: estimate },
  { ingredientKey: 'corn_starch', unit: 'g', nameLocal: 'แป้งข้าวโพด', price: { low: 0.03, high: 0.045 }, source: estimate },
  { ingredientKey: 'bread_slice', unit: 'piece', nameLocal: 'ขนมปังแผ่น', price: { low: 2.5, high: 4 }, source: estimate },
  { ingredientKey: 'spring_roll_wrapper', unit: 'piece', nameLocal: 'แผ่นปอเปี๊ยะ', price: { low: 1, high: 2 }, source: estimate },
  { ingredientKey: 'wonton_wrapper', unit: 'piece', nameLocal: 'แผ่นเกี๊ยว', price: { low: 0.5, high: 1 }, source: estimate },

  // ── Herbs and aromatics ─────────────────────────────────────────────────
  // Bird's-eye chilli is 35–40/kg — the placeholder catalogue had it at
  // 150–400, which alone painted every stir-fry red.
  { ingredientKey: 'holy_basil', unit: 'g', nameLocal: 'ใบกะเพรา', price: { low: 0.06, high: 0.1 }, source: estimate },
  { ingredientKey: 'thai_basil', unit: 'g', nameLocal: 'ใบโหระพา', price: { low: 0.06, high: 0.1 }, source: estimate },
  { ingredientKey: 'garlic', unit: 'g', nameLocal: 'กระเทียม', price: { low: 0.06, high: 0.085 }, source: survey },
  { ingredientKey: 'shallot', unit: 'g', nameLocal: 'หอมแดง', price: { low: 0.04, high: 0.065 }, source: estimate },
  { ingredientKey: 'onion', unit: 'g', nameLocal: 'หอมใหญ่', price: { low: 0.025, high: 0.042 }, source: estimate },
  { ingredientKey: 'spring_onion', unit: 'g', nameLocal: 'ต้นหอม', price: { low: 0.06, high: 0.075 }, source: survey },
  { ingredientKey: 'coriander', unit: 'g', nameLocal: 'ผักชี', price: { low: 0.06, high: 0.1 }, source: survey },
  { ingredientKey: 'chili_birdseye', unit: 'g', nameLocal: 'พริกขี้หนู', price: { low: 0.035, high: 0.045 }, source: survey },
  { ingredientKey: 'chili_spur', unit: 'g', nameLocal: 'พริกชี้ฟ้า', price: { low: 0.09, high: 0.16 }, source: survey },
  { ingredientKey: 'lemongrass', unit: 'g', nameLocal: 'ตะไคร้', price: { low: 0.03, high: 0.05 }, source: estimate },
  { ingredientKey: 'galangal', unit: 'g', nameLocal: 'ข่า', price: { low: 0.03, high: 0.05 }, source: estimate },
  { ingredientKey: 'kaffir_lime_leaf', unit: 'g', nameLocal: 'ใบมะกรูด', price: { low: 0.1, high: 0.2 }, source: estimate },
  { ingredientKey: 'ginger', unit: 'g', nameLocal: 'ขิง', price: { low: 0.04, high: 0.06 }, source: estimate },
  { ingredientKey: 'lime', unit: 'piece', nameLocal: 'มะนาว', price: { low: 1, high: 3 }, source: survey },
  { ingredientKey: 'mint', unit: 'g', nameLocal: 'ใบสะระแหน่', price: { low: 0.1, high: 0.18 }, source: estimate },

  // ── Vegetables ──────────────────────────────────────────────────────────
  { ingredientKey: 'morning_glory', unit: 'g', nameLocal: 'ผักบุ้ง', price: { low: 0.07, high: 0.085 }, source: survey },
  { ingredientKey: 'kale_chinese', unit: 'g', nameLocal: 'คะน้า', price: { low: 0.016, high: 0.022 }, source: survey },
  { ingredientKey: 'cabbage', unit: 'g', nameLocal: 'กะหล่ำปลี', price: { low: 0.015, high: 0.022 }, source: survey },
  { ingredientKey: 'carrot', unit: 'g', nameLocal: 'แครอท', price: { low: 0.018, high: 0.026 }, source: survey },
  { ingredientKey: 'tomato', unit: 'g', nameLocal: 'มะเขือเทศ', price: { low: 0.025, high: 0.042 }, source: estimate },
  { ingredientKey: 'cucumber', unit: 'g', nameLocal: 'แตงกวา', price: { low: 0.02, high: 0.032 }, source: estimate },
  { ingredientKey: 'beansprout', unit: 'g', nameLocal: 'ถั่วงอก', price: { low: 0.02, high: 0.032 }, source: estimate },
  { ingredientKey: 'long_bean', unit: 'g', nameLocal: 'ถั่วฝักยาว', price: { low: 0.03, high: 0.047 }, source: estimate },
  { ingredientKey: 'papaya_green', unit: 'g', nameLocal: 'มะละกอดิบ', price: { low: 0.02, high: 0.032 }, source: estimate },
  { ingredientKey: 'eggplant_thai', unit: 'g', nameLocal: 'มะเขือเปราะ', price: { low: 0.035, high: 0.052 }, source: estimate },
  { ingredientKey: 'baby_corn', unit: 'g', nameLocal: 'ข้าวโพดอ่อน', price: { low: 0.04, high: 0.062 }, source: estimate },
  { ingredientKey: 'bell_pepper', unit: 'g', nameLocal: 'พริกหวาน', price: { low: 0.06, high: 0.095 }, source: estimate },
  { ingredientKey: 'mushroom_straw', unit: 'g', nameLocal: 'เห็ดฟาง', price: { low: 0.08, high: 0.125 }, source: estimate },
  { ingredientKey: 'mushroom_shiitake', unit: 'g', nameLocal: 'เห็ดหอม', price: { low: 0.12, high: 0.19 }, source: estimate },
  { ingredientKey: 'lettuce', unit: 'g', nameLocal: 'ผักกาดหอม', price: { low: 0.04, high: 0.065 }, source: estimate },
  { ingredientKey: 'potato', unit: 'g', nameLocal: 'มันฝรั่ง', price: { low: 0.025, high: 0.038 }, source: estimate },
  { ingredientKey: 'pineapple', unit: 'g', nameLocal: 'สับปะรด', price: { low: 0.025, high: 0.042 }, source: estimate },
  // Ripe น้ำดอกไม้ for dessert, not the green eating mango the daily list
  // quotes at 30–32/kg — the dessert grade runs well above it in season.
  { ingredientKey: 'mango_ripe', unit: 'g', nameLocal: 'มะม่วงสุก', price: { low: 0.045, high: 0.085 }, source: estimate },
  { ingredientKey: 'banana', unit: 'g', nameLocal: 'กล้วย', price: { low: 0.02, high: 0.032 }, source: survey },
  // Juicing oranges (ส้มสายน้ำผึ้ง), not the 12–14/kg eating orange on the
  // daily list: at that price a fresh orange juice costs 8% of its menu price,
  // which is not a believable margin for a drink a café squeezes to order.
  { ingredientKey: 'orange', unit: 'g', nameLocal: 'ส้มคั้นน้ำ', price: { low: 0.035, high: 0.055 }, source: estimate },
  { ingredientKey: 'tofu_firm', unit: 'g', nameLocal: 'เต้าหู้แข็ง', price: { low: 0.04, high: 0.062 }, source: estimate },
  { ingredientKey: 'tofu_soft', unit: 'g', nameLocal: 'เต้าหู้อ่อน', price: { low: 0.035, high: 0.052 }, source: estimate },

  // ── Sauces, seasonings, fats ────────────────────────────────────────────
  // Cooking oil is 50–58 THB/L across palm and soybean at Aug 2026 listings.
  { ingredientKey: 'vegetable_oil', unit: 'ml', nameLocal: 'น้ำมันพืช', price: { low: 0.048, high: 0.062 }, source: survey },
  { ingredientKey: 'sesame_oil', unit: 'ml', nameLocal: 'น้ำมันงา', price: { low: 0.15, high: 0.26 }, source: estimate },
  { ingredientKey: 'fish_sauce', unit: 'ml', nameLocal: 'น้ำปลา', price: { low: 0.035, high: 0.055 }, source: estimate },
  { ingredientKey: 'soy_sauce_light', unit: 'ml', nameLocal: 'ซีอิ๊วขาว', price: { low: 0.03, high: 0.048 }, source: estimate },
  { ingredientKey: 'soy_sauce_dark', unit: 'ml', nameLocal: 'ซีอิ๊วดำ', price: { low: 0.035, high: 0.055 }, source: estimate },
  { ingredientKey: 'seasoning_sauce', unit: 'ml', nameLocal: 'ซอสปรุงรส', price: { low: 0.04, high: 0.065 }, source: estimate },
  { ingredientKey: 'oyster_sauce', unit: 'ml', nameLocal: 'ซอสหอยนางรม', price: { low: 0.045, high: 0.075 }, source: estimate },
  { ingredientKey: 'vinegar', unit: 'ml', nameLocal: 'น้ำส้มสายชู', price: { low: 0.015, high: 0.026 }, source: estimate },
  { ingredientKey: 'ketchup', unit: 'ml', nameLocal: 'ซอสมะเขือเทศ', price: { low: 0.04, high: 0.065 }, source: estimate },
  { ingredientKey: 'sriracha', unit: 'ml', nameLocal: 'ซอสพริกศรีราชา', price: { low: 0.045, high: 0.075 }, source: estimate },
  { ingredientKey: 'mayonnaise', unit: 'ml', nameLocal: 'มายองเนส', price: { low: 0.08, high: 0.13 }, source: estimate },
  { ingredientKey: 'palm_sugar', unit: 'g', nameLocal: 'น้ำตาลปี๊บ', price: { low: 0.045, high: 0.075 }, source: estimate },
  { ingredientKey: 'sugar_white', unit: 'g', nameLocal: 'น้ำตาลทราย', price: { low: 0.022, high: 0.032 }, source: estimate },
  { ingredientKey: 'salt', unit: 'g', nameLocal: 'เกลือ', price: { low: 0.008, high: 0.016 }, source: estimate },
  { ingredientKey: 'white_pepper', unit: 'g', nameLocal: 'พริกไทยขาว', price: { low: 0.3, high: 0.5 }, source: estimate },
  { ingredientKey: 'curry_powder', unit: 'g', nameLocal: 'ผงกะหรี่', price: { low: 0.15, high: 0.26 }, source: estimate },
  { ingredientKey: 'chili_flakes', unit: 'g', nameLocal: 'พริกป่น', price: { low: 0.12, high: 0.2 }, source: estimate },
  { ingredientKey: 'tamarind_paste', unit: 'g', nameLocal: 'น้ำมะขามเปียก', price: { low: 0.06, high: 0.095 }, source: estimate },
  { ingredientKey: 'coconut_milk', unit: 'ml', nameLocal: 'กะทิ', price: { low: 0.045, high: 0.07 }, source: estimate },
  { ingredientKey: 'curry_paste_green', unit: 'g', nameLocal: 'พริกแกงเขียวหวาน', price: { low: 0.09, high: 0.145 }, source: estimate },
  { ingredientKey: 'curry_paste_red', unit: 'g', nameLocal: 'พริกแกงเผ็ด', price: { low: 0.09, high: 0.145 }, source: estimate },
  { ingredientKey: 'curry_paste_massaman', unit: 'g', nameLocal: 'พริกแกงมัสมั่น', price: { low: 0.12, high: 0.19 }, source: estimate },
  { ingredientKey: 'curry_paste_panang', unit: 'g', nameLocal: 'พริกแกงพะแนง', price: { low: 0.1, high: 0.16 }, source: estimate },
  { ingredientKey: 'curry_paste_sour', unit: 'g', nameLocal: 'พริกแกงส้ม', price: { low: 0.09, high: 0.145 }, source: estimate },
  { ingredientKey: 'chili_paste_roasted', unit: 'g', nameLocal: 'น้ำพริกเผา', price: { low: 0.09, high: 0.145 }, source: estimate },
  { ingredientKey: 'soybean_paste', unit: 'g', nameLocal: 'เต้าเจี้ยว', price: { low: 0.05, high: 0.085 }, source: estimate },
  { ingredientKey: 'peanut_roasted', unit: 'g', nameLocal: 'ถั่วลิสงคั่ว', price: { low: 0.1, high: 0.17 }, source: estimate },
  { ingredientKey: 'cashew_nut', unit: 'g', nameLocal: 'เม็ดมะม่วงหิมพานต์', price: { low: 0.35, high: 0.6 }, source: estimate },
  { ingredientKey: 'dried_shrimp', unit: 'g', nameLocal: 'กุ้งแห้ง', price: { low: 0.25, high: 0.42 }, source: estimate },
  { ingredientKey: 'rice_powder_roasted', unit: 'g', nameLocal: 'ข้าวคั่ว', price: { low: 0.08, high: 0.13 }, source: estimate },

  // ── Café: dairy, coffee, tea ────────────────────────────────────────────
  // Thai tea powder is ~60 THB per 450g bag (≈133/kg); roasted arabica runs
  // 400–700/kg wholesale in 1kg bags, which is the single most cost-relevant
  // line for a café and worth re-checking against the shop's own invoice.
  { ingredientKey: 'milk_fresh', unit: 'ml', nameLocal: 'นมสด', price: { low: 0.05, high: 0.068 }, source: estimate },
  { ingredientKey: 'milk_condensed_sweet', unit: 'ml', nameLocal: 'นมข้นหวาน', price: { low: 0.07, high: 0.1 }, source: estimate },
  { ingredientKey: 'milk_evaporated', unit: 'ml', nameLocal: 'นมข้นจืด', price: { low: 0.06, high: 0.09 }, source: estimate },
  { ingredientKey: 'whipping_cream', unit: 'ml', nameLocal: 'วิปครีม', price: { low: 0.15, high: 0.23 }, source: estimate },
  { ingredientKey: 'butter', unit: 'g', nameLocal: 'เนย', price: { low: 0.25, high: 0.42 }, source: estimate },
  { ingredientKey: 'cheese_mozzarella', unit: 'g', nameLocal: 'ชีสมอสซาเรลล่า', price: { low: 0.25, high: 0.37 }, source: estimate },
  { ingredientKey: 'coffee_bean_arabica', unit: 'g', nameLocal: 'เมล็ดกาแฟอาราบิก้า', price: { low: 0.4, high: 0.72 }, source: estimate },
  { ingredientKey: 'tea_thai_powder', unit: 'g', nameLocal: 'ผงชาไทย', price: { low: 0.13, high: 0.21 }, source: survey },
  { ingredientKey: 'tea_green_powder', unit: 'g', nameLocal: 'ผงชาเขียว/มัทฉะ', price: { low: 0.5, high: 1.2 }, source: estimate },
  { ingredientKey: 'cocoa_powder', unit: 'g', nameLocal: 'ผงโกโก้', price: { low: 0.25, high: 0.46 }, source: estimate },
  { ingredientKey: 'honey', unit: 'ml', nameLocal: 'น้ำผึ้ง', price: { low: 0.2, high: 0.36 }, source: estimate },
  { ingredientKey: 'syrup_flavored', unit: 'ml', nameLocal: 'ไซรัป', price: { low: 0.12, high: 0.21 }, source: estimate },
  // Cheap, but a 200g cup of it is not free, and leaving it out understates
  // every iced drink on a Thai café menu.
  { ingredientKey: 'ice', unit: 'g', nameLocal: 'น้ำแข็ง', price: { low: 0.0015, high: 0.003 }, source: estimate },
]

/** Keys whose price is a survey reading rather than an estimate. */
export function surveyedIngredientKeys(): string[] {
  return TH_INGREDIENTS.filter((i) => i.source === survey).map((i) => i.ingredientKey)
}
