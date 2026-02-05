'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../providers/AuthProvider'
import { api } from '@/lib/api'
import { Phone, MapPin, RefreshCw, CheckCircle2, Users, XCircle } from 'lucide-react'

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

const getToday = () => new Date().toISOString().slice(0, 10)

const getMapLink = (address: string, city: string) => {
  const query = encodeURIComponent(`${address}, ${city}`)
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

export default function CourierDispatchPage() {
  const { user, session, loading: authLoading } = useAuth()
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [deliveries, setDeliveries] = useState<DispatchDelivery[]>([])
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'todo' | 'assigned' | 'done'>('todo')
  const [assignTarget, setAssignTarget] = useState<DispatchDelivery | null>(null)

  const canDispatch = !!user?.can_dispatch
  const courierId = user?.courier_id || null

  const fetchDeliveries = async () => {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const query = `?date_from=${encodeURIComponent(selectedDate)}&date_to=${encodeURIComponent(selectedDate)}`
      const [data, couriersRes] = await Promise.all([
        api.get<DispatchDelivery[]>(`/dispatch/deliveries${query}`, session.access_token),
        api.get<any[]>(`/couriers`, session.access_token)
      ])
      setDeliveries(data)
      const formattedCouriers = couriersRes.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        phone_number: c.phone_number || null
      }))
      setCouriers(formattedCouriers)
    } catch (err) {
      console.error(err)
      setError('Impossible de charger le dispatch.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user || !canDispatch) return
    fetchDeliveries()
  }, [user, canDispatch, selectedDate])

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
      setActiveTab('mine')
    } catch (err) {
      console.error(err)
      alert("Erreur lors de l'assignation")
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
      console.error(err)
      alert("Erreur lors de l'assignation")
      return false
    }
  }

  const getWhatsAppLink = (delivery: DispatchDelivery, courier: Courier) => {
    if (!courier.phone_number) return '#'
    const cleanNumber = courier.phone_number.replace(/\D/g, '')
    const message = [
      delivery.short_code ? `Code: ${delivery.short_code}` : null,
      `Nouvelle course: ${delivery.shop_name}`,
      `Retrait: ${delivery.shop_address || '-'}`,
      `Livraison: ${delivery.client_address}, ${delivery.client_city}`,
      `Horaire: ${delivery.time_window}`,
      `Sacs: ${delivery.bags ?? '-'}`,
    ].filter(Boolean).join('\n')
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
  }

  if (authLoading) {
    return <div className="p-6 text-gray-500">Chargement...</div>
  }

  if (!canDispatch) {
    return (
      <div className="p-6 bg-white rounded-xl border shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Dispatch</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ce compte n'est pas autorise au dispatch.
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
              <h1 className="text-xl font-bold text-gray-900">Dispatch mobile</h1>
              <p className="text-xs text-gray-500">Assignez-vous les courses en attente</p>
            </div>
            <button
              onClick={fetchDeliveries}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
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
              A prendre ({todo.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assigned')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                activeTab === 'assigned' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              En cours ({assigned.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('done')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold border ${
                activeTab === 'done' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              Termine ({done.length})
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-6 text-center text-gray-500">Chargement...</div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">{error}</div>
      ) : (
        <div className="space-y-4">
          {(activeTab === 'todo' ? todo : activeTab === 'assigned' ? assigned : done).length === 0 ? (
            <div className="p-8 rounded-xl border bg-white text-center text-gray-500">
              Aucune course pour cette date.
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
                  <a
                    href={getMapLink(delivery.shop_address || '', '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <MapPin className="h-4 w-4" />
                    Retrait
                  </a>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500">Livraison</div>
                  <div className="mt-1 text-base font-semibold text-gray-900">{delivery.client_name || 'Client'}</div>
                  <div className="text-sm text-gray-600">
                    {delivery.client_address}, {delivery.client_city}
                  </div>
                  {(delivery.client_floor || delivery.client_door_code) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      {delivery.client_floor && <span className="rounded bg-gray-100 px-2 py-1">Etage {delivery.client_floor}</span>}
                      {delivery.client_door_code && <span className="rounded bg-gray-100 px-2 py-1">Code {delivery.client_door_code}</span>}
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
                      Appeler
                    </a>
                  )}
                  <a
                    href={getMapLink(delivery.client_address, delivery.client_city)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <MapPin className="h-4 w-4" />
                    Itineraire
                  </a>
                  {activeTab === 'todo' ? (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => handleAssignSelf(delivery.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Prendre
                      </button>
                      <button
                        onClick={() => setAssignTarget(delivery)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Users className="h-4 w-4" />
                        Assigner
                      </button>
                    </div>
                  ) : activeTab === 'assigned' ? (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!session?.access_token) return
                          try {
                            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=picked_up`, {}, session.access_token)
                            fetchDeliveries()
                          } catch (err) {
                            alert("Erreur lors de la collecte")
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Collecte
                      </button>
                      <button
                        onClick={async () => {
                          if (!session?.access_token) return
                          try {
                            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=delivered`, {}, session.access_token)
                            fetchDeliveries()
                          } catch (err) {
                            alert("Erreur lors de la livraison")
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Livre
                      </button>
                      <button
                        onClick={async () => {
                          if (!session?.access_token) return
                          try {
                            await api.patch(`/dispatch/deliveries/${delivery.id}/status?status=cancelled`, {}, session.access_token)
                            fetchDeliveries()
                          } catch (err) {
                            alert("Erreur lors de l'annulation")
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <XCircle className="h-4 w-4" />
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <span className="ml-auto text-xs font-semibold text-gray-500">
                      {delivery.status === 'cancelled' ? 'Annulee' : 'Livree'}
                    </span>
                  )}
                </div>

                {delivery.notes && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Note: {delivery.notes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {assignTarget && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white border shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Assigner la course</div>
                <div className="text-xs text-gray-500">{assignTarget.shop_name}</div>
              </div>
              <button className="text-sm text-gray-500" onClick={() => setAssignTarget(null)}>Fermer</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {couriers.length === 0 ? (
                <div className="p-6 text-center text-gray-500">Aucun coursier disponible.</div>
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
                          Assigner + WhatsApp
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAssignCourier(assignTarget.id, courier.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Assigner
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
