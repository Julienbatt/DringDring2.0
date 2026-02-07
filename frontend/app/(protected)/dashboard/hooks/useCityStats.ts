'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'

export type CityStats = {
  month: string
  previous_month: string
  total_deliveries: number
  unique_clients: number
  active_shops: number
  cms_deliveries: number
  cms_share_pct: number
  cms_unique_clients: number
  total_bags: number
  average_bags: number
  active_days: number
  deliveries_per_active_day: number
  previous_month_deliveries: number
  deliveries_change_pct: number | null
  total_subvention_chf: number
  total_volume_chf: number
  cms_subsidy_chf: number
}

export function useCityStats(month?: string) {
  const [data, setData] = useState<CityStats | null>(null)
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
        setError('Session inexistante')
        setData(null)
        return
      }

      const query = month ? `?month=${encodeURIComponent(month)}` : ''
      const result = await apiGet<CityStats>(
        `/stats/city${query}`,
        session.access_token
      )
      setData(result)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '')
      if (message.includes('403')) {
        setError('Acces reserve commune')
      } else if (message.includes('401')) {
        setError('Session expiree')
      } else {
        setError('Erreur de chargement')
      }
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}
