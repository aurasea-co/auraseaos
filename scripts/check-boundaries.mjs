#!/usr/bin/env node
// Architecture guard for the MenuDesk analysis engine.
//
// The MenuDesk Bible (§13, "ขยายสู่ SEA") makes one thing load-bearing:
// the analysis logic must be portable across countries, while the data it
// reasons over (ingredient prices, recipes, dish names) and the channel it
// speaks through (LINE in Thailand, WhatsApp in Indonesia, Zalo in Vietnam)
// stay swappable. Expanding to a new market should be config, not a rewrite.
//
// That only holds if the dependency arrow points one way:
//
//   data/th  ─┐
//             ├─→  engine  (knows neither; receives both through ports)
//   delivery ─┘
//
// So src/lib/menudesk/engine is a pure-TypeScript island. It declares the
// interfaces it needs in engine/ports.ts and receives implementations by
// injection. It may not reach for Next, Supabase, the AI SDK, a country
// data set, or a delivery channel — and it may not contain Thai text or a
// baht sign, because a hardcoded Thai string is a hardcoded country.
//
// This script fails the build when that is violated. Run: npm run check:boundaries

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath rather than import.meta.dirname — the latter needs Node
// 20.11+, and this has to run on whatever Node the CI image happens to pin.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE_DIR = join(REPO_ROOT, 'src/lib/menudesk/engine')

// Each rule matches an import specifier and explains what to do instead —
// a guard that only says "no" gets deleted the first time it's inconvenient.
const FORBIDDEN_IMPORTS = [
  {
    test: (s) => s === 'next' || s.startsWith('next/'),
    why: 'the engine is framework-neutral — keep request/response handling in the route layer',
  },
  {
    test: (s) => s.startsWith('@supabase/') || s.startsWith('@/lib/supabase'),
    why: 'the engine never talks to the database — pass rows in, return values out',
  },
  {
    test: (s) => s.startsWith('@anthropic-ai/') || s.startsWith('@/lib/ai'),
    why: 'model calls belong behind a port (MenuVisionPort / RecipeInferencePort in engine/ports.ts)',
  },
  {
    test: (s) => s.startsWith('@/lib/menudesk/ai'),
    why: 'ai/ implements the engine ports — depending on it inverts the arrow',
  },
  {
    test: (s) => s.startsWith('@/lib/menudesk/data'),
    why: 'country data reaches the engine through CountryDataProvider, never by import',
  },
  {
    test: (s) => s.startsWith('@/lib/menudesk/delivery'),
    why: 'the engine returns a payload; delivery decides how to send it',
  },
  {
    test: (s) => s.startsWith('node:') || s === 'fs' || s === 'path',
    why: 'the engine must run unchanged in a browser, a test, and a CLI',
  },
  {
    test: (s) => s === 'react' || s.startsWith('react/') || s === 'react-dom',
    why: 'the engine has no UI',
  },
]

/** Relative imports may not climb out of the engine directory. */
function escapesEngine(specifier, fileDir) {
  if (!specifier.startsWith('.')) return false
  const target = resolve(fileDir, specifier)
  return !target.startsWith(ENGINE_DIR)
}

// U+0E00–U+0E7F is the Thai block; ฿ is U+0E3F and already inside it, but
// it's called out separately because a stray baht sign is the likelier slip.
const THAI_SCRIPT = /[฀-๿]/
const BAHT_SIGN = /฿/

// Matches: import ... from 'x' · export ... from 'x' · import('x') · require('x')
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

function walk(dir) {
  let out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out // engine dir absent — reported by the caller, not here
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out = out.concat(walk(full))
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(full)) out.push(full)
  }
  return out
}

const violations = []
const files = walk(ENGINE_DIR)

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const rel = relative(REPO_ROOT, file)
  const fileDir = join(file, '..')
  const lines = source.split('\n')

  for (const [i, line] of lines.entries()) {
    const lineNo = i + 1

    SPECIFIER_RE.lastIndex = 0
    let match
    while ((match = SPECIFIER_RE.exec(line)) !== null) {
      const specifier = match[1]
      const rule = FORBIDDEN_IMPORTS.find((r) => r.test(specifier))
      if (rule) {
        violations.push(`${rel}:${lineNo}  imports '${specifier}' — ${rule.why}`)
      } else if (escapesEngine(specifier, fileDir)) {
        violations.push(
          `${rel}:${lineNo}  imports '${specifier}' — relative import escapes the engine directory`,
        )
      }
    }

    // Skip the copyright-style header comments; the rule is about strings
    // the engine would emit, and prose in a comment emits nothing. Anything
    // outside a leading `//` still gets checked.
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '')
    if (BAHT_SIGN.test(code)) {
      violations.push(
        `${rel}:${lineNo}  contains a baht sign — currency formatting belongs in the presentation layer`,
      )
    } else if (THAI_SCRIPT.test(code)) {
      violations.push(
        `${rel}:${lineNo}  contains Thai text — user-facing copy belongs in messages/*.json`,
      )
    }
  }
}

if (files.length === 0) {
  console.error(
    `✗ boundary check found no files under ${relative(REPO_ROOT, ENGINE_DIR)}.\n` +
      '  The guard passes vacuously when the engine is missing, which is worse than failing.',
  )
  process.exit(1)
}

if (violations.length > 0) {
  console.error(`✗ MenuDesk engine boundary violated (${violations.length}):\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error(
    '\nThe engine is country-neutral by contract. Depend on a port in\n' +
      'src/lib/menudesk/engine/ports.ts and inject the implementation instead.\n',
  )
  process.exit(1)
}

console.log(
  `✓ MenuDesk engine boundary intact — ${files.length} file(s) checked, no framework, ` +
    'database, model, country-data, delivery, or Thai-string dependency.',
)
