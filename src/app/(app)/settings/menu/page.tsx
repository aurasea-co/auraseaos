'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Plus, Trash2, Archive, ArchiveRestore, Pencil, Upload, Download } from 'lucide-react'
import { buildMenuItemsCsvTemplate } from '@/lib/ingestion/csv-menu-items'
import { useUser } from '@/providers/user-context'

// Settings → Menu items
//
// F&B branch catalog management. Mirrors /settings/competitors in
// shape: one row per item, inline edit on the price/cost/category
// cells, archive (soft-delete via is_active=false) preferred over
// hard delete so historical fnb_daily_sales rows still resolve.
//
// Hot path: owner enters their menu at onboarding, edits seasonal
// items occasionally. POS adapter (future) will write into
// fnb_daily_sales referencing the IDs created here.

interface MenuItem {
  id: string
  name: string
  category: string | null
  price_thb: number
  cost_thb: number | null
  external_item_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function MenuSettingsPage() {
  const t = useTranslations('settingsMenu')
  const { activeBranch, role } = useUser()
  const isFnb = activeBranch?.business_type === 'fnb'

  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Inline add-row state. Stays at the top of the page, not in a
  // collapsible drawer — adding 30 items in onboarding is the warmest
  // path, and a drawer adds friction per item.
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addCategory, setAddCategory] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addCost, setAddCost] = useState('')

  // Per-row edit state. Maps id → in-progress changes (string-typed so
  // empty / 0 stay distinguishable). Save-on-blur.
  const [edits, setEdits] = useState<Record<string, Partial<Record<keyof MenuItem, string>>>>({})

  // Full-row edit mode — opened by the pencil icon. Shows ALL four
  // fields (name + category + price + cost) in an inline form below
  // the row so the owner can edit everything atomically without
  // hunting for inline cells.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCost, setEditCost] = useState('')

  // CSV import state.
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<
    | null
    | { imported: number; updated: number; skipped: number; warnings: Array<{ lineNumber: number; code: string; raw: string }> }
  >(null)

  const reload = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/menu-items`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
      } else {
        setItems(json.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [activeBranch])

  useEffect(() => { reload() }, [reload])

  // Split active vs archived so we can render them in distinct
  // sections. Active items dominate the page grouped by category;
  // archived items live in a dedicated section at the bottom when
  // the "Show archived" toggle is on (so they don't blend into
  // category groups as dimmed rows the user might miss).
  const activeItems = useMemo(() => items.filter((it) => it.is_active), [items])
  const archivedItems = useMemo(() => items.filter((it) => !it.is_active), [items])

  // Group active items by category for visual structure. Items
  // without a category bucket under "—" so they stay visible.
  const activeByCategory = useMemo(() => {
    const groups = new Map<string, MenuItem[]>()
    for (const it of activeItems) {
      const key = it.category || '—'
      const arr = groups.get(key) ?? []
      arr.push(it)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [activeItems])

  async function handleAdd() {
    if (!activeBranch || submitting) return
    const name = addName.trim()
    const priceNum = Number(addPrice)
    if (!name) {
      setError(t('errorNameRequired'))
      return
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError(t('errorPriceRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: addCategory.trim() || null,
          price_thb: priceNum,
          cost_thb: addCost.trim() === '' ? null : Number(addCost),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
        return
      }
      setAddName('')
      setAddCategory('')
      setAddPrice('')
      setAddCost('')
      setToast(t('toastAdded', { name }))
      window.setTimeout(() => setToast(null), 2500)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Edit-row (pencil icon) handlers ──────────────────────────────

  function openEdit(it: MenuItem) {
    setEditingId(it.id)
    setEditName(it.name)
    setEditCategory(it.category || '')
    setEditPrice(String(it.price_thb))
    setEditCost(it.cost_thb == null ? '' : String(it.cost_thb))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditCategory('')
    setEditPrice('')
    setEditCost('')
  }

  async function saveEdit() {
    if (!editingId) return
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setError(t('errorNameRequired'))
      return
    }
    const priceNum = Number(editPrice)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError(t('errorPriceRequired'))
      return
    }
    let costPatch: number | null | undefined
    if (editCost.trim() === '') {
      costPatch = null
    } else {
      const costNum = Number(editCost)
      if (!Number.isFinite(costNum) || costNum < 0) {
        setError(t('errorCostInvalid'))
        return
      }
      costPatch = Math.round(costNum)
    }
    await patchItem(editingId, {
      name: trimmedName,
      category: editCategory.trim() || null,
      price_thb: Math.round(priceNum),
      cost_thb: costPatch ?? null,
    })
    setToast(t('toastUpdated', { name: trimmedName }))
    window.setTimeout(() => setToast(null), 2500)
    cancelEdit()
  }

  // ── CSV import handlers ──────────────────────────────────────────

  function downloadTemplate() {
    const csv = buildMenuItemsCsvTemplate()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'menu-items-template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    if (!activeBranch || importing) return
    setImporting(true)
    setImportResult(null)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/branches/${activeBranch.id}/menu-items/import`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError((json?.error as string) || res.statusText)
        return
      }
      setImportResult(json)
      await reload()
    } finally {
      setImporting(false)
    }
  }

  async function patchItem(id: string, patch: Partial<MenuItem>) {
    if (!activeBranch) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/menu-items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
        return
      }
      // Optimistic: update local state with returned row
      setItems((prev) => prev.map((it) => (it.id === id ? (json.item as MenuItem) : it)))
    } finally {
      setSubmitting(false)
    }
  }

  function commitEdit(id: string, field: keyof MenuItem) {
    const rowEdits = edits[id]
    if (!rowEdits || !(field in rowEdits)) return
    const item = items.find((it) => it.id === id)
    if (!item) return
    const raw = rowEdits[field]
    // Build the patch from the field-specific input parsing.
    if (field === 'name') {
      const v = (raw ?? '').toString().trim()
      if (!v || v === item.name) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: undefined } }))
        return
      }
      patchItem(id, { name: v })
    } else if (field === 'category') {
      const v = (raw ?? '').toString().trim()
      if ((item.category || '') === v) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: undefined } }))
        return
      }
      patchItem(id, { category: v || null })
    } else if (field === 'price_thb') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setError(t('errorPriceRequired'))
        return
      }
      if (Math.round(n) === item.price_thb) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: undefined } }))
        return
      }
      patchItem(id, { price_thb: Math.round(n) })
    } else if (field === 'cost_thb') {
      const isEmpty = raw === undefined || raw === '' || raw === null
      if (isEmpty && item.cost_thb === null) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: undefined } }))
        return
      }
      if (isEmpty) {
        patchItem(id, { cost_thb: null })
        return
      }
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        setError(t('errorCostInvalid'))
        return
      }
      if (Math.round(n) === item.cost_thb) {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: undefined } }))
        return
      }
      patchItem(id, { cost_thb: Math.round(n) })
    }
  }

  async function toggleArchive(it: MenuItem) {
    await patchItem(it.id, { is_active: !it.is_active })
    setToast(it.is_active ? t('toastArchived', { name: it.name }) : t('toastRestored', { name: it.name }))
    window.setTimeout(() => setToast(null), 2500)
  }

  async function hardDelete(it: MenuItem) {
    if (!activeBranch) return
    if (!window.confirm(t('confirmDelete', { name: it.name }))) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/branches/${activeBranch.id}/menu-items?id=${encodeURIComponent(it.id)}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
        return
      }
      setToast(t('toastDeleted', { name: it.name }))
      window.setTimeout(() => setToast(null), 2500)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Non-fnb guard ────────────────────────────────────────────────────

  if (role !== 'owner' && role !== 'manager') return null
  if (!activeBranch) return null
  if (!isFnb) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        {t('fnbOnly')}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="flex items-center gap-2 lg:hidden">
        <Link href="/settings" style={{ padding: 4, color: '#6b6b6b' }}>
          <ArrowLeft size={18} />
        </Link>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{t('title')}</h2>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2
            className="hidden lg:block"
            style={{ fontSize: 'var(--font-size-lg)', fontWeight: 500, color: 'var(--color-text-primary)', margin: 0 }}
          >
            {t('title')}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            {activeBranch.name} · {t('subtitle')}
          </p>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: archivedItems.length > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
            cursor: archivedItems.length > 0 ? 'pointer' : 'default',
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            disabled={archivedItems.length === 0}
          />
          {/* Count appended so the owner can see at a glance whether
              toggling this would actually reveal anything. Disabled
              state when zero — clearer than a checkbox that "does
              nothing" because there's nothing to show. */}
          {archivedItems.length > 0
            ? t('showArchivedWithCount', { count: archivedItems.length })
            : t('noArchivedItems')}
        </label>
      </div>

      {error && (
        <div style={{
          background: '#FBEAEA',
          border: '1px solid #F5C6C6',
          color: '#A32D2D',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {toast && (
        <div style={{
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          color: '#166534',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 13,
        }}>
          {toast}
        </div>
      )}

      {/* Two entry paths side-by-side: single-item add OR bulk CSV
          import. Most owners start with CSV at onboarding (50+ items),
          then use Add for seasonal additions later. */}
      {!showAdd ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setShowAdd(true); setError(null) }}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: 'var(--color-accent, #534AB7)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} /> {t('addItem')}
          </button>

          <label
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              borderRadius: 6,
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title={t('importHint')}
          >
            <Upload size={14} /> {importing ? t('importing') : t('importCsv')}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  handleImportFile(file)
                  e.target.value = ''  // allow re-upload of same file
                }
              }}
            />
          </label>

          <button
            type="button"
            onClick={downloadTemplate}
            title={t('templateHint')}
            style={{
              padding: '8px 12px',
              fontSize: 12,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-accent, #534AB7)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Download size={12} /> {t('downloadTemplate')}
          </button>
        </div>
      ) : (
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr)) auto auto',
          gap: 8,
          alignItems: 'end',
        }}>
          <div>
            <label style={miniLabel}>{t('colName')}</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={120}
              style={input}
              autoFocus
            />
          </div>
          <div>
            <label style={miniLabel}>{t('colCategory')}</label>
            <input
              type="text"
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              placeholder={t('categoryPlaceholder')}
              maxLength={60}
              style={input}
            />
          </div>
          <div>
            <label style={miniLabel}>{t('colPrice')}</label>
            <input
              type="number"
              inputMode="numeric"
              value={addPrice}
              onChange={(e) => setAddPrice(e.target.value)}
              placeholder="฿"
              min={0}
              style={input}
            />
          </div>
          <div>
            <label style={miniLabel}>{t('colCost')}</label>
            <input
              type="number"
              inputMode="numeric"
              value={addCost}
              onChange={(e) => setAddCost(e.target.value)}
              placeholder={t('costOptional')}
              min={0}
              style={input}
            />
          </div>
          <button type="button" onClick={handleAdd} disabled={submitting} style={primaryBtn}>
            {submitting ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            onClick={() => { setShowAdd(false); setAddName(''); setAddCategory(''); setAddPrice(''); setAddCost(''); setError(null) }}
            style={secondaryBtn}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          {t('loading')}
        </div>
      )}

      {/* CSV import result panel — surfaces above the list when an
          upload completes. Green when at least one row imported or
          updated, amber otherwise. */}
      {importResult && (
        <section
          style={{
            background: (importResult.imported + importResult.updated) > 0 ? '#F0FDF4' : '#FFFBEB',
            border: `1px solid ${(importResult.imported + importResult.updated) > 0 ? '#BBF7D0' : '#FCD34D'}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: (importResult.imported + importResult.updated) > 0 ? '#166534' : '#92400E',
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {t('importSummary', {
              imported: importResult.imported,
              updated: importResult.updated,
              skipped: importResult.skipped,
            })}
          </div>
          {importResult.warnings.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>
                {t('importWarningsToggle', { count: importResult.warnings.length })}
              </summary>
              <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 11, lineHeight: 1.5 }}>
                {importResult.warnings.slice(0, 20).map((w, i) => (
                  <li key={i}>
                    {t('importWarningLine', { line: w.lineNumber })} — {t(`importError.${w.code}`)}
                    {w.raw && (
                      <div style={{ marginTop: 2, fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--color-text-tertiary)', wordBreak: 'break-word' }}>
                        {w.raw}
                      </div>
                    )}
                  </li>
                ))}
                {importResult.warnings.length > 20 && (
                  <li style={{ color: 'var(--color-text-tertiary)' }}>
                    {t('importWarningsMore', { count: importResult.warnings.length - 20 })}
                  </li>
                )}
              </ul>
            </details>
          )}
        </section>
      )}

      {!loading && activeItems.length === 0 && archivedItems.length === 0 && (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px dashed var(--color-border)',
          borderRadius: 8,
          padding: '20px',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
          lineHeight: 1.7,
        }}>
          <div style={{ marginBottom: 10, fontWeight: 500, color: 'var(--color-text-primary)' }}>
            {t('emptyActive')}
          </div>
          <div style={{ fontSize: 12 }}>{t('emptyActiveHint')}</div>
        </div>
      )}

      {!loading && activeItems.length === 0 && archivedItems.length > 0 && !showArchived && (
        <div style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '16px 18px',
          fontSize: 13,
          color: 'var(--color-text-tertiary)',
        }}>
          {t('emptyActiveButArchived', { count: archivedItems.length })}
        </div>
      )}

      {!loading && activeByCategory.map(([categoryName, rows]) => (
        <section key={categoryName}>
          <h3 style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 6,
          }}>
            {categoryName}
          </h3>
          <div style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Column headers. MARGIN gets a hover tooltip explaining
                the formula — owners often ask "why is this red?" without
                knowing the threshold; the tooltip explains the math
                up-front. `title` attribute is enough — visible on hover
                on desktop, and a long-press shows it on mobile. */}
            <div style={{ ...rowStyle, fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ flex: 2, minWidth: 0 }}>{t('colName')}</div>
              <div style={{ flex: 1 }}>{t('colPrice')}</div>
              <div style={{ flex: 1 }}>{t('colCost')}</div>
              <div
                style={{ flex: 1, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}
                title={t('marginTooltip')}
              >
                {t('colMargin')}
              </div>
              <div style={{ width: 110 }} />
            </div>
            {rows.map((it) => {
              const editRow = edits[it.id] ?? {}
              const priceDisplay = editRow.price_thb ?? String(it.price_thb)
              const costDisplay = editRow.cost_thb ?? (it.cost_thb == null ? '' : String(it.cost_thb))
              const nameDisplay = editRow.name ?? it.name
              const margin = it.cost_thb != null && it.price_thb > 0
                ? Math.round(((it.price_thb - it.cost_thb) / it.price_thb) * 100)
                : null
              const dimmed = !it.is_active
              return (
                <Fragment key={it.id}>
                <div
                  style={{
                    ...rowStyle,
                    borderTop: '1px solid var(--color-border)',
                    opacity: dimmed ? 0.5 : 1,
                  }}
                >
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <input
                      type="text"
                      value={nameDisplay}
                      onChange={(e) => setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], name: e.target.value } }))}
                      onBlur={() => commitEdit(it.id, 'name')}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      maxLength={120}
                      style={inlineInput}
                      disabled={dimmed}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={priceDisplay}
                      onChange={(e) => setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], price_thb: e.target.value } }))}
                      onBlur={() => commitEdit(it.id, 'price_thb')}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      min={0}
                      style={inlineInput}
                      disabled={dimmed}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={costDisplay}
                      onChange={(e) => setEdits((p) => ({ ...p, [it.id]: { ...p[it.id], cost_thb: e.target.value } }))}
                      onBlur={() => commitEdit(it.id, 'cost_thb')}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      min={0}
                      placeholder={t('costOptional')}
                      style={inlineInput}
                      disabled={dimmed}
                    />
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: margin != null && margin >= 50 ? '#166534' : margin != null && margin < 30 ? '#A32D2D' : 'var(--color-text-secondary)' }}>
                    {margin != null ? `${margin}%` : '—'}
                  </div>
                  <div style={{ width: 110, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {/* Pencil — opens the row-expansion full edit form
                        (name+category+price+cost). The inline cells
                        above edit price/cost only, so the pencil is
                        the path for name/category changes. */}
                    <button
                      type="button"
                      onClick={() => openEdit(it)}
                      disabled={submitting}
                      style={iconBtn}
                      title={t('editTitle')}
                      aria-label={t('editAria', { name: it.name })}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchive(it)}
                      disabled={submitting}
                      style={iconBtn}
                      title={it.is_active ? t('archiveTitle') : t('restoreTitle')}
                      aria-label={it.is_active
                        ? t('archiveAria', { name: it.name })
                        : t('restoreAria', { name: it.name })}
                    >
                      {it.is_active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                    </button>
                    {role === 'owner' && (
                      <button
                        type="button"
                        onClick={() => hardDelete(it)}
                        disabled={submitting}
                        style={{ ...iconBtn, color: '#A32D2D' }}
                        title={t('deleteTitle')}
                        aria-label={t('deleteAria', { name: it.name })}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === it.id && (
                  <div
                    style={{
                      borderTop: '1px solid var(--color-border)',
                      background: 'var(--color-bg-surface)',
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)' }}>
                      {t('editPanelTitle')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={miniLabel}>{t('colName')}</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={120}
                          style={input}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label style={miniLabel}>{t('colCategory')}</label>
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          maxLength={60}
                          style={input}
                        />
                      </div>
                      <div>
                        <label style={miniLabel}>{t('colPrice')}</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          style={input}
                        />
                      </div>
                      <div>
                        <label style={miniLabel}>{t('colCost')}</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={editCost}
                          onChange={(e) => setEditCost(e.target.value)}
                          placeholder={t('costOptional')}
                          style={input}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={submitting}
                        style={secondaryBtn}
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={submitting}
                        style={primaryBtn}
                      >
                        {submitting ? t('saving') : t('save')}
                      </button>
                    </div>
                  </div>
                )}
              </Fragment>
              )
            })}
          </div>
        </section>
      ))}

      {/* Archived items section — only renders when the toggle is on
          AND there's something to show. Lives in its own block at the
          bottom (not interleaved with the active categories above) so
          the visual difference between "show off" and "show on" is
          obvious — was the original UX bug. */}
      {!loading && showArchived && archivedItems.length > 0 && (
        <section style={{ marginTop: 8 }}>
          <h3 style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary)',
            marginBottom: 6,
          }}>
            {t('archivedSectionTitle', { count: archivedItems.length })}
          </h3>
          <div style={{
            background: 'var(--color-bg-surface)',
            border: '1px dashed var(--color-border)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Column headers — mirror the active table's columns. */}
            <div style={{ ...rowStyle, fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ flex: 2, minWidth: 0 }}>{t('colName')}</div>
              <div style={{ flex: 1 }}>{t('colCategory')}</div>
              <div style={{ flex: 1 }}>{t('colPrice')}</div>
              <div style={{ flex: 1 }}>{t('colCost')}</div>
              <div style={{ width: 80 }} />
            </div>
            {archivedItems.map((it) => (
              <div
                key={it.id}
                style={{
                  ...rowStyle,
                  borderTop: '1px solid var(--color-border)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <div style={{ flex: 2, minWidth: 0, fontSize: 13 }}>{it.name}</div>
                <div style={{ flex: 1, fontSize: 12 }}>{it.category || '—'}</div>
                <div style={{ flex: 1, fontSize: 13 }}>{it.price_thb}</div>
                <div style={{ flex: 1, fontSize: 13 }}>{it.cost_thb ?? '—'}</div>
                <div style={{ width: 80, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => toggleArchive(it)}
                    disabled={submitting}
                    style={iconBtn}
                    title={t('restoreTitle')}
                    aria-label={t('restoreAria', { name: it.name })}
                  >
                    <ArchiveRestore size={14} />
                  </button>
                  {role === 'owner' && (
                    <button
                      type="button"
                      onClick={() => hardDelete(it)}
                      disabled={submitting}
                      style={{ ...iconBtn, color: '#A32D2D' }}
                      title={t('deleteTitle')}
                      aria-label={t('deleteAria', { name: it.name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────

const miniLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-tertiary)',
  marginBottom: 3,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
}

const inlineInput: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: 13,
  border: '1px solid transparent',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--color-text-primary)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '8px 12px',
}

const primaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 500,
  background: 'var(--color-accent, #534AB7)',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  padding: '4px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  borderRadius: 4,
}
