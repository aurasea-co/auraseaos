// Generate the SQL that loads the Thai catalogue into migration 043's
// `common_dishes` and `ingredient_prices` tables.
//
//   npm run seed:menudesk          # writes supabase/migrations/044_...sql
//   npm run seed:menudesk -- --check   # fails if the file is out of date
//
// The TypeScript catalogue is the source of truth; this file is a build
// artifact, committed so the SQL can be reviewed and pasted like every other
// migration in this project (there is no CLI migration flow here — see the
// README). When the concierge admin lands in W9 the DB becomes authoritative
// and this becomes its bootstrap.
//
// The output is idempotent: it upserts on the table's natural key, so pasting
// it twice is safe and re-pasting after a price revision updates in place
// rather than duplicating a country's catalogue.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { TH_INGREDIENTS } from '@/lib/menudesk/data/th/ingredients'
import { TH_COMMON_DISHES } from '@/lib/menudesk/data/th/dishes'

const OUTPUT = 'supabase/migrations/044_menudesk_th_reference_data.sql'
const COUNTRY = 'TH'

/** Single-quote a value for SQL, doubling any embedded quote. */
function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** A Postgres text[] literal. */
function sqlTextArray(values: string[]): string {
  return `array[${values.map(sql).join(', ')}]::text[]`
}

function generate(): string {
  const lines: string[] = []

  lines.push(
    '-- Migration 044: MenuDesk Thai reference data',
    '--',
    '-- GENERATED FILE — do not edit by hand.',
    '-- Source: src/lib/menudesk/data/th/{ingredients,dishes}.ts',
    '-- Regenerate: npm run seed:menudesk',
    '--',
    '-- No CLI migrations in this project: paste the whole file into the Supabase',
    '-- SQL editor and run it. Safe to re-run — every statement upserts on the',
    "-- table's natural key, so a price revision updates in place.",
    '--',
    `-- ${TH_INGREDIENTS.length} ingredients · ${TH_COMMON_DISHES.length} dishes`,
    '',
    'begin;',
    '',
    '-- ── Ingredient prices ─────────────────────────────────────────────────',
    '',
  )

  for (const ingredient of TH_INGREDIENTS) {
    lines.push(
      'insert into ingredient_prices',
      '  (country_code, ingredient_key, name_local, unit, price_low, price_high, source)',
      `values (${sql(COUNTRY)}, ${sql(ingredient.ingredientKey)}, ${sql(ingredient.nameLocal)}, ` +
        `${sql(ingredient.unit)}, ${ingredient.price.low}, ${ingredient.price.high}, ` +
        `${sql(ingredient.source)})`,
      'on conflict (country_code, ingredient_key) do update set',
      '  name_local = excluded.name_local,',
      '  unit = excluded.unit,',
      '  price_low = excluded.price_low,',
      '  price_high = excluded.price_high,',
      '  source = excluded.source,',
      '  updated_at = now();',
      '',
    )
  }

  lines.push('-- ── Common dishes ─────────────────────────────────────────────────────', '')

  for (const dish of TH_COMMON_DISHES) {
    const recipeJson = JSON.stringify({
      yieldServings: dish.recipe.yieldServings,
      lines: dish.recipe.lines,
    })

    lines.push(
      'insert into common_dishes',
      '  (country_code, name_normalized, aliases, recipe_json, is_reviewed)',
      `values (${sql(COUNTRY)}, ${sql(dish.nameNormalized)}, ${sqlTextArray(dish.aliases)}, ` +
        `${sql(recipeJson)}::jsonb, true)`,
      'on conflict (country_code, name_normalized) do update set',
      '  aliases = excluded.aliases,',
      '  recipe_json = excluded.recipe_json,',
      // Curated rows are reviewed by definition; a row promoted from model
      // inference is not, and re-running this must not launder it into one.
      '  is_reviewed = true,',
      '  version = common_dishes.version + 1,',
      '  updated_at = now();',
      '',
    )
  }

  lines.push('commit;', '')

  return lines.join('\n')
}

function main(): void {
  const generated = generate()
  const check = process.argv.includes('--check')

  if (check) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : ''
    if (current !== generated) {
      console.error(
        `✗ ${OUTPUT} is out of date with the TypeScript catalogue.\n` +
          '  Run: npm run seed:menudesk',
      )
      process.exitCode = 1
      return
    }
    console.log(`✓ ${OUTPUT} matches the catalogue.`)
    return
  }

  writeFileSync(OUTPUT, generated)
  console.log(
    `✓ wrote ${OUTPUT} — ${TH_INGREDIENTS.length} ingredients, ${TH_COMMON_DISHES.length} dishes.`,
  )
}

main()
