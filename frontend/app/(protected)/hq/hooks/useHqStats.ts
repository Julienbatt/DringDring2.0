'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export type HqStats = {
  month: string
  previous_month: string
  total_deliveries: number
  unique_clients: number
  active_shops: number
  active_cities: number
  total_bags: number
  average_bags: number
  total_volume_chf: number
  total_subvention_chf: number
  total_basket_value_chf: number
  average_basket_value_chf: number
  cms_deliveries: number
  cms_share_pct: number
  cms_subsidy_chf: number
  active_days: number
  deliveries_per_active_day: number
  previous_month_deliveries: number
  deliveries_change_pct: number | null
}

export function useHqStats(month?: string, adminRegionId?: string | null) {
  const { t } = useLanguage()
  const [data, setData] = useState<HqStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) {
        setError(t('common.error.missingSession'))
        setData(null)
        return
      }

      const params = new URLSearchParams()
      if (month) params.set('month', month)
      if (adminRegionId) params.set('admin_region_id', adminRegionId)
      const query = params.toString() ? `?${params.toString()}` : ''
      const result = await apiGet<HqStats>(`/stats/hq${query}`, session.access_token)
      setData(result)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '')
      if (message.includes('403')) {
        setError(t('common.error.forbidden'))
      } else if (message.includes('401')) {
        setError(t('common.error.sessionExpired'))
      } else {
        setError(t('common.error.loadData'))
      }
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month, adminRegionId, t])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}
