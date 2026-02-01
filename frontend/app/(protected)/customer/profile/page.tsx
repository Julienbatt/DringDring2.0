'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { apiGet, apiPut } from '@/lib/api'
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
    const [newPassword, setNewPassword] = useState('')
    const [updating, setUpdating] = useState(false)

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

        setClientSaving(true)
        try {
            const payload = {
                name: clientDraft.name,
                address: clientDraft.address,
                postal_code: clientDraft.postal_code,
                lat: clientDraft.lat ?? null,
                lng: clientDraft.lng ?? null,
                phone: clientDraft.phone,
                floor: clientDraft.floor,
                door_code: clientDraft.door_code,
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
                        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            Aucune fiche client n'est associee a ce compte.
                        </div>
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
                                    onChange={(e) => setClientDraft({ ...clientDraft, phone: e.target.value })}
                                    placeholder="Non renseigne"
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
