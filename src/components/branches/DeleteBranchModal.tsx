'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, AlertTriangle } from 'lucide-react'

// Owner-facing "Delete branch" modal. The shape changes based on
// whether the branch has any recorded data:
//   - no data → straight confirmation with a red Delete button
//   - has data → adds an amber warning banner and requires the
//                owner to type the branch name verbatim to enable
//                the Delete button. Prevents accidental destruction
//                of history.
//
// Accessibility: role="dialog", aria-modal, focus trap (auto-focus
// on the first input or the close button), Esc closes.

interface Props {
  branchName: string
  dataRows: number
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function DeleteBranchModal({ branchName, dataRows, onCancel, onConfirm }: Props) {
  const t = useTranslations('settingsBranches')
  const [typedName, setTypedName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasData = dataRows > 0
  const canDelete = !hasData || typedName.trim() === branchName

  useEffect(() => {
    if (hasData) inputRef.current?.focus()
    else closeRef.current?.focus()
  }, [hasData])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function handleConfirm() {
    if (!canDelete || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'))
      setDeleting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-branch-title"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: 24,
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
          <h3 id="delete-branch-title" style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
            {t('deleteModalTitle')}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: '#9b9b9b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.6, margin: '0 0 14px' }}>
          {t('deleteModalBody', { name: branchName })}
        </p>

        {hasData && (
          <div style={{
            background: '#FFF4E0',
            border: '1px solid #FCD9A0',
            color: '#8A5A00',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            lineHeight: 1.5,
            marginBottom: 14,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
            <span>{t('deleteModalDataWarning', { rows: dataRows })}</span>
          </div>
        )}

        {hasData && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b' }}>
              {t('deleteModalTypeToConfirm')}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={branchName}
              style={{
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #d4d4d4',
                borderRadius: 8,
                color: '#1a1a1a',
                background: '#ffffff',
              }}
            />
          </label>
        )}

        {error && (
          <div style={{
            fontSize: 12,
            color: '#A32D2D',
            background: '#FBEAEA',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid #d4d4d4',
              borderRadius: 8,
              background: 'transparent',
              color: '#3a3a3a',
              cursor: deleting ? 'not-allowed' : 'pointer',
              minHeight: 40,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canDelete || deleting}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              background: canDelete && !deleting ? '#A32D2D' : '#dca6a6',
              color: '#ffffff',
              cursor: canDelete && !deleting ? 'pointer' : 'not-allowed',
              minHeight: 40,
            }}
          >
            {deleting ? t('deleting') : hasData ? t('deleteCtaWithData') : t('deleteCta')}
          </button>
        </div>
      </div>
    </div>
  )
}
