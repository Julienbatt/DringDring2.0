'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { api } from '@/lib/api'
import { Phone, MapPin, RefreshCw, CheckCircle2, Users, XCircle, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/StatusBadge'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

type DispatchDelivery = {
  id: string
  delivery_date: string
  shop_name: string
  shop_address: string | null
  client_name: string | null
  client_address: string
  client_city: string
  client_phone: string | null
  client_floor: string | null
  client_door_code: string | null
  time_window: string
  short_code: string | null
  notes: string | null
  bags: number | null
  status: string | null
  courier_id: string | null
}

type Courier = {
  id: string
  name: string
  phone_number: string | null
}

type BackendCourier = {
  id: string
  first_name: string
  last_name: string
  phone_number: string | null
}

const getToday = () => new Date().toISOString().slice(0, 10)

const getMapLink = (address: string, city: string) => {
  const query = encodeURIComponent(`${address}, ${city}`)
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

export default function CourierDispatchPage() {
  const { user, session, loading: authLoading } = useAuth()
  const { t } = useLanguage()
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [deliveries, setDeliveries] = useState<DispatchDelivery[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'todo' | 'assigned' | 'done'>('todo')
  const [assignTarget, setAssignTarget] = useState<DispatchDelivery | null>(null)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [editTarget, setEditTarget] = useState<DispatchDelivery | null>(null)
  const [editForm, setEditForm] = useState<{ floor: string; door_code: string; notes: string }>({
    floor: '',
    door_code: '',
    notes: '',
  })
  const [editSaving, setEditSaving] = useState(false)

  const canDispatch = !!user?.can_dispatch
  const courierId = user?.courier_id || null

  const fetchDeliveries = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const query = `?date_from=${encodeURIComponent(selectedDate)}&date_to=${encodeURIComponent(selectedDate)}`
      const [data, couriersRes] = await Promise.all([
        api.get<DispatchDelivery[]>(`/dispatch/deliveries${query}`, session.access_token),
        api.get<BackendCourier[]>(`/couriers`, session.access_token)
      ])
      setDeliveries(data)
      const formattedCouriers = couriersRes.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        phone_number: c.phone_number || null
      }))
      setCouriers(formattedCouriers)
    } catch (err) {
      captureError(err, 'CourierDispatchPage.fetchDeliveries')
      setError(t('dispatch.mobile.loadError'))
    } finally {
      setLoading(false)
    }
  }, [session, selectedDate, t])

  useEffect(() => {
    if (!user || !canDispatch) return
    fetchDeliveries()
  }, [user, canDispatch, fetchDeliveries])

  const todo = useMemo(
    () => deliveries.filter((d) => !d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')),
    [deliveries]
  )
  const assigned = useMemo(
    () => deliveries.filter((d) => d.courier_id && !['delivered', 'cancelled'].includes(d.status || '')),
    [deliveries]
  )
  const done = useMemo(
    () => deliveries.filter((d) => ['delivered', 'cancelled'].includes(d.status || '')),
    [deliveries]
  )

  const handleAssignSelf = async (deliveryId: string) => {
    if (!courierId || !session?.access_token) return
    try {
      await api.patch(`/dispatch/deliveries/${deliveryId}/assign`, { courier_id: courierId }, session.access_token)
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, courier_id: courierId, status: 'assigned' } : d))
      )
      setActiveTab('assigned')
    } catch (err) {
      captureError(err, 'CourierDispatchPage.handleAssignSelf')
      alert(t('dispatch.mobile.assignError'))
    }
  }

  const handleAssignCourier = async (deliveryId: string, targetCourierId: string) => {
    if (!session?.access_token) return
    try {
      await api.patch(`/dispatch/deliveries/${deliveryId}/assign`, { courier_id: targetCourierId }, session.access_token)
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, courier_id: targetCourierId, status: 'assigned' } : d))
      )
      setAssignTarget(null)
      return true
    } catch (err) {
      captureError(err, 'CourierDispatchPage.handleAssignCourier')
      alert(t('dispatch.mobile.assignError'))
      return false
    }
  }

  const updateDeliveryStatus = async (delivery: DispatchDelivery, status: 'picked_up' | 'delivered' | 'cancelled') => {
    if (!session?.access_token) return
    const key = `${delivery.id}:${status}`
    setActionLoading((prev) => ({ ...prev, [key]: '1' }))
    try {
      await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=${status}`, {}, session.access_token)
      // Fast local feedback: avoids waiting full refresh for button state.
      setDeliveries((prev) => prev.map((d) => (d.id === delivery.id ? { ...d, status } : d)))
      fetchDeliveries()
    } finally {
      setActionLoading((prev) => {
        const copy = { ...prev }
        delete copy[key]
        return copy
      })
    }
  }

  const openEdit = (delivery: DispatchDelivery) => {
    setEditTarget(delivery)
    setEditForm({
      floor: delivery.client_floor ?? '',
      door_code: delivery.client_door_code ?? '',
      notes: delivery.notes ?? '',
    })
  }

  const closeEdit = () => {
    setEditTarget(null)
    setEditSaving(false)
  }

  const mapCorrectionError = (err: unknown): string => {
    // The api wrapper throws `new Error("API error <status>: <body>")`.
    // The body is the FastAPI response JSON. Parse to localize.
    if (!(err instanceof Error)) return t('correction.error.generic')
    // Note: no /s flag (tsconfig target=ES2017). FastAPI details are single-line.
    const match = err.message.match(/^API error (\d+):\s*([\s\S]*)$/)
    if (!match) return t('correction.error.generic')
    const status = Number(match[1])
    let detail = ''
    try {
      const body = JSON.parse(match[2]) as { detail?: unknown }
      detail = typeof body.detail === 'string' ? body.detail : ''
    } catch {
      detail = match[2]
    }
    if (status === 403) {
      if (detail === 'Not assigned to this delivery') return t('correction.error.notAssigned')
      if (detail.startsWith('Field not editable')) return t('correction.error.notEditable')
    }
    if (status === 409) {
      if (detail === 'Delivery is locked') return t('correction.error.locked')
      if (detail.startsWith('Billing period')) return t('correction.error.frozen')
    }
    return t('correction.error.generic')
  }

  const handleSaveCorrection = async () => {
    if (!editTarget || !session?.access_token) return
    // Diff the form against the original — submit only what actually changed.
    const body: { floor?: string; door_code?: string; notes?: string } = {}
    const normalize = (v: string) => (v.trim().length === 0 ? '' : v)
    if (normalize(editForm.floor) !== (editTarget.client_floor ?? '')) {
      body.floor = normalize(editForm.floor)
    }
    if (normalize(editForm.door_code) !== (editTarget.client_door_code ?? '')) {
      body.door_code = normalize(editForm.door_code)
    }
    if (normalize(editForm.notes) !== (editTarget.notes ?? '')) {
      body.notes = normalize(editForm.notes)
    }
    if (Object.keys(body).length === 0) {
      closeEdit()
      return
    }
    setEditSaving(true)
    try {
      // The PATCH response only echoes a partial summary (no floor/door/notes),
      // so we update local state from the submitted body instead.
      await api.patch(`/deliveries/courier/${editTarget.id}`, body, session.access_token)
      const targetId = editTarget.id
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === targetId
            ? {
                ...d,
                client_floor: body.floor !== undefined ? body.floor : d.client_floor,
                client_door_code: body.door_code !== undefined ? body.door_code : d.client_door_code,
                notes: body.notes !== undefined ? body.notes : d.notes,
              }
            : d
        )
      )
      toast.success(t('correction.courier.saved'))
      closeEdit()
    } catch (err) {
      const message = mapCorrectionError(err)
      setError(message)
      toast.error(message)
      captureError(err, 'courier.correction.save')
    } finally {
      setEditSaving(false)
    }
  }

  const getStatus = (delivery: DispatchDelivery) => {
    if (delivery.status === 'cancelled') return 'cancelled'
    if (delivery.status === 'delivered') return 'delivered'
    if (delivery.status === 'picked_up') return 'picked_up'
    if (delivery.courier_id) return 'assigned'
    return 'unassigned'
  }

  const getWhatsAppLink = (delivery: DispatchDelivery, courier: Courier) => {
    if (!courier.phone_number) return '#'
    const cleanNumber = courier.phone_number.replace(/\D/g, '')
    const message = [
      delivery.short_code ? `${t('dispatch.mobile.code')}: ${delivery.short_code}` : null,
      `${t('dispatch.mobile.waNewDelivery')}: ${delivery.shop_name}`,
      `${t('dispatch.mobile.pickup')}: ${delivery.shop_address || '-'}`,
      `${t('dispatch.mobile.delivery')}: ${delivery.client_address}, ${delivery.client_city}`,
      delivery.client_floor ? `${t('dispatch.mobile.floor')}: ${delivery.client_floor}` : null,
      delivery.client_door_code ? `${t('dispatch.mobile.code')}: ${delivery.client_door_code}` : null,
      `${t('dispatch.mobile.schedule')}: ${delivery.time_window}`,
      `${t('dispatch.mobile.bags')}: ${delivery.bags ?? '-'}`,
      delivery.notes ? `${t('dispatch.mobile.note')}: ${delivery.notes}` : null,
    ].filter(Boolean).join('\n')
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
  }

  if (authLoading) {
    return <div className="p-6 text-gray-500">{t('dispatch.mobile.loading')}</div>
  }

  if (!canDispatch) {
    return (
      <div className="p-6 bg-white rounded-xl border shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">{t('dispatch.mobile.dispatch')}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('dispatch.mobile.noAccess')}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur border-b">
        <div className="flex flex-col gap-3 px-2 sm:px-0 py-3 pt-8 sm:pt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('dispatch.mobile.title')}</h1>
              <p className="text-xs text-gray-500">{t('dispatch.mobile.subtitle')}</p>
            </div>
            <button
              onClick={fetchDeliveries}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <RefreshCw className="h-4 w-4" />
              {t('dispatch.mobile.refresh')}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('todo')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                activeTab === 'todo' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t('dispatch.mobile.todo')} ({todo.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assigned')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                activeTab === 'assigned' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t('dispatch.mobile.assigned')} ({assigned.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('done')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                activeTab === 'done' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t('dispatch.mobile.done')} ({done.length})
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-6 text-center text-gray-500">{t('dispatch.mobile.loading')}</div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">{error}</div>
      ) : (
        <div className="space-y-4">
          {(activeTab === 'todo' ? todo : activeTab === 'assigned' ? assigned : done).length === 0 ? (
            <div className="p-8 rounded-xl border bg-white text-center text-gray-500">
              {t('dispatch.mobile.noData')}
            </div>
          ) : (
            (activeTab === 'todo' ? todo : activeTab === 'assigned' ? assigned : done).map((delivery) => (
              <div key={delivery.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500">{delivery.time_window}</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{delivery.shop_name}</div>
                    {delivery.shop_address && (
                      <div className="text-sm text-gray-600">{delivery.shop_address}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={getStatus(delivery)} size="xs" />
                    <a
                      href={getMapLink(delivery.shop_address || '', '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <MapPin className="h-4 w-4" />
                      {t('dispatch.mobile.pickup')}
                    </a>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500">{t('dispatch.mobile.delivery')}</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">{delivery.client_name || t('dispatch.mobile.client')}</div>
                  <div className="text-sm text-gray-600">
                    {delivery.client_address}, {delivery.client_city}
                  </div>
                  {(delivery.client_floor || delivery.client_door_code) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      {delivery.client_floor && <span className="rounded bg-gray-100 px-2 py-1">{t('dispatch.mobile.floor')} {delivery.client_floor}</span>}
                      {delivery.client_door_code && <span className="rounded bg-gray-100 px-2 py-1">{t('dispatch.mobile.code')} {delivery.client_door_code}</span>}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {delivery.client_phone && (
                    <a
                      href={`tel:${delivery.client_phone}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Phone className="h-4 w-4" />
                      {t('dispatch.mobile.call')}
                    </a>
                  )}
                  <a
                    href={getMapLink(delivery.client_address, delivery.client_city)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <MapPin className="h-4 w-4" />
                    {t('dispatch.mobile.route')}
                  </a>
                  {delivery.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => openEdit(delivery)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 min-h-[44px]"
                    >
                      <Pencil className="h-4 w-4" />
                      {t('correction.courier.editButton')}
                    </button>
                  )}
                  {activeTab === 'todo' ? (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => handleAssignSelf(delivery.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t('dispatch.mobile.take')}
                      </button>
                      <button
                        onClick={() => setAssignTarget(delivery)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Users className="h-4 w-4" />
                        {t('dispatch.mobile.assign')}
                      </button>
                    </div>
                  ) : activeTab === 'assigned' ? (
                    <div className="ml-auto flex items-center gap-2">
                      {(() => {
                        const isCollectDone = delivery.status === 'picked_up' || delivery.status === 'delivered' || delivery.status === 'cancelled'
                        const isCollectLoading = !!actionLoading[`${delivery.id}:picked_up`]
                        const collectDisabled = isCollectDone || isCollectLoading
                        return (
                      <button
                        onClick={async () => {
                          if (collectDisabled) return
                          try {
                            await updateDeliveryStatus(delivery, 'picked_up')
                          } catch {
                            alert(t('dispatch.mobile.pickupError'))
                          }
                        }}
                        disabled={collectDisabled}
                        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                          collectDisabled
                            ? 'cursor-not-allowed bg-gray-300 text-gray-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {collectDisabled ? `${t('dispatch.mobile.collect')} ✓` : t('dispatch.mobile.collect')}
                      </button>
                        )
                      })()}
                      <button
                        onClick={async () => {
                          try {
                            await updateDeliveryStatus(delivery, 'delivered')
                          } catch {
                            alert(t('dispatch.mobile.deliveryError'))
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        {t('dispatch.mobile.deliver')}
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await updateDeliveryStatus(delivery, 'cancelled')
                          } catch {
                            alert(t('dispatch.mobile.cancelError'))
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <XCircle className="h-4 w-4" />
                        {t('dispatch.mobile.cancel')}
                      </button>
                    </div>
                  ) : (
                    <StatusBadge className="ml-auto" status={getStatus(delivery)} size="xs" />
                  )}
                </div>

                {delivery.notes && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {t('dispatch.mobile.note')}: {delivery.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white border shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">{t('correction.courier.title')}</div>
                <div className="text-xs text-gray-500">{editTarget.client_address}, {editTarget.client_city}</div>
              </div>
              <button
                type="button"
                className="text-sm text-gray-500 min-h-[44px] min-w-[44px]"
                onClick={closeEdit}
                aria-label={t('dispatch.mobile.close')}
              >
                {t('dispatch.mobile.close')}
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('correction.field.floor')}
                </span>
                <input
                  type="text"
                  value={editForm.floor}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, floor: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('correction.field.door_code')}
                </span>
                <input
                  type="text"
                  value={editForm.door_code}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, door_code: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px]"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('correction.field.notes')}
                </span>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={3}
                />
              </label>
            </div>
            <div className="border-t p-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 min-h-[44px]"
              >
                {t('correction.courier.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveCorrection}
                disabled={editSaving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[44px]"
              >
                {editSaving ? t('common.loading') : t('correction.courier.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white border shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">{t('dispatch.mobile.assignDelivery')}</div>
                <div className="text-xs text-gray-500">{assignTarget.shop_name}</div>
              </div>
              <button className="text-sm text-gray-500" onClick={() => setAssignTarget(null)}>{t('dispatch.mobile.close')}</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {couriers.length === 0 ? (
                <div className="p-6 text-center text-gray-500">{t('dispatch.mobile.noCourier')}</div>
              ) : (
                couriers.map((courier) => (
                  <div key={courier.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{courier.name}</div>
                      {courier.phone_number && (
                        <div className="text-xs text-gray-500">{courier.phone_number}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {courier.phone_number ? (
                        <button
                          onClick={async () => {
                            const ok = await handleAssignCourier(assignTarget.id, courier.id)
                            if (!ok) return
                            const link = getWhatsAppLink(assignTarget, courier)
                            if (link !== '#') {
                              window.open(link, '_blank', 'noopener,noreferrer')
                            }
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          {t('dispatch.mobile.assignWhatsapp')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAssignCourier(assignTarget.id, courier.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          {t('dispatch.mobile.assign')}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
