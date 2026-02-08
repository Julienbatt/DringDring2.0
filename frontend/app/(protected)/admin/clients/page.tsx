'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, MapPin, Phone, User, Key, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { apiGet } from '@/lib/api'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ClientDialog, ClientData } from './components/ClientDialog'

type Client = {
    id: string
    name: string
    address: string
    postal_code: string
    city_id: string
    city_real_name?: string
    city_name?: string
    phone?: string
    email?: string
    floor?: string
    door_code?: string
    is_cms: boolean
    account_invite_status?: string | null
    account_invite_error?: string | null
    account_invited_at?: string | null
}

function normalizeDisplayCity(value?: string) {
    const text = (value || '').trim()
    if (!text) return ''

    // Handle labels like "1950 Ville de Sion - Promotion Economique".
    const noPostal = text.replace(/^\d{4}\s+/, '').trim()
    const noPrefix = noPostal.replace(/^(ville|commune)\s+de\s+/i, '').trim()

    // Keep only the geographic name before any business suffix.
    const base = noPrefix.split(/\s[-–—]\s/)[0]?.trim() || noPrefix
    return base
}

function extractPostalCityFromAddress(address?: string): { postal: string; city: string } | null {
    const text = (address || '').trim()
    if (!text) return null

    // Use trailing Swiss-like "NPA + city" from autocomplete address.
    const match = text.match(/(\d{4})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.\-\s]*)$/)
    if (!match) return null

    const postal = match[1].trim()
    const city = match[2].replace(/\s{2,}/g, ' ').trim()
    if (!postal || !city) return null

    return { postal, city }
}

function getDisplayLocation(client: Client) {
    const fromAddress = extractPostalCityFromAddress(client.address)
    if (fromAddress) {
        return `${fromAddress.postal} ${fromAddress.city}`.trim()
    }

    const city = normalizeDisplayCity(client.city_real_name || client.city_name || '')
    return `${client.postal_code} ${city}`.trim()
}

