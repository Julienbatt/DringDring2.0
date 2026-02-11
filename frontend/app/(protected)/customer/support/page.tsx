'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Mail, Phone, MessageCircle, FileText } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

type SupportInfo = {
    admin_region_name: string
    contact_email: string | null
    contact_person: string | null
    phone: string | null
}

export default function CustomerSupportPage() {
    const { session } = useAuth()
    const { t } = useLanguage()
    const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadSupport = async () => {
            if (!session?.access_token) {
                setLoading(false)
                return
            }
            try {
                const data = await apiGet<SupportInfo>('/clients/me/support', session.access_token)
                setSupportInfo(data)
            } catch {
                setSupportInfo(null)
            } finally {
                setLoading(false)
            }
        }

        loadSupport()
    }, [session])

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex w-full flex-col gap-6 px-4 pb-16 pt-6 md:px-8">
                <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">{t('customer.support.overline')}</p>
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">{t('customer.support.title')}</h1>
                        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
                            {t('customer.support.subtitle')}
                        </p>
                    </div>
                </header>

                <section className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            {supportInfo?.admin_region_name || t('customer.support.defaultLabel')}
                        </div>
                        <p className="text-sm text-slate-600">
                            {t('customer.support.contactHint')}
                        </p>
                        <div className="mt-4 flex flex-col gap-2 text-sm text-slate-700">
                            <span className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-slate-400" />
                                {loading ? t('common.loading') : supportInfo?.contact_email || t('customer.support.defaultEmail')}
                            </span>
                            <span className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-slate-400" />
                                {loading ? t('common.loading') : supportInfo?.phone || t('customer.support.defaultPhone')}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <FileText className="h-4 w-4 text-emerald-600" />
                            {t('customer.support.faqTitle')}
                        </div>
                        <ul className="space-y-2 text-sm text-slate-600">
                            <li>{t('customer.support.faq1')}</li>
                            <li>{t('customer.support.faq2')}</li>
                            <li>{t('customer.support.faq3')}</li>
                        </ul>
                        <Link
                            href="/customer/profile"
                            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                            {t('customer.support.manageProfile')}
                        </Link>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            {t('customer.support.quickHelpTitle')}
                        </div>
                        <p className="text-sm text-slate-600">
                            {t('customer.support.quickHelpBody')}
                        </p>
                        <Link
                            href="/dashboard"
                            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                            {t('customer.support.backToDashboard')}
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    )
}
