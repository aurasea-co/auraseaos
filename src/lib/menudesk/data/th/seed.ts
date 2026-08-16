// Thailand seed data — placeholder shapes, not the real catalogue.
//
// W3 replaces this with the ~100 CommonDish recipes and Makro-level ingredient
// prices loaded from the `common_dishes` / `ingredient_prices` tables
// (migration 043). What matters at W0 is that the SHAPE is right, so swapping
// the source is a change to this directory and nothing else — that is the
// whole SEA-expansion bet in Bible §13.
//
// Quantities are grams / millilitres / pieces. Prices are THB per unit, and
// are genuinely fractional at this granularity (garlic is not 1 baht a gram),
// which is why ingredient_prices stores NUMERIC while a printed menu price
// stores INTEGER. See AURASEA_HOUSE_STYLE.md — THB, never satang.

import type { IngredientPrice, Recipe } from '@/lib/menudesk/engine'

/**
 * Price bands are wide on purpose. Bible §06 puts the free tier's honest
 * accuracy at ±20–40% on ingredient prices, and a narrow band we cannot
 * defend is worse than a wide band we can.
 */
export const TH_INGREDIENT_PRICES: IngredientPrice[] = [
  { ingredientKey: 'pork_minced', unit: 'g', price: { low: 0.16, high: 0.24 } },
  { ingredientKey: 'pork_belly', unit: 'g', price: { low: 0.18, high: 0.26 } },
  { ingredientKey: 'chicken_thigh', unit: 'g', price: { low: 0.09, high: 0.14 } },
  { ingredientKey: 'shrimp_medium', unit: 'g', price: { low: 0.35, high: 0.55 } },
  { ingredientKey: 'rice_jasmine', unit: 'g', price: { low: 0.03, high: 0.05 } },
  { ingredientKey: 'rice_noodle_fresh', unit: 'g', price: { low: 0.04, high: 0.07 } },
  { ingredientKey: 'egg_chicken', unit: 'piece', price: { low: 4.0, high: 6.0 } },
  { ingredientKey: 'holy_basil', unit: 'g', price: { low: 0.08, high: 0.18 } },
  { ingredientKey: 'garlic', unit: 'g', price: { low: 0.07, high: 0.13 } },
  { ingredientKey: 'chili_birdseye', unit: 'g', price: { low: 0.15, high: 0.4 } },
  { ingredientKey: 'fish_sauce', unit: 'ml', price: { low: 0.03, high: 0.06 } },
  { ingredientKey: 'oyster_sauce', unit: 'ml', price: { low: 0.05, high: 0.09 } },
  { ingredientKey: 'palm_sugar', unit: 'g', price: { low: 0.05, high: 0.09 } },
  { ingredientKey: 'vegetable_oil', unit: 'ml', price: { low: 0.05, high: 0.08 } },
  { ingredientKey: 'coconut_milk', unit: 'ml', price: { low: 0.04, high: 0.07 } },
  { ingredientKey: 'curry_paste_green', unit: 'g', price: { low: 0.12, high: 0.22 } },
  { ingredientKey: 'tamarind_paste', unit: 'g', price: { low: 0.12, high: 0.2 } },
  { ingredientKey: 'peanut_roasted', unit: 'g', price: { low: 0.18, high: 0.3 } },
  { ingredientKey: 'beansprout', unit: 'g', price: { low: 0.02, high: 0.05 } },
  { ingredientKey: 'tofu_firm', unit: 'g', price: { low: 0.06, high: 0.11 } },
  { ingredientKey: 'milk_fresh', unit: 'ml', price: { low: 0.04, high: 0.07 } },
  { ingredientKey: 'coffee_bean_arabica', unit: 'g', price: { low: 0.55, high: 1.1 } },
]

export interface SeedCommonDish {
  /** Canonical key — country-neutral, so a Vietnamese `pad_thai` can reuse it. */
  nameNormalized: string
  /** Printed spellings that resolve to this dish, normalized form included. */
  aliases: string[]
  recipe: Recipe
}

