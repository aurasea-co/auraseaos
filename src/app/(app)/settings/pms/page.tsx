'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Trash2, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { useUser } from '@/providers/user-context'

// Settings → PMS integration
//
// Lets the owner register the branch's PMS (Cloudbeds, Mews, etc) and
// the external property identifier the PMS uses for the branch. The
// hourly /api/cron/push-approved-rates worker reads this row to decide
// which provider client to call when a LINE approval needs to be
// pushed back to the PMS.
//
// Today the only active provider is the MockProvider — so configuring
// a Cloudbeds row here just changes the skip reason on the dashboard's
// approval-history badge ("Cloudbeds adapter not yet implemented" vs
// "No PMS configured"). When a real CloudbedsProvider lands, the same
// row activates the push without UI changes.
//
// Hotel-only — F&B branches see a "switch to a hotel branch" notice
// (same pattern as /settings/rooms and /settings/competitors).

const PROVIDER_OPTIONS = [
  { value: 'cloudbeds', labelKey: 'providerCloudbeds' },
  { value: 'mews', labelKey: 'providerMews' },
  { value: 'siteminder', labelKey: 'providerSiteMinder' },
  { value: 'opera', labelKey: 'providerOpera' },
] as const

type ProviderValue = (typeof PROVIDER_OPTIONS)[number]['value']

