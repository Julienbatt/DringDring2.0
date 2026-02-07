'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'

export type ShopClient = {
  id: string
  name: string
  address: string | null
  postal_code: string | null
  city_name: string | null
  is_cms: boolean | null
  floor?: string | null
  door_code?: string | null
  phone?: string | null
}

export function useShopClients() {
  const [data, setData] = useState<ShopClient[] | null>(null)
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

      const result = await apiGet<ShopClient[]>(
        '/clients/shop',
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
        setError('Erreur de chargement des clients')
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
