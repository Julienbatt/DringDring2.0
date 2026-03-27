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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api'
import { useAuth } from '../../../providers/AuthProvider'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export type CityData = {
    id?: string
    name: string
    canton_id?: string
    parent_city_id?: string | null
    parent_city_name?: string | null
    address?: string
    contact_person?: string
    email?: string
    phone?: string
    postal_codes?: string[]
}

type CityDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    cityToEdit?: CityData | null
    onSuccess: () => void
}

type CantonOption = {
    id: string
    name: string
    code?: string | null
}

export function CityDialog({ open, onOpenChange, cityToEdit, onSuccess }: CityDialogProps) {
    const { session, user, adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [loading, setLoading] = useState(false)
    const [cantons, setCantons] = useState<CantonOption[]>([])
    const [communes, setCommunes] = useState<CityData[]>([])
    const isCityUser = user?.role === 'city' && !!user?.city_id

    const [formData, setFormData] = useState<CityData>({
        name: '',
        address: '',
        contact_person: '',
        email: '',
        phone: '',
        canton_id: '',
        parent_city_id: '',
        postal_codes: []
    })

    useEffect(() => {
        if (cityToEdit) {
            setFormData({
                ...cityToEdit,
                name: cityToEdit.name || '',
                address: cityToEdit.address || '',
                contact_person: cityToEdit.contact_person || '',
                email: cityToEdit.email || '',
                phone: cityToEdit.phone || '',
                canton_id: cityToEdit.canton_id || '',
                parent_city_id: cityToEdit.parent_city_id || '',
                postal_codes: cityToEdit.postal_codes || []
            })
        } else {
            setFormData({
                name: '',
                address: '',
                contact_person: '',
                email: '',
                phone: '',
                canton_id: '',
                parent_city_id: '',
                postal_codes: []
            })
        }
    }, [cityToEdit, open])

    useEffect(() => {
        if (!open) return
        if (isCityUser && !cityToEdit && user?.city_id) {
            setFormData((prev) => ({
                ...prev,
                parent_city_id: user.city_id,
            }))
        }
    }, [open, isCityUser, cityToEdit, user?.city_id])

    useEffect(() => {
        const loadCantons = async () => {
            if (!session?.access_token || !open) return
            try {
                const data = await apiGet<CantonOption[]>('/regions/cantons', session.access_token)
                setCantons(data)
            } catch (error) {
                captureError(error, 'CityDialog.loadCantons')
                setCantons([])
                toast.error(t('admin.cities.dialog.loadCantonsError'))
            }
        }

        loadCantons()
    }, [open, session?.access_token, t])

    useEffect(() => {
        const loadCommunes = async () => {
            if (!session?.access_token || !open) return
            try {
                const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
                const data = await apiGet<CityData[]>(`/cities${queryParams}`, session.access_token)
                const parentCandidates = data.filter((item) => !item.parent_city_id)
                setCommunes(parentCandidates)
            } catch (error) {
                captureError(error, 'CityDialog.loadCommunes')
                setCommunes([])
            }
        }

        loadCommunes()
    }, [open, session?.access_token, adminContextRegion])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!session?.access_token) return
        if (user?.role === 'super_admin' && !adminContextRegion?.id) {
            toast.error(t('admin.cities.dialog.selectRegion'))
            return
        }

        setLoading(true)
        try {
            const postal_codes = formData.postal_codes?.length ? formData.postal_codes : undefined

            const payload: Record<string, unknown> = {
                ...formData,
                canton_id: formData.canton_id || null,
                parent_city_id: formData.parent_city_id || null,
            }
            if (postal_codes) {
                payload.postal_codes = postal_codes
            }
            if (isCityUser && user?.city_id) {
                payload.parent_city_id = cityToEdit?.id === user.city_id ? null : user.city_id
                if (user.admin_region_id) {
                    payload.admin_region_id = user.admin_region_id
                }
            }
            if (user?.role === 'super_admin' && adminContextRegion?.id) {
                payload.admin_region_id = adminContextRegion.id
            }

            if (cityToEdit?.id) {
                await apiPut(`/cities/${cityToEdit.id}`, payload, session.access_token)
                toast.success(t('admin.cities.dialog.updated'))
            } else {
                await apiPost('/cities', payload, session.access_token)
                toast.success(t('admin.cities.dialog.created'))
            }
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            captureError(error, 'CityDialog.handleSubmit')
            toast.error(getErrorMessage(error, t('admin.cities.dialog.saveError')))
        } finally {
            setLoading(false)
        }
    }

    const isEditing = !!cityToEdit?.id
    const formatAddress = (address: { street: string; number: string; zip: string; city: string }) => {
        const line1 = [address.street, address.number].filter(Boolean).join(' ').trim()
        const line2 = [address.zip, address.city].filter(Boolean).join(' ').trim()
        return [line1, line2].filter(Boolean).join(', ')
    }

    const handleAddressSelect = (address: { street: string; number: string; zip: string; city: string }) => {
        setFormData((prev) => ({ ...prev, address: formatAddress(address) }))
    }

    const handleDelete = async () => {
        if (!session?.access_token || !cityToEdit?.id) return
        if (!confirm(t('admin.cities.dialog.deleteConfirmPrompt'))) return
        setLoading(true)
        try {
            await apiDelete(`/cities/${cityToEdit.id}`, session.access_token)
            toast.success(t('admin.cities.dialog.deleted'))
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            captureError(error, 'CityDialog.handleDelete')
            toast.error(getErrorMessage(error, t('admin.cities.dialog.deleteError')))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t('admin.cities.dialog.editTitle') : t('admin.cities.dialog.newTitle')}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">{t('admin.cities.dialog.name')}</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="canton">{t('admin.cities.dialog.canton')}</Label>
                            <Select
                                value={formData.canton_id || '__none__'}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        canton_id: value === '__none__' ? '' : value,
                                    }))
                                }
                            >
                                <SelectTrigger id="canton">
                                    <SelectValue placeholder={t('admin.cities.dialog.select')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">{t('admin.cities.dialog.none')}</SelectItem>
                                    {cantons.map((canton) => (
                                        <SelectItem key={canton.id} value={canton.id}>
                                            {canton.name}{canton.code ? ` (${canton.code})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="parent_city_id">{t('admin.cities.dialog.parentCity')}</Label>
                        {isCityUser ? (
                            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {cityToEdit?.id === user?.city_id
                                    ? t('admin.cities.dialog.mainCity')
                                    : cityToEdit?.parent_city_name
                                        ?? communes.find((commune) => commune.id === user?.city_id)?.name
                                        ?? t('admin.cities.dialog.mainCity')}
                            </div>
                        ) : (
                            <Select
                                value={formData.parent_city_id || '__none__'}
                                onValueChange={(value) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        parent_city_id: value === '__none__' ? '' : value,
                                    }))
                                }
                            >
                                <SelectTrigger id="parent_city_id">
                                    <SelectValue placeholder={t('admin.cities.dialog.noneFeminine')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">{t('admin.cities.dialog.noneFeminine')}</SelectItem>
                                    {communes
                                        .filter((commune) => !cityToEdit?.id || commune.id !== cityToEdit.id)
                                        .map((commune) => (
                                        <SelectItem key={commune.id} value={commune.id || ''}>
                                            {commune.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>{t('admin.cities.dialog.addressSearch')}</Label>
                        <AddressAutocomplete onSelect={handleAddressSelect} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">{t('admin.cities.dialog.address')}</Label>
                        <Input
                            id="address"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder={t('admin.cities.dialog.addressPlaceholder')}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contact">{t('admin.cities.dialog.contact')}</Label>
                            <Input
                                id="contact"
                                value={formData.contact_person}
                                onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                                placeholder={t('admin.cities.dialog.contactPlaceholder')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">{t('admin.cities.dialog.phone')}</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">{t('admin.cities.dialog.email')}</Label>
                        <Input
                            id="email" type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        {isEditing && (!isCityUser || cityToEdit?.parent_city_id === user?.city_id) && (
                            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                                {t('common.delete')}
                            </Button>
                        )}
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('admin.cities.dialog.saving') : (isEditing ? t('admin.cities.dialog.update') : t('admin.cities.dialog.create'))}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
