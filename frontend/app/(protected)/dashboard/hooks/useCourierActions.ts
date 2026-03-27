'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiPost } from '@/lib/api'
import { captureError } from '@/lib/errorReporting'

export function useCourierActions() {
    const [updating, setUpdating] = useState<string | null>(null)

    const updateStatus = async (deliveryId: string, status: 'picked_up' | 'delivered' | 'issue') => {
        setUpdating(deliveryId)
        try {
            const supabase = createClient()
            const { data: sessionData } = await supabase.auth.getSession()
            const session = sessionData.session
            if (!session) return false

            await apiPost(
                `/deliveries/${deliveryId}/status?status=${status}`,
                {},
                session.access_token
            )
            return true
        } catch (e) {
            captureError(e, 'courier-status-update')
            return false
        } finally {
            setUpdating(null)
        }
    }

    return { updateStatus, updating }
}
