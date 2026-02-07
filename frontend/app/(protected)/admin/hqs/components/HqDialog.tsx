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
      toast.error('Le nom du HQ est obligatoire')
      return
    }
    if (!address.trim()) {
      toast.error("L'adresse du HQ est obligatoire")
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
        toast.success('HQ mis a jour')
      } else {
        await apiPost('/shops/hqs', payload, session.access_token)
        toast.success('HQ cree')
      }
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, 'Erreur lors de lenregistrement'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.access_token || !hqToEdit?.id) return
    if (!confirm('Supprimer ce HQ ?')) return
    setLoading(true)
    try {
      await apiDelete(`/shops/hqs/${hqToEdit.id}`, session.access_token)
      toast.success('HQ supprime')
      onSuccess()
      onOpenChange(false)
    } catch (error: unknown) {
      console.error(error)
      toast.error(getErrorMessage(error, 'Erreur lors de la suppression'))
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
          <DialogTitle>{isEditing ? 'Modifier le HQ' : 'Nouveau HQ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom du HQ *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ex: Migros Valais"
            />
          </div>
          <div className="space-y-2">
            <Label>Recherche adresse (Suisse)</Label>
            <AddressAutocomplete onSelect={handleAddressSelect} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Adresse physique *</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, NPA, Localite..."
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact principal (optionnel)</Label>
            <Input
              id="contactPerson"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Nom du contact"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optionnel)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@hq.ch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telephone (optionnel)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 ..."
            />
          </div>
          <DialogFooter className="pt-4">
            {isEditing && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Enregistrement...' : isEditing ? 'Mettre a jour' : 'Creer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
