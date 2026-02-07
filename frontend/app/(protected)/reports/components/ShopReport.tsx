'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ClientAutocomplete from '@/components/ClientAutocomplete'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { createClient } from '@/lib/supabase/client'
import { apiPost, apiGet, apiPatch, API_BASE_URL } from '@/lib/api'
import { toast } from 'sonner'
import { useShopClients } from '../hooks/useShopClients'
import { useShopDeliveries } from '../hooks/useShopDeliveries'
import { useShopPeriods } from '../hooks/useShopPeriods'
import { useShopStats } from '@/app/(protected)/reports/hooks/useShopStats'
import { useMe } from '../../hooks/useMe'

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function getToday() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatCHF(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return `CHF ${value.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: unknown) {
  if (!value) return ''
  const asText = String(value)
  return asText.slice(0, 10)
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}
function formatClientAddress(client: {
  address?: string | null
  postal_code?: string | null
  city_name?: string | null
}) {
  const address = String(client.address ?? '').trim()
  const postal = String(client.postal_code ?? '').trim()
  const city = String(client.city_name ?? '').trim()
  const normalized = address.toLowerCase()
  const hasPostal = postal && normalized.includes(postal.toLowerCase())
  const hasCity = city && normalized.includes(city.toLowerCase())
  const parts = [address]
  if (postal && !hasPostal) parts.push(postal)
  if (city && !hasCity) parts.push(city)
  return parts.filter(Boolean).join(' ')
}

type PreviewResult = {
  total_price: string
  share_client: string
  share_city: string
  share_admin_region?: string
}

const TABLE_COLUMNS = [
  'short_code',
  'delivery_date',
  'client_name',
  'address',
  'city_name',
  'bags',
  'basket_value',
  'status',
  'amount_due',
]

const TABLE_LABELS: Record<string, string> = {
  short_code: 'N°',
  delivery_date: 'Date',
  client_name: 'Client',
  address: 'Adresse',
  city_name: 'Commune partenaire',
  bags: 'Sacs',
  basket_value: 'Valeur des courses (CHF)',
  status: 'Statut',
  amount_due: 'Montant facture (TTC)',
}

const EDITABLE_STATUSES = new Set(['created', 'assigned'])
const DELIVERY_EDIT_GRACE_HOURS = 48

function formatStatus(value: unknown) {
  const raw = String(value ?? '').toLowerCase()
  if (!raw) return '-'
  if (raw === 'created') return 'Creee'
  if (raw === 'assigned') return 'En cours'
  if (raw === 'picked_up') return 'En cours'
  if (raw === 'delivered') return 'Livree'
  if (raw === 'issue') return 'Incident'
  if (raw === 'cancelled') return 'Annulee'
  return raw
}

function canEditDelivery(
  status: string,
  updatedAt?: string | null,
  deliveryDate?: string | null
) {
  if (EDITABLE_STATUSES.has(status)) return true
  if (status === 'delivered') {
    let base: Date | null = null
    if (updatedAt) {
      const updated = new Date(updatedAt)
      if (!Number.isNaN(updated.getTime())) {
        base = updated
      }
    }
    if (!base && deliveryDate) {
      const delivered = new Date(deliveryDate)
      if (!Number.isNaN(delivered.getTime())) {
        delivered.setHours(0, 0, 0, 0)
        base = delivered
      }
    }
    if (!base) return false
    const grace = base.getTime() + DELIVERY_EDIT_GRACE_HOURS * 60 * 60 * 1000
    return Date.now() <= grace
  }
  return false
}

type FormState = {
  client_id: string
  delivery_date: string
  time_window: string
  bags: string | number
  order_amount: string | number
  basket_value: string | number
  notes: string
  [key: string]: string | number
}

type DeliveryTableRow = {
  delivery_id?: string
  client_id?: string
  delivery_date?: string
  time_window?: string
  bags?: string | number | null
  order_amount?: string | number | null
  basket_value?: string | number | null
  notes?: string | null
}

export default function ShopReport() {
  const [selectedMonth] = useState(getCurrentMonth())
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: me } = useMe()
  const isHqDependentShop = Boolean(me?.role === 'shop' && me?.hq_id)

  const [formState, setFormState] = useState<FormState>({
    client_id: '',
    delivery_date: getToday(),
    time_window: '',
    bags: '',
    order_amount: '',
    basket_value: '',
    notes: '',
  })
  const [deliveryDateDisplay, setDeliveryDateDisplay] = useState(() => formatSwissDate(getToday()))
  const [formResetKey, setFormResetKey] = useState(0)
  const [isCreatingClient, setIsCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '', address: '', postal_code: '', city_id: '', floor: '', door_code: '',
    phone: '',
    email: '',
    create_account: false,
    is_cms: false
  })
  const [newClientSubmitting, setNewClientSubmitting] = useState(false)
  const [cities, setCities] = useState<{ id: string; name: string }[]>([])
  const normalizePhone = (value: string) => {
    const cleaned = value.replace(/\s+/g, '')
    if (!cleaned) return ''
    if (cleaned.startsWith('+')) return cleaned
    if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`
    if (cleaned.startsWith('0')) return `+41${cleaned.slice(1)}`
    if (cleaned.startsWith('41')) return `+${cleaned}`
    return cleaned
  }
  const isValidSwissPhone = (value: string) => {
    if (!value) return true
    if (!value.startsWith('+41')) return false
    const digits = value.replace(/\D/g, '')
    return digits.length === 11
  }
  const formatSwissPhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    let rest = ''
    if (digits.startsWith('41')) {
      rest = digits.slice(2)
    } else if (digits.startsWith('0')) {
      rest = digits.slice(1)
    } else {
      rest = digits
    }
    rest = rest.slice(0, 9)
    const seg1 = rest.slice(0, 2)
    const seg2 = rest.slice(2, 5)
    const seg3 = rest.slice(5, 7)
    const seg4 = rest.slice(7, 9)
    let formatted = '+41'
    if (seg1) formatted += ` ${seg1}`
    if (seg2) formatted += ` ${seg2}`
    if (seg3) formatted += ` ${seg3}`
    if (seg4) formatted += ` ${seg4}`
    return formatted
  }

  useEffect(() => {
    const monthParam = searchParams.get('month')
    if (!monthParam) return
    const url = new URL(window.location.href)
    url.searchParams.delete('month')
    router.replace(`${url.pathname}${url.search}`, { scroll: false })
  }, [router, searchParams])

  useEffect(() => {
    setDeliveryDateDisplay(formatSwissDate(formState.delivery_date))
  }, [formState.delivery_date, formResetKey])

  function formatSwissDate(value: string) {
    if (!value) return ''
    const [year, month, day] = value.split('-')
    if (!year || !month || !day) return value
    return `${day}/${month}/${year}`
  }

  function parseSwissDate(value: string) {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!match) return null
    const [, dd, mm, yyyy] = match
    const iso = `${yyyy}-${mm}-${dd}`
    const test = new Date(iso)
    if (Number.isNaN(test.getTime())) return null
    return iso
  }

  // Fetch cities for New Client form
  useEffect(() => {
    if (isCreatingClient && cities.length === 0) {
      const fetchCities = async () => {
        try {
          // Need to get session
          const supabase = createClient()
          const { data } = await supabase.auth.getSession()
          if (data.session) {
            const res = await apiGet<{ id: string; name: string }[]>('/cities/shop', data.session.access_token)
            setCities(res)
          }
        } catch (e) { console.error("Failed to load cities", e) }
      }
      fetchCities()
    }
  }, [isCreatingClient, cities.length])

  const handleAddressSelect = (addr: { street: string; number: string; zip: string; city: string }) => {
    // 1. Fill address
    const fullAddress = `${addr.street} ${addr.number}`.trim()

    // 2. Try to find city
    // addr.city usually "Sion", "Bramois", etc.
    const normalizedCity = addr.city.toLowerCase()
    const foundCity = cities.find(c => c.name.toLowerCase() === normalizedCity)

    setNewClient(prev => ({
      ...prev,
      address: fullAddress,
      postal_code: addr.zip,
      city_id: foundCity ? foundCity.id : prev.city_id,
      // Also pre-fill name if we want? No, name is usually company or person name, not address label.
    }))
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newClient.create_account && !newClient.email.trim()) {
      alert("Renseignez un email pour creer un compte client")
      return
    }
    if (newClient.phone && !isValidSwissPhone(normalizePhone(newClient.phone))) {
      alert("Numero invalide. Format attendu: +41...")
      return
    }
    setNewClientSubmitting(true)
    try {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      if (!data.session) return

      const res = await apiPost<{ id: string }>('/clients/shop', {
        ...newClient,
        email: newClient.email.trim() || null,
        phone: newClient.phone ? normalizePhone(newClient.phone) : null,
        active: true
      }, data.session.access_token)

      // Success
      await refresh() // Refresh client list
      // Select the new client
      setFormState(prev => ({ ...prev, client_id: res.id }))
      setIsCreatingClient(false)
      setNewClient({
        name: '',
        address: '',
        postal_code: '',
        city_id: '',
        floor: '',
        door_code: '',
        phone: '',
        email: '',
        create_account: false,
        is_cms: false
      })
    } catch {
      alert("Erreur creation client")
    } finally {
      setNewClientSubmitting(false)
    }
  }
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(null)
  const [tariffType, setTariffType] = useState<'bags' | 'order_amount' | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [lastShortCode, setLastShortCode] = useState<string | null>(null)

  const {
    data: deliveries,
    isFrozen,
    loading,
    error,
    refresh,
  } = useShopDeliveries(selectedMonth)
  const {
    data: shopStats,
    loading: statsLoading,
    error: statsError,
  } = useShopStats(selectedMonth)
  const {
    data: periods,
  } = useShopPeriods()
  const {
    data: clients,
    loading: clientsLoading,
    error: clientsError,
  } = useShopClients()

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = event.target
    const { name, value } = target
    if (target instanceof HTMLTextAreaElement) {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }))
      return
    }
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      setFormState((prev) => ({
        ...prev,
        [name]: target.checked,
      }))
      return
    }
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  useEffect(() => {
    if (!tariffType) {
      setPreview(null)
      setPreviewError(null)
      return
    }

    if (!tariffType) {
      setSubmitError('Configuration tarifaire indisponible')
      setSubmitting(false)
      return
    }

    const bagCount = tariffType === 'order_amount' ? 1 : Number(formState.bags)

    // [NEW] Block preview if frozen
    if (isFrozen) {
      setPreview(null)
      setPreviewError(null)
      return
    }

    if (!formState.client_id) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    if (tariffType === 'order_amount') {
      if (!formState.order_amount || Number(formState.order_amount) <= 0) {
        setPreview(null)
        setPreviewError(null)
        return
      }
    } else if (Number.isNaN(bagCount) || bagCount < 1) {
      setPreview(null)
      setPreviewError(null)
      return
    }

    let active = true
    setPreviewLoading(true)
    setPreviewError(null)

    const load = async () => {
      try {
        const supabase = createClient()
        const { data: sessionData } = await supabase.auth.getSession()
        const session = sessionData.session
        if (!session) {
          setPreviewError('Session inexistante')
          setPreview(null)
          return
        }

        const payload = {
          client_id: formState.client_id,
          delivery_date: formState.delivery_date,
          time_window: formState.time_window || '08:00-12:00',
          bags: bagCount,
          order_amount: formState.order_amount ? Number(formState.order_amount) : null,
        }

        const result = await apiPost<PreviewResult>(
          '/deliveries/shop/preview',
          payload,
          session.access_token
        )

        if (!active) return
        setPreview(result)
      } catch {
        if (!active) return
        setPreviewError('Impossible de calculer le montant')
        setPreview(null)
      } finally {
        if (active) setPreviewLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [
    formState.client_id,
    formState.bags,
    formState.order_amount,
    formState.delivery_date,
    formState.time_window,
    tariffType,
    isFrozen, // Dependency added
  ])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const bagCount = tariffType === 'order_amount' ? 1 : Number(formState.bags)
    if (isFrozen) {
      setSubmitError('Cette periode est gelee')
      setSubmitting(false)
      return
    }
    if (!formState.client_id) {
      setSubmitError('Veuillez selectionner un client valide dans la liste')
      setSubmitting(false)
      return
    }
    if (tariffType === 'order_amount') {
      if (!formState.order_amount || Number(formState.order_amount) <= 0) {
        setSubmitError('Veuillez saisir une valeur de courses valide')
        setSubmitting(false)
        return
      }
    } else {
      if (Number.isNaN(bagCount) || bagCount < 1) {
        setSubmitError('Veuillez selectionner un nombre de sacs valide')
        setSubmitting(false)
        return
      }
    }

    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) {
        setSubmitError('Session inexistante')
        return
      }

      if (editingDeliveryId) {
        const payload = {
          delivery_date: formState.delivery_date,
          time_window: formState.time_window,
          bags: bagCount,
          order_amount: formState.order_amount ? Number(formState.order_amount) : null,
          basket_value: tariffType === 'order_amount'
            ? (formState.order_amount ? Number(formState.order_amount) : null)
            : (formState.basket_value ? Number(formState.basket_value) : null),
          notes: formState.notes,
        }
        await apiPatch(`/deliveries/shop/${editingDeliveryId}`, payload, session.access_token)
        setEditingDeliveryId(null)
      } else {
        const payload = {
          client_id: formState.client_id,
          delivery_date: formState.delivery_date,
          time_window: formState.time_window,
          bags: bagCount,
          order_amount: formState.order_amount ? Number(formState.order_amount) : null,
          basket_value: tariffType === 'order_amount'
            ? (formState.order_amount ? Number(formState.order_amount) : null)
            : (formState.basket_value ? Number(formState.basket_value) : null),
          notes: formState.notes,
        }
        const created = await apiPost<{ delivery_id: string; short_code?: string }>(
          '/deliveries/shop',
          payload,
          session.access_token
        )
        if (created?.short_code) {
          setLastShortCode(created.short_code)
          toast.success(`Livraison creee. Code: ${created.short_code}`)
        }
      }
      setFormState((prev) => ({
        ...prev,
        client_id: '',
        time_window: '',
        bags: '',

        order_amount: '',
        basket_value: '',
        notes: '',
      }))
      setFormResetKey((prev) => prev + 1)
      await refresh()
    } catch {
      setSubmitError(editingDeliveryId ? 'Impossible de modifier la livraison' : 'Impossible de creer la livraison')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingDeliveryId(null)
    setFormState((prev) => ({
      ...prev,
      client_id: '',
      delivery_date: getToday(),
      time_window: '',
      bags: '',
      order_amount: '',
      basket_value: '',
      notes: '',
    }))
    setFormResetKey((prev) => prev + 1)
  }

  const handleEditDelivery = (row: DeliveryTableRow) => {
    if (!row?.delivery_id) return
    setEditingDeliveryId(row.delivery_id)
    setFormState((prev) => ({
      ...prev,
      client_id: row.client_id || prev.client_id,
      delivery_date: formatDate(row.delivery_date) || prev.delivery_date,
      time_window: row.time_window || '',
      bags: row.bags ?? '',
      order_amount: row.order_amount ?? '',
      basket_value: row.basket_value ?? '',
      notes: row.notes ?? '',
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelDelivery = async (row: DeliveryTableRow) => {
    if (!row?.delivery_id) return
    const reason = window.prompt("Raison de l'annulation (optionnelle) ?") ?? ''
    try {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) {
        setSubmitError('Session inexistante')
        return
      }
      await apiPost(`/deliveries/shop/${row.delivery_id}/cancel`, { reason }, session.access_token)
      if (editingDeliveryId === row.delivery_id) {
        handleCancelEdit()
      }
      await refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Impossible d'annuler la livraison"
      setSubmitError(message)
    }
  }

  useEffect(() => {
    // Fetch shop configuration on mount
    const fetchConfig = async () => {
      try {
        const supabase = createClient()
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) return

        const config = await apiGet('/deliveries/shop/configuration', sessionData.session.access_token) as { rule_type: string }
        const normalized = String(config.rule_type || '').trim().toLowerCase()
        setTariffType(normalized === 'order_amount' ? 'order_amount' : 'bags')
        setConfigError(null)
      } catch (e) {
        console.error('Failed to load shop config', e)
        setConfigError('Configuration tarifaire indisponible.')
      } finally {
        setConfigLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const selectedClient = (clients ?? []).find(
    (client) => client.id === formState.client_id
  )

  const newClients =
    shopStats ? Math.max(0, shopStats.unique_clients - shopStats.repeat_clients) : 0

  // [NEW] Find current period freeze details
  const currentFrozenPeriod = (periods ?? []).find(
    (p) => String(p.period_month).startsWith(selectedMonth)
  )

  return (
    <div className="p-8 space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Livraisons - Commerce</h1>
          {isFrozen && (
            <div className="flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1">
              <span className="text-xs font-medium text-orange-700">Periode gelee</span>
              {currentFrozenPeriod && (
                <>
                  <span className="text-xs text-orange-600">
                    (par {currentFrozenPeriod.frozen_by_name || 'Admin'} le {formatDate(currentFrozenPeriod.frozen_at)})
                  </span>

                  {!isHqDependentShop && (
                    <button
                      onClick={async () => {
                        try {
                          const supabase = createClient()
                          const { data } = await supabase.auth.getSession()
                          if (!data.session) return

                          const res = await fetch(`${API_BASE_URL}/reports/shop-monthly-pdf?shop_id=${currentFrozenPeriod.shop_id || ''}&month=${selectedMonth}`, {
                            headers: { Authorization: `Bearer ${data.session.access_token}` }
                          })
                          if (!res.ok) throw new Error("Erreur téléchargement")

                          const blob = await res.blob()
                          const url = window.URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = `Commerce_Report_${selectedMonth}.pdf`
                          document.body.appendChild(a)
                          a.click()
                          window.URL.revokeObjectURL(url)
                          document.body.removeChild(a)
                        } catch {
                          alert("Impossible de télécharger le PDF")
                        }
                      }}
                      type="button"
                      className="ml-2 flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                      PDF
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </header >

      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="text-sm font-medium text-gray-700">
          {editingDeliveryId ? 'Modifier une livraison' : 'Enregistrer une livraison'}
        </h2>

        {isFrozen && (
          <div className="text-sm text-orange-600">
            Periode gelee : creation et simulation de livraisons desactivees.
          </div>
        )}
        {configLoading && (
          <div className="text-sm text-gray-500">Chargement de la configuration tarifaire...</div>
        )}
        {configError && (
          <div className="text-sm text-red-600">{configError}</div>
        )}
        {lastShortCode && (
          <div className="text-sm text-emerald-700">
            Code de livraison: <span className="font-semibold">{lastShortCode}</span>
          </div>
        )}
        {submitError && (
          <div className="text-sm text-red-600">{submitError}</div>
        )}
        {clientsError && (
          <div className="text-sm text-red-600">{clientsError}</div>
        )}

        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-sm text-gray-600 md:col-span-2">
            Client
            <ClientAutocomplete
              key={`client-${formResetKey}`}
              clients={clients ?? []}
              value={formState.client_id}
              onChange={(clientId) => {
                setFormState((prev) => ({
                  ...prev,
                  client_id: clientId,
                }))
              }}
              placeholder={clientsLoading ? 'Chargement...' : 'Rechercher un client'}
              disabled={Boolean(editingDeliveryId)}
            />
            <button
              type="button"
              className="text-xs text-blue-600 underline ml-2"
              onClick={() => setIsCreatingClient(true)}
              disabled={Boolean(editingDeliveryId)}
            >
              + Nouveau Client
            </button>
          </label>

          {isCreatingClient && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
              <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">Nouveau Client</h3>

                <div className="space-y-4">
                  <label className="block text-sm">
                    Nom Complet
                    <input
                      className="w-full border rounded px-2 py-1 mt-1"
                      value={newClient.name}
                      onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                      placeholder="Nom Prénom ou Société"
                    />
                  </label>

                  <div className="block text-sm">
                    Recherche Adresse (Suisse)
                    <AddressAutocomplete onSelect={handleAddressSelect} />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      Adresse (Rue + No)
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={newClient.address}
                        onChange={e => setNewClient({ ...newClient, address: e.target.value })}
                      />
                    </label>
                    <label className="block text-sm">
                      NPA
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={newClient.postal_code}
                        onChange={e => setNewClient({ ...newClient, postal_code: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="block text-sm">
                    Commune partenaire
                    <select
                      className="w-full border rounded px-2 py-1 mt-1"
                      value={newClient.city_id}
                      onChange={e => setNewClient({ ...newClient, city_id: e.target.value })}
                    >
                      <option value="">Choisir une commune partenaire...</option>
                      {cities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block text-sm">
                      Etage
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={newClient.floor}
                        onChange={e => setNewClient({ ...newClient, floor: e.target.value })}
                        placeholder="ex: 3ème"
                      />
                    </label>
                    <label className="block text-sm">
                      Digicode
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={newClient.door_code}
                        onChange={e => setNewClient({ ...newClient, door_code: e.target.value })}
                        placeholder="ex: 1234A"
                      />
                    </label>
                    <label className="block text-sm">
                      Tél
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        value={newClient.phone}
                        onChange={e => setNewClient({ ...newClient, phone: formatSwissPhone(e.target.value) })}
                        placeholder="+4179..."
                        onBlur={(event) =>
                          setNewClient((prev) => ({
                            ...prev,
                            phone: normalizePhone(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      Email (optionnel)
                      <input
                        className="w-full border rounded px-2 py-1 mt-1"
                        type="email"
                        value={newClient.email}
                        onChange={e => setNewClient({ ...newClient, email: e.target.value })}
                        placeholder="prenom.nom@email.ch"
                      />
                    </label>
                    <label className="block text-sm">
                      Compte client
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          checked={newClient.create_account}
                          onChange={e =>
                            setNewClient({ ...newClient, create_account: e.target.checked })
                          }
                          disabled={!newClient.email}
                        />
                        <span className="text-xs text-gray-500">
                          Créer un compte si email renseigné
                        </span>
                      </div>
                    </label>
                  </div>

                  <label className="block text-sm">
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="checkbox"
                        checked={newClient.is_cms}
                        onChange={e => setNewClient({ ...newClient, is_cms: e.target.checked })}
                      />
                      <span className="text-xs text-gray-600">
                        Bénéficiaire CMS (tarif réduit)
                      </span>
                    </div>
                  </label>

                </div>

                <div className="flex justify-end pt-4 border-t mt-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingClient(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={newClientSubmitting || !newClient.name || !newClient.city_id}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {newClientSubmitting ? '...' : 'Créer'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedClient && (
            <div className="md:col-span-2 rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <div className="font-medium">{selectedClient.name}</div>
              <div>{formatClientAddress(selectedClient)}</div>
              <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                {selectedClient.floor && <span>Etage: {selectedClient.floor}</span>}
                {selectedClient.door_code && <span>Code: {selectedClient.door_code}</span>}
                {selectedClient.phone && <span>Tél: {selectedClient.phone}</span>}
              </div>
              <div>{selectedClient.is_cms ? 'Client CMS' : 'Client standard'}</div>
            </div>
          )}
          <label className="text-sm text-gray-600">
            Date
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              type="text"
              inputMode="numeric"
              placeholder="JJ/MM/AAAA"
              name="delivery_date_display"
              value={deliveryDateDisplay}
              onChange={(event) => {
                const next = event.target.value.replace(/[^\d/]/g, '')
                setDeliveryDateDisplay(next)
                const parsed = parseSwissDate(next)
                if (parsed) {
                  setFormState((prev) => ({
                    ...prev,
                    delivery_date: parsed,
                  }))
                }
              }}
              onBlur={() => {
                const parsed = parseSwissDate(deliveryDateDisplay)
                if (!parsed) {
                  setDeliveryDateDisplay(formatSwissDate(formState.delivery_date))
                }
              }}
              required
            />
          </label>
          <label className="text-sm text-gray-600">
            Heure de livraison
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              type="time"
              name="time_window"
              value={formState.time_window}
              onChange={handleChange}
              required
            />
          </label>
          {!configLoading && tariffType === 'bags' && (
            <label className="text-sm text-gray-600">
              Sacs
              <select
                className="mt-1 w-full rounded border px-2 py-1"
                name="bags"
                value={formState.bags}
                onChange={handleChange}
                required
              >
                <option value="">Selectionner</option>
                {Array.from({ length: 20 }, (_, index) => index + 1).map(
                  (count) => (
                    <option key={count} value={count}>
                      {count} sac{count > 1 ? 's' : ''}
                    </option>
                  )
                )}
              </select>
            </label>
          )}

          <label className="text-sm text-gray-600 md:col-span-2">
            Remarques / Instructions (facultatif)
            <textarea
              className="mt-1 w-full rounded border px-2 py-1"
              name="notes"
              rows={2}
              value={formState.notes}
              onChange={handleChange}
              placeholder="Code porte, étage, contact spécifique..."
            />
          </label>

          {!configLoading && tariffType === 'order_amount' && (
            <label className="text-sm text-gray-600">
              Montant commande (CHF)
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                type="number"
                step="0.05"
                name="order_amount"
                value={formState.order_amount || ''}
                onChange={handleChange}
                required
              />
              <span className="text-xs text-gray-400">
                Obligatoire pour les commerces au tarif palier.
              </span>
            </label>
          )}

          {!configLoading && tariffType === 'bags' && (
            <label className="text-sm text-gray-600">
              Valeur des courses (CHF)
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                type="number"
                step="0.05"
                name="basket_value"
                value={formState.basket_value || ''}
                onChange={handleChange}
                placeholder="Optionnel"
              />
              <span className="text-xs text-gray-400">
                Utilise pour la rentabilite, non facture.
              </span>
            </label>
          )}

          {previewError && (
            <div className="md:col-span-2 text-sm text-red-600">
              {previewError}
            </div>
          )}
          {previewLoading && (
            <div className="md:col-span-2 text-sm text-gray-500">
              Calcul du montant...
            </div>
          )}
          {preview && !previewLoading && (
            <div className="md:col-span-2 rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <div className="font-medium">Estimation</div>
              <div>
                Total livraison :{' '}
                <span className="font-semibold">
                  {formatCHF(Number(preview.total_price))}
                </span>
              </div>
              <div>Part client : {formatCHF(Number(preview.share_client))}</div>
              <div>Part commune : {formatCHF(Number(preview.share_city))}</div>
              <div>
                Part entreprise regionale :{' '}
                {formatCHF(Number(preview.share_admin_region || 0))}
              </div>
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              type="submit"
              disabled={submitting || !preview || isFrozen || configLoading || Boolean(configError)}
            >
              {submitting
                ? 'Enregistrement...'
                : editingDeliveryId
                  ? 'Enregistrer les modifications'
                  : 'Creer la livraison'}
            </button>
            {editingDeliveryId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Annuler la modification
              </button>
            )}
          </div>
        </form>
      </section >

      <section className="space-y-4">
        <div className="text-sm font-medium text-gray-700">Stats du mois</div>
        {statsLoading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : statsError ? (
          <div className="text-sm text-red-600">{statsError}</div>
        ) : shopStats ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Impact financier
                </h3>
                <span className="text-xs text-emerald-700">Recettes & volume</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Montant facture (TTC)</div>
                  <div className="text-2xl font-semibold">{formatCHF(shopStats.total_volume_chf)}</div>
                  <div className="text-xs text-gray-400">Part entreprise regionale</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Montant des courses</div>
                  <div className="text-2xl font-semibold">
                    {formatCHF(shopStats.total_basket_value_chf)}
                  </div>
                  <div className="text-xs text-gray-400">
                    Panier moyen: {formatCHF(shopStats.average_basket_value_chf)}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Livraisons (ce mois)</div>
                  <div className="text-2xl font-semibold">{shopStats.total_deliveries}</div>
                  <div className="text-xs text-gray-400">
                    {formatPercent(shopStats.deliveries_change_pct)} vs {shopStats.previous_month}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Public & social
                </h3>
                <span className="text-xs text-amber-700">Impact CMS</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-amber-700">Livraisons CMS</div>
                  <div className="text-2xl font-semibold">{shopStats.cms_deliveries}</div>
                  <div className="text-xs text-amber-700/80">Volume social du mois</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">% livraisons CMS</div>
                  <div className="text-2xl font-semibold">{shopStats.cms_share_pct.toFixed(1)}%</div>
                  <div className="text-xs text-gray-400">Part du mois</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Prise en charge CMS</div>
                  <div className="text-2xl font-semibold">
                    {formatCHF(shopStats.cms_subsidy_chf)}
                  </div>
                  <div className="text-xs text-gray-400">Participation Velocite</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                  Service & fidelite
                </h3>
                <span className="text-xs text-sky-700">Clients</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Clients servis</div>
                  <div className="text-2xl font-semibold">{shopStats.unique_clients}</div>
                  <div className="text-xs text-gray-400">Nouveaux: {newClients}</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Clients recurrents</div>
                  <div className="text-2xl font-semibold">{shopStats.repeat_clients}</div>
                  <div className="text-xs text-gray-400">
                    Taux: {shopStats.repeat_rate_pct.toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="text-sm font-medium text-gray-700">Top clients</div>
                {shopStats.top_clients.length === 0 ? (
                  <div className="text-sm text-gray-500">Aucun client recurrent.</div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {shopStats.top_clients.map((client) => (
                      <div key={client.client_id} className="rounded border px-3 py-2">
                        <div className="text-sm font-medium">{client.client_name}</div>
                        <div className="text-xs text-gray-500">
                          {client.deliveries} livraisons - {client.bags} sacs
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Operations
                </h3>
                <span className="text-xs text-slate-500">Rythme & capacite</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Sacs livres</div>
                  <div className="text-2xl font-semibold">{shopStats.total_bags}</div>
                  <div className="text-xs text-gray-400">
                    Moyenne: {shopStats.average_bags.toFixed(1)}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Jours actifs</div>
                  <div className="text-2xl font-semibold">{shopStats.active_days}</div>
                  <div className="text-xs text-gray-400">Mois en cours</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Livraisons / jour</div>
                  <div className="text-2xl font-semibold">
                    {shopStats.deliveries_per_active_day.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">Jours actifs</div>
                </div>
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="text-sm text-gray-500">Pic du mois</div>
                  <div className="text-2xl font-semibold">
                    {shopStats.peak_day_deliveries || 0}
                  </div>
                  <div className="text-xs text-gray-400">
                    {shopStats.peak_day ? formatDate(shopStats.peak_day) : 'n/a'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">
          Historique des livraisons
        </h2>

        {loading ? (
          <div className="text-sm text-gray-500">Chargement...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : deliveries && deliveries.length > 0 ? (
          <div className="overflow-auto border rounded">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="border px-3 py-2 text-left font-medium text-gray-700"
                    >
                      {TABLE_LABELS[col] ?? col}
                    </th>
                  ))}
                  <th className="border px-3 py-2 text-left font-medium text-gray-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((row, index) => (
                  <tr key={index} className="odd:bg-white even:bg-gray-50">
                    {TABLE_COLUMNS.map((col) => {
                      const statusRaw = String(row.status || '')
                      const isCancelled = statusRaw.toLowerCase() === 'cancelled'
                      const value = row[col]
                      const cell =
                        col === 'amount_due'
                          ? formatCHF(isCancelled ? 0 : Number(row.share_admin_region || 0))
                          : col === 'basket_value'
                            ? isCancelled
                              ? formatCHF(0)
                              : row.basket_value === null || row.basket_value === undefined || row.basket_value === ''
                                ? '-'
                                : formatCHF(Number(row.basket_value))
                          : col === 'status'
                            ? formatStatus(value)
                            : col === 'delivery_date'
                              ? formatDate(value)
                              : String(value ?? '')
                      return (
                        <td
                          key={col}
                          className="border px-3 py-2 whitespace-nowrap"
                        >
                          {cell}
                        </td>
                      )
                    })}
                    <td className="border px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const status = String(row.status || '')
                        const canEdit = canEditDelivery(status, row.status_updated_at, row.delivery_date) && !isFrozen
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                              onClick={() => handleEditDelivery(row)}
                              disabled={!canEdit}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="text-xs font-medium text-red-600 hover:text-red-800 disabled:text-gray-400"
                              onClick={() => handleCancelDelivery(row)}
                              disabled={!canEdit}
                            >
                              Annuler
                            </button>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Aucune livraison.</div>
        )}
      </section>

    </div >
  )
}
