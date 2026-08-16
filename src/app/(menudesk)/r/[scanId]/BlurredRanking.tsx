'use client'

// The curiosity gap made visible (Bible §04 step 2).
//
// This component receives COLOURS AND COUNTS. It has no access to a dish name,
// a price, or a percentage, because the server never sent any — the redaction
// lives in analysis/summary.ts, and the blur here is a visual treatment, not a
// security measure. Anyone who opens devtools on this page should find exactly
// what they see on it: N rows, N colours, no menu.
//
// That distinction is the whole reason this is a separate component with a
// narrow prop type. A future edit that wants a name here has to add it to the
// payload first, which is the moment somebody should stop and think.

import { useTranslations } from 'next-intl'
import type { TrafficLight } from '@/lib/menudesk/engine'
import type { TrafficLightCounts } from '@/lib/menudesk/analysis/summary'

const DOT_CLASS: Record<TrafficLight, string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-400',
  green: 'bg-emerald-500',
}

/**
 * Widths for the redacted name bars, cycled by row index.
 *
 * Deliberately NOT derived from the real dish name. Varying the placeholder by
 * the length of the thing it hides is a classic redaction leak: it narrows a
 * guess before a single character is revealed.
 */
const BAR_WIDTHS = ['72%', '58%', '81%', '64%', '77%', '52%', '69%']

export function BlurredRanking({
  rows,
  counts,
}: {
  rows: TrafficLight[]
  counts: TrafficLightCounts
}) {
  const t = useTranslations('scanResult')

  return (
    <section className="mt-8">
      {/* Stacked, not side by side: both strings are full sentences in Thai and
          a 375px phone wraps them into each other. */}
      <h2 className="font-heading text-lg text-brand-menudesk-navy">{t('rankingTitle')}</h2>
      <p className="mt-0.5 text-sm text-brand-menudesk-navy/50">{t('lockedNote')}</p>

      <ul className="mt-3 space-y-2" aria-label={t('rankingTitle')}>
        {rows.map((light, index) => (
          <li
            key={index}
            className="flex items-center gap-3 rounded-xl border border-brand-menudesk-navy/10 bg-white px-4 py-3"
          >
            {/* The dot is sharp: the COUNT of bleeding dishes is the hook, and
                hiding it would hide the reason to unlock. */}
            <span className={`h-3 w-3 shrink-0 rounded-full ${DOT_CLASS[light]}`} />

            <span
              className="h-3 rounded bg-brand-menudesk-navy/25 blur-[3px]"
              style={{ width: BAR_WIDTHS[index % BAR_WIDTHS.length] }}
            />

            <span className="ml-auto h-3 w-10 shrink-0 rounded bg-brand-menudesk-navy/25 blur-[3px]" />
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {(['red', 'amber', 'green'] as const).map((light) => (
          <div
            key={light}
            className="rounded-xl border border-brand-menudesk-navy/10 px-2 py-3"
          >
            <dt className="text-xs text-brand-menudesk-navy/60">{t(light)}</dt>
            <dd className="mt-1 flex items-center justify-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[light]}`} />
              <span className="font-heading text-xl text-brand-menudesk-navy">
                {counts[light]}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
