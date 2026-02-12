'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export type CustomerDeliveryRow = {
    delivery_id: string
    delivery_date: string
    shop_name: string
    time_window: string
    bags: number
    status: string
    status_updated_at: string | null
}

export function useCustomerDeliveries() {
    const { t } = useLanguage()
    const [data, setData] = useState<CustomerDeliveryRow[] | null>(null)
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

            // We reuse the courier logic structure but need a customer specific endpoint 
            // OR we reuse an endpoint that filters by role. 
            // For now, let's assume we need a new route or we filter client side (not secure strictly but okay for MVP if RLS handles it).
            // Actually, looking at backend, we don't have a specific `GET /deliveries/customer`.
            // Let's implement one quickly in the next step.
            const result = await apiGet<CustomerDeliveryRow[]>(
                `/deliveries/customer`,
                session.access_token
            )
            setData(result)
        } catch (e: unknown) {
            console.error(e)
            setError(t('common.error.loadOrders'))
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        load()
    }, [load])

    return { data, loading, error, refresh: load }
}
