'use client'

import { useEffect, useState } from 'react'
import { Download, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MonthInput } from '@/components/ui/month-input'
import { apiGet, API_BASE_URL } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'

type CitySummaryRow = {
  city_id: string
  city_name: string
  billing_month: string
  total_deliveries: number
  total_amount_due: number | string
  total_volume_chf: number | string
}

type CityShopRow = {
  shop_id: string
  shop_name: string
  city_name: string
  total_deliveries: number
  total_subvention_due: number | string
  total_volume_chf: number | string
}

type CityDeliveryRow = {
  delivery_id: string
  delivery_date: string
  shop_id: string
  shop_name: string
  city_name: string
  client_name: string | null
  address: string | null
  postal_code: string | null
  delivery_city: string | null
  bags: number | null
  is_cms: boolean | null
  time_window: string | null
  total_price: number | string | null
  share_city: number | string | null
  share_admin_region: number | string | null
  share_client: number | string | null
}

function getCurrentMonth() {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function formatMonth(value: string) {
  const date = new Date(value.length === 7 ? `${value}-01` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
}

export default function CityBillingPage() {
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [summary, setSummary] = useState<CitySummaryRow | null>(null)
  const [shops, setShops] = useState<CityShopRow[]>([])
  const [deliveries, setDeliveries] = useState<CityDeliveryRow[]>([])
  const [selectedShopId, setSelectedShopId] = useState('all')
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'cms' | 'non_cms'>('all')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    if (!user?.city_id) return
    loadData()
    loadDeliveries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, user?.city_id])

  const loadData = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const summaryRows = await apiGet<CitySummaryRow[]>(
        `/reports/city-billing?month=${selectedMonth}`,
        session.access_token
      )
      setSummary(summaryRows[0] || null)

      const shopRows = await apiGet<CityShopRow[]>(
        `/reports/city-billing-shops?month=${selectedMonth}`,
        session.access_token
      )
      setShops(shopRows)
    } catch (error) {
      console.error('Failed to load city billing', error)
      toast.error('Erreur lors du chargement des donnees')
    } finally {
      setLoading(false)
    }
  }

  const loadDeliveries = async () => {
    if (!user?.city_id) return
    setDetailLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const rows = await apiGet<CityDeliveryRow[]>(
        `/reports/city-billing-deliveries?city_id=${user.city_id}&month=${selectedMonth}`,
        session.access_token
      )
      setDeliveries(rows)
    } catch (error) {
      console.error('Failed to load city deliveries', error)
      toast.error('Erreur lors du chargement des details')
    } finally {
      setDetailLoading(false)
    }
  }

  const downloadCsv = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const apiBase = API_BASE_URL
      if (!apiBase) return

      const response = await fetch(`${apiBase}/reports/city-billing/export?month=${selectedMonth}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('Export CSV impossible')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `facturation-commune-${selectedMonth}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CSV export failed', error)
      toast.error("Erreur lors de l'export CSV")
    }
  }

  const downloadPdf = async () => {
    if (!user?.city_id) return
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const apiBase = API_BASE_URL
      if (!apiBase) return

      const url = `${apiBase}/reports/city-monthly-pdf?city_id=${user.city_id}&month=${selectedMonth}`
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!response.ok) throw new Error('PDF indisponible (periode non gelee)')

      const blob = await response.blob()
      const urlObject = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = urlObject
      a.download = `facturation-commune-${selectedMonth}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(urlObject)
    } catch (error) {
      console.error('PDF download failed', error)
      toast.error('Erreur lors du telechargement PDF')
    }
  }

  const filteredByShop = selectedShopId === 'all'
    ? deliveries
    : deliveries.filter((row) => row.shop_id === selectedShopId)

  const visibleDetails =
    audienceFilter === 'all'
      ? filteredByShop
      : filteredByShop.filter((row) =>
          audienceFilter === 'cms' ? row.is_cms : !row.is_cms
        )

  const cmsDeliveries = deliveries.filter((row) => row.is_cms).length
  const cmsSharePct = deliveries.length
    ? (cmsDeliveries / deliveries.length) * 100
    : 0

  if (!user?.city_id) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <h1 className="text-xl font-semibold text-slate-900">Acces commune incomplet</h1>
          <p className="mt-2 text-sm text-slate-600">
            Aucun identifiant de commune n&apos;est associe a votre compte. Contactez l&apos;administration regionale.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturation communale</h1>
          <p className="text-muted-foreground">Resume et detail des livraisons par commerce</p>
          <p className="text-xs text-emerald-700 mt-1">
            Periode analysee: {formatMonth(selectedMonth)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthInput
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-[180px]"
          />
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="default" onClick={downloadPdf}>
            <FileText className="mr-2 h-4 w-4" />
            PDF officiel
          </Button>
        </div>
      </div>

      {!loading && !summary && shops.length === 0 && deliveries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Aucune donnee disponible sur {formatMonth(selectedMonth)}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Cette vue se remplit automatiquement lorsqu&apos;il y a des livraisons consolidees
            pour votre commune sur la periode.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Volume total</div>
          <div className="text-2xl font-bold">
            CHF {Number(summary?.total_volume_chf || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Livraisons</div>
          <div className="text-2xl font-bold">{summary?.total_deliveries || 0}</div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Subvention communale</div>
          <div className="text-2xl font-bold">
            CHF {Number(summary?.total_amount_due || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Budget mobilise sur la periode</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Livraisons CMS</div>
          <div className="text-2xl font-bold">{cmsDeliveries}</div>
          <div className="text-xs text-muted-foreground">
            {cmsSharePct.toFixed(1)}% des livraisons
          </div>
        </div>
        <div className="rounded-xl border bg-card text-card-foreground shadow p-6">
          <div className="text-sm font-medium text-muted-foreground">Public prioritaire</div>
          <div className="text-2xl font-bold">CMS</div>
          <div className="text-xs text-muted-foreground">
            Personnes agees ou a mobilite reduite
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Commerce</TableHead>
              <TableHead>Commune</TableHead>
              <TableHead className="text-right">Livraisons</TableHead>
              <TableHead className="text-right">Subvention (CHF)</TableHead>
              <TableHead className="text-right">Total CHF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Chargement...</TableCell>
              </TableRow>
            ) : shops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Aucune donnee pour cette periode.
                </TableCell>
              </TableRow>
            ) : (
              shops.map((row) => (
                <TableRow key={row.shop_id}>
                  <TableCell className="font-medium">{row.shop_name}</TableCell>
                  <TableCell>{row.city_name}</TableCell>
                  <TableCell className="text-right">{row.total_deliveries}</TableCell>
                  <TableCell className="text-right">
                    CHF {Number(row.total_subvention_due || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    CHF {Number(row.total_volume_chf || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border bg-white p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Detail des courses</div>
            <div className="text-sm text-muted-foreground">
              Filtrez par commerce ou public pour consulter le detail.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              className="border rounded px-3 py-2 text-sm"
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
            >
              <option value="all">Tous les commerces</option>
              {shops.map((row) => (
                <option key={row.shop_id} value={row.shop_id}>
                  {row.shop_name}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={audienceFilter}
              onChange={(e) =>
                setAudienceFilter(e.target.value as 'all' | 'cms' | 'non_cms')
              }
            >
              <option value="all">Tous les publics</option>
              <option value="cms">Public CMS</option>
              <option value="non_cms">Public standard</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Commerce</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead>NPA</TableHead>
                <TableHead>Commune</TableHead>
                <TableHead>Public</TableHead>
                <TableHead className="text-right">Sacs</TableHead>
                <TableHead className="text-right">Total CHF</TableHead>
                <TableHead className="text-right">Part commune</TableHead>
                <TableHead className="text-right">Part entreprise regionale</TableHead>
                <TableHead className="text-right">Part client</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-20 text-center">Chargement...</TableCell>
                </TableRow>
              ) : visibleDetails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-20 text-center text-muted-foreground">
                    Aucune livraison pour cette periode.
                  </TableCell>
                </TableRow>
              ) : (
                visibleDetails.map((row) => (
                  <TableRow key={row.delivery_id}>
                    <TableCell>{new Date(row.delivery_date).toLocaleDateString('fr-CH')}</TableCell>
                    <TableCell>{row.shop_name}</TableCell>
                    <TableCell>{row.client_name || '-'}</TableCell>
                    <TableCell>{row.address || '-'}</TableCell>
                    <TableCell>{row.postal_code || '-'}</TableCell>
                    <TableCell>{row.delivery_city || row.city_name}</TableCell>
                    <TableCell>{row.is_cms ? 'CMS' : 'Standard'}</TableCell>
                    <TableCell className="text-right">{row.bags ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      CHF {Number(row.total_price || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </TableCell>
                      <TableCell className="text-right">
                        CHF {Number(row.share_city || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        CHF {Number(row.share_admin_region || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                      </TableCell>
                    <TableCell className="text-right">
                      CHF {Number(row.share_client || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
