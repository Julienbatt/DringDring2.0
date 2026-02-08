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
import { useLanguage } from '@/lib/i18n/LanguageProvider'

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

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
    const { t } = useLanguage()
    const { data: user, loading } = useMe()
    const { session } = useAuth()
    const [client, setClient] = useState<ClientProfile | null>(null)
    const [clientDraft, setClientDraft] = useState<ClientProfile>(emptyClient)
    const [clientLoading, setClientLoading] = useState(false)
    const [clientSaving, setClientSaving] = useState(false)
    const [creatingClient, setCreatingClient] = useState(false)
    const [createDraft, setCreateDraft] = useState<ClientProfile>(emptyClient)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [updating, setUpdating] = useState(false)
    const [emailDraft, setEmailDraft] = useState('')
    const [emailUpdating, setEmailUpdating] = useState(false)

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

    useEffect(() => {
        if (!user?.email) return
        setEmailDraft(user.email)
    }, [user?.email])

    const handlePasswordUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!newPassword) return
        if (newPassword !== confirmPassword) {
            toast.error(t('settings.security.passwordMismatch'))
            return
        }

        setUpdating(true)
        const supabase = createClient()

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            })

            if (error) throw error

            toast.success(t('settings.security.passwordUpdated'))
            setNewPassword('')
            setConfirmPassword('')
        } catch (error: unknown) {
            toast.error(`${t('settings.toast.genericError')}: ${getErrorMessage(error, t('common.unknownError'))}`)
        } finally {
            setUpdating(false)
        }
    }

    const handleEmailUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!emailDraft) return
        if (emailDraft === user?.email) return
        setEmailUpdating(true)
        const supabase = createClient()
        try {
            const { error } = await supabase.auth.updateUser({ email: emailDraft })
            if (error) throw error
            toast.success(t('settings.profile.emailUpdated'))
        } catch (error: unknown) {
            toast.error(`${t('settings.toast.emailError')}: ${getErrorMessage(error, t('common.unknownError'))}`)
        } finally {
            setEmailUpdating(false)
        }
    }

    const handleClientUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!session?.access_token || !client) return

        if (clientDraft.phone && !isValidSwissPhone(normalizePhone(clientDraft.phone))) {
            toast.error(t('profile.phoneInvalid'))
            return
        }
        setClientSaving(true)
        try {
            const payload = {
                name: clientDraft.name,
                address: clientDraft.address,
                postal_code: clientDraft.postal_code,
                city_name: clientDraft.city_name,
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
            toast.success(t('profile.updated'))
        } catch (error: unknown) {
            toast.error(`${t('settings.toast.genericError')}: ${getErrorMessage(error, t('common.unknownError'))}`)
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
            city_name: address.city,
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
            toast.error(t('profile.requiredFields'))
            return
        }
        if (createDraft.phone && !isValidSwissPhone(normalizePhone(createDraft.phone))) {
            toast.error(t('profile.phoneInvalid'))
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
            toast.success(t('profile.created'))
        } catch (error: unknown) {
            toast.error(`${t('settings.toast.genericError')}: ${getErrorMessage(error, t('common.unknownError'))}`)
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
        return <div className="p-8">{t('settings.loadingProfile')}</div>
    }

    if (!user) {
        return <div className="p-8">{t('settings.userNotFound')}</div>
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="flex w-full flex-col gap-8 px-4 pb-16 pt-6 md:px-8">
                <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col justify-between gap-6 p-6 md:p-10">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                                    <BrandLogo width={180} height={54} className="h-10 w-auto md:h-12" />
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.28em] text-emerald-600">{t('profile.myAccount')}</p>
                                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">{t('profile.title')}</h1>
                                </div>
                            </div>
                            <p className="max-w-xl text-sm text-slate-600 md:text-base">
                                {t('profile.subtitle')}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">{t('profile.clientInfo')}</h2>
                    {clientLoading ? (
                        <div className="mt-4 text-sm text-slate-500">{t('profile.loadingClientInfo')}</div>
                    ) : !client ? (
                        <form onSubmit={handleClientCreate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2 text-sm text-slate-500">
                                {t('profile.noCard')}
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.name')}</label>
                                <input
                                    value={createDraft.name}
                                    onChange={(e) => setCreateDraft({ ...createDraft, name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.emailOptional')}</label>
                                <input
                                    value={createDraft.email}
                                    onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.addressSearch')}</label>
                                <div className="mt-2">
                                    <AddressAutocomplete onSelect={handleCreateAddressSelect} />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.address')}</label>
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
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.postalCode')}</label>
                                <input
                                    value={createDraft.postal_code}
                                    onChange={(e) => setCreateDraft({ ...createDraft, postal_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.city')}</label>
                                <input
                                    value={createDraft.city_name}
                                    onChange={(e) => setCreateDraft({ ...createDraft, city_name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.phone')}</label>
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
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.floor')}</label>
                                <input
                                    value={createDraft.floor}
                                    onChange={(e) => setCreateDraft({ ...createDraft, floor: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.doorCode')}</label>
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
                                    {creatingClient ? t('profile.creating') : t('profile.createCard')}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleClientUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.name')}</label>
                                <input
                                    value={clientDraft.name}
                                    onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.partnerCity')}</label>
                                <input
                                    value={clientDraft.city_name}
                                    onChange={(e) => setClientDraft({ ...clientDraft, city_name: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.addressSearch')}</label>
                                <div className="mt-2">
                                    <AddressAutocomplete onSelect={handleAddressSelect} />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.address')}</label>
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
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.postalCode')}</label>
                                <input
                                    value={clientDraft.postal_code}
                                    onChange={(e) => setClientDraft({ ...clientDraft, postal_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.phone')}</label>
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
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('settings.profile.email')}</label>
                                <input
                                    value={clientDraft.email}
                                    onChange={(e) => setClientDraft({ ...clientDraft, email: e.target.value })}
                                    placeholder={t('profile.optional')}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.floor')}</label>
                                <input
                                    value={clientDraft.floor}
                                    onChange={(e) => setClientDraft({ ...clientDraft, floor: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.doorCode')}</label>
                                <input
                                    value={clientDraft.door_code}
                                    onChange={(e) => setClientDraft({ ...clientDraft, door_code: e.target.value })}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('profile.status')}</label>
                                <div className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                    {client.is_cms ? t('profile.cmsClient') : t('profile.standardClient')}
                                </div>
                            </div>
                            <div className="md:col-span-2 flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={clientSaving}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {clientSaving ? t('settings.cta.updating') : t('profile.save')}
                                </button>
                            </div>
                        </form>
                    )}
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">{t('profile.accountSection')}</h2>
                    <form onSubmit={handleEmailUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label htmlFor="customer-account-email" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('settings.profile.email')}</label>
                            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <input
                                    id="customer-account-email"
                                    type="email"
                                    value={emailDraft}
                                    onChange={(e) => setEmailDraft(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={!emailDraft || emailDraft === user.email || emailUpdating}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {emailUpdating ? t('settings.cta.updating') : t('settings.profile.updateEmail')}
                                </button>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{t('settings.profile.emailHint')}</p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t('settings.profile.role')}</label>
                            <div className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {t(`role.${user.role}`) !== `role.${user.role}` ? t(`role.${user.role}`) : roleLabel(user.role ?? undefined)}
                            </div>
                        </div>
                    </form>
                </section>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">{t('settings.security.title')}</h2>
                    <form onSubmit={handlePasswordUpdate} className="mt-4 space-y-4">
                        <div>
                            <label htmlFor="new-password" className="text-sm font-medium text-slate-600">{t('settings.security.newPassword')}</label>
                            <input
                                id="new-password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="******"
                                minLength={6}
                                className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                            />
                            <p className="mt-1 text-xs text-slate-400">{t('settings.security.minHint')}</p>
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="text-sm font-medium text-slate-600">{t('settings.security.confirmPassword')}</label>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="******"
                                minLength={6}
                                className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={!newPassword || !confirmPassword || updating}
                                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {updating ? t('settings.cta.updating') : t('settings.cta.update')}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="pt-2">
                    <button
                        onClick={handleLogout}
                        className="text-sm font-semibold text-red-600 transition hover:text-red-700"
                    >
                        {t('common.logout')}
                    </button>
                </section>
            </div>
        </div>
    )
}
