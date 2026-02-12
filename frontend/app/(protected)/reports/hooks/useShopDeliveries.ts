'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export type ShopDeliveryRow = Record<string, unknown>

export function useShopDeliveries(month?: string) {
  const { t } = useLanguage()
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
        setError(t('common.error.missingSession'))
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
        setError(t('common.error.forbidden'))
      } else if (message.includes('401')) {
        setError(t('common.error.sessionExpired'))
      } else {
        setError(t('common.error.loadDeliveries'))
      }
      setData(null)
      setIsFrozen(false)
    } finally {
      setLoading(false)
    }
  }, [month, t])

  useEffect(() => {
    load()
  }, [load])

  return { data, isFrozen, loading, error, refresh: load }
}
