'use client'

import { Suspense } from 'react'
import ShopReport from '../reports/components/ShopReport'
import HqReport from '../reports/components/HqReport'
import CourierDashboard from './components/CourierDashboard'
import CustomerDashboard from './components/CustomerDashboard'
import AdminRegionDashboard from './components/AdminRegionDashboard'
import SuperAdminDashboard from './components/SuperAdminDashboard'
import CityDashboard from './components/CityDashboard'
import { useMe } from '../hooks/useMe'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function DashboardContent() {
  const { t } = useLanguage()
  const { data, loading, error } = useMe()

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">{t('common.loading')}</div>
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>
  }

  if (!data?.role) {
    return <div className="p-8 text-sm text-gray-600">{t('common.unauthorized')}</div>
  }

  switch (data.role) {
    case 'city':
      return <CityDashboard />
    case 'shop':
      return <ShopReport />
    case 'hq':
      return <HqReport />
    case 'courier':
      return <CourierDashboard />
    case 'customer':
      return <CustomerDashboard />
    case 'admin_region':
      return <AdminRegionDashboard />
    case 'super_admin':
      return <SuperAdminDashboard />
    default:
      return (
        <div className="p-8 text-sm text-gray-600">
          {t('common.viewUnavailableRole')}: {data.role}
        </div>
      )
  }
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  )
}
