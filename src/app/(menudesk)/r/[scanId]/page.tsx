'use client'

// Scan result — the blurred view (W4), then the full ranking after unlock (W6).
//
// W0 PLACEHOLDER. It renders the estimate disclaimer now because that label is
// not decoration: Bible §06 makes "ประเมิน" a standing promise that the free
// tier's baht figures are a band, not a fact, and §12 rates one owner catching
// us guessing as the risk that ends the product. Whatever fills this page must
// keep the badge and the note.
//
// The route is public — src/middleware.ts lets /r/ through unauthenticated, and
// migration 043's RLS scopes the underlying rows to the scan's owner.

import { useTranslations } from 'next-intl'

export default function ScanResultPage({
  params,
}: {
  params: { scanId: string }
}) {
  const t = useTranslations('scan')

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-12">
      <h1 className="font-heading text-2xl leading-heading text-brand-menudesk-navy">
        {t('resultTitle')}
      </h1>

      <span className="mt-4 inline-block rounded-full bg-brand-menudesk-purple/10 px-3 py-1 text-sm font-medium text-brand-menudesk-purple">
        {t('estimateBadge')}
      </span>

      <p className="mt-3 text-sm leading-body text-brand-menudesk-navy/60">
        {t('estimateNote')}
      </p>

      <p className="mt-8 text-sm text-brand-menudesk-navy/50">
        {t('comingSoon')} — scan <code>{params.scanId}</code>
      </p>
    </main>
  )
}
