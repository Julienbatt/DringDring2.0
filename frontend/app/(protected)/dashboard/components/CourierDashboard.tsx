'use client'

import { useState } from 'react'
import { useCourierDeliveries } from '../hooks/useCourierDeliveries'
import { useCourierActions } from '../hooks/useCourierActions'
import { StatusBadge } from '@/components/StatusBadge'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getToday() {
    const now = new Date()
    return now.toISOString().slice(0, 10)
}

function toLocaleTag(locale: string) {
    if (locale === 'de') return 'de-CH'
    if (locale === 'it') return 'it-CH'
    if (locale === 'en') return 'en-CH'
    return 'fr-CH'
}

export default function CourierDashboard() {
    const { t, locale } = useLanguage()
    const localeTag = toLocaleTag(locale)
    const [selectedDate, setSelectedDate] = useState(getToday())
    const { data, loading, error, refresh } = useCourierDeliveries(selectedDate)
    const { updateStatus, updating } = useCourierActions()

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedDate(e.target.value)
    }

    const getMapLink = (address: string, postal: string, city: string) => {
        const query = encodeURIComponent(`${address}, ${postal} ${city}`)
        return `https://www.google.com/maps/dir/?api=1&destination=${query}`
    }

    const selectedDateLabel = new Date(selectedDate).toLocaleDateString(localeTag, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })

    return (
        <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-5 bg-gray-50 min-h-screen">
            <header className="sticky top-0 z-10 bg-gray-50 border-b">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('courier.dashboard.title')}</h1>
                            <p className="text-xs sm:text-sm text-gray-500">{t('courier.dashboard.subtitle')} · {selectedDateLabel}</p>
                        </div>
                        <button
                            onClick={refresh}
                            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 sm:hidden"
                        >
                            {t('courier.dashboard.refresh')}
                        </button>
                    </div>

                    <div className="flex w-full sm:w-auto items-center gap-2">
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={handleDateChange}
                            className="w-full sm:w-auto border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                        <button
                            onClick={refresh}
                            className="hidden sm:inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                            {t('courier.dashboard.refresh')}
                        </button>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg shadow-sm">
                    {error}
                </div>
            ) : !data || data.length === 0 ? (
                <div className="bg-white border border-gray-200 text-gray-600 p-12 rounded-xl text-center shadow-sm flex flex-col items-center gap-4">
                    <p>{t('courier.dashboard.emptyForDate')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-base sm:text-lg font-semibold text-gray-800">
                            {data.length} {t('courier.dashboard.missions')}
                        </h2>
                    </div>

                    <div className="grid gap-6">
                        {data.map((delivery) => {
                            const isDelivered = delivery.status === 'delivered'
                            const isPickedUp = delivery.status === 'picked_up'
                            const isCancelled = delivery.status === 'cancelled'
                            const isPending = !isDelivered
                            const isCollectDisabled = isPickedUp || isDelivered || isCancelled || updating === delivery.delivery_id
                            const isDeliverDisabled = !isPickedUp || isDelivered || isCancelled || updating === delivery.delivery_id
                            const statusForBadge = isCancelled
                                ? 'cancelled'
                                : isDelivered
                                    ? 'delivered'
                                    : isPickedUp
                                        ? 'picked_up'
                                        : 'assigned'

                            return (
                                <div
                                    key={delivery.delivery_id}
                                    className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${isDelivered ? 'opacity-70 grayscale-[40%]' : 'hover:shadow-md border-gray-200'}`}
                                >
                                    {/* Header Card */}
                                    <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                            {delivery.time_window}
                                        </span>
                                        <StatusBadge status={statusForBadge} size="xs" />
                                    </div>

                                    <div className="p-4 sm:p-5 flex flex-col gap-5">
                                        {/* Pickup Section */}
                                        <div className={`relative pl-6 border-l-2 ${isPending ? 'border-blue-500' : 'border-gray-300'}`}>
                                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${isPending ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}></div>
                                            <div className="flex justify-between items-start gap-3">
                                                <div>
                                                    <h3 className="text-sm font-medium text-gray-500 mb-1">{t('courier.dashboard.pickup')}</h3>
                                                    <p className="font-bold text-gray-900 text-base sm:text-lg">{delivery.shop_name}</p>
                                                    <p className="text-sm text-gray-600">{delivery.shop_address}</p>
                                                </div>
                                                <a
                                                    href={getMapLink(delivery.shop_address, '', '')}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                    title={t('courier.dashboard.openMaps')}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                    </svg>
                                                    {t('courier.dashboard.route')}
                                                </a>
                                            </div>
                                            <div className="mt-2 inline-flex items-center gap-2 bg-gray-100 px-2 py-1 rounded text-sm font-medium text-gray-700">
                                                {t('courier.dashboard.bags')}: {delivery.bags}
                                            </div>

                                            {isPending && !isCancelled && (
                                                <div className="mt-4 text-sm text-gray-500">
                                                    {t('courier.dashboard.waitingDelivery')}
                                                </div>
                                            )}
                                            {!isDelivered && !isCancelled && (
                                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            if (isCollectDisabled) return
                                                            const ok = await updateStatus(delivery.delivery_id, 'picked_up')
                                                            if (ok) refresh()
                                                        }}
                                                        disabled={isCollectDisabled}
                                                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                                                            isCollectDisabled
                                                                ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                        }`}
                                                    >
                                                        {isPickedUp ? t('courier.dashboard.collectedDone') : t('courier.dashboard.collect')}
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (isDeliverDisabled) return
                                                            const ok = await updateStatus(delivery.delivery_id, 'delivered')
                                                            if (ok) refresh()
                                                        }}
                                                        disabled={isDeliverDisabled}
                                                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                                                            isDeliverDisabled
                                                                ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                                                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                        }`}
                                                    >
                                                        {t('courier.dashboard.deliver')}
                                                    </button>
                                                    <span className="text-xs text-gray-500">
                                                        {isPickedUp ? t('courier.dashboard.collected') : t('courier.dashboard.toCollect')}
                                                    </span>
                                                </div>
                                            )}
                                            {isCancelled && (
                                                <div className="mt-4 text-sm font-medium text-red-600">
                                                    {t('courier.dashboard.cancelled')}
                                                </div>
                                            )}
                                        </div>

                                        {/* Dropoff Section */}
                                        <div className={`relative pl-6 border-l-2 ${isDelivered ? 'border-green-500' : 'border-gray-200'}`}>
                                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 ${isDelivered ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'}`}></div>
                                            <div className="flex justify-between items-start gap-3">
                                                <div>
                                                    <h3 className="text-sm font-medium text-gray-500 mb-1">{t('courier.dashboard.delivery')}</h3>
                                                    <p className="font-bold text-gray-900 text-base sm:text-lg">{delivery.client_name || t('courier.dashboard.clientFallback')}</p>
                                                    <p className="text-sm text-gray-600">
                                                        {delivery.client_address}<br />
                                                        {delivery.client_postal_code} {delivery.client_city}
                                                    </p>
                                                </div>
                                                <a
                                                    href={getMapLink(delivery.client_address, delivery.client_postal_code, delivery.client_city)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100"
                                                    title={t('courier.dashboard.openMaps')}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                    </svg>
                                                    {t('courier.dashboard.route')}
                                                </a>
                                            </div>

                                            {isDelivered && (
                                                <div className="mt-4 text-sm text-green-600 font-medium">
                                                    {t('courier.dashboard.deliveredDone')}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
