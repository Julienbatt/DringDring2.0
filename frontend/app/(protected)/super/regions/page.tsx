'use client'

import { useState, useEffect } from 'react'
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
    const [regions, setRegions] = useState<AdminRegion[]>([])
    const [cantons, setCantons] = useState<Canton[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Form state
    const [newName, setNewName] = useState('')
    const [newAddress, setNewAddress] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [selectedCanton, setSelectedCanton] = useState<string>('')

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
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
            console.error('Failed to load data', error)
            toast.error("Erreur lors du chargement des donnees")
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        if (!newName) {
            toast.error("Le nom est requis")
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

            toast.success("Region creee avec succes")
            setIsDialogOpen(false)
            setNewName('')
            setNewAddress('')
            setNewEmail('')
            setSelectedCanton('')
            loadData() // Refresh
        } catch (error) {
            console.error('Failed to create region', error)
            toast.error("Erreur lors de la creation")
        }
    }

    const handleAddressSelect = (address: { street: string; number: string; zip: string; city: string }) => {
        const formatted = `${address.street} ${address.number}, ${address.zip} ${address.city}`.trim()
        setNewAddress(formatted)
    }

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Gestion des entreprises regionales de livraison</h1>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nouvelle entreprise regionale
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Creer une entreprise regionale</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Nom de l entreprise regionale</Label>
                                <Input
                                    id="name"
                                    placeholder="ex: Velocite Sion"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Recherche adresse (Suisse)</Label>
                                <AddressAutocomplete onSelect={handleAddressSelect} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="address">Adresse (Optionnel)</Label>
                                <Input
                                    id="address"
                                    placeholder="ex: Rue du Rhone 1"
                                    value={newAddress}
                                    onChange={(e) => setNewAddress(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Contact (Optionnel)</Label>
                                <Input
                                    id="email"
                                    placeholder="ex: info@velocite-sion.ch"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="canton">Canton (Optionnel)</Label>
                                <Select onValueChange={setSelectedCanton} value={selectedCanton}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selectionner un canton" />
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
                            Creer
                        </Button>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="table-scroll rounded-md border bg-white">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nom</TableHead>
                            <TableHead>Canton</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Adresse</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">Chargement...</TableCell>
                            </TableRow>
                        ) : regions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    Aucune region trouvee.
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
                                            {region.active ? 'Actif' : 'Inactif'}
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
                                            Gerer
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
