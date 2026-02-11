'use client'

import { Suspense } from 'react'
import HqReport from '../../reports/components/HqReport'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function HqBillingContent() {
  return <HqReport />
}

export default function HqBillingPage() {
  const { t } = useLanguage()
  return (
    <Suspense fallback={<div>{t('common.loading')}</div>}>
      <HqBillingContent />
    </Suspense>
  )
}