export const TH_COMMON_DISHES: SeedCommonDish[] = [
  {
    nameNormalized: 'pad_krapao_moo',
    aliases: ['ผัดกะเพราหมู', 'ผัดกระเพราหมู', 'กะเพราหมูสับ', 'pad krapao moo', 'basil pork'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'pork_minced', quantity: 120, unit: 'g' },
        { ingredientKey: 'holy_basil', quantity: 15, unit: 'g' },
        { ingredientKey: 'garlic', quantity: 10, unit: 'g' },
        { ingredientKey: 'chili_birdseye', quantity: 8, unit: 'g' },
        { ingredientKey: 'oyster_sauce', quantity: 15, unit: 'ml' },
        { ingredientKey: 'fish_sauce', quantity: 10, unit: 'ml' },
        { ingredientKey: 'vegetable_oil', quantity: 15, unit: 'ml' },
        { ingredientKey: 'rice_jasmine', quantity: 200, unit: 'g' },
      ],
    },
  },
  {
    nameNormalized: 'pad_thai_goong',
    aliases: ['ผัดไทยกุ้ง', 'ผัดไทกุ้ง', 'pad thai goong', 'pad thai shrimp'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'rice_noodle_fresh', quantity: 150, unit: 'g' },
        { ingredientKey: 'shrimp_medium', quantity: 70, unit: 'g' },
        { ingredientKey: 'egg_chicken', quantity: 1, unit: 'piece' },
        { ingredientKey: 'tofu_firm', quantity: 30, unit: 'g' },
        { ingredientKey: 'beansprout', quantity: 50, unit: 'g' },
        { ingredientKey: 'tamarind_paste', quantity: 20, unit: 'g' },
        { ingredientKey: 'palm_sugar', quantity: 15, unit: 'g' },
        { ingredientKey: 'fish_sauce', quantity: 15, unit: 'ml' },
        { ingredientKey: 'peanut_roasted', quantity: 10, unit: 'g' },
        { ingredientKey: 'vegetable_oil', quantity: 20, unit: 'ml' },
      ],
    },
  },
  {
    nameNormalized: 'green_curry_chicken',
    aliases: ['แกงเขียวหวานไก่', 'เขียวหวานไก่', 'green curry chicken', 'gaeng keow wan gai'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'chicken_thigh', quantity: 130, unit: 'g' },
        { ingredientKey: 'coconut_milk', quantity: 200, unit: 'ml' },
        { ingredientKey: 'curry_paste_green', quantity: 30, unit: 'g' },
        { ingredientKey: 'palm_sugar', quantity: 10, unit: 'g' },
        { ingredientKey: 'fish_sauce', quantity: 15, unit: 'ml' },
        { ingredientKey: 'rice_jasmine', quantity: 200, unit: 'g' },
      ],
    },
  },
  {
    nameNormalized: 'khao_moo_krob',
    aliases: ['ข้าวหมูกรอบ', 'หมูกรอบ', 'khao moo krob', 'crispy pork rice'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'pork_belly', quantity: 150, unit: 'g' },
        { ingredientKey: 'rice_jasmine', quantity: 200, unit: 'g' },
        { ingredientKey: 'vegetable_oil', quantity: 30, unit: 'ml' },
        { ingredientKey: 'garlic', quantity: 8, unit: 'g' },
      ],
    },
  },
  {
    nameNormalized: 'latte_hot',
    aliases: ['ลาเต้', 'ลาเต้ร้อน', 'latte', 'cafe latte'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'coffee_bean_arabica', quantity: 18, unit: 'g' },
        { ingredientKey: 'milk_fresh', quantity: 180, unit: 'ml' },
      ],
    },
  },
  {
    nameNormalized: 'khai_jiao',
    aliases: ['ไข่เจียว', 'ข้าวไข่เจียว', 'khai jiao', 'thai omelette'],
    recipe: {
      yieldServings: 1,
      lines: [
        { ingredientKey: 'egg_chicken', quantity: 2, unit: 'piece' },
        { ingredientKey: 'fish_sauce', quantity: 5, unit: 'ml' },
        { ingredientKey: 'vegetable_oil', quantity: 40, unit: 'ml' },
        { ingredientKey: 'rice_jasmine', quantity: 200, unit: 'g' },
      ],
    },
  },
]
