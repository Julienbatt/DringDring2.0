'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'

export type ShopPeriodRow = {
  period_month: string
  frozen_at: string
  frozen_by: string
  frozen_by_name?: string | null
  comment?: string | null
  shop_id?: string
  shop_name?: string | null
  deliveries?: number | string | null
  amount_ttc?: number | string | null
}

export function useShopPeriods() {
  const [data, setData] = useState<ShopPeriodRow[] | null>(null)
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

      const result = await apiGet<ShopPeriodRow[]>(
        '/reports/shop-periods',
        session.access_token
      )
      setData(result)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '')
      if (message.includes('403')) {
        setError('Acces reserve shop')
      } else if (message.includes('401')) {
        setError('Session expiree')
      } else {
        setError('Erreur de chargement')
      }
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, refresh: load }
}
