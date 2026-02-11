'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export type ShopData = {
  id?: string
  name: string
  city_id: string
  hq_id?: string | null
  tariff_version_id?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
}

type ShopDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shopToEdit?: ShopData | null
  onSuccess: () => void
}

type ReferenceData = {
  cities: { id: string; name: string }[]
  hqs: { id: string; name: string }[]
  tariffs: { id: string; name: string }[]
}

export function ShopDialog({ open, onOpenChange, shopToEdit, onSuccess }: ShopDialogProps) {
  const { session, adminContextRegion } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [refData, setRefData] = useState<ReferenceData>({ cities: [], hqs: [], tariffs: [] })

  const [formData, setFormData] = useState<ShopData>({
    name: '',
    city_id: '',
    hq_id: 'none',
    tariff_version_id: 'none',
    address: '',
    lat: null,
    lng: null,
    contact_person: '',
    email: '',
    phone: '',
  })

  useEffect(() => {
    if (shopToEdit) {
      setFormData({
        ...shopToEdit,
        hq_id: shopToEdit.hq_id || 'none',
        tariff_version_id: shopToEdit.tariff_version_id || 'none',
        address: shopToEdit.address || '',
        lat: shopToEdit.lat ?? null,
        lng: shopToEdit.lng ?? null,
        contact_person: shopToEdit.contact_person || '',
        email: shopToEdit.email || '',
        phone: shopToEdit.phone || '',
      })
    } else {
      setFormData({
        name: '',
        city_id: '',
        hq_id: 'none',
        tariff_version_id: 'none',
        address: '',
        lat: null,
        lng: null,
        contact_person: '',
        email: '',
        phone: '',
      })
    }
  }, [shopToEdit, open])

  const fetchReferences = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
      const [cities, hqs, tariffs] = await Promise.all([
        apiGet<ReferenceData['cities']>(`/cities${queryParams}`, session.access_token),
        apiGet<ReferenceData['hqs']>(`/shops/hqs${queryParams}`, session.access_token),
        apiGet<ReferenceData['tariffs']>(`/shops/tariffs${queryParams}`, session.access_token),
      ])
      setRefData({ cities, hqs, tariffs })
    } catch (error) {
      console.error('Error loading references', error)
      toast.error(t('admin.shops.dialog.loadRefsError'))
    }
  }, [session, adminContextRegion, t])

  useEffect(() => {
    if (open && session?.access_token) {
      fetchReferences()
    }
  }, [open, session, fetchReferences])

  const formatAddress = (address: { street: string; number: string; zip: string; city: string }) => {
    const line1 = [address.street, address.number].filter(Boolean).join(' ').trim()
    const line2 = [address.zip, address.city].filter(Boolean).join(' ').trim()
    return [line1, line2].filter(Boolean).join(', ')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.access_token) return

    if (!formData.city_id) {
      toast.error(t('admin.shops.dialog.cityRequired'))
      return
    }
    if (!formData.tariff_version_id || formData.tariff_version_id === 'none') {
      toast.error(t('admin.shops.dialog.tariffRequired'))
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...formData,
        hq_id: formData.hq_id === 'none' ? null : formData.hq_id,
        tariff_version_id: formData.tariff_version_id === 'none' ? null : formData.tariff_version_id,
      }

      if (shopToEdit?.id) {
        await apiPut(`/shops/${shopToEdit.id}`, payload, session.access_token)
        toast.success(t('admin.shops.dialog.updated'))
      } else {
        const res = await apiPost<{
          user_created?: boolean
          user_error?: string | null
          user_email?: string | null
        }>('/shops', payload, session.access_token)
        toast.success(t('admin.shops.dialog.created'))
        if (res?.user_created) {
          toast.info(t('admin.shops.dialog.accountCreated'))
        } else if (res?.user_error) {
          toast.error(`${t('admin.shops.dialog.accountNotCreated')}: ${res.user_error}`)
        }
      }
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, t('admin.shops.dialog.unknownError')))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.access_token || !shopToEdit?.id) return
    if (!confirm(t('admin.shops.dialog.deleteConfirmPrompt'))) return
    setLoading(true)
    try {
      await apiDelete(`/shops/${shopToEdit.id}`, session.access_token)
      toast.success(t('admin.shops.dialog.deleted'))
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, t('admin.shops.dialog.deleteError')))
    } finally {
      setLoading(false)
    }
  }

  const isEditing = !!shopToEdit?.id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('admin.shops.dialog.editTitle') : t('admin.shops.dialog.newTitle')}</DialogTitle>
          <DialogDescription>
            {t('admin.shops.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('admin.shops.dialog.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder={t('admin.shops.dialog.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">{t('admin.shops.dialog.city')}</Label>
              <Select value={formData.city_id} onValueChange={(v) => setFormData({ ...formData, city_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.shops.dialog.cityPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {refData.cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md">
            <div className="space-y-2">
              <Label htmlFor="hq">{t('admin.shops.dialog.hq')}</Label>
              <Select value={formData.hq_id || 'none'} onValueChange={(v) => setFormData({ ...formData, hq_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.shops.dialog.none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- {t('admin.shops.dialog.none')} --</SelectItem>
                  {refData.hqs.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tariff">{t('admin.shops.dialog.tariff')}</Label>
              <Select
                value={formData.tariff_version_id || 'none'}
                onValueChange={(v) => setFormData({ ...formData, tariff_version_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.shops.dialog.select')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- {t('admin.shops.dialog.toDefine')} --</SelectItem>
                  {refData.tariffs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">{t('admin.shops.dialog.address')}</Label>
            <AddressAutocomplete
              onSelect={(address) => {
                setFormData({
                  ...formData,
                  address: formatAddress(address),
                  lat: address.lat ?? null,
                  lng: address.lng ?? null,
                })
              }}
            />
            <Textarea
              id="address"
              value={formData.address || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  address: e.target.value,
                  lat: null,
                  lng: null,
                })
              }
              placeholder={t('admin.shops.dialog.addressPlaceholder')}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="person">{t('admin.shops.dialog.contact')}</Label>
              <Input
                id="person"
                value={formData.contact_person || ''}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder={t('admin.shops.dialog.contactPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('admin.shops.dialog.email')}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t('admin.shops.dialog.emailPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('admin.shops.dialog.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t('admin.shops.dialog.phonePlaceholder')}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            {isEditing && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                {t('common.delete')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('admin.shops.dialog.saving') : isEditing ? t('admin.shops.dialog.update') : t('admin.shops.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
