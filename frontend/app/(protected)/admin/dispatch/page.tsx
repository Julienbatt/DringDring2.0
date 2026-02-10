'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { de, enUS, fr, it } from 'date-fns/locale'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

// Types
type DispatchDelivery = {
    id: string
    delivery_date: string
    shop_id: string
    shop_name: string
    client_name: string
    client_address: string
    client_city: string
    client_phone: string | null
    client_floor: string | null
    client_door_code: string | null
    time_window: string
    notes: string | null
    bags: number | null
    short_code: string | null
    status: string | null
    status_updated_at?: string | null
    courier_id: string | null
}

type Courier = {
    id: string
    name: string
    email: string
    phone_number: string | null
}

type BackendCourier = {
    id: string
    first_name: string
    last_name: string
    email: string
    phone_number: string | null
}

export default function DispatchPage() {
    const { user, loading: authLoading, session, adminContextRegion } = useAuth()
    const { t, locale } = useLanguage()
    const [deliveries, setDeliveries] = useState<DispatchDelivery[]>([])
    const [couriers, setCouriers] = useState<Courier[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
    const previousDeliveryIdsRef = useRef<Set<string>>(new Set())
    const hasLoadedOnceRef = useRef(false)
    const lastFetchAtRef = useRef(0)
    const highlightTimeoutsRef = useRef<Map<string, number>>(new Map())

    // Assignment Modal State
    const [selectedDelivery, setSelectedDelivery] = useState<DispatchDelivery | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [assigningLoading, setAssigningLoading] = useState(false)
    const [editDelivery, setEditDelivery] = useState<DispatchDelivery | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editSaving, setEditSaving] = useState(false)
    const [editForm, setEditForm] = useState({
        delivery_date: '',
        time_window: '',
        bags: '',
        notes: ''
    })
    const deliveryEditGraceHours = 48
    const [showCancelled, setShowCancelled] = useState(false)

    // Tabs State
    const [activeTab, setActiveTab] = useState<'todo' | 'assigned' | 'done'>('todo')
    const [actionLoading, setActionLoading] = useState<Record<string, string>>({})

    const getCurrentMonth = () => new Date().toISOString().slice(0, 7)
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
    const [monthPickerOpen, setMonthPickerOpen] = useState(false)
    const [pickerYear, setPickerYear] = useState(() => Number(getCurrentMonth().split('-')[0]))
    const dateLocale = useMemo(() => {
        if (locale === 'de') return de
        if (locale === 'it') return it
        if (locale === 'en') return enUS
        return fr
    }, [locale])

    const getDeliveryStatus = (delivery: DispatchDelivery) => {
        if (delivery.status === 'cancelled') return 'cancelled'
        if (delivery.status === 'delivered') return 'delivered'
        if (delivery.status === 'picked_up') return 'picked_up'
        if (delivery.courier_id) return 'assigned'
        return 'unassigned'
    }

    const clearHighlight = useCallback((deliveryId: string) => {
        setHighlightedIds((prev) => {
            if (!prev.has(deliveryId)) return prev
            const next = new Set(prev)
            next.delete(deliveryId)
            return next
        })
        const timeoutId = highlightTimeoutsRef.current.get(deliveryId)
        if (timeoutId) {
            window.clearTimeout(timeoutId)
            highlightTimeoutsRef.current.delete(deliveryId)
        }
    }, [])

    const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!silent) {
            setLoading(true)
        }
        setError(null)
        try {
            const fetchStartedAt = Date.now()
            // Parallel fetch: Deliveries + Couriers (for dropdown)
            // Couriers endpoint: /couriers (list couriers in region - auto filtered for admin_region)
            // Delivery endpoint: /dispatch/deliveries

            const monthParam = `month=${encodeURIComponent(selectedMonth)}`
            const regionParam = adminContextRegion ? `&admin_region_id=${adminContextRegion.id}` : ''
            const queryParams = `?${monthParam}${regionParam}`
            const couriersParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const [deliveriesRes, couriersRes] = await Promise.all([
                api.get<DispatchDelivery[]>(`/dispatch/deliveries${queryParams}`, session?.access_token),
                api.get<BackendCourier[]>(`/couriers${couriersParams}`, session?.access_token)
            ])

            // Mapping backend response to frontend Courier type if schema differs slightly
            // Backend returns: first_name, last_name, phone_number...
            // We need to mash names for display
            const formattedCouriers = couriersRes.map((c) => ({
                id: c.id,
                name: `${c.first_name} ${c.last_name}`,
                email: c.email,
                phone_number: c.phone_number
            }))

            setDeliveries(deliveriesRes)
            const currentIds = new Set(deliveriesRes.map((delivery) => delivery.id))
            if (hasLoadedOnceRef.current) {
                const previousFetchAt = lastFetchAtRef.current
                const highlightIds = deliveriesRes
                    .filter((delivery) => {
                        if (!previousDeliveryIdsRef.current.has(delivery.id)) return true
                        if (!delivery.status_updated_at) return false
                        const updatedAt = new Date(delivery.status_updated_at).getTime()
                        return !Number.isNaN(updatedAt) && updatedAt > previousFetchAt
                    })
                    .map((delivery) => delivery.id)
                if (highlightIds.length > 0) {
                    setHighlightedIds((prev) => {
                        const next = new Set(prev)
                        highlightIds.forEach((id) => next.add(id))
                        return next
                    })
                    highlightIds.forEach((id) => {
                        if (highlightTimeoutsRef.current.has(id)) return
                        const timeoutId = window.setTimeout(() => {
                            clearHighlight(id)
                            highlightTimeoutsRef.current.delete(id)
                        }, 120000)
                        highlightTimeoutsRef.current.set(id, timeoutId)
                    })
                }
            } else {
                hasLoadedOnceRef.current = true
                setHighlightedIds(new Set())
            }
            previousDeliveryIdsRef.current = currentIds
            lastFetchAtRef.current = fetchStartedAt
            setCouriers(formattedCouriers)
        } catch (err: unknown) {
            console.error(err)
            setError(t('admin.dispatch.errorLoad'))
        } finally {
            if (!silent) {
                setLoading(false)
            }
        }
    }, [adminContextRegion, clearHighlight, selectedMonth, session?.access_token])

    // Allow admin_region or super_admin (with optional context drill-down).
    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin_region' && user.role !== 'super_admin') return

        fetchData()
    }, [user, fetchData])

    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin_region' && user.role !== 'super_admin') return

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return
            fetchData({ silent: true })
        }, 15000)

        return () => window.clearInterval(intervalId)
    }, [user, fetchData])

    const handleAssignClick = (delivery: DispatchDelivery) => {
        setSelectedDelivery(delivery)
        setIsModalOpen(true)
    }

    const handleAssignConfirm = async (courierId: string) => {
        if (!selectedDelivery) return
        setAssigningLoading(true)
        try {
            await api.patch(`/dispatch/deliveries/${selectedDelivery.id}/assign`, {
                courier_id: courierId
            }, session?.access_token)

            // Update local state: assigned deliveries are immediately marked as delivered.
            setDeliveries(prev => prev.map(d =>
                d.id === selectedDelivery.id
                    ? { ...d, courier_id: courierId, status: 'assigned' }
                    : d
            ))
            setHighlightedIds((prev) => {
                const next = new Set(prev)
                next.add(selectedDelivery.id)
                return next
            })

            const assignedCourier = couriers.find(c => c.id === courierId)
            if (assignedCourier?.phone_number) {
                const link = getWhatsAppLink(selectedDelivery, assignedCourier)
                window.open(link, '_blank', 'noopener,noreferrer')
            }

            setIsModalOpen(false)
            setSelectedDelivery(null)
        } catch {
            alert(t('admin.dispatch.errorAssign'))
        } finally {
            setAssigningLoading(false)
        }
    }

    const handleUpdateStatus = async (delivery: DispatchDelivery, status: 'picked_up' | 'delivered' | 'cancelled') => {
        const key = `${delivery.id}:${status}`
        setActionLoading((prev) => ({ ...prev, [key]: '1' }))
        try {
            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=${status}`, {}, session?.access_token)
            setDeliveries(prev => prev.map(d => (
                d.id === delivery.id
                    ? { ...d, status }
                    : d
            )))
        } catch {
            alert(t('admin.dispatch.errorStatusUpdate'))
        } finally {
            setActionLoading((prev) => {
                const copy = { ...prev }
                delete copy[key]
                return copy
            })
        }
    }

    const handleEditClick = (delivery: DispatchDelivery) => {
        setEditDelivery(delivery)
        setEditForm({
            delivery_date: String(delivery.delivery_date || '').slice(0, 10),
            time_window: delivery.time_window || '',
            bags: delivery.bags ? String(delivery.bags) : '',
            notes: delivery.notes || ''
        })
        setIsEditModalOpen(true)
    }

    const handleEditSave = async () => {
        if (!editDelivery) return
        setEditSaving(true)
        try {
            const payload = {
                delivery_date: editForm.delivery_date,
                time_window: editForm.time_window,
                bags: editForm.bags ? Number(editForm.bags) : null,
                notes: editForm.notes,
            }
            await api.patch(`/deliveries/admin/${editDelivery.id}`, payload, session?.access_token)
            setDeliveries(prev => prev.map(d => (
                d.id === editDelivery.id
                    ? { ...d, delivery_date: payload.delivery_date, time_window: payload.time_window, bags: payload.bags, notes: payload.notes }
                    : d
            )))
            setIsEditModalOpen(false)
            setEditDelivery(null)
        } catch {
            alert(t('admin.dispatch.errorEdit'))
        } finally {
            setEditSaving(false)
        }
    }

    const handleCancelDelivery = async (delivery: DispatchDelivery) => {
        const key = `${delivery.id}:cancelled`
        setActionLoading((prev) => ({ ...prev, [key]: '1' }))
        try {
            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=cancelled`, {}, session?.access_token)
            setDeliveries(prev => prev.map(d => (
                d.id === delivery.id
                    ? { ...d, status: 'cancelled' }
                    : d
            )))
        } catch (err) {
            const message = err instanceof Error ? err.message : t('admin.dispatch.errorCancel')
            alert(message)
        } finally {
            setActionLoading((prev) => {
                const copy = { ...prev }
                delete copy[key]
                return copy
            })
        }
    }

    const getWhatsAppLink = (delivery: DispatchDelivery, courier: Courier | undefined) => {
        if (!courier || !courier.phone_number) return '#'
        // Format message - ULTRA CONCISE for RUSH
        const msg =
            `#${delivery.short_code || '---'}\n` +
            `Sacs: ${delivery.bags || '?'}\n` +
            `${delivery.shop_name} -> ${delivery.client_name || 'Client'}\n` +
            `${delivery.client_address}, ${delivery.client_city}\n` +
            (delivery.client_floor || delivery.client_door_code
                ? `Etage: ${delivery.client_floor || '-'} ${delivery.client_door_code ? `Code: ${delivery.client_door_code}` : ''}\n`
                : '') +
            `Tel: ${delivery.client_phone || 'Pas de tel'}\n` +
            `Horaire: ${delivery.time_window}\n` +
            (delivery.notes ? `Notes: ${delivery.notes}` : '')

        const cleanNumber = courier.phone_number.replace(/\D/g, '')
        return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(msg)}`
    }

    const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const [selectedYear, selectedMonthIndex] = selectedMonth.split('-').map(Number)
    const formatMonthLabel = (year: number, monthIndex: number) => {
        const label = format(new Date(year, monthIndex, 1), 'MMMM yyyy', { locale: dateLocale })
        if (!dateLocale) return label
        return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
    }
    const getMonthValue = (year: number, monthIndex: number) =>
        `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const stepMonth = (delta: number) => {
        const date = new Date(selectedYear, selectedMonthIndex - 1 + delta, 1)
        setSelectedMonth(getMonthValue(date.getFullYear(), date.getMonth()))
    }
    const isSameDay = (dateValue: string) => String(dateValue).slice(0, 10) === todayKey
    const pendingDeliveries = deliveries.filter(
        (d) => !d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
    )
    const assignedDeliveries = deliveries.filter(
        (d) => d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
    )
    const completedDeliveries = deliveries.filter((d) => {
        if (showCancelled) {
            return ['delivered', 'cancelled'].includes(d.status || '')
        }
        return (d.status || '') === 'delivered'
    })

    const canEditDelivery = (delivery: DispatchDelivery) => {
        if (delivery.status === 'cancelled') return false
        if (delivery.status === 'delivered') {
            let base: Date | null = null
            if (delivery.status_updated_at) {
                const updated = new Date(delivery.status_updated_at)
                if (!Number.isNaN(updated.getTime())) {
                    base = updated
                }
            }
            if (!base && delivery.delivery_date) {
                const delivered = new Date(delivery.delivery_date)
                if (!Number.isNaN(delivered.getTime())) {
                    delivered.setHours(0, 0, 0, 0)
                    base = delivered
                }
            }
            if (!base) return false
            const grace = base.getTime() + deliveryEditGraceHours * 60 * 60 * 1000
            return Date.now() <= grace
        }
        return true
    }
    const deliveriesToday = deliveries.filter((d) => isSameDay(d.delivery_date))
    const pendingToday = deliveriesToday.filter(
        (d) => !d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
    )
    const assignedToday = deliveriesToday.filter(
        (d) => d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
    )
    const deliveredToday = deliveriesToday.filter((d) => (d.status || '') === 'delivered')
    const bagsToday = deliveriesToday.reduce((sum, d) => sum + Number(d.bags || 0), 0)
    const recentOps = [...deliveries]
        .sort((a, b) => new Date(b.delivery_date).getTime() - new Date(a.delivery_date).getTime())
        .slice(0, 6)

    if (authLoading) return <div className="p-8">{t('admin.dispatch.loadingAuth')}</div>
    if (loading) return <div className="p-8">{t('admin.dispatch.loadingData')}</div>
    if (error) return <div className="p-8 text-red-600">{error}</div>

    return (
        <div className="w-full p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">{t('admin.dispatch.title')}</h1>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                            <button
                                type="button"
                                onClick={() => stepMonth(-1)}
                                className="rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100"
                            >
                                ‹
                            </button>
                            <button
                                type="button"
                                onClick={() => setMonthPickerOpen((prev) => !prev)}
                                className="min-w-[140px] text-left font-medium text-gray-700"
                            >
                                {formatMonthLabel(selectedYear, selectedMonthIndex - 1)}
                            </button>
                            <button
                                type="button"
                                onClick={() => stepMonth(1)}
                                className="rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100"
                            >
                                ›
                            </button>
                        </div>
                        {monthPickerOpen && (
                            <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
                                <div className="flex items-center justify-between px-1 pb-2">
                                    <button
                                        type="button"
                                        onClick={() => setPickerYear((y) => y - 1)}
                                        className="rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100"
                                    >
                                        ‹
                                    </button>
                                    <div className="text-sm font-semibold text-gray-700">{pickerYear}</div>
                                    <button
                                        type="button"
                                        onClick={() => setPickerYear((y) => y + 1)}
                                        className="rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100"
                                    >
                                        ›
                                    </button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {Array.from({ length: 12 }).map((_, index) => {
                                        const isSelected = pickerYear === selectedYear && index === selectedMonthIndex - 1
                                        return (
                                            <button
                                                key={`${pickerYear}-${index}`}
                                                type="button"
                                                className={`rounded-lg px-2 py-2 text-xs font-medium ${
                                                    isSelected
                                                        ? 'bg-emerald-500 text-white'
                                                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                                                }`}
                                                onClick={() => {
                                                    setSelectedMonth(getMonthValue(pickerYear, index))
                                                    setMonthPickerOpen(false)
                                                }}
                                            >
                                                {format(new Date(pickerYear, index, 1), 'MMM', { locale: dateLocale })}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            void fetchData()
                        }}
                        className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                    >
                        {t('admin.dispatch.refresh')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap items-center justify-between border-b border-gray-200 mb-4 gap-3">
                <div className="flex">
                    <button
                    onClick={() => setActiveTab('todo')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'todo' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                    {t('admin.dispatch.tab.todo', { count: pendingDeliveries.length })}
                    </button>
                    <button
                    onClick={() => setActiveTab('assigned')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'assigned' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                    {t('admin.dispatch.tab.assigned', { count: assignedDeliveries.length })}
                    </button>
                    <button
                    onClick={() => setActiveTab('done')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'done' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                    {t('admin.dispatch.tab.done', { count: completedDeliveries.length })}
                    </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={showCancelled}
                        onChange={(event) => setShowCancelled(event.target.checked)}
                    />
                    {t('admin.dispatch.showCancelled')}
                </label>
            </div>

            <div className="table-scroll bg-white shadow sm:rounded-lg">
                <table className="min-w-[1160px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.dispatch.table.dateTime')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.dispatch.table.shop')}</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.dispatch.table.recipient')}</th>
                            <th className="hidden xl:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.dispatch.table.note')}</th>
                            <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.dispatch.table.statusCourier')}</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[320px]">{t('admin.dispatch.table.action')}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {(() => {
                            const filtered = deliveries.filter(d => {
                                if (activeTab === 'todo') return !d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
                                if (activeTab === 'assigned') return d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')
                                if (activeTab === 'done') {
                                    if (showCancelled) return ['delivered', 'cancelled'].includes(d.status || '')
                                    return (d.status || '') === 'delivered'
                                }
                                return true
                            })

                            if (filtered.length === 0) {
                                return (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        {activeTab === 'todo'
                                            ? t('admin.dispatch.empty.todo')
                                            : activeTab === 'assigned'
                                                ? t('admin.dispatch.empty.assigned')
                                                : showCancelled
                                                    ? t('admin.dispatch.empty.doneOrCancelled')
                                                    : t('admin.dispatch.empty.done')}
                                        </td>
                                    </tr>
                                )
                            }

                            return filtered.map((delivery) => {
                                const assignedCourier = couriers.find(c => c.id === delivery.courier_id)
                                const isDelivered = delivery.status === 'delivered'
                                const isCancelled = delivery.status === 'cancelled'
                                const hasCourier = Boolean(delivery.courier_id)
                                const canEdit = canEditDelivery(delivery)
                                const canAssign = !isDelivered && !isCancelled
                                const canCancel = canEdit
                                const isHighlighted = highlightedIds.has(delivery.id)
                                const highlightClass = isHighlighted ? 'bg-amber-100/80' : ''
                                const isPickedUp = delivery.status === 'picked_up'
                                const collectDisabled = isPickedUp || isDelivered || isCancelled || !!actionLoading[`${delivery.id}:picked_up`]
                                const deliverDisabled = !isPickedUp || isDelivered || isCancelled || !!actionLoading[`${delivery.id}:delivered`]
                                const cancelDisabled = !canEdit || !!actionLoading[`${delivery.id}:cancelled`]
                                const statusForBadge = getDeliveryStatus(delivery)
                                const notesShort = delivery.notes ? delivery.notes.slice(0, 60) : ''
                                return (
                                    <tr
                                        key={delivery.id}
                                        onClick={() => clearHighlight(delivery.id)}
                                        className={isHighlighted ? 'bg-amber-100/80 animate-pulse ring-2 ring-amber-300/70 ring-inset shadow-sm' : undefined}
                                    >
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${highlightClass} ${isHighlighted ? 'border-l-4 border-amber-400' : ''}`}>
                                            <div className="font-medium">{format(new Date(delivery.delivery_date), 'EEE dd MMM', { locale: dateLocale })}</div>
                                            {isHighlighted && (
                                                <span className="mt-1 inline-flex items-center rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                                    {t('admin.dispatch.badge.new')}
                                                </span>
                                            )}
                                            <div className="text-gray-500">{delivery.time_window}</div>
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${highlightClass}`}>
                                            {delivery.shop_name}
                                        </td>
                                        <td className={`px-6 py-4 text-sm text-gray-500 ${highlightClass}`}>
                                            <div className="font-medium text-gray-900">{delivery.client_name || t('admin.dispatch.clientFallback')}</div>
                                            <div>{delivery.client_address}</div>
                                            <div>{delivery.client_city}</div>
                                            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 lg:hidden">
                                                <StatusBadge status={statusForBadge} size="xs" />
                                                {assignedCourier?.name && (
                                                    <span>{t('admin.dispatch.courier')}: {assignedCourier.name}</span>
                                                )}
                                                {notesShort && (
                                                    <span className="truncate">{t('admin.dispatch.notes')}: {notesShort}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`hidden xl:table-cell px-6 py-4 text-sm text-gray-500 max-w-xs truncate ${highlightClass}`} title={delivery.notes || ''}>
                                            {delivery.notes || '-'}
                                        </td>
                                        <td className={`hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm ${highlightClass}`}>
                                            <StatusBadge status={statusForBadge} size="xs" />
                                        </td>
                                        <td className={`min-w-[320px] px-6 py-4 text-right text-sm font-medium ${highlightClass}`}>
                                            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                                            {canAssign && (
                                                <button
                                                    onClick={() => handleAssignClick(delivery)}
                                                    className="text-emerald-600 hover:text-emerald-800"
                                                    disabled={!canEdit}
                                                >
                                                    {delivery.courier_id ? t('admin.dispatch.action.change') : t('admin.dispatch.action.assign')}
                                                </button>
                                            )}
                                            {!isDelivered && !isCancelled && hasCourier && (
                                                <button
                                                    onClick={() => {
                                                        if (collectDisabled) return
                                                        handleUpdateStatus(delivery, 'picked_up')
                                                    }}
                                                    disabled={collectDisabled}
                                                    className={`rounded px-2 py-1 ${
                                                        collectDisabled
                                                            ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                                                            : 'text-blue-600 hover:text-blue-800'
                                                    }`}
                                                >
                                                    {isPickedUp ? t('admin.dispatch.action.collected') : t('admin.dispatch.action.collect')}
                                                </button>
                                            )}
                                            {!isDelivered && !isCancelled && hasCourier && (
                                                <button
                                                    onClick={() => {
                                                        if (deliverDisabled) return
                                                        handleUpdateStatus(delivery, 'delivered')
                                                    }}
                                                    disabled={deliverDisabled}
                                                    className={`rounded px-2 py-1 ${
                                                        deliverDisabled
                                                            ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                                                            : 'text-slate-600 hover:text-slate-800'
                                                    }`}
                                                >
                                                    {t('admin.dispatch.action.deliver')}
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={() => handleEditClick(delivery)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    {t('common.edit')}
                                                </button>
                                            )}
                                            {canCancel && (
                                                <button
                                                    onClick={() => handleCancelDelivery(delivery)}
                                                    className={`rounded px-2 py-1 ${
                                                        cancelDisabled
                                                            ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                                                            : 'text-red-600 hover:text-red-800'
                                                    }`}
                                                    disabled={cancelDisabled}
                                                >
                                                    {t('admin.dispatch.action.cancel')}
                                                </button>
                                            )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        })()}
                    </tbody>
                </table>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
                <div className="rounded-lg border bg-white p-4">
                    <div className="text-sm font-semibold text-gray-700">{t('admin.dispatch.todayOps')}</div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-gray-500">{t('admin.dispatch.kpi.todo')}</div>
                            <div className="text-lg font-semibold text-gray-800">{pendingToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">{t('admin.dispatch.kpi.assigned')}</div>
                            <div className="text-lg font-semibold text-gray-800">{assignedToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">{t('admin.dispatch.kpi.delivered')}</div>
                            <div className="text-lg font-semibold text-gray-800">{deliveredToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">{t('admin.dispatch.kpi.bags')}</div>
                            <div className="text-lg font-semibold text-gray-800">{bagsToday}</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        {t('admin.dispatch.kpi.hint')}
                    </div>
                </div>

                <div className="rounded-lg border bg-white p-4 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-700">{t('admin.dispatch.journal.title')}</div>
                        <div className="text-xs text-gray-500">{recentOps.length} {t('admin.dispatch.journal.last')}</div>
                    </div>
                    <div className="mt-4 space-y-3">
                        {recentOps.length === 0 && (
                            <div className="text-sm text-gray-500">{t('admin.dispatch.journal.empty')}</div>
                        )}
                        {recentOps.map((delivery) => {
                            const assignedCourier = couriers.find(c => c.id === delivery.courier_id)
                            return (
                                <div key={delivery.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
                                    <div className="space-y-1">
                                        <div className="font-medium text-gray-800">{delivery.shop_name}</div>
                                        <div className="text-xs text-gray-500">
                                            {format(new Date(delivery.delivery_date), 'dd MMM, HH:mm', { locale: dateLocale })} - {delivery.client_name || t('admin.dispatch.clientFallback')}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <StatusBadge status={getDeliveryStatus(delivery)} size="xs" />
                                        {assignedCourier ? <span>{t('admin.dispatch.withCourier')} {assignedCourier.name}</span> : null}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                            href="/admin/couriers"
                            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                        >
                            {t('admin.dispatch.journal.manageCouriers')}
                        </Link>
                        <Link
                            href="/admin/shops"
                            className="rounded border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                        >
                            {t('admin.dispatch.journal.viewShops')}
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                void fetchData()
                            }}
                            className="rounded border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                            {t('admin.dispatch.journal.refreshNow')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Assignment Modal */}
            {
                isModalOpen && selectedDelivery && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                            <h3 className="text-lg font-bold mb-4">{t('admin.dispatch.modal.assignTitle')}</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                {t('admin.dispatch.modal.assignFor')}{' '}
                                <strong>{selectedDelivery.shop_name}</strong>{' '}
                                {t('admin.dispatch.modal.assignOn')}{' '}
                                {format(new Date(selectedDelivery.delivery_date), 'dd/MM')}.
                            </p>

                            <div className="space-y-2 max-h-80 overflow-y-auto mb-4">
                                {couriers.map(c => {
                                    // Smart Logic: Calculate workload and synergy
                                    const dailyCount = deliveries.filter(d =>
                                        d.courier_id === c.id &&
                                        d.delivery_date === selectedDelivery.delivery_date
                                    ).length

                                    const isAtSameShop = deliveries.some(d =>
                                        d.courier_id === c.id &&
                                        d.delivery_date === selectedDelivery.delivery_date &&
                                        d.shop_id === selectedDelivery.shop_id &&
                                        d.id !== selectedDelivery.id // Don't count self
                                    )

                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => handleAssignConfirm(c.id)}
                                            disabled={assigningLoading}
                                            className={`w-full text-left px-4 py-3 rounded border hover:bg-gray-50 flex justify-between items-center ${selectedDelivery.courier_id === c.id ? 'bg-emerald-50 border-emerald-300' : 'border-gray-200'
                                                }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium text-gray-900">{c.name}</span>
                                                <div className="flex space-x-2 mt-1">
                                                    {/* Workload Badge */}
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${dailyCount === 0 ? 'bg-green-100 text-green-800' :
                                                        dailyCount < 5 ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-red-100 text-red-800'
                                                        }`}>
                                                        {dailyCount} {t('admin.dispatch.modal.dailyMissions')}{dailyCount > 1 ? 's' : ''} {t('admin.dispatch.modal.dailySuffix')}
                                                    </span>

                                                    {/* Synergy Badge */}
                                                    {isAtSameShop && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                                                            {t('admin.dispatch.modal.alreadyOnSite')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {selectedDelivery.courier_id === c.id && (
                                                <svg className="h-5 w-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    )
                                })}

                                {couriers.length === 0 && (
                                    <div className="text-sm text-gray-500 italic text-center py-2">{t('admin.dispatch.modal.noCourier')}</div>
                                )}
                            </div>

                            <div className="flex justify-end pt-2 border-t">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {isEditModalOpen && editDelivery && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold mb-4">{t('admin.dispatch.modal.editTitle')}</h3>
                        <div className="space-y-3">
                            <label className="block text-sm">
                                {t('admin.dispatch.modal.date')}
                                <input
                                    type="date"
                                    className="mt-1 w-full rounded border px-2 py-1"
                                    value={editForm.delivery_date}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({ ...prev, delivery_date: event.target.value }))
                                    }
                                />
                            </label>
                            <label className="block text-sm">
                                {t('admin.dispatch.modal.deliveryTime')}
                                <input
                                    type="time"
                                    className="mt-1 w-full rounded border px-2 py-1"
                                    value={editForm.time_window}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({ ...prev, time_window: event.target.value }))
                                    }
                                />
                            </label>
                            <label className="block text-sm">
                                {t('admin.dispatch.modal.bags')}
                                <input
                                    type="number"
                                    min="1"
                                    className="mt-1 w-full rounded border px-2 py-1"
                                    value={editForm.bags}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({ ...prev, bags: event.target.value }))
                                    }
                                />
                            </label>
                            <label className="block text-sm">
                                {t('admin.dispatch.modal.notes')}
                                <textarea
                                    className="mt-1 w-full rounded border px-2 py-1"
                                    rows={3}
                                    value={editForm.notes}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({ ...prev, notes: event.target.value }))
                                    }
                                />
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(false)
                                    setEditDelivery(null)
                                }}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleEditSave}
                                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                disabled={editSaving}
                            >
                                {editSaving ? t('admin.dispatch.modal.saving') : t('admin.dispatch.modal.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
