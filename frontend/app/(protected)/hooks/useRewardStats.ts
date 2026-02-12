'use client'

import { useEffect, useState } from 'react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type RewardRow = {
  shop_id: string
  shop_name: string
  deliveries_total: number
  active_months: number
  deliveries_last_3m: number
  deliveries_prev_3m: number
  score: number
  rank: number
  tier: string
}

type RewardStats = {
  ready: boolean
  months_available: number
  window_months: number
  period_start: string
  period_end: string
  thresholds: {
    bronze: number
    silver: number
    gold: number
  }
  tiers: {
    Gold: number
    Silver: number
    Bronze: number
    Base: number
  }
  rows: RewardRow[]
}

export function useRewardStats(adminRegionId?: string) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [data, setData] = useState<RewardStats | null>(null)
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
        if (adminRegionId) params.set('admin_region_id', adminRegionId)
        const path = `/stats/rewards${params.toString() ? `?${params.toString()}` : ''}`
        const response = await apiGet<RewardStats>(path, session.access_token)
        setData(response)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('common.error.loadData'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [session, adminRegionId, t])

  return { data, loading, error }
}
