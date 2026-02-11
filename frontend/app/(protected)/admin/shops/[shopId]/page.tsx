'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export default function EditShopPage() {
    const router = useRouter()
    const { t } = useLanguage()

    useEffect(() => {
        router.replace('/admin/shops')
    }, [router])

    return <div className="p-6 text-sm text-gray-500">{t('common.redirecting')}</div>
}
