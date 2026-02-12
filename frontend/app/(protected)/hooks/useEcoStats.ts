'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type EcoStats = {
  distance_km: number
  co2_saved_kg: number
  deliveries: number
  month: string
}

export function useEcoStats(month?: string, adminRegionId?: string) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [data, setData] = useState<EcoStats | null>(null)
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
        if (adminRegionId) params.set('admin_region_id', adminRegionId)
        const path = `/stats/eco${params.toString() ? `?${params.toString()}` : ''}`
        const response = await apiGet<EcoStats>(path, session.access_token)
        setData(response)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('common.error.loadData'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [session, month, adminRegionId, t])

  return { data, loading, error }
}
