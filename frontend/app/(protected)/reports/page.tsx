'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMe } from '../hooks/useMe'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function ReportsContent() {
  const router = useRouter()
  const { t } = useLanguage()
  const { data, loading, error } = useMe()
  const role = data?.role

  useEffect(() => {
    if (role && ['city', 'hq', 'shop'].includes(role)) {
      router.replace('/dashboard')
    }
  }, [role, router])

  if (loading) {
    return (
      <div className="p-8 text-sm text-gray-600">
        {t('reports.page.loadingSpace')}
      </div>
    )
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>
  }

  if (!data?.role) {
    return (
      <div className="p-8 text-sm text-gray-600">
        {t('reports.page.noRole')}
      </div>
    )
  }

  if (['city', 'hq', 'shop'].includes(data.role)) {
    return <div className="p-8 text-sm text-gray-600">{t('reports.page.redirecting')}</div>
  }

  if (
    data.role === 'admin_region' ||
    data.role === 'super_admin' ||
    data.role === 'courier' ||
    data.role === 'customer'
  ) {
    return (
      <div className="p-8 text-sm text-gray-600">
        {t('reports.page.inProgress')}
      </div>
    )
  }

  return (
    <div className="p-8 text-sm text-gray-600">
      {t('reports.page.unavailable')}
    </div>
  )
}

function ReportsFallback() {
  const { t } = useLanguage()
  return <div className="p-8 text-sm text-gray-600">{t('common.loading')}</div>
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsFallback />}>
      <ReportsContent />
    </Suspense>
  )
}
