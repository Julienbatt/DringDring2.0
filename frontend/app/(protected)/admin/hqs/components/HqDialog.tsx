'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiDelete, apiPost, apiPut } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export type HqData = {
  id: string
  name: string
  address?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
}

type HqDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  hqToEdit: HqData | null
  onSuccess: () => void
}

export function HqDialog({ open, onOpenChange, hqToEdit, onSuccess }: HqDialogProps) {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (hqToEdit) {
      setName(hqToEdit.name || '')
      setAddress(hqToEdit.address || '')
      setContactPerson(hqToEdit.contact_person || '')
      setEmail(hqToEdit.email || '')
      setPhone(hqToEdit.phone || '')
    } else {
      setName('')
      setAddress('')
      setContactPerson('')
      setEmail('')
      setPhone('')
    }
  }, [hqToEdit, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.access_token) return
    if (!name.trim()) {
      toast.error(t('admin.hq.dialog.nameRequired'))
      return
    }
    if (!address.trim()) {
      toast.error(t('admin.hq.dialog.addressRequired'))
      return
    }
    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        contact_person: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      }
      if (hqToEdit?.id) {
        await apiPut(`/shops/hqs/${hqToEdit.id}`, payload, session.access_token)
        toast.success(t('admin.hq.dialog.updated'))
      } else {
        await apiPost('/shops/hqs', payload, session.access_token)
        toast.success(t('admin.hq.dialog.created'))
      }
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, t('admin.hq.dialog.saveError')))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.access_token || !hqToEdit?.id) return
    if (!confirm(t('admin.hq.dialog.deleteConfirmPrompt'))) return
    setLoading(true)
    try {
      await apiDelete(`/shops/hqs/${hqToEdit.id}`, session.access_token)
      toast.success(t('admin.hq.dialog.deleted'))
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, t('admin.hq.dialog.deleteError')))
    } finally {
      setLoading(false)
    }
  }

  const isEditing = !!hqToEdit?.id
  const formatAddress = (value: { street: string; number: string; zip: string; city: string }) => {
    const line1 = [value.street, value.number].filter(Boolean).join(' ').trim()
    const line2 = [value.zip, value.city].filter(Boolean).join(' ').trim()
    return [line1, line2].filter(Boolean).join(', ')
  }

  const handleAddressSelect = (value: { street: string; number: string; zip: string; city: string }) => {
    setAddress(formatAddress(value))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('admin.hq.dialog.editTitle') : t('admin.hq.dialog.newTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('admin.hq.dialog.name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={t('admin.hq.dialog.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('admin.hq.dialog.addressSearch')}</Label>
            <AddressAutocomplete onSelect={handleAddressSelect} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">{t('admin.hq.dialog.address')}</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t('admin.hq.dialog.addressPlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">{t('admin.hq.dialog.contact')}</Label>
            <Input
              id="contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder={t('admin.hq.dialog.contactPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('admin.hq.dialog.email')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('admin.hq.dialog.emailPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t('admin.hq.dialog.phone')}</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('admin.hq.dialog.phonePlaceholder')}
            />
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
              {loading ? t('admin.hq.dialog.saving') : isEditing ? t('admin.hq.dialog.update') : t('admin.hq.dialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