interface ConfigRow {
  id: string
  provider: ProviderValue
  external_property_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function PmsSettingsPage() {
  const { activeBranch } = useUser()
  const t = useTranslations('settingsPms')
  const isHotel = activeBranch?.business_type === 'accommodation'

  const [configs, setConfigs] = useState<ConfigRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state — single form for "add or edit". When the user edits an
  // existing config row, we pre-fill these values.
  const [provider, setProvider] = useState<ProviderValue>('cloudbeds')
  const [externalPropertyId, setExternalPropertyId] = useState('')
  const [isActive, setIsActive] = useState(true)

  const reload = useCallback(async () => {
    if (!activeBranch || !isHotel) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/pms-config`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
      } else {
        setConfigs(json.configs || [])
      }
    } finally {
      setLoading(false)
    }
  }, [activeBranch, isHotel])

  useEffect(() => { reload() }, [reload])

  // When configs load, pre-fill the form with the first row (if any).
  // Owners typically have one PMS per branch; if they have multiple
  // they can switch tabs by clicking a row's "Edit" link.
  useEffect(() => {
    if (configs.length === 0) {
      setProvider('cloudbeds')
      setExternalPropertyId('')
      setIsActive(true)
      return
    }
    const first = configs[0]
    setProvider(first.provider)
    setExternalPropertyId(first.external_property_id)
    setIsActive(first.is_active)
  }, [configs])

  const existingForProvider = useMemo(
    () => configs.find((c) => c.provider === provider) ?? null,
    [configs, provider],
  )

  async function handleSave() {
    if (!activeBranch || submitting) return
    const trimmedPid = externalPropertyId.trim()
    if (!trimmedPid) {
      setError(t('errorPropertyIdRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/branches/${activeBranch.id}/pms-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          external_property_id: trimmedPid,
          is_active: isActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.detail || json.error || res.statusText)
        return
      }
      setToast(existingForProvider ? t('toastUpdated') : t('toastCreated'))
      window.setTimeout(() => setToast(null), 3000)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(row: ConfigRow) {
    if (!activeBranch || submitting) return
    if (!window.confirm(t('confirmDelete', { provider: row.provider }))) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/branches/${activeBranch.id}/pms-config?provider=${encodeURIComponent(row.provider)}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || res.statusText)
        return
      }
      setToast(t('toastDeleted'))
      window.setTimeout(() => setToast(null), 3000)
      await reload()
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Non-hotel guard ──────────────────────────────────────────────────

  if (activeBranch && !isHotel) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px', color: 'var(--color-text-secondary)' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 8 }}>{t('title')}</h1>
        <p style={{ fontSize: 14 }}>{t('hotelOnlyNotice')}</p>
      </div>
    )
  }

  // ─── Loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500 }}>{t('title')}</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-tertiary)' }}>{t('loading')}</p>
      </div>
    )
  }

  // ─── Main ─────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: 16,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          {t('description')}
        </p>
      </div>

      {/* MockProvider notice — explains why even a saved config still
          shows "Skipped" until the real adapter ships. Honest signaling
          beats a misleading green "connected" pill. */}
      <section style={{ ...card, background: '#FFFBEB', borderColor: '#FCD34D' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle size={18} color="#92400E" style={{ marginTop: 2 }} />
          <div style={{ fontSize: 12, color: '#78350F', lineHeight: 1.6 }}>
            <strong style={{ display: 'block', marginBottom: 4, color: '#92400E', fontSize: 13 }}>
              {t('mockNoticeTitle')}
            </strong>
            {t('mockNoticeBody')}
          </div>
        </div>
      </section>

      {error && (
        <section style={{ ...card, background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B', fontSize: 13 }}>
          {error}
        </section>
      )}

      {toast && (
        <section style={{ ...card, background: '#F0FDF4', borderColor: '#BBF7D0', color: '#166534', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <CheckCircle2 size={16} /> {toast}
        </section>
      )}

      {/* Existing configs list (if any). Most owners have 1; we render
          a row per existing config with Edit / Delete actions. */}
      {configs.length > 0 && (
        <section style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, marginBottom: 10 }}>{t('currentConfigsTitle')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {configs.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  background: 'var(--color-bg-surface)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {t(providerLabelKey(c.provider))}
                    {!c.is_active && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                        · {t('disabledTag')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                    {t('propertyIdLabel')}: {c.external_property_id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProvider(c.provider)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    background: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {t('editAction')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(c)}
                  disabled={submitting}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.5 : 1,
                  }}
                  aria-label={t('deleteAction')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add / edit form */}
      <section style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0, marginBottom: 12 }}>
          {existingForProvider ? t('editConfigTitle') : t('addConfigTitle')}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('providerLabel')}</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderValue)}
              style={inputStyle}
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
              ))}
            </select>
            <p style={hintStyle}>{t('providerHint')}</p>
          </div>

          <div>
            <label style={labelStyle}>{t('propertyIdInputLabel')}</label>
            <input
              type="text"
              value={externalPropertyId}
              onChange={(e) => setExternalPropertyId(e.target.value)}
              placeholder={t(propertyIdPlaceholderKey(provider))}
              maxLength={200}
              style={inputStyle}
            />
            <p style={hintStyle}>{t(propertyIdHintKey(provider))}</p>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              {t('isActiveLabel')}
            </label>
            <p style={{ ...hintStyle, marginLeft: 24 }}>{t('isActiveHint')}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting || !externalPropertyId.trim()}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                background: 'var(--color-accent, #534AB7)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: submitting || !externalPropertyId.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !externalPropertyId.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? t('saving') : existingForProvider ? t('saveChanges') : t('connect')}
            </button>
          </div>
        </div>
      </section>

      {/* Help section — links to provider docs / contact for credentials. */}
      <section style={{ ...card, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        <strong style={{ display: 'block', marginBottom: 6, color: 'var(--color-text-primary)' }}>
          {t('helpTitle')}
        </strong>
        <p>{t('helpBody')}</p>
        <p style={{ marginTop: 8 }}>
          <Link
            href="/ratedesk"
            style={{ color: 'var(--color-accent, #534AB7)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {t('backToRatedesk')} <ExternalLink size={12} />
          </Link>
        </p>
      </section>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  marginTop: 4,
}

function providerLabelKey(p: string): string {
  switch (p) {
    case 'cloudbeds': return 'providerCloudbeds'
    case 'mews': return 'providerMews'
    case 'siteminder': return 'providerSiteMinder'
    case 'opera': return 'providerOpera'
    default: return 'providerCloudbeds'
  }
}

function propertyIdPlaceholderKey(p: ProviderValue): string {
  return `propertyIdPlaceholder_${p}`
}

function propertyIdHintKey(p: ProviderValue): string {
  return `propertyIdHint_${p}`
}
