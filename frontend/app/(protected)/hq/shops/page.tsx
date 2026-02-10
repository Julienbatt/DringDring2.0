'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Mail, Phone, MapPin, Store } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { apiGet } from '@/lib/api'
import { useAuth } from '../../providers/AuthProvider'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Shop = {
  id: string
  name: string
  city_name?: string | null
  address?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
}

export default function HQShopsPage() {
  const { t } = useLanguage()
  const { session } = useAuth()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const loadShops = useCallback(async () => {
    setLoading(true)
    try {
      if (!session?.access_token) return
      const data = await apiGet<Shop[]>('/shops/hq', session.access_token)
      setShops(data)
    } catch (error) {
      console.error('Failed to load HQ shops', error)
      toast.error(t('hq.shops.toast.loadError'))
    } finally {
      setLoading(false)
    }
  }, [session, t])

  useEffect(() => {
    if (session?.access_token) {
      loadShops()
    }
  }, [session, loadShops])

  const filteredShops = shops.filter((shop) => {
    const query = searchQuery.toLowerCase()
    return (
      shop.name.toLowerCase().includes(query) ||
      (shop.city_name || '').toLowerCase().includes(query) ||
      (shop.contact_person || '').toLowerCase().includes(query)
    )
  })

  const uniqueCities = new Set(
    shops.map((shop) => String(shop.city_name ?? '').trim()).filter(Boolean)
  ).size
  const shopsWithContact = shops.filter(
    (shop) => Boolean(String(shop.contact_person ?? '').trim() || String(shop.phone ?? '').trim())
  ).length
  const subtitle = t('hq.shops.subtitle').replace('{count}', String(shops.length))

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {t('hq.shops.title')}
          </h1>
          <p className="text-gray-500 mt-1">
            {subtitle}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {t('hq.shops.helper')}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="text-xs uppercase tracking-wider text-emerald-700">{t('hq.shops.kpi.coverage')}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{uniqueCities}</div>
          <div className="text-xs text-slate-600">{t('hq.shops.kpi.activeCities')}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">{t('hq.shops.kpi.activeShops')}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{shops.length}</div>
          <div className="text-xs text-slate-600">{t('hq.shops.kpi.hqPortfolio')}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">{t('hq.shops.kpi.contactQuality')}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{shopsWithContact}</div>
          <div className="text-xs text-slate-600">{t('hq.shops.kpi.withContact')}</div>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
        <Search className="w-4 h-4 text-gray-400 ml-2" />
        <Input
          placeholder={t('hq.shops.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-none shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="table-scroll bg-white rounded-xl border shadow-sm">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>{t('hq.shops.table.shop')}</TableHead>
              <TableHead>{t('hq.shops.table.city')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('hq.shops.table.address')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('hq.shops.table.contact')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : filteredShops.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                  {t('hq.shops.empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredShops.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <Store className="h-4 w-4 text-emerald-600" />
                      {shop.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{shop.city_name || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-gray-400" />
                      {shop.address || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-600">
                    <div className="space-y-1">
                      <div>{shop.contact_person || '-'}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Mail className="h-3 w-3" />
                        {shop.email || '-'}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Phone className="h-3 w-3" />
                        {shop.phone || '-'}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
