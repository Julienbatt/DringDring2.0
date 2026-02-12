'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export type ShopTopClient = {
  client_id: string
  client_name: string
  deliveries: number
  bags: number
}

export type ShopStats = {
  month: string
  previous_month: string
  total_deliveries: number
  unique_clients: number
  repeat_clients: number
  repeat_rate_pct: number
  total_bags: number
  average_bags: number
  total_volume_chf: number
  cms_subsidy_chf: number
  cms_deliveries: number
  cms_share_pct: number
  total_basket_value_chf: number
  average_basket_value_chf: number
  active_days: number
  deliveries_per_active_day: number
  peak_day: string | null
  peak_day_deliveries: number
  previous_month_deliveries: number
  deliveries_change_pct: number | null
  top_clients: ShopTopClient[]
}

export function useShopStats(month?: string) {
  const { t } = useLanguage()
  const [data, setData] = useState<ShopStats | null>(null)
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

      const query = month ? `?month=${encodeURIComponent(month)}` : ''
      const result = await apiGet<ShopStats>(
        `/stats/shop${query}`,
        session.access_token
      )
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
  }, [month, t])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}
