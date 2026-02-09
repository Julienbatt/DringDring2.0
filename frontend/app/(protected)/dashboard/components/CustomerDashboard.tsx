'use client'

import React from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, Leaf, MapPin, MessageCircle } from 'lucide-react'
import { useCustomerDeliveries } from '../hooks/useCustomerDeliveries'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useCustomerStats } from '../hooks/useCustomerStats'
import BrandLogo from '@/components/BrandLogo'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getStatusStep(status: string) {
    if (status === 'delivered') return 3
    if (status === 'picked_up') return 2
    return 1 // created
}

function getLocaleTag(locale: string) {
    if (locale === 'de') return 'de-CH'
    if (locale === 'it') return 'it-CH'
    if (locale === 'en') return 'en-CH'
    return 'fr-CH'
}

function formatTime(value: string | null, localeTag: string) {
    if (!value) return '-'
    return new Date(value).toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(value: string, localeTag: string) {
    return new Date(value).toLocaleDateString(localeTag, { day: '2-digit', month: 'long' })
}

function statusBadge(status: string, t: (key: string, vars?: Record<string, string | number>) => string) {
    if (status === 'delivered') {
        return { label: t('customer.dashboard.status.delivered'), tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 }
    }
    if (status === 'picked_up') {
        return { label: t('customer.dashboard.status.onRoad'), tone: 'text-sky-700 bg-sky-50 border-sky-200', icon: MapPin }
    }
    return { label: t('customer.dashboard.status.planned'), tone: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock }
}

const DAY_LABEL_KEYS = [
    'customer.dashboard.days.sunday',
    'customer.dashboard.days.monday',
    'customer.dashboard.days.tuesday',
    'customer.dashboard.days.wednesday',
    'customer.dashboard.days.thursday',
    'customer.dashboard.days.friday',
    'customer.dashboard.days.saturday',
]

export default function CustomerDashboard() {
    const { t, locale } = useLanguage()
    const localeTag = getLocaleTag(locale)
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
            : DAY_LABEL_KEYS[customerStats.top_day]
                ? t(DAY_LABEL_KEYS[customerStats.top_day])
                : '-'
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
                                        <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">{t('customer.dashboard.brand')}</p>
                                        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">{t('customer.dashboard.title')}</h1>
                                    </div>
                                </div>
                                <p className="max-w-xl text-sm text-slate-600 md:text-base">
                                    {t('customer.dashboard.subtitle')}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={refresh}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                                >
                                    {t('customer.dashboard.refresh')}
                                </button>
                                <Link
                                    href="/customer/support"
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    {t('customer.dashboard.support')}
                                </Link>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.inProgress')}</p>
                                <p className="text-2xl font-semibold text-slate-900">{activeDeliveries.length}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.deliveredMonth')}</p>
                                <p className="text-2xl font-semibold text-emerald-700">{deliveredMonth}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.deliveriesMonth')}</p>
                                <p className="text-2xl font-semibold text-slate-900">
                                    {ecoLoading || !ecoStats ? monthlyDeliveries.length : ecoStats.deliveries}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                                    <Leaf className="h-4 w-4 text-emerald-500" />
                                    {t('customer.dashboard.kpi.co2Saved')}
                                </div>
                                <p className="text-2xl font-semibold text-emerald-700">
                                    {ecoLoading || !ecoStats ? '-' : t('customer.dashboard.kpi.kgValue', { value: ecoStats.co2_saved_kg.toFixed(1) })}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.favoriteShop')}</p>
                                <p className="text-base font-semibold text-slate-900">
                                    {statsLoading ? '...' : favoriteShopLabel}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {statsLoading || !customerStats ? '-' : t('customer.dashboard.kpi.deliveriesCount', { count: customerStats.top_shop_deliveries })}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.favoriteDay')}</p>
                                <p className="text-base font-semibold text-slate-900">
                                    {statsLoading ? '...' : favoriteDayLabel}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {statsLoading || !customerStats ? '-' : t('customer.dashboard.kpi.deliveriesCount', { count: customerStats.top_day_deliveries })}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.bagsMonth')}</p>
                                <p className="text-2xl font-semibold text-slate-900">
                                    {statsLoading || !customerStats ? '-' : customerStats.total_bags}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t('customer.dashboard.kpi.kmForYou')}</p>
                                <p className="text-2xl font-semibold text-emerald-700">
                                    {statsLoading || !customerStats ? '-' : customerStats.total_distance_km.toFixed(1)}
                                </p>
                                <p className="text-xs text-slate-400">{t('customer.dashboard.kpi.estimate')}</p>
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
                        <h2 className="mb-2 text-xl font-semibold text-slate-900">{t('customer.dashboard.empty.title')}</h2>
                        <p className="text-slate-500">{t('customer.dashboard.empty.subtitle')}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base sm:text-lg font-semibold text-slate-900">{t('customer.dashboard.currentDeliveries')}</h2>
                            <Link href="/customer/deliveries" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                                {t('customer.dashboard.viewHistory')}
                            </Link>
                        </div>

                        {activeDeliveries.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                                <p className="text-sm font-medium text-slate-600">{t('customer.dashboard.noCurrent.title')}</p>
                                <p className="mt-1 text-xs text-slate-400">{t('customer.dashboard.noCurrent.subtitle')}</p>
                            </div>
                        ) : null}

                        {activeDeliveries.map((delivery) => {
                            const currentStep = getStatusStep(delivery.status)
                            const badge = statusBadge(delivery.status, t)
                            const StatusIcon = badge.icon
                            const updateTime = formatTime(delivery.status_updated_at || delivery.delivery_date, localeTag)

                            return (
                                <div key={delivery.delivery_id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md">
                                    <div className="p-4 sm:p-6 md:p-8">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                                                    {t('customer.dashboard.orderOf', { date: formatDate(delivery.delivery_date, localeTag) })}
                                                </div>
                                                <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">{delivery.shop_name}</h2>
                                                <p className="mt-1 text-sm text-slate-500">
                                                    {t('customer.dashboard.bagsCount', { count: delivery.bags })}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badge.tone}`}>
                                                    <StatusIcon className="h-4 w-4" />
                                                    {badge.label}
                                                </div>
                                                <div className="text-xs text-slate-500">{t('customer.dashboard.updatedAt', { time: updateTime })}</div>
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
                                                    { label: t('customer.dashboard.steps.validated'), step: 1 },
                                                    { label: t('customer.dashboard.steps.onRoad'), step: 2 },
                                                    { label: t('customer.dashboard.steps.delivered'), step: 3 },
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
                                        <span className="text-xs text-slate-500">{t('customer.dashboard.help')}</span>
                                        <Link
                                            href="/customer/support"
                                            className="text-sm font-semibold text-slate-700 transition hover:text-slate-900"
                                        >
                                            {t('customer.dashboard.contactSupport')}
                                        </Link>
                                    </div>
                                </div>
                            )
                        })}

                        {recentHistory.length > 0 && (
                            <div className="rounded-2xl border border-slate-100 bg-white p-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-semibold text-slate-900">{t('customer.dashboard.recentHistory')}</h3>
                                    <a href="/customer/deliveries" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                                        {t('customer.dashboard.viewAll')}
                                    </a>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {recentHistory.map((delivery) => (
                                        <div key={delivery.delivery_id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                                            <div>
                                                <div className="font-semibold text-slate-900">{delivery.shop_name}</div>
                                                <div className="text-xs text-slate-500">
                                                    {new Date(delivery.delivery_date).toLocaleDateString(localeTag)} - {t('customer.dashboard.bagsCount', { count: delivery.bags })}
                                                </div>
                                            </div>
                                            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                                                {t('customer.dashboard.status.delivered')}
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