export default function ClientsPage() {
    const { session, adminContextRegion } = useAuth()
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const pageSize = 100

    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedClient, setSelectedClient] = useState<ClientData | null>(null)
    const cmsCount = clients.filter((client) => client.is_cms).length
    const standardCount = clients.length - cmsCount

    const loadClients = useCallback(async () => {
        try {
            if (!session?.access_token) return
            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const data = await apiGet<Client[]>(`/clients/admin${queryParams}`, session.access_token)
            setClients(data)
        } catch (error) {
            console.error('Failed to load clients', error)
            toast.error('Erreur lors du chargement des clients')
        } finally {
            setLoading(false)
        }
    }, [session, adminContextRegion])

    useEffect(() => {
        if (session?.access_token) {
            loadClients()
        }
    }, [session, loadClients])

    const handleCreate = () => {
        setSelectedClient(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (client: Client) => {
        setSelectedClient(client)
        setIsDialogOpen(true)
    }

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.city_real_name || client.city_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.postal_code.includes(searchTerm)
    )
    const totalFiltered = filteredClients.length
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
    const safePage = Math.min(currentPage, totalPages)
    const pageStart = (safePage - 1) * pageSize
    const pageEnd = pageStart + pageSize
    const pagedClients = filteredClients.slice(pageStart, pageEnd)

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, clients.length])

    if (loading) return <LoadingSkeleton />

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestion des clients</h1>
                    <p className="text-gray-500 mt-1">
                        {clients.length} clients enregistres.
                    </p>
                </div>
                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Nouveau client
                </Button>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible">
                <div className="min-w-[160px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Total</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{clients.length}</div>
                </div>
                <div className="min-w-[160px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Clients CMS</div>
                    <div className="mt-1 text-2xl font-semibold text-emerald-700">{cmsCount}</div>
                </div>
                <div className="min-w-[180px] rounded-lg border bg-white px-4 py-3 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Clients standards</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">{standardCount}</div>
                </div>
            </div>

            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    placeholder="Rechercher (nom, commune, NPA)..."
                    className="border-none shadow-none focus-visible:ring-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden md:hidden">
                {pagedClients.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-gray-500">
                        {searchTerm ? 'Aucun client ne correspond.' : 'Aucun client trouve.'}
                    </div>
                ) : (
                    <div className="divide-y">
                        {pagedClients.map((client) => (
                            <button
                                key={client.id}
                                className="w-full text-left p-4 hover:bg-gray-50/50 transition-colors"
                                onClick={() => handleEdit(client)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                                            <User className="w-4 h-4 text-gray-500" />
                                            {client.name}
                                        </div>
                                        {client.phone && (
                                            <div className="flex items-center gap-2 text-sm text-gray-500 ml-6 mt-1">
                                                <Phone className="w-3 h-3" />
                                                {client.phone}
                                            </div>
                                        )}
                                    </div>
                                    {client.is_cms ? (
                                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                            CMS
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-gray-400">Standard</span>
                                    )}
                                </div>

                                <div className="mt-3 text-sm text-gray-700">
                                    <div>{client.address}</div>
                                    {(client.floor || client.door_code) && (
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                                            {client.floor && (
                                                <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    <Building className="w-3 h-3" /> Etage: {client.floor}
                                                </span>
                                            )}
                                            {client.door_code && (
                                                <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    <Key className="w-3 h-3" /> Code: {client.door_code}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-gray-400" />
                                        {getDisplayLocation(client)}
                                        </div>
                                        <span className="text-xs font-medium text-emerald-700">Modifier</span>
                                    </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg border shadow-sm hidden md:block">
                <Table className="w-full table-fixed min-w-[980px]">
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[26%]">Identite et contact</TableHead>
                            <TableHead className="w-[30%]">Adresse et acces</TableHead>
                            <TableHead className="w-[28%]">Localisation</TableHead>
                            <TableHead className="w-[8%] text-center whitespace-nowrap">Profil</TableHead>
                            <TableHead className="w-[8%] text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedClients.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-gray-500">
                                    {searchTerm ? 'Aucun client ne correspond.' : 'Aucun client trouve.'}
                                </TableCell>
                            </TableRow>
                        ) : (
                            pagedClients.map((client) => (
                                <TableRow
                                    key={client.id}
                                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                                    onClick={() => handleEdit(client)}
                                >
                                    <TableCell className="align-top">
                                        <div className="flex flex-col gap-1">
                                            <div className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                                                <User className="w-4 h-4 text-gray-500" />
                                                <span className="truncate">{client.name}</span>
                                            </div>
                                            {client.phone && (
                                                <div className="flex items-center gap-2 text-sm text-gray-500 ml-6 min-w-0">
                                                    <Phone className="w-3 h-3" />
                                                    <span className="truncate">{client.phone}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <div className="flex flex-col gap-1 text-sm">
                                            <div className="text-gray-900 break-words">{client.address}</div>
                                            {(client.floor || client.door_code) && (
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    {client.floor && (
                                                        <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            <Building className="w-3 h-3" /> Etage: {client.floor}
                                                        </span>
                                                    )}
                                                    {client.door_code && (
                                                        <span className="flex items-center gap-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            <Key className="w-3 h-3" /> Code: {client.door_code}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="align-top">
                                        <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
                                            <MapPin className="w-4 h-4 text-gray-400" />
                                            <span className="truncate">{getDisplayLocation(client)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {client.is_cms ?
                                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                CMS
                                            </Badge> :
                                            <span className="text-xs text-gray-400">Standard</span>
                                        }
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                handleEdit(client)
                                            }}
                                        >
                                            Modifier
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">
                    {totalFiltered === 0
                        ? '0 client'
                        : `Affichage ${pageStart + 1}-${Math.min(pageEnd, totalFiltered)} sur ${totalFiltered}`}
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={safePage === 1}
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        >
                            Precedent
                        </Button>
                        <span className="text-sm text-gray-500">
                            Page {safePage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={safePage === totalPages}
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        >
                            Suivant
                        </Button>
                    </div>
                )}
            </div>

            <ClientDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                clientToEdit={selectedClient}
                onSuccess={loadClients}
            />
        </div>
    )
}
