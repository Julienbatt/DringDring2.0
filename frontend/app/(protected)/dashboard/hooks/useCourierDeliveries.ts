'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import * as Sentry from '@sentry/browser'
import { captureError } from '@/lib/errorReporting'

export type CourierDeliveryRow = {
    delivery_id: string
    delivery_date: string
    shop_name: string
    shop_address: string
    client_name: string | null
    client_address: string
    client_postal_code: string
    client_city: string
    time_window: string
    bags: number
    status: string
    status_updated_at: string | null
}

export function useCourierDeliveries(date?: string) {
    const { t } = useLanguage()
    const [data, setData] = useState<CourierDeliveryRow[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (silent: boolean = false) => {
        if (!silent) {
            setLoading(true)
        }
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

            const query = date ? `?date=${encodeURIComponent(date)}` : ''
            const result = await apiGet<CourierDeliveryRow[]>(
                `/deliveries/courier${query}`,
                session.access_token
            )
            setData(result)
        } catch (e: unknown) {
            captureError(e, 'courier-deliveries')
            setError(t('common.error.loadDeliveries'))
            setData(null)
        } finally {
            if (!silent) {
                setLoading(false)
            }
        }
    }, [date, t])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return
            load(true)
        }, 10000)

        return () => window.clearInterval(intervalId)
    }, [load])

    return { data, loading, error, refresh: load }
}
