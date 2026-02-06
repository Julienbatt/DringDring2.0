'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Mail, Phone, MessageCircle, FileText } from 'lucide-react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'

type SupportInfo = {
    admin_region_name: string
    contact_email: string | null
    contact_person: string | null
    phone: string | null
}

export default function CustomerSupportPage() {
    const { session } = useAuth()
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
            } catch (error) {
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
                        <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">Support</p>
                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Aide & support</h1>
                        <p className="max-w-2xl text-sm text-slate-600 md:text-base">
                            Besoin d&apos;une information rapide ou d&apos;assistance sur une livraison ? Voici les options
                            recommandees pour obtenir une reponse rapide.
                        </p>
                    </div>
                </header>

                <section className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            {supportInfo?.admin_region_name || 'Support DringDring'}
                        </div>
                        <p className="text-sm text-slate-600">
                            Pour toute question sur une livraison ou un incident.
                        </p>
                        <div className="mt-4 flex flex-col gap-2 text-sm text-slate-700">
                            <span className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-slate-400" />
                                {loading ? 'Chargement...' : supportInfo?.contact_email || 'support@dringdring.ch'}
                            </span>
                            <span className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-slate-400" />
                                {loading ? 'Chargement...' : supportInfo?.phone || '+41 79 000 00 00'}
                            </span>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <FileText className="h-4 w-4 text-emerald-600" />
                            Questions frequentes
                        </div>
                        <ul className="space-y-2 text-sm text-slate-600">
                            <li>Suivre une livraison en temps reel.</li>
                            <li>Modifier une adresse ou un numero de telephone.</li>
                            <li>Signaler un incident ou un retard.</li>
                        </ul>
                        <Link
                            href="/customer/profile"
                            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                            Gerer mes informations
                        </Link>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                            Besoin d&apos;aide rapide ?
                        </div>
                        <p className="text-sm text-slate-600">
                            Contactez-nous directement depuis vos commandes en cours pour une assistance prioritaire.
                        </p>
                        <Link
                            href="/dashboard"
                            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                            Retour au dashboard
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    )
}
