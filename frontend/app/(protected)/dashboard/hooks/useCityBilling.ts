'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'

export type CityBillingRow = Record<string, unknown>

export function useCityBilling(month?: string) {
  const [data, setData] = useState<CityBillingRow[] | null>(null)
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
      const res = await apiGet<CityBillingRow[]>(
        `/reports/city-billing${query}`,
        session.access_token
      )

      setData(res)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '')

      if (message.includes('403')) {
        setError('Acces interdit : role insuffisant')
      } else if (message.includes('401')) {
        setError('Session expiree')
      } else {
        setError('Erreur lors du chargement des donnees')
      }

      setData(null)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  return {
    data,
    loading,
    error,
    refresh: load,
  }
}
