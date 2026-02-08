'use client'

import { useEffect, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { toast } from 'sonner'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export type ClientData = {
    id?: string
    name: string
    address: string
    postal_code: string
    city_id: string
    lat?: number | null
    lng?: number | null
    // city_real_name? : Often redundant if city_id is used for tariff scope, but let's keep it if needed for free text? 
    // Specification implies strict territory. Let's use city_id selection from available cities in region.
    phone?: string | null
    email?: string | null
    floor?: string | null
    door_code?: string | null
    is_cms: boolean
    account_invite_status?: string | null
    account_invite_error?: string | null
    account_invited_at?: string | null
}

type ClientDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    clientToEdit?: ClientData | null
    onSuccess: () => void
}

export function ClientDialog({ open, onOpenChange, clientToEdit, onSuccess }: ClientDialogProps) {
    const { session, adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [loading, setLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [cities, setCities] = useState<{ id: string; name: string }[]>([])
    const [createAccount, setCreateAccount] = useState(false)
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteStatusLocal, setInviteStatusLocal] = useState<string | null>(null)
    const [inviteErrorLocal, setInviteErrorLocal] = useState<string | null>(null)

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

    const [formData, setFormData] = useState<ClientData>({
        name: '',
        address: '',
        postal_code: '',
        city_id: '',
        lat: null,
        lng: null,
        phone: '',
        email: '',
        floor: '',
        door_code: '',
        is_cms: false
    })

    // Load Cities (Region scope)
    useEffect(() => {
        if (open && session?.access_token) {
            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            apiGet<{ id: string; name: string }[]>(`/cities${queryParams}`, session.access_token)
                .then(setCities)
                .catch(e => console.error("Error loading cities", e))
        }
    }, [open, session, adminContextRegion])

    // Populate Form
    const sanitizeAddress = (value: string) => {
        const parts = value
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part && !part.includes(':'))
        return parts.join(', ').trim()
    }

    useEffect(() => {
        if (clientToEdit) {
            setFormData({
                ...clientToEdit,
                address: sanitizeAddress(clientToEdit.address || ''),
                phone: clientToEdit.phone || '',
                email: clientToEdit.email || '',
                floor: clientToEdit.floor || '',
                door_code: clientToEdit.door_code || '',
                // Ensure postal_code is string
                postal_code: clientToEdit.postal_code || '',
                lat: clientToEdit.lat ?? null,
                lng: clientToEdit.lng ?? null,
            })
            setCreateAccount(false)
            setConfirmDelete(false)
            setInviteStatusLocal(clientToEdit.account_invite_status || null)
            setInviteErrorLocal(clientToEdit.account_invite_error || null)
        } else {
            setFormData({
                name: '',
                address: '',
                postal_code: '',
                city_id: '',
                lat: null,
                lng: null,
                phone: '',
                email: '',
                floor: '',
                door_code: '',
                is_cms: false
            })
            setCreateAccount(false)
            setConfirmDelete(false)
            setInviteStatusLocal(null)
            setInviteErrorLocal(null)
        }
    }, [clientToEdit, open])

    const handleAddressSelect = (address: { street: string; number: string; zip: string; city: string; lat?: number; lng?: number }) => {
        const formatted = `${address.street} ${address.number}`.trim()
        const match = cities.find((c) => c.name.toLowerCase() === address.city.toLowerCase())
        setFormData((prev) => ({
            ...prev,
            address: formatted,
            postal_code: address.zip,
            city_id: match ? match.id : prev.city_id,
            lat: address.lat ?? prev.lat ?? null,
            lng: address.lng ?? prev.lng ?? null,
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!session?.access_token) return

        if (!formData.city_id) {
            toast.error(t('admin.clients.dialog.cityRequired'))
            return
        }
        if (!clientToEdit?.id && createAccount && !(formData.email || '').trim()) {
            toast.error(t('admin.clients.dialog.emailRequiredToCreate'))
            return
        }

        setLoading(true)
        try {
            if (formData.phone && !isValidSwissPhone(normalizePhone(formData.phone))) {
                toast.error(t('admin.clients.dialog.phoneInvalid'))
                setLoading(false)
                return
            }
            const payload = {
                ...formData,
                // Clean empty strings to null for backend if preferred, or keep as string. 
                phone: formData.phone ? normalizePhone(formData.phone) : null,
                email: (formData.email || '').trim() || null,
                floor: formData.floor || null,
                door_code: formData.door_code || null,
            }

            if (clientToEdit?.id) {
                await apiPut(`/clients/${clientToEdit.id}`, payload, session.access_token)
                toast.success(t('admin.clients.dialog.updated'))
            } else {
                await apiPost('/clients', { ...payload, create_account: createAccount }, session.access_token)
                toast.success(t('admin.clients.dialog.created'))
            }
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            console.error(error)
            toast.error(getErrorMessage(error, t('admin.clients.dialog.unknownError')))
        } finally {
            setLoading(false)
        }
    }

    const isEditing = !!clientToEdit?.id
    const inviteStatus = inviteStatusLocal
    const inviteError = inviteErrorLocal

    const inviteStatusLabel = () => {
        if (!inviteStatus) return t('admin.clients.dialog.invite.notSet')
        if (inviteStatus === 'invited') return t('admin.clients.dialog.invite.invited')
        if (inviteStatus === 'failed') return t('admin.clients.dialog.invite.failed')
        if (inviteStatus === 'not_requested') return t('admin.clients.dialog.invite.notRequested')
        return inviteStatus
    }

    const handleDelete = async () => {
        if (!session?.access_token || !clientToEdit?.id) return
        setLoading(true)
        try {
            await apiDelete(`/clients/${clientToEdit.id}`, session.access_token)
            toast.success(t('admin.clients.dialog.deleted'))
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            console.error(error)
            toast.error(getErrorMessage(error, t('admin.clients.dialog.deleteError')))
        } finally {
            setLoading(false)
            setConfirmDelete(false)
        }
    }

    const handleInviteAccount = async () => {
        if (!session?.access_token || !clientToEdit?.id) return
        if (!(formData.email || '').trim()) {
            toast.error(t('admin.clients.dialog.emailRequiredToInvite'))
            return
        }
        setInviteLoading(true)
        try {
            const response = await apiPost<{ status?: string; error?: string }>(
                `/clients/${clientToEdit.id}/invite-account`,
                {},
                session.access_token
            )
            const nextStatus = response?.status || 'invited'
            setInviteStatusLocal(nextStatus)
            setInviteErrorLocal(response?.error || null)
            if (nextStatus === 'invited') {
                toast.success(t('admin.clients.dialog.invite.sent'))
            } else {
                toast.error(response?.error || t('admin.clients.dialog.invite.failedGeneric'))
            }
            onSuccess()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, t('admin.clients.dialog.invite.error')))
        } finally {
            setInviteLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? t('admin.clients.dialog.editTitle') : t('admin.clients.dialog.newTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('admin.clients.dialog.description')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">

                    <div className="space-y-2">
                        <Label htmlFor="name">{t('admin.clients.dialog.name')}</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                            placeholder={t('admin.clients.dialog.namePlaceholder')}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label>{t('admin.clients.dialog.addressSearch')}</Label>
                            <AddressAutocomplete onSelect={handleAddressSelect} />
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="address">{t('admin.clients.dialog.address')}</Label>
                            <Input
                                id="address"
                                value={formData.address}
                                onChange={e =>
                                    setFormData({
                                        ...formData,
                                        address: e.target.value,
                                        lat: null,
                                        lng: null,
                                    })
                                }
                                required
                                placeholder={t('admin.clients.dialog.addressPlaceholder')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="city">{t('admin.clients.dialog.partnerCity')}</Label>
                            <Select
                                value={formData.city_id}
                                onValueChange={v => setFormData({ ...formData, city_id: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t('admin.clients.dialog.select')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {cities.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="npa">{t('admin.clients.dialog.postalCode')}</Label>
                            <Input
                                id="npa"
                                value={formData.postal_code}
                                onChange={e => setFormData({ ...formData, postal_code: e.target.value })}
                                required
                                placeholder={t('admin.clients.dialog.postalCodePlaceholder')}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-md border border-gray-100">
                        <div className="space-y-2">
                            <Label htmlFor="floor">{t('admin.clients.dialog.floor')}</Label>
                            <Input
                                id="floor"
                                value={formData.floor || ''}
                                onChange={e => setFormData({ ...formData, floor: e.target.value })}
                                placeholder={t('admin.clients.dialog.floorPlaceholder')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="code">{t('admin.clients.dialog.code')}</Label>
                            <Input
                                id="code"
                                value={formData.door_code || ''}
                                onChange={e => setFormData({ ...formData, door_code: e.target.value })}
                                placeholder={t('admin.clients.dialog.codePlaceholder')}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="phone">{t('admin.clients.dialog.phone')}</Label>
                            <Input
                                id="phone"
                                type="tel"
                                value={formData.phone || ''}
                                onChange={e => setFormData({ ...formData, phone: formatSwissPhone(e.target.value) })}
                                placeholder="+4179..."
                                onBlur={(e) => {
                                    const formatted = normalizePhone(e.target.value)
                                    setFormData((prev) => ({ ...prev, phone: formatted }))
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">{t('admin.clients.dialog.email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email || ''}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder={t('admin.clients.dialog.emailPlaceholder')}
                            />
                        </div>
                    </div>

                    {!isEditing && (
                        <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                            <div className="flex items-start space-x-2">
                                <Checkbox
                                    id="create-account"
                                    checked={createAccount}
                                    onCheckedChange={(c) => setCreateAccount(c as boolean)}
                                    disabled={!formData.email}
                                />
                                <Label htmlFor="create-account" className="font-medium">
                                    {t('admin.clients.dialog.createAccount')}
                                </Label>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                {t('admin.clients.dialog.createAccountHint')}
                            </p>
                        </div>
                    )}

                    {isEditing && (
                        <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                            <div className="text-sm font-medium text-gray-700">
                                {t('admin.clients.dialog.accountStatus')}: {inviteStatusLabel()}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleInviteAccount}
                                    disabled={inviteLoading || !(formData.email || '').trim()}
                                >
                                    {inviteLoading ? t('admin.clients.dialog.invite.sending') : t('admin.clients.dialog.invite.cta')}
                                </Button>
                                {!(formData.email || '').trim() && (
                                    <span className="text-xs text-gray-500">{t('admin.clients.dialog.invite.emailRequired')}</span>
                                )}
                            </div>
                            {inviteStatus === 'failed' && inviteError && (
                                <p className="mt-1 text-xs text-red-600">
                                    {inviteError}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                            id="cms"
                            checked={formData.is_cms}
                            onCheckedChange={(c) => setFormData({ ...formData, is_cms: c as boolean })}
                        />
                        <Label htmlFor="cms" className="font-medium">{t('admin.clients.dialog.cms')}</Label>
                    </div>

                    <DialogFooter className="pt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                            {isEditing && !confirmDelete && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => setConfirmDelete(true)}
                                    disabled={loading}
                                >
                                    {t('common.delete')}
                                </Button>
                            )}
                            {isEditing && confirmDelete && (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setConfirmDelete(false)}
                                        disabled={loading}
                                    >
                                        {t('admin.clients.dialog.deleteCancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={loading}
                                    >
                                        {t('admin.clients.dialog.deleteConfirm')}
                                    </Button>
                                </>
                            )}
                        </div>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('admin.clients.dialog.saving') : (isEditing ? t('admin.clients.dialog.update') : t('admin.clients.dialog.create'))}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
