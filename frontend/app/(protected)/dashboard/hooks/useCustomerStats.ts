'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type CustomerStats = {
  month: string
  total_deliveries: number
  total_bags: number
  total_distance_km: number
  top_shop_id: string | null
  top_shop_name: string | null
  top_shop_deliveries: number
  top_day: number | null
  top_day_deliveries: number
}

export function useCustomerStats(month?: string) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [data, setData] = useState<CustomerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (month) params.set('month', month)
        const path = `/stats/customer${params.toString() ? `?${params.toString()}` : ''}`
        const response = await apiGet<CustomerStats>(path, session.access_token)
        setData(response)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('common.error.loadData'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [session, month, t])

  return { data, loading, error }
}
