'use client'

import { Suspense } from 'react'
import HqReport from '../reports/components/HqReport'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function HqDashboardContent() {
  return <HqReport />
}

export default function HqDashboardPage() {
  const { t } = useLanguage()
  return (
    <Suspense fallback={<div>{t('common.loading')}</div>}>
      <HqDashboardContent />
    </Suspense>
  )
}
