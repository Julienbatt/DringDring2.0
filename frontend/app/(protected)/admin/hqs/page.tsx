'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Building2, MapPin, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import { HqDialog, HqData } from './components/HqDialog'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export const dynamic = 'force-dynamic'

export default function AdminHqsPage() {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [hqs, setHqs] = useState<HqData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedHq, setSelectedHq] = useState<HqData | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (!session?.access_token) return
      const data = await apiGet<HqData[]>('/shops/hqs', session.access_token)
      setHqs(data)
    } catch (error) {
      console.error('Failed to load HQ', error)
      toast.error(t('admin.hq.toast.loadError'))
    } finally {
      setLoading(false)
    }
  }, [session, t])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleCreate = () => {
    setSelectedHq(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (hq: HqData) => {
    setSelectedHq(hq)
    setIsDialogOpen(true)
  }

  const normalizedTerm = searchTerm.trim().toLowerCase()
  const filtered = normalizedTerm
    ? hqs.filter((hq) => (
        hq.name.toLowerCase().includes(normalizedTerm)
        || (hq.address || '').toLowerCase().includes(normalizedTerm)
        || (hq.contact_person || '').toLowerCase().includes(normalizedTerm)
      ))
    : hqs

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin.hq.title')}</h1>
          <p className="text-gray-500 mt-1">
            {hqs.length} {t('admin.hq.subtitleCount')}
          </p>
        </div>
        <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.hq.add')}
        </Button>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
        <Search className="w-4 h-4 text-gray-400 ml-2" />
        <Input
          type="search"
          placeholder={t('admin.hq.searchPlaceholder')}
          className="border-none shadow-none focus-visible:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="table-scroll bg-white rounded-lg border shadow-sm">
        <Table className="w-full table-fixed min-w-[860px]">
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="w-[40%]">{t('admin.hq.table.hqLocation')}</TableHead>
              <TableHead className="w-[45%]">{t('admin.hq.table.contact')}</TableHead>
              <TableHead className="w-[15%] text-right whitespace-nowrap">{t('admin.hq.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center h-32 animate-pulse text-gray-400">
                  {t('common.loading')}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center h-32 text-muted-foreground">
                  {t('admin.hq.table.empty')}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((hq) => (
                <TableRow key={hq.id} className="hover:bg-gray-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="font-semibold text-gray-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-emerald-600" />
                        {hq.name}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {hq.address ? (
                          <span title={hq.address} className="truncate max-w-[220px]">
                            {hq.address}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">{t('admin.hq.addressMissing')}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      {hq.contact_person && (
                        <div className="font-medium text-gray-800">
                          {hq.contact_person}
                        </div>
                      )}
                      {(hq.email || hq.phone) ? (
                        <div className="flex gap-3 text-gray-500">
                          {hq.email && (
                            <div className="flex items-center gap-1" title={hq.email}>
                              <Mail className="w-3 h-3" />
                              <span className="text-xs truncate max-w-[140px]">{hq.email}</span>
                            </div>
                          )}
                          {hq.phone && (
                            <div className="flex items-center gap-1" title={hq.phone}>
                              <Phone className="w-3 h-3" />
                              <span className="text-xs">{hq.phone}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">{t('admin.hq.contactMissing')}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(hq)}>
                      {t('common.edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <HqDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        hqToEdit={selectedHq}
        onSuccess={loadData}
      />
    </div>
  )
}
