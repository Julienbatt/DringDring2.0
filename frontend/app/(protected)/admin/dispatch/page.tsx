'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'

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
    const [deliveries, setDeliveries] = useState<DispatchDelivery[]>([])
    const [couriers, setCouriers] = useState<Courier[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
    const previousDeliveryIdsRef = useRef<Set<string>>(new Set())
    const hasLoadedOnceRef = useRef(false)
    const lastFetchAtRef = useRef(0)

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

    const getCurrentMonth = () => new Date().toISOString().slice(0, 7)
    const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
    const [monthPickerOpen, setMonthPickerOpen] = useState(false)
    const [pickerYear, setPickerYear] = useState(() => Number(getCurrentMonth().split('-')[0]))

    // Allow admin_region or super_admin (with optional context drill-down).
    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin_region' && user.role !== 'super_admin') return

        fetchData()
    }, [user, adminContextRegion, selectedMonth])

    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin_region' && user.role !== 'super_admin') return

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return
            fetchData({ silent: true })
        }, 15000)

        return () => window.clearInterval(intervalId)
    }, [user, adminContextRegion, selectedMonth])

    const fetchData = async ({ silent = false }: { silent?: boolean } = {}) => {
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
                api.get<any[]>(`/couriers${couriersParams}`, session?.access_token)
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
                }
            } else {
                hasLoadedOnceRef.current = true
                setHighlightedIds(new Set())
            }
            previousDeliveryIdsRef.current = currentIds
            lastFetchAtRef.current = fetchStartedAt
            setCouriers(formattedCouriers)
        } catch (err: any) {
            console.error(err)
            setError('Erreur lors du chargement des donnees dispatch.')
        } finally {
            if (!silent) {
                setLoading(false)
            }
        }
    }

    const handleAssignClick = (delivery: DispatchDelivery) => {
        setSelectedDelivery(delivery)
        setIsModalOpen(true)
    }

    const clearHighlight = (deliveryId: string) => {
        setHighlightedIds((prev) => {
            if (!prev.has(deliveryId)) return prev
            const next = new Set(prev)
            next.delete(deliveryId)
            return next
        })
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
        } catch (err) {
            alert("Erreur lors de l'assignation")
        } finally {
            setAssigningLoading(false)
        }
    }

    const handleUpdateStatus = async (delivery: DispatchDelivery, status: 'picked_up' | 'delivered' | 'cancelled') => {
        try {
            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=${status}`, {}, session?.access_token)
            setDeliveries(prev => prev.map(d => (
                d.id === delivery.id
                    ? { ...d, status }
                    : d
            )))
        } catch (err) {
            alert("Erreur lors de la validation")
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
                    ? { ...d, delivery_date: payload.delivery_date, time_window: payload.time_window, bags: payload.bags as any, notes: payload.notes }
                    : d
            )))
            setIsEditModalOpen(false)
            setEditDelivery(null)
        } catch (err) {
            alert("Erreur lors de la modification")
        } finally {
            setEditSaving(false)
        }
    }

    const handleCancelDelivery = async (delivery: DispatchDelivery) => {
        try {
            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=cancelled`, {}, session?.access_token)
            setDeliveries(prev => prev.map(d => (
                d.id === delivery.id
                    ? { ...d, status: 'cancelled' }
                    : d
            )))
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur lors de l'annulation"
            alert(message)
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
        const label = format(new Date(year, monthIndex, 1), 'MMMM yyyy', { locale: fr })
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

    if (authLoading) return <div className="p-8">Chargement auth...</div>
    if (loading) return <div className="p-8">Chargement dispatch...</div>
    if (error) return <div className="p-8 text-red-600">{error}</div>

    return (
        <div className="mx-auto max-w-6xl p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Dispatch et operations</h1>
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
                                                {format(new Date(pickerYear, index, 1), 'MMM', { locale: fr })}
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
                        Actualiser
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
                    A dispatcher ({pendingDeliveries.length})
                    </button>
                    <button
                    onClick={() => setActiveTab('assigned')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'assigned' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                    En cours ({assignedDeliveries.length})
                    </button>
                    <button
                    onClick={() => setActiveTab('done')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'done' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                    Termine ({completedDeliveries.length})
                    </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={showCancelled}
                        onChange={(event) => setShowCancelled(event.target.checked)}
                    />
                    Afficher les annulées
                </label>
            </div>

            <div className="table-scroll bg-white shadow sm:rounded-lg">
                <table className="min-w-[900px] w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date / Heure</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commerce</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destinataire</th>
                            <th className="hidden xl:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                            <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut / Coursier</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
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
                                            ? "Tout est dispatche."
                                            : activeTab === 'assigned'
                                                ? "Aucune course en cours."
                                                : showCancelled
                                                    ? "Aucune course terminee ou annulee."
                                                    : "Aucune course terminee."}
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
                                const highlightClass = isHighlighted ? 'bg-amber-50/80' : ''
                                const isPickedUp = delivery.status === 'picked_up'
                                const statusText = isCancelled
                                    ? 'Annulee'
                                    : isDelivered
                                        ? 'Livree'
                                        : isPickedUp
                                            ? 'Collecte'
                                            : hasCourier
                                                ? 'En cours'
                                            : 'Non assignee'
                                const notesShort = delivery.notes ? delivery.notes.slice(0, 60) : ''
                                return (
                                    <tr
                                        key={delivery.id}
                                        onClick={() => clearHighlight(delivery.id)}
                                        className={isHighlighted ? 'bg-amber-50/80 animate-pulse' : undefined}
                                    >
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${highlightClass} ${isHighlighted ? 'border-l-4 border-amber-300' : ''}`}>
                                            <div className="font-medium">{format(new Date(delivery.delivery_date), 'EEE dd MMM', { locale: fr })}</div>
                                            <div className="text-gray-500">{delivery.time_window}</div>
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${highlightClass}`}>
                                            {delivery.shop_name}
                                        </td>
                                        <td className={`px-6 py-4 text-sm text-gray-500 ${highlightClass}`}>
                                            <div className="font-medium text-gray-900">{delivery.client_name || 'Client'}</div>
                                            <div>{delivery.client_address}</div>
                                            <div>{delivery.client_city}</div>
                                            <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500 lg:hidden">
                                                <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                                                    {statusText}
                                                </span>
                                                {assignedCourier?.name && (
                                                    <span>Coursier: {assignedCourier.name}</span>
                                                )}
                                                {notesShort && (
                                                    <span className="truncate">Notes: {notesShort}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`hidden xl:table-cell px-6 py-4 text-sm text-gray-500 max-w-xs truncate ${highlightClass}`} title={delivery.notes || ''}>
                                            {delivery.notes || '-'}
                                        </td>
                                        <td className={`hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm ${highlightClass}`}>
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    isCancelled
                                                        ? 'bg-red-100 text-red-800'
                                                        : isDelivered
                                                            ? 'bg-green-100 text-green-800'
                                                            : hasCourier
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : 'bg-yellow-100 text-yellow-800'
                                                }`}
                                            >
                                                {isCancelled ? 'Annulee' : isDelivered ? 'Livree' : isPickedUp ? 'Collecte' : hasCourier ? 'En cours' : 'Non assigne'}
                                            </span>
                                        </td>
                                        <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 ${highlightClass}`}>
                                            {canAssign && (
                                                <button
                                                    onClick={() => handleAssignClick(delivery)}
                                                    className="text-emerald-600 hover:text-emerald-800"
                                                    disabled={!canEdit}
                                                >
                                                    {delivery.courier_id ? 'Changer' : 'Assigner'}
                                                </button>
                                            )}
                                            {!isDelivered && !isCancelled && hasCourier && !isPickedUp && (
                                                <button
                                                    onClick={() => handleUpdateStatus(delivery, 'picked_up')}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    Collecte
                                                </button>
                                            )}
                                            {!isDelivered && !isCancelled && hasCourier && isPickedUp && (
                                                <button
                                                    onClick={() => handleUpdateStatus(delivery, 'delivered')}
                                                    className="text-slate-600 hover:text-slate-800"
                                                >
                                                    Livrer
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={() => handleEditClick(delivery)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    Modifier
                                                </button>
                                            )}
                                            {canCancel && (
                                                <button
                                                    onClick={() => handleCancelDelivery(delivery)}
                                                    className="text-red-600 hover:text-red-800"
                                                    disabled={!canEdit}
                                                >
                                                    Annuler
                                                </button>
                                            )}
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
                    <div className="text-sm font-semibold text-gray-700">Operations du jour</div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-gray-500">A dispatcher</div>
                            <div className="text-lg font-semibold text-gray-800">{pendingToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Assignees</div>
                            <div className="text-lg font-semibold text-gray-800">{assignedToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Livrees</div>
                            <div className="text-lg font-semibold text-gray-800">{deliveredToday.length}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Sacs</div>
                            <div className="text-lg font-semibold text-gray-800">{bagsToday}</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        Base sur les courses du jour (date de livraison).
                    </div>
                </div>

                <div className="rounded-lg border bg-white p-4 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-700">Journal d'operations</div>
                        <div className="text-xs text-gray-500">{recentOps.length} derniere(s)</div>
                    </div>
                    <div className="mt-4 space-y-3">
                        {recentOps.length === 0 && (
                            <div className="text-sm text-gray-500">Aucune operation recente.</div>
                        )}
                        {recentOps.map((delivery) => {
                            const assignedCourier = couriers.find(c => c.id === delivery.courier_id)
                            const statusLabel = delivery.status === 'cancelled'
                                ? 'Annulee'
                                : delivery.status === 'delivered'
                                    ? 'Livree'
                                    : delivery.courier_id
                                        ? 'Assignee'
                                        : 'En attente'
                            return (
                                <div key={delivery.id} className="flex items-center justify-between rounded border border-gray-100 px-3 py-2 text-sm">
                                    <div className="space-y-1">
                                        <div className="font-medium text-gray-800">{delivery.shop_name}</div>
                                        <div className="text-xs text-gray-500">
                                            {format(new Date(delivery.delivery_date), 'dd MMM, HH:mm', { locale: fr })} - {delivery.client_name || 'Client'}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {statusLabel}{assignedCourier ? ` avec ${assignedCourier.name}` : ''}
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
                            Gerer les coursiers
                        </Link>
                        <Link
                            href="/admin/shops"
                            className="rounded border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
                        >
                            Voir les commerces
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                void fetchData()
                            }}
                            className="rounded border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                            Rafraichir maintenant
                        </button>
                    </div>
                </div>
            </div>

            {/* Assignment Modal */}
            {
                isModalOpen && selectedDelivery && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                            <h3 className="text-lg font-bold mb-4">Assigner un coursier</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Pour la course de <strong>{selectedDelivery.shop_name}</strong> le {format(new Date(selectedDelivery.delivery_date), 'dd/MM')}.
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
                                                        {dailyCount} course{dailyCount > 1 ? 's' : ''} ce jour
                                                    </span>

                                                    {/* Synergy Badge */}
                                                    {isAtSameShop && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                                                             Deja sur place
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
                                    <div className="text-sm text-gray-500 italic text-center py-2">Aucun coursier disponible.</div>
                                )}
                            </div>

                            <div className="flex justify-end pt-2 border-t">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {isEditModalOpen && editDelivery && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold mb-4">Modifier la livraison</h3>
                        <div className="space-y-3">
                            <label className="block text-sm">
                                Date
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
                                Heure precise
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
                                Sacs
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
                                Notes
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
                                Annuler
                            </button>
                            <button
                                onClick={handleEditSave}
                                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                disabled={editSaving}
                            >
                                {editSaving ? 'Enregistrement...' : 'Enregistrer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
