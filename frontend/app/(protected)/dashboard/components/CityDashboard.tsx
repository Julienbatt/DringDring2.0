'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Leaf, Users, Building2, Bike } from 'lucide-react'
import { useCityStats } from '../hooks/useCityStats'
import { useEcoStats } from '@/app/(protected)/hooks/useEcoStats'
import { useCityBillingShops } from '../hooks/useCityBillingShops'

function getCurrentMonth() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

function formatCHF(value: number) {
  return `CHF ${value.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatMonth(value: string) {
  const date = new Date(value.length === 7 ? `${value}-01` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' })
}

type ShopRow = {
  shop_id?: string
  shop_name?: string
  total_deliveries?: number
  total_subvention_due?: number
  total_volume_chf?: number
}

export default function CityDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [isCopyingSummary, setIsCopyingSummary] = useState(false)
  const { data: stats, loading: statsLoading, error: statsError } = useCityStats(selectedMonth)
  const { data: ecoStats, loading: ecoLoading } = useEcoStats(selectedMonth)
  const { data: rawShopRows } = useCityBillingShops(selectedMonth)

  const topShops = useMemo(() => {
    const rows = (rawShopRows ?? []) as ShopRow[]
    return [...rows]
      .sort((a, b) => Number(b.total_deliveries ?? 0) - Number(a.total_deliveries ?? 0))
      .slice(0, 3)
  }, [rawShopRows])

  const stepMonth = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const date = new Date(year, (month || 1) - 1 + delta, 1)
    const next = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    setSelectedMonth(next)
  }

  const totalDeliveries = stats?.total_deliveries ?? 0
  const uniqueClients = stats?.unique_clients ?? 0
  const activeShops = stats?.active_shops ?? 0
  const totalSubvention = stats?.total_subvention_chf ?? 0
  const cmsSharePct = stats?.cms_share_pct ?? 0
  const cmsDeliveries = stats?.cms_deliveries ?? 0
  const deliveriesPerDay = stats?.deliveries_per_active_day ?? 0
  const deliveriesChangePct = stats?.deliveries_change_pct
  const co2Saved = ecoStats?.co2_saved_kg ?? 0
  const kmByBike = ecoStats?.distance_km ?? 0
  const trendLabel =
    deliveriesChangePct === null || deliveriesChangePct === undefined
      ? 'n/a'
      : `${deliveriesChangePct > 0 ? '+' : ''}${deliveriesChangePct.toFixed(1)}%`
  const citySummaryText = [
    `DringDring - Resume ville (${formatMonth(selectedMonth)})`,
    `Livraisons: ${totalDeliveries}`,
    `Beneficiaires: ${uniqueClients}`,
    `Commerces actifs: ${activeShops}`,
    `Subvention communale: ${formatCHF(totalSubvention)}`,
    `Part CMS: ${cmsSharePct.toFixed(1)}% (${cmsDeliveries} livraisons)`,
    `Rythme: ${deliveriesPerDay.toFixed(1)} livraisons/jour actif (evol. ${trendLabel})`,
    `Impact environnemental: ${co2Saved.toFixed(1)} kg CO2 evites, ${kmByBike.toFixed(1)} km a velo`,
  ].join('\n')

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(citySummaryText)
      setIsCopyingSummary(true)
      window.setTimeout(() => setIsCopyingSummary(false), 1500)
    } catch {
      setIsCopyingSummary(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Tableau Ville
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Impact communal DringDring
            </h1>
            <p className="text-sm text-slate-500">
              Pilotage social, economique et environnemental pour {formatMonth(selectedMonth)}.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="rounded-full p-1.5 text-slate-500 hover:bg-white"
              aria-label="Mois precedent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-900">
              {formatMonth(selectedMonth)}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="rounded-full p-1.5 text-slate-500 hover:bg-white"
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/city/billing"
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Ouvrir la facturation
          </Link>
          <Link
            href="/admin/cities"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700"
          >
            Gerer les communes partenaires
          </Link>
        </div>
      </section>

      {statsError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {statsError}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Livraisons</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{statsLoading ? '...' : totalDeliveries}</div>
          <div className="text-xs text-slate-500">Evol. {trendLabel}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <Users className="h-4 w-4 text-emerald-600" />
            Beneficiaires
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{statsLoading ? '...' : uniqueClients}</div>
          <div className="text-xs text-slate-500">Menages servis</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Commerces actifs
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{statsLoading ? '...' : activeShops}</div>
          <div className="text-xs text-slate-500">Reseau partenaire</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Subvention communale</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {statsLoading ? '...' : formatCHF(totalSubvention)}
          </div>
          <div className="text-xs text-slate-500">Budget engage</div>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Resume pret a partager</h2>
            <p className="text-xs text-slate-600">
              Texte court pour email, dossier communal ou point de suivi.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopySummary}
            className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {isCopyingSummary ? 'Copie' : 'Copier'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
              Impact social
            </h2>
            <span className="text-xs text-amber-700">Public prioritaire</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Livraisons CMS</div>
              <div className="text-2xl font-semibold text-slate-900">{statsLoading ? '...' : cmsDeliveries}</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">% CMS</div>
              <div className="text-2xl font-semibold text-slate-900">
                {statsLoading ? '...' : `${cmsSharePct.toFixed(1)}%`}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Livraisons / jour actif</div>
              <div className="text-2xl font-semibold text-slate-900">
                {statsLoading ? '...' : deliveriesPerDay.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Impact environnemental
          </h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Leaf className="h-4 w-4 text-emerald-600" />
                CO2 economise
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {ecoLoading ? '...' : `${co2Saved.toFixed(1)} kg`}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Bike className="h-4 w-4 text-emerald-600" />
                Kilometres a velo
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {ecoLoading ? '...' : `${kmByBike.toFixed(1)} km`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Top commerces du mois</h2>
        <p className="text-xs text-slate-500">Vitrine de vos partenaires les plus engages.</p>
        <div className="mt-4 space-y-3">
          {topShops.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              Aucun commerce actif sur cette periode.
            </div>
          ) : (
            topShops.map((shop, index) => (
              <div key={shop.shop_id ?? `shop-${index}`} className="rounded-xl border bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {index + 1}. {shop.shop_name || 'Commerce'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {Number(shop.total_deliveries ?? 0)} livraisons
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatCHF(Number(shop.total_subvention_due ?? 0))}
                    </div>
                    <div className="text-xs text-slate-500">Subvention</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
