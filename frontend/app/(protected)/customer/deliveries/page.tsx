'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Package, Clock, ShoppingBag, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react'

type CustomerDelivery = {
    delivery_id: string
    delivery_date: string
    shop_name: string
    time_window: string
    bags: number
    status: string | null
    status_updated_at: string | null
}

export default function CustomerDeliveriesPage() {
    const { session } = useAuth()
    const [deliveries, setDeliveries] = useState<CustomerDelivery[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'delivered'>('all')
    const currentMonth = format(new Date(), 'yyyy-MM')
    const { data: ecoStats, loading: ecoLoading } = useEcoStats(currentMonth)
    const monthlyDeliveries = useMemo(() => {
        return deliveries.filter((item) => format(new Date(item.delivery_date), 'yyyy-MM') === currentMonth)
    }, [deliveries, currentMonth])

    const loadDeliveries = useCallback(async () => {
        try {
            if (!session?.access_token) return
            const data = await apiGet<CustomerDelivery[]>('/deliveries/customer', session.access_token)
            setDeliveries(data)
        } catch (error) {
            console.error('Failed to load deliveries', error)
        } finally {
            setLoading(false)
        }
    }, [session])

    useEffect(() => {
        if (session?.access_token) {
            loadDeliveries()
        }
    }, [session, loadDeliveries])

    const totals = useMemo(() => {
        const delivered = deliveries.filter((item) => item.status === 'delivered').length
        const active = deliveries.filter((item) => item.status && item.status !== 'delivered').length
        return { delivered, active, total: deliveries.length }
    }, [deliveries])

    const filteredDeliveries = useMemo(() => {
        if (statusFilter === 'all') return deliveries
        if (statusFilter === 'delivered') return deliveries.filter((item) => item.status === 'delivered')
        return deliveries.filter((item) => item.status && item.status !== 'delivered')
    }, [deliveries, statusFilter])

    const grouped = useMemo(() => {
        const groups: Record<string, CustomerDelivery[]> = {}
        filteredDeliveries.forEach((delivery) => {
            const label = format(new Date(delivery.delivery_date), 'MMMM yyyy', { locale: fr })
            if (!groups[label]) groups[label] = []
            groups[label].push(delivery)
        })
        return groups
    }, [filteredDeliveries])

    const statusConfig = (status: string | null) => {
        switch (status) {
            case 'delivered':
                return { label: 'Livree', tone: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 }
            case 'picked_up':
                return { label: 'En route', tone: 'text-sky-700 bg-sky-50 border-sky-200', icon: MapPin }
            case 'issue':
                return { label: 'Incident', tone: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle }
            case 'cancelled':
                return { label: 'Annulee', tone: 'text-slate-500 bg-slate-100 border-slate-200', icon: AlertTriangle }
            default:
                return { label: 'Planifiee', tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock }
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Chargement de vos livraisons...</div>
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex w-full flex-col gap-8 px-4 pb-16 pt-6 md:px-8">
                <header className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Historique des livraisons</h1>
                            <p className="text-sm text-slate-600 md:text-base">
                                Suivez l&apos;etat de vos commandes en cours et passees.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            {totals.active} en cours
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Livraisons (mois)</p>
                            <p className="text-2xl font-semibold text-slate-900">
                                {ecoLoading || !ecoStats ? monthlyDeliveries.length : ecoStats.deliveries}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">En cours</p>
                            <p className="text-2xl font-semibold text-sky-700">{totals.active}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Livrees</p>
                            <p className="text-2xl font-semibold text-emerald-700">{totals.delivered}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">CO2 economise (kg)</p>
                            <p className="text-2xl font-semibold text-emerald-700">
                                {ecoLoading || !ecoStats ? '-' : ecoStats.co2_saved_kg.toFixed(1)}
                            </p>
                            <p className="text-xs text-slate-400">
                                {ecoLoading || !ecoStats ? '' : `${ecoStats.distance_km.toFixed(1)} km a velo`}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { value: 'all', label: 'Tout' },
                            { value: 'active', label: 'En cours' },
                            { value: 'delivered', label: 'Livrees' },
                        ].map((item) => (
                            <button
                                key={item.value}
                                onClick={() => setStatusFilter(item.value as typeof statusFilter)}
                                className={`rounded-full px-4 py-1 text-xs font-semibold transition ${
                                    statusFilter === item.value
                                        ? 'bg-emerald-600 text-white'
                                        : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </header>

                {filteredDeliveries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
                        <Package className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                        <h3 className="text-lg font-semibold text-slate-900">Aucune livraison</h3>
                        <p className="text-sm text-slate-500">Aucune livraison ne correspond a ce filtre.</p>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {Object.entries(grouped).map(([month, monthDeliveries]) => (
                            <div key={month} className="space-y-4">
                                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{month}</h2>
                                <div className="space-y-4 border-l border-slate-200 pl-6">
                                    {monthDeliveries.map((delivery) => {
                                        const status = statusConfig(delivery.status)
                                        const StatusIcon = status.icon
                                        const updatedAt = delivery.status_updated_at || delivery.delivery_date
                                        const updatedLabel = updatedAt
                                            ? format(new Date(updatedAt), 'HH:mm', { locale: fr })
                                            : ''
                                        return (
                                            <div key={delivery.delivery_id} className="relative rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                                                <div className="absolute -left-[30px] top-6 h-3 w-3 rounded-full border-2 border-emerald-400 bg-white"></div>
                                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                                            <Clock className="h-4 w-4" />
                                                            {format(new Date(delivery.delivery_date), 'EEEE d MMMM', { locale: fr })}
                                                        </div>
                                                        <div className="text-lg font-semibold text-slate-900">{delivery.shop_name}</div>
                                                        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                                                            <span className="flex items-center gap-1">
                                                                <ShoppingBag className="h-4 w-4" />
                                                                {delivery.bags} sac{delivery.bags > 1 ? 's' : ''}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-4 w-4" />
                                                                {delivery.time_window}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.tone}`}>
                                                            {status.label}
                                                        </span>
                                                        {StatusIcon ? (
                                                            <StatusIcon className="h-6 w-6 text-slate-500" />
                                                        ) : null}
                                                        <span className="text-xs text-slate-500">Maj: {updatedLabel}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
