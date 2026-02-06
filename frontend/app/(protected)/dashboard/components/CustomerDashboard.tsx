'use client'

import React from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Leaf, MapPin, MessageCircle } from 'lucide-react'
import { useCustomerDeliveries } from '../hooks/useCustomerDeliveries'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useCustomerStats } from '../hooks/useCustomerStats'
import BrandLogo from '@/components/BrandLogo'

function getStatusStep(status: string) {
    if (status === 'delivered') return 3
    if (status === 'picked_up') return 2
    return 1 // created
}

function formatTime(value: string | null) {
    if (!value) return '-'
    return new Date(value).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long' })
}

function statusBadge(status: string) {
    if (status === 'delivered') {
        return { label: 'Livree', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 }
    }
    if (status === 'picked_up') {
        return { label: 'En route', tone: 'text-sky-700 bg-sky-50 border-sky-200', icon: MapPin }
    }
    return { label: 'Planifiee', tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock }
}

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export default function CustomerDashboard() {
    const { data, loading, error, refresh } = useCustomerDeliveries()
    const activeDeliveries = data?.filter((delivery) => delivery.status !== 'delivered') ?? []
    const recentHistory = data?.filter((delivery) => delivery.status === 'delivered').slice(0, 3) ?? []
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { data: ecoStats, loading: ecoLoading } = useEcoStats(currentMonth)
    const { data: customerStats, loading: statsLoading } = useCustomerStats(currentMonth)
    const monthlyDeliveries = data?.filter((delivery) => String(delivery.delivery_date).startsWith(currentMonth)) ?? []
    const deliveredMonth = monthlyDeliveries.filter((delivery) => delivery.status === 'delivered').length
    const favoriteDayLabel =
        customerStats?.top_day === null || customerStats?.top_day === undefined
            ? '-'
            : DAY_LABELS[customerStats.top_day] || '-'
    const favoriteShopLabel = customerStats?.top_shop_name || '-'

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex w-full flex-col gap-6 sm:gap-8 px-4 pb-16 pt-6 sm:px-6 md:px-8">
                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-8">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                                        <BrandLogo width={180} height={54} className="h-10 w-auto md:h-12" />
                                    </div>
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">DringDring</p>
                                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Tableau client</h1>
                                    </div>
                                </div>
                                <p className="max-w-xl text-sm text-slate-600 md:text-base">
                                    Toutes vos livraisons en cours, vos impacts et l&apos;historique en un seul endroit.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={refresh}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                                >
                                    Actualiser
                                </button>
                                <Link
                                    href="/customer/support"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Support
                                </Link>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">En cours</p>
                                <p className="text-2xl font-semibold text-slate-900">{activeDeliveries.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Livrees (mois)</p>
                                <p className="text-2xl font-semibold text-emerald-700">{deliveredMonth}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Livraisons (mois)</p>
                                <p className="text-2xl font-semibold text-slate-900">
                                    {ecoLoading || !ecoStats ? monthlyDeliveries.length : ecoStats.deliveries}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                                    <Leaf className="h-4 w-4 text-emerald-500" />
                                    CO2 economise
                                </div>
                                <p className="text-2xl font-semibold text-emerald-700">
                                    {ecoLoading || !ecoStats ? '-' : `${ecoStats.co2_saved_kg.toFixed(1)} kg`}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Commerce favori</p>
                                <p className="text-base font-semibold text-slate-900">
                                    {statsLoading ? '...' : favoriteShopLabel}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {statsLoading || !customerStats ? '-' : `${customerStats.top_shop_deliveries} livraisons`}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Jour favori</p>
                                <p className="text-base font-semibold text-slate-900">
                                    {statsLoading ? '...' : favoriteDayLabel}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {statsLoading || !customerStats ? '-' : `${customerStats.top_day_deliveries} livraisons`}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sacs (mois)</p>
                                <p className="text-2xl font-semibold text-slate-900">
                                    {statsLoading || !customerStats ? '-' : customerStats.total_bags}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Km pour vous</p>
                                <p className="text-2xl font-semibold text-emerald-700">
                                    {statsLoading || !customerStats ? '-' : customerStats.total_distance_km.toFixed(1)}
                                </p>
                                <p className="text-xs text-slate-400">Estimation</p>
                            </div>
                        </div>
                    </div>
                </section>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2].map(i => (
                            <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-100 bg-white"></div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
                        <p className="font-semibold">{error}</p>
                    </div>
                ) : !data || data.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                        <h2 className="mb-2 text-xl font-semibold text-slate-900">Aucune commande active</h2>
                        <p className="text-slate-500">Vos futures livraisons apparaitront ici.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base sm:text-lg font-semibold text-slate-900">Livraisons en cours</h2>
                            <Link href="/customer/deliveries" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                                Voir l&apos;historique
                            </Link>
                        </div>

                        {activeDeliveries.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                                <p className="text-sm font-medium text-slate-600">Aucune livraison en cours.</p>
                                <p className="mt-1 text-xs text-slate-400">Retrouvez toutes vos livraisons dans l&apos;historique.</p>
                            </div>
                        ) : null}

                        {activeDeliveries.map((delivery) => {
                            const currentStep = getStatusStep(delivery.status)
                            const badge = statusBadge(delivery.status)
                            const StatusIcon = badge.icon
                            const updateTime = formatTime(delivery.status_updated_at || delivery.delivery_date)

                            return (
                                <div key={delivery.delivery_id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
                                    <div className="p-4 sm:p-6 md:p-8">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                                                    Commande du {formatDate(delivery.delivery_date)}
                                                </div>
                                                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">{delivery.shop_name}</h2>
                                                <p className="mt-1 text-sm text-slate-500">{delivery.bags} sac{delivery.bags > 1 ? 's' : ''}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badge.tone}`}>
                                                    <StatusIcon className="h-4 w-4" />
                                                    {badge.label}
                                                </div>
                                                <div className="text-xs text-slate-500">Maj: {updateTime}</div>
                                                <div className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-700">
                                                    {delivery.time_window}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative mt-8">
                                            <div className="absolute top-1/2 left-0 h-1 w-full -translate-y-1/2 rounded-full bg-slate-200"></div>
                                            <div
                                                className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-emerald-500 transition-all duration-700 ease-out"
                                                style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                                            ></div>

                                            <div className="relative flex w-full justify-between">
                                                {[
                                                    { label: 'Validee', step: 1 },
                                                    { label: 'En route', step: 2 },
                                                    { label: 'Livree', step: 3 },
                                                ].map((item) => (
                                                    <div key={item.step} className="flex flex-col items-center gap-2">
                                                        <div
                                                            className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-500 ${
                                                                currentStep >= item.step
                                                                    ? item.step === 3
                                                                        ? 'border-emerald-500 bg-emerald-500 text-white'
                                                                        : 'border-emerald-500 text-emerald-600'
                                                                    : 'border-slate-300 text-slate-300'
                                                            }`}
                                                        >
                                                            {item.step}
                                                        </div>
                                                        <span
                                                            className={`text-xs font-medium md:text-sm ${
                                                                currentStep >= item.step ? 'text-slate-700' : 'text-slate-400'
                                                            }`}
                                                        >
                                                            {item.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
                                        <span className="text-xs text-slate-500">Besoin d&apos;aide ?</span>
                                        <Link
                                            href="/customer/support"
                                            className="text-sm font-semibold text-slate-700 transition hover:text-slate-900"
                                        >
                                            Contacter le support
                                        </Link>
                                    </div>
                                </div>
                            )
                        })}

                        {recentHistory.length > 0 && (
                            <div className="rounded-2xl border border-slate-100 bg-white p-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-slate-900">Historique recent</h3>
                                    <a href="/customer/deliveries" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                                        Voir tout
                                    </a>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {recentHistory.map((delivery) => (
                                        <div key={delivery.delivery_id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                                            <div>
                                                <div className="font-semibold text-slate-900">{delivery.shop_name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {new Date(delivery.delivery_date).toLocaleDateString('fr-CH')} - {delivery.bags} sac{delivery.bags > 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                                                Livree
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
