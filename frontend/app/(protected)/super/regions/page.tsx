'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { captureError } from '@/lib/errorReporting'

interface AdminRegion {
    id: string
    name: string
    active: boolean
    canton_name?: string
    address?: string
    contact_email?: string
}

interface Canton {
    id: string
    name: string
    code: string
}

export default function RegionsPage() {
    const { t } = useLanguage()
    const [regions, setRegions] = useState<AdminRegion[]>([])
    const [cantons, setCantons] = useState<Canton[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Form state
    const [newName, setNewName] = useState('')
    const [newAddress, setNewAddress] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [selectedCanton, setSelectedCanton] = useState<string>('')

    const loadData = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()

            if (!session?.access_token) return

            const [regionsData, cantonsData] = await Promise.all([
                apiGet<AdminRegion[]>('/regions', session.access_token),
                apiGet<Canton[]>('/regions/cantons', session.access_token)
            ])
            setRegions(regionsData)
            setCantons(cantonsData)
        } catch (error) {
            captureError(error, 'RegionsPage.loadData')
            toast.error(t('super.regions.toast.loadError'))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleCreate = async () => {
        if (!newName) {
            toast.error(t('super.regions.toast.nameRequired'))
            return
        }

        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) return

            await apiPost('/regions', {
                name: newName,
                address: newAddress || null,
                contact_email: newEmail || null,
                canton_id: selectedCanton || null,
                active: true
            }, session.access_token)

            toast.success(t('super.regions.toast.created'))
            setIsDialogOpen(false)
            setNewName('')
            setNewAddress('')
            setNewEmail('')
            setSelectedCanton('')
            loadData() // Refresh
        } catch (error) {
            captureError(error, 'RegionsPage.handleCreate')
            toast.error(t('super.regions.toast.createError'))
        }
    }

    const handleAddressSelect = (address: { street: string; number: string; zip: string; city: string }) => {
        const formatted = `${address.street} ${address.number}, ${address.zip} ${address.city}`.trim()
        setNewAddress(formatted)
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">{t('super.regions.title')}</h1>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('super.regions.new')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('super.regions.dialog.title')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">{t('super.regions.dialog.name')}</Label>
                                <Input
                                    id="name"
                                    placeholder={t('super.regions.dialog.namePlaceholder')}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('super.regions.dialog.addressSearch')}</Label>
                                <AddressAutocomplete onSelect={handleAddressSelect} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">{t('super.regions.dialog.address')}</Label>
                                <Input
                                    id="address"
                                    placeholder={t('super.regions.dialog.addressPlaceholder')}
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">{t('super.regions.dialog.email')}</Label>
                                <Input
                                    id="email"
                                    placeholder={t('super.regions.dialog.emailPlaceholder')}
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="canton">{t('super.regions.dialog.canton')}</Label>
                                <Select onValueChange={setSelectedCanton} value={selectedCanton}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('super.regions.dialog.cantonPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cantons.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <Button onClick={handleCreate} className="w-full">
                            {t('super.regions.dialog.create')}
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="table-scroll rounded-md border bg-white">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('super.regions.table.name')}</TableHead>
                            <TableHead>{t('super.regions.table.canton')}</TableHead>
                            <TableHead>{t('super.regions.table.email')}</TableHead>
                            <TableHead>{t('super.regions.table.address')}</TableHead>
                            <TableHead>{t('super.regions.table.status')}</TableHead>
                            <TableHead className="text-right">{t('super.regions.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">{t('common.loading')}</TableCell>
                            </TableRow>
                        ) : regions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    {t('super.regions.empty')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            regions.map((region) => (
                                <TableRow key={region.id}>
                                    <TableCell className="font-medium">{region.name}</TableCell>
                                    <TableCell>{region.canton_name || '-'}</TableCell>
                                    <TableCell>{region.contact_email || '-'}</TableCell>
                                    <TableCell>{region.address || '-'}</TableCell>
                                    <TableCell>
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${region.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            {region.active ? t('super.regions.status.active') : t('super.regions.status.inactive')}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                localStorage.setItem('admin_context_region', JSON.stringify({ id: region.id, name: region.name }))
                                                window.location.href = '/admin/couriers'
                                            }}
                                        >
                                            {t('super.regions.manage')}
                                        </Button>
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
