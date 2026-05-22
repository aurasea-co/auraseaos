'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ChevronDown, Search } from 'lucide-react'
import Link from 'next/link'
import { HELP_SECTIONS, type HelpEntry, type HelpRole } from './help-content'

type RoleFilter = 'all' | HelpRole

const ROLE_BADGE: Record<HelpRole, { bg: string; fg: string; labelKey: string }> = {
  owner:   { bg: 'var(--color-accent-light, #EEEBFF)', fg: 'var(--color-accent-text, #534AB7)', labelKey: 'filterOwner' },
  manager: { bg: 'var(--color-amber-light, #FFF4E0)', fg: 'var(--color-amber-text, #8A5A00)', labelKey: 'filterManager' },
  staff:   { bg: 'var(--color-bg-surface, #F4F4F2)', fg: 'var(--color-text-secondary, #6b6b6b)', labelKey: 'filterStaff' },
}

export default function HelpPage() {
  const t = useTranslations('help')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Pre-translate Qs and As so the search filter can match against
  // localised strings (not just the keys).
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    return HELP_SECTIONS.map((section) => {
      const entries = section.entries
        .filter((e) => filter === 'all' || e.roles.includes(filter as HelpRole))
        .map((e) => {
          const question = t(e.questionKey)
          const answer = t(e.answerKey)
          return { ...e, question, answer }
        })
        .filter((e) =>
          q === ''
            ? true
            : e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q),
        )
      return { ...section, title: t(section.titleKey), entries }
    }).filter((s) => s.entries.length > 0)
  }, [query, filter, t])

  const filterTabs: { value: RoleFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'filterAll' },
    { value: 'owner', labelKey: 'filterOwner' },
    { value: 'manager', labelKey: 'filterManager' },
    { value: 'staff', labelKey: 'filterStaff' },
  ]

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center gap-2 lg:hidden" style={{ marginBottom: 4 }}>
        <Link
          href="/settings"
          className="touch-target"
          style={{ padding: 4, color: 'var(--color-text-tertiary)' }}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {t('title')}
        </h1>
      </div>
      <h1 className="hidden lg:block" style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {t('title')}
      </h1>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b9b9b' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          style={{
            width: '100%',
            padding: '10px 12px 10px 34px',
            border: '1px solid var(--color-border-strong, #d4d4d4)',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: 14,
            color: '#1a1a1a',
            background: '#ffffff',
            minHeight: 44,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Role filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {filterTabs.map((tab) => {
          const active = filter === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              style={{
                fontSize: 13,
                padding: '6px 12px',
                borderRadius: 999,
                border: active ? '1px solid #534AB7' : '1px solid var(--color-border, #e5e5e5)',
                background: active ? 'var(--color-accent-light, #EEEBFF)' : '#ffffff',
                color: active ? 'var(--color-accent-text, #534AB7)' : '#6b6b6b',
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
              }}
            >
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          color: '#9b9b9b',
          fontSize: 14,
          background: '#ffffff',
          border: '1px solid var(--color-border, #e5e5e5)',
          borderRadius: 'var(--radius-lg, 12px)',
        }}>
          {t('noResults')}
        </div>
      ) : (
        sections.map((section) => (
          <section
            key={section.id}
            style={{
              background: '#ffffff',
              border: '1px solid var(--color-border, #e5e5e5)',
              borderRadius: 'var(--radius-lg, 12px)',
              overflow: 'hidden',
            }}
          >
            <h2 style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1a1a',
              margin: 0,
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border, #e5e5e5)',
              background: 'var(--color-bg-surface, #fafafa)',
            }}>
              {section.title}
            </h2>
            <div>
              {section.entries.map((entry, i) => (
                <HelpAccordionItem
                  key={entry.id}
                  entry={entry}
                  isFirst={i === 0}
                  expanded={expanded.has(entry.id)}
                  onToggle={() => toggle(entry.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function HelpAccordionItem({
  entry,
  isFirst,
  expanded,
  onToggle,
}: {
  entry: HelpEntry & { question: string; answer: string }
  isFirst: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const t = useTranslations('help')

  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--color-border, #e5e5e5)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="touch-target"
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '14px 16px',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minHeight: 52,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#1a1a1a',
            lineHeight: 1.45,
          }}>
            {entry.question}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {entry.roles.map((r) => {
              const meta = ROLE_BADGE[r]
              return (
                <span
                  key={r}
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: '1px 8px',
                    borderRadius: 999,
                    background: meta.bg,
                    color: meta.fg,
                  }}
                >
                  {t(meta.labelKey)}
                </span>
              )
            })}
          </div>
        </div>
        <ChevronDown
          size={16}
          style={{
            color: '#9b9b9b',
            transition: 'transform 200ms ease',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
      </button>
      {/* Animated reveal — using grid-template-rows trick so we don't
          need to measure height. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p style={{
            fontSize: 13,
            color: '#6b6b6b',
            lineHeight: 1.6,
            margin: 0,
            padding: '0 16px 16px',
            whiteSpace: 'pre-line',
          }}>
            {entry.answer}
          </p>
        </div>
      </div>
    </div>
  )
}
