'use client'

import { useState, useEffect, Fragment, useCallback } from 'react'
import { Plus, Search, MapPin, Phone, Mail, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/(protected)/providers/AuthProvider'
import { toast } from 'sonner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { CityDialog, CityData } from './components/CityDialog'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export const dynamic = 'force-dynamic'

export default function AdminCitiesPage() {
    const { adminContextRegion } = useAuth()
    const { t } = useLanguage()
    const [cities, setCities] = useState<CityData[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedCity, setSelectedCity] = useState<CityData | null>(null)

    const loadData = useCallback(async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const token = session.access_token
            const queryParams = adminContextRegion ? `?admin_region_id=${adminContextRegion.id}` : ''
            const data = await apiGet<CityData[]>(`/cities${queryParams}`, token)

            setCities(data)
        } catch (error) {
            console.error('Failed to load cities', error)
            toast.error(t('admin.cities.toast.loadError'))
        } finally {
            setLoading(false)
        }
    }, [adminContextRegion, t])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleCreate = () => {
        setSelectedCity(null)
        setIsDialogOpen(true)
    }

    const handleEdit = (city: CityData) => {
        setSelectedCity(city)
        setIsDialogOpen(true)
    }

    const normalizedTerm = searchTerm.trim().toLowerCase()
    const matchesCity = (city: CityData) => {
        if (!normalizedTerm) return true
        const npa = (city.postal_codes || []).join(' ')
        const haystack = [
            city.name,
            city.address,
            city.contact_person,
            city.email,
            city.phone,
            city.parent_city_name,
            npa,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
        return haystack.includes(normalizedTerm)
    }

    const byId = new Map<string, CityData>()
    cities.forEach((city) => {
        if (city.id) byId.set(city.id, city)
    })

    const childrenByParent = new Map<string, CityData[]>()
    const parents = cities.filter((city) => !city.parent_city_id)
    const orphans: CityData[] = []

    cities.forEach((city) => {
        if (!city.parent_city_id) return
        const parentKey = city.parent_city_id
        if (!byId.has(parentKey)) {
            orphans.push(city)
            return
        }
        const list = childrenByParent.get(parentKey) ?? []
        list.push(city)
        childrenByParent.set(parentKey, list)
    })

    parents.sort((a, b) => a.name.localeCompare(b.name))
    childrenByParent.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)))
    orphans.sort((a, b) => a.name.localeCompare(b.name))

    const visibleGroups = parents
        .map((parent) => {
            const children = childrenByParent.get(parent.id || '') ?? []
            const parentMatches = matchesCity(parent)
            const visibleChildren = !normalizedTerm
                ? children
                : parentMatches
                    ? children
                    : children.filter(matchesCity)
            const isVisible = parentMatches || visibleChildren.length > 0
            return { parent, children: visibleChildren, isVisible }
        })
        .filter((group) => (normalizedTerm ? group.isVisible : true))

    const visibleOrphans = normalizedTerm ? orphans.filter(matchesCity) : orphans
    const totalCommunes = parents.length
    const totalZones = cities.filter((city) => Boolean(city.parent_city_id)).length
    const zonesWithoutParent = orphans.length

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t('admin.cities.title')}</h1>
                    <p className="text-gray-500 mt-1">
                        {t('admin.cities.subtitle')}
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                        {t('admin.cities.marketingHint')}
                    </p>
                </div>

                <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('admin.cities.addPartnerCity')}
                </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="text-xs uppercase tracking-wider text-emerald-700">{t('admin.cities.kpi.partnerCities')}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{totalCommunes}</div>
                    <div className="text-xs text-slate-600">{t('admin.cities.kpi.partnerCitiesHint')}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500">{t('admin.cities.kpi.serviceZones')}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{totalZones}</div>
                    <div className="text-xs text-slate-600">{t('admin.cities.kpi.serviceZonesHint')}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500">{t('admin.cities.kpi.networkQuality')}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{zonesWithoutParent}</div>
                    <div className="text-xs text-slate-600">{t('admin.cities.kpi.networkQualityHint')}</div>
                </div>
            </div>

            <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border shadow-sm max-w-md">
                <Search className="w-4 h-4 text-gray-400 ml-2" />
                <Input
                    type="search"
                    placeholder={t('admin.cities.searchPlaceholder')}
                    className="border-none shadow-none focus-visible:ring-0"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="table-scroll bg-white rounded-lg border shadow-sm">
                <Table className="w-full table-fixed min-w-[980px]">
                    <TableHeader className="bg-gray-50/50">
                        <TableRow>
                            <TableHead className="w-[34%]">{t('admin.cities.table.partnerCity')}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[24%]">{t('admin.cities.table.adminContact')}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[30%]">{t('admin.cities.table.contactDetails')}</TableHead>
                            <TableHead className="w-[12%] text-right whitespace-nowrap">{t('admin.cities.table.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={4} className="text-center h-32 animate-pulse text-gray-400">{t('common.loading')}</TableCell></TableRow>
                        ) : visibleGroups.length === 0 && visibleOrphans.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center h-32 text-muted-foreground">{t('admin.cities.table.empty')}</TableCell></TableRow>
                        ) : (
                            <>
                                {visibleGroups.map(({ parent, children }) => {
                                    const totalZones = parent.id ? (childrenByParent.get(parent.id)?.length ?? 0) : 0
                                    return (
                                        <Fragment key={parent.id ?? parent.name}>
                                            <TableRow className="hover:bg-gray-50/50 transition-colors">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <div className="bg-emerald-50 p-2 rounded text-emerald-600">
                                                            <MapPin className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-base">{parent.name}</span>
                                                        <span className="ml-2 text-[11px] uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                                            {t('admin.cities.badge.city')}
                                                        </span>
                                                        {totalZones > 0 && (
                                                            <span className="text-xs text-gray-500">
                                                                {t('admin.cities.zonesCount')}: {totalZones}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {parent.address && (
                                                        <div className="text-xs text-gray-500 mt-1 ml-10">{parent.address}</div>
                                                    )}
                                                    <div className="mt-2 ml-10 text-xs text-gray-500 lg:hidden">
                                                        {parent.contact_person && (
                                                            <div className="flex items-center gap-2 text-gray-700">
                                                                <User className="w-4 h-4 text-gray-400" />
                                                                {parent.contact_person}
                                                            </div>
                                                        )}
                                                        {parent.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {parent.phone}
                                                            </div>
                                                        )}
                                                        {parent.email && (
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-3 h-3" /> {parent.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {parent.contact_person ? (
                                                        <div className="flex items-center gap-2 text-gray-700">
                                                            <User className="w-4 h-4 text-gray-400" />
                                                            {parent.contact_person}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">{t('admin.cities.notDefined')}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                                                        {parent.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {parent.phone}
                                                            </div>
                                                        )}
                                                        {parent.email && (
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-3 h-3" /> {parent.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(parent)}
                                                    >
                                                        {t('common.edit')}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {children.map((child) => (
                                                <TableRow key={child.id ?? `${parent.id}-child-${child.name}`} className="hover:bg-gray-50/50 transition-colors">
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2 ml-8">
                                                            <div className="bg-slate-50 p-2 rounded text-slate-500">
                                                                <MapPin className="w-4 h-4" />
                                                            </div>
                                                            <span className="text-base">{child.name}</span>
                                                            <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                                {t('admin.cities.badge.zone')}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-emerald-700 mt-1 ml-16">
                                                            {t('admin.cities.zoneOf')} {parent.name}
                                                        </div>
                                                    {child.address && (
                                                        <div className="text-xs text-gray-500 mt-1 ml-16">{child.address}</div>
                                                    )}
                                                    <div className="mt-2 ml-16 text-xs text-gray-500 lg:hidden">
                                                        {child.contact_person && (
                                                            <div className="flex items-center gap-2 text-gray-700">
                                                                <User className="w-4 h-4 text-gray-400" />
                                                                {child.contact_person}
                                                            </div>
                                                        )}
                                                        {child.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {child.phone}
                                                            </div>
                                                        )}
                                                        {child.email && (
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-3 h-3" /> {child.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {child.contact_person ? (
                                                        <div className="flex items-center gap-2 text-gray-700">
                                                            <User className="w-4 h-4 text-gray-400" />
                                                            {child.contact_person}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">{t('admin.cities.notDefined')}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                                                        {child.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {child.phone}
                                                                </div>
                                                            )}
                                                            {child.email && (
                                                                <div className="flex items-center gap-2">
                                                                    <Mail className="w-3 h-3" /> {child.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEdit(child)}
                                                        >
                                                            {t('common.edit')}
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </Fragment>
                                    )
                                })}
                                {visibleOrphans.length > 0 && (
                                    <>
                                        <TableRow>
                                            <TableCell colSpan={4} className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                                {t('admin.cities.orphanZones')}
                                            </TableCell>
                                        </TableRow>
                                        {visibleOrphans.map((city) => (
                                            <TableRow key={city.id ?? `orphan-${city.name}`} className="hover:bg-gray-50/50 transition-colors">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <div className="bg-slate-50 p-2 rounded text-slate-500">
                                                            <MapPin className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-base">{city.name}</span>
                                                        <span className="ml-2 text-[11px] uppercase tracking-wide text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                            {t('admin.cities.badge.zone')}
                                                        </span>
                                                    </div>
                                                    {city.address && <div className="text-xs text-gray-500 mt-1 ml-10">{city.address}</div>}
                                                    <div className="mt-2 ml-10 text-xs text-gray-500 lg:hidden">
                                                        {city.contact_person && (
                                                            <div className="flex items-center gap-2 text-gray-700">
                                                                <User className="w-4 h-4 text-gray-400" />
                                                                {city.contact_person}
                                                            </div>
                                                        )}
                                                        {city.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {city.phone}
                                                            </div>
                                                        )}
                                                        {city.email && (
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-3 h-3" /> {city.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {city.contact_person ? (
                                                        <div className="flex items-center gap-2 text-gray-700">
                                                            <User className="w-4 h-4 text-gray-400" />
                                                            {city.contact_person}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">{t('admin.cities.notDefined')}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                                                        {city.phone && (
                                                            <div className="flex items-center gap-2">
                                                                <Phone className="w-3 h-3" /> {city.phone}
                                                            </div>
                                                        )}
                                                        {city.email && (
                                                            <div className="flex items-center gap-2">
                                                                <Mail className="w-3 h-3" /> {city.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(city)}
                                                    >
                                                        {t('common.edit')}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </>
                                )}
                            </>
                        )}
                    </TableBody>
                </Table>
            </div>

            <CityDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                cityToEdit={selectedCity}
                onSuccess={loadData}
            />
        </div>
    )
}
