'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'

export type ShopDeliveryRow = Record<string, unknown>

export function useShopDeliveries(month?: string) {
  const [data, setData] = useState<ShopDeliveryRow[] | null>(null)
  const [isFrozen, setIsFrozen] = useState(false)
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
      const result = await apiGet<{
        rows: ShopDeliveryRow[]
        is_frozen: boolean
      }>(
        `/deliveries/shop${query}`,
        session.access_token
      )
      setData(result.rows)
      setIsFrozen(result.is_frozen)
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
      setIsFrozen(false)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  return { data, isFrozen, loading, error, refresh: load }
}
