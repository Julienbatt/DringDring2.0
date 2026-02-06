'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet, apiPost, apiPut } from '@/lib/api'
import { useMe } from '../../hooks/useMe'
import { useAuth } from '../../providers/AuthProvider'
import { toast } from 'sonner'
import BrandLogo from '@/components/BrandLogo'
import { roleLabel } from '@/lib/roleLabel'
import AddressAutocomplete from '@/components/AddressAutocomplete'

const emptyClient = {
    id: '',
    name: '',
    address: '',
    postal_code: '',
    city_name: '',
    lat: null as number | null,
    lng: null as number | null,
    is_cms: false,
    floor: '',
    door_code: '',
    phone: '',
    email: '',
    active: true,
}

type ClientProfile = typeof emptyClient

export default function CustomerProfilePage() {
    const { data: user, loading } = useMe()
    const { session } = useAuth()
    const [client, setClient] = useState<ClientProfile | null>(null)
    const [clientDraft, setClientDraft] = useState<ClientProfile>(emptyClient)
    const [clientLoading, setClientLoading] = useState(false)
    const [clientSaving, setClientSaving] = useState(false)
    const [creatingClient, setCreatingClient] = useState(false)
    const [createDraft, setCreateDraft] = useState<ClientProfile>(emptyClient)
    const [newPassword, setNewPassword] = useState('')
    const [updating, setUpdating] = useState(false)

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

    useEffect(() => {
        const loadClient = async () => {
            if (!session?.access_token) return
            setClientLoading(true)
            try {
                const data = await apiGet<ClientProfile>('/clients/me', session.access_token)
                const normalized = {
                    ...data,
                    phone: data.phone ?? '',
                    floor: data.floor ?? '',
                    door_code: data.door_code ?? '',
                }
                setClient(normalized)
                setClientDraft(normalized)
            } catch (error) {
                console.error('Failed to load client profile', error)
                setClient(null)
            } finally {
                setClientLoading(false)
            }
        }

        loadClient()
    }, [session])

    const handlePasswordUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!newPassword) return

        setUpdating(true)
        const supabase = createClient()

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            })

            if (error) throw error

            toast.success('Mot de passe mis a jour avec succes')
            setNewPassword('')
        } catch (error: any) {
            toast.error(`Erreur: ${error.message}`)
        } finally {
            setUpdating(false)
        }
    }

    const handleClientUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!session?.access_token || !client) return

        if (clientDraft.phone && !isValidSwissPhone(normalizePhone(clientDraft.phone))) {
            toast.error('Numero invalide. Format attendu: +41...')
            return
        }
        setClientSaving(true)
        try {
            const payload = {
                name: clientDraft.name,
                address: clientDraft.address,
                postal_code: clientDraft.postal_code,
                lat: clientDraft.lat ?? null,
                lng: clientDraft.lng ?? null,
                phone: clientDraft.phone ? normalizePhone(clientDraft.phone) : null,
                floor: clientDraft.floor,
                door_code: clientDraft.door_code,
                email: clientDraft.email,
            }
            const updated = await apiPut<ClientProfile>('/clients/me', payload, session.access_token)
            setClient(updated)
            setClientDraft(updated)
            toast.success('Informations client mises a jour')
        } catch (error: any) {
            toast.error(`Erreur: ${error.message}`)
        } finally {
            setClientSaving(false)
        }
    }

    const handleAddressSelect = (address: { street: string; number: string; zip: string; city: string; lat?: number; lng?: number }) => {
        const formatted = `${address.street} ${address.number}`.trim()
        setClientDraft((prev) => ({
            ...prev,
            address: formatted,
            postal_code: address.zip,
            lat: address.lat ?? prev.lat ?? null,
            lng: address.lng ?? prev.lng ?? null,
        }))
    }

    const handleCreateAddressSelect = (address: { street: string; number: string; zip: string; city: string; lat?: number; lng?: number }) => {
        const formatted = `${address.street} ${address.number}`.trim()
        setCreateDraft((prev) => ({
            ...prev,
            address: formatted,
            postal_code: address.zip,
            city_name: address.city,
            lat: address.lat ?? prev.lat ?? null,
            lng: address.lng ?? prev.lng ?? null,
        }))
    }

    const handleClientCreate = async (e: FormEvent) => {
        e.preventDefault()
        if (!session?.access_token) return
        if (!createDraft.name || !createDraft.postal_code || !createDraft.city_name) {
            toast.error('Nom, NPA et ville sont obligatoires')
            return
        }
        if (createDraft.phone && !isValidSwissPhone(normalizePhone(createDraft.phone))) {
            toast.error('Numero invalide. Format attendu: +41...')
            return
        }
        setCreatingClient(true)
        try {
            const payload = {
                name: createDraft.name,
                address: createDraft.address,
                postal_code: createDraft.postal_code,
                city_name: createDraft.city_name,
                lat: createDraft.lat ?? null,
                lng: createDraft.lng ?? null,
                phone: createDraft.phone ? normalizePhone(createDraft.phone) : null,
                floor: createDraft.floor,
                door_code: createDraft.door_code,
                email: createDraft.email || null,
            }
            const created = await apiPost<ClientProfile>('/clients/me', payload, session.access_token)
            setClient(created)
            setClientDraft(created)
            setCreateDraft(created)
            toast.success('Fiche client créée')
        } catch (error: any) {
            toast.error(`Erreur: ${error.message}`)
        } finally {
            setCreatingClient(false)
        }
    }

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    if (loading) {
        return <div className="p-8">Chargement du profil...</div>
    }

    if (!user) {
        return <div className="p-8">Utilisateur non trouve</div>
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-6 md:px-8">
                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col justify-between gap-6 p-6 md:p-10">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                                    <BrandLogo width={180} height={54} className="h-10 w-auto md:h-12" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">Mon compte</p>
                                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Profil client</h1>
                                </div>
                            </div>
                            <p className="max-w-xl text-sm text-slate-600 md:text-base">
                                Retrouvez vos informations personnelles et mettez a jour votre securite.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">Informations client</h2>
                    {clientLoading ? (
                        <div className="mt-4 text-sm text-slate-500">Chargement des informations client...</div>
                    ) : !client ? (
                        <form onSubmit={handleClientCreate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2 text-sm text-slate-500">
                                Aucune fiche client n&apos;est associee a ce compte. Creez-la pour acceder a vos livraisons.
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Nom</label>
                                <input
                                    value={createDraft.name}
                                    onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Email (optionnel)</label>
                                <input
                                    value={createDraft.email}
                                    onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Recherche adresse (Suisse)</label>
                                <div className="mt-2">
                                    <AddressAutocomplete onSelect={handleCreateAddressSelect} />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Adresse</label>
                                <input
                                    value={createDraft.address}
                                    onChange={(e) =>
                                        setCreateDraft({
                                            ...createDraft,
                                            address: e.target.value,
                                            lat: null,
                                            lng: null,
                                        })
                                    }
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Code postal</label>
                                <input
                                    value={createDraft.postal_code}
                                    onChange={(e) => setCreateDraft({ ...createDraft, postal_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Ville</label>
                                <input
                                    value={createDraft.city_name}
                                    onChange={(e) => setCreateDraft({ ...createDraft, city_name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Telephone</label>
                                <input
                                    value={createDraft.phone}
                                    onChange={(e) => setCreateDraft({ ...createDraft, phone: formatSwissPhone(e.target.value) })}
                                    onBlur={(event) =>
                                        setCreateDraft((prev) => ({
                                            ...prev,
                                            phone: normalizePhone(event.target.value),
                                        }))
                                    }
                                    placeholder="+4179..."
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Etage</label>
                                <input
                                    value={createDraft.floor}
                                    onChange={(e) => setCreateDraft({ ...createDraft, floor: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Code porte</label>
                                <input
                                    value={createDraft.door_code}
                                    onChange={(e) => setCreateDraft({ ...createDraft, door_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2 flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={creatingClient}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {creatingClient ? 'Creation...' : 'Creer ma fiche client'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleClientUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Nom</label>
                                <input
                                    value={clientDraft.name}
                                    onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Commune partenaire</label>
                                <input
                                    value={clientDraft.city_name}
                                    disabled
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Recherche adresse (Suisse)</label>
                                <div className="mt-2">
                                    <AddressAutocomplete onSelect={handleAddressSelect} />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Adresse</label>
                                <input
                                    value={clientDraft.address}
                                    onChange={(e) =>
                                        setClientDraft({
                                            ...clientDraft,
                                            address: e.target.value,
                                            lat: null,
                                            lng: null,
                                        })
                                    }
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Code postal</label>
                                <input
                                    value={clientDraft.postal_code}
                                    onChange={(e) => setClientDraft({ ...clientDraft, postal_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Telephone</label>
                                <input
                                    value={clientDraft.phone}
                                    onChange={(e) => setClientDraft({ ...clientDraft, phone: formatSwissPhone(e.target.value) })}
                                    onBlur={(event) =>
                                        setClientDraft((prev) => ({
                                            ...prev,
                                            phone: normalizePhone(event.target.value),
                                        }))
                                    }
                                    placeholder="+4179..."
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Email</label>
                                <input
                                    value={clientDraft.email}
                                    onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })}
                                    placeholder="optionnel"
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Etage</label>
                                <input
                                    value={clientDraft.floor}
                                    onChange={(e) => setClientDraft({ ...clientDraft, floor: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Code porte</label>
                                <input
                                    value={clientDraft.door_code}
                                    onChange={(e) => setClientDraft({ ...clientDraft, door_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Statut</label>
                                <div className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                    {client.is_cms ? 'Client CMS' : 'Client standard'}
                                </div>
                            </div>
                            <div className="md:col-span-2 flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={clientSaving}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {clientSaving ? 'Mise a jour...' : 'Enregistrer'}
                                </button>
                            </div>
                        </form>
                    )}
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">Compte</h2>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Email</label>
                            <div className="mt-1 text-sm font-medium text-slate-900">{user.email}</div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Role</label>
                            <div className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {roleLabel(user.role ?? undefined)}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">Securite</h2>
                    <form onSubmit={handlePasswordUpdate} className="mt-4 space-y-4">
                        <div>
                            <label htmlFor="new-password" className="text-sm font-medium text-slate-600">Nouveau mot de passe</label>
                            <input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="******"
                                minLength={6}
                                className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                            />
                            <p className="mt-1 text-xs text-slate-400">Minimum 6 caracteres.</p>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={!newPassword || updating}
                                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {updating ? 'Mise a jour...' : 'Mettre a jour'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="pt-2">
                    <button
                        onClick={handleLogout}
                        className="text-sm font-semibold text-red-600 transition hover:text-red-700"
                    >
                        Se deconnecter
                    </button>
                </section>
            </div>
        </div>
    )
}
