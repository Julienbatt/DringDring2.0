'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useMe } from '../hooks/useMe'
import { toast } from 'sonner'
import { roleLabel } from '@/lib/roleLabel'
import { apiGet, apiPost, apiPut, apiDelete, API_BASE_URL } from '@/lib/api'
import { MonthInput } from '@/components/ui/month-input'

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

export default function SettingsPage() {
    const router = useRouter()
    const { data: user, loading } = useMe()
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [updating, setUpdating] = useState(false)
    const [emailDraft, setEmailDraft] = useState('')
    const [emailUpdating, setEmailUpdating] = useState(false)
    const [vatRatePercent, setVatRatePercent] = useState('8.1')
    const [vatMonth, setVatMonth] = useState(() => new Date().toISOString().slice(0, 7))
    const [vatEffectiveFrom, setVatEffectiveFrom] = useState<string | null>(null)
    const [vatLoading, setVatLoading] = useState(false)
    const [vatSaving, setVatSaving] = useState(false)
    const [billingLoading, setBillingLoading] = useState(false)
    const [billingSaving, setBillingSaving] = useState(false)
    const [logoUploading, setLogoUploading] = useState(false)
    const [internalBillingLoading, setInternalBillingLoading] = useState(false)
    const [internalBillingSaving, setInternalBillingSaving] = useState(false)
    const [internalLogoUploading, setInternalLogoUploading] = useState(false)
    const [billingForm, setBillingForm] = useState({
        billing_name: '',
        billing_iban: '',
        billing_street: '',
        billing_house_num: '',
        billing_postal_code: '',
        billing_city: '',
        billing_country: 'CH',
        billing_logo_path: '',
    })
    const [internalBillingForm, setInternalBillingForm] = useState({
        internal_billing_name: '',
        internal_billing_iban: '',
        internal_billing_street: '',
        internal_billing_house_num: '',
        internal_billing_postal_code: '',
        internal_billing_city: '',
        internal_billing_country: 'CH',
        internal_billing_logo_path: '',
    })

    useEffect(() => {
        if (user?.role === 'customer') {
            router.replace('/customer/profile')
        }
    }, [user, router])

    useEffect(() => {
        if (!user?.email) return
        setEmailDraft(user.email)
    }, [user?.email])

    useEffect(() => {
        if (user?.role !== 'super_admin') return
        let isActive = true
        const loadVatRate = async () => {
            setVatLoading(true)
            try {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) return
                const data = await apiGet<{ rate: number; effective_from: string }>(
                    `/settings/vat-rate?month=${vatMonth}`,
                    session.access_token
                )
                if (!isActive) return
                const percent = (data.rate * 100).toFixed(1).replace(/\.0$/, '')
                setVatRatePercent(percent)
                setVatEffectiveFrom(data.effective_from)
            } catch (error: unknown) {
                toast.error(`Erreur TVA: ${getErrorMessage(error, 'Erreur inconnue')}`)
            } finally {
                if (isActive) {
                    setVatLoading(false)
                }
            }
        }
        loadVatRate()
        return () => {
            isActive = false
        }
    }, [user?.role, vatMonth])

    useEffect(() => {
        if (user?.role !== 'admin_region') return
        let isActive = true
        const loadBilling = async () => {
            setBillingLoading(true)
            try {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) return
                const data = await apiGet<{
                    billing_name: string | null
                    billing_iban: string | null
                    billing_street: string | null
                    billing_house_num: string | null
                    billing_postal_code: string | null
                    billing_city: string | null
                    billing_country: string | null
                    billing_logo_path: string | null
                }>('/regions/me/billing', session.access_token)
                if (!isActive) return
                setBillingForm({
                    billing_name: data.billing_name || '',
                    billing_iban: data.billing_iban || '',
                    billing_street: data.billing_street || '',
                    billing_house_num: data.billing_house_num || '',
                    billing_postal_code: data.billing_postal_code || '',
                    billing_city: data.billing_city || '',
                    billing_country: data.billing_country || 'CH',
                    billing_logo_path: data.billing_logo_path || '',
                })
            } catch (error: unknown) {
                toast.error(`Erreur facturation: ${getErrorMessage(error, 'Erreur inconnue')}`)
            } finally {
                if (isActive) {
                    setBillingLoading(false)
                }
            }
        }
        loadBilling()
        return () => {
            isActive = false
        }
    }, [user?.role])

    useEffect(() => {
        if (user?.role !== 'admin_region') return
        let isActive = true
        const loadInternalBilling = async () => {
            setInternalBillingLoading(true)
            try {
                const supabase = createClient()
                const { data: { session } } = await supabase.auth.getSession()
                if (!session?.access_token) return
                const data = await apiGet<{
                    internal_billing_name: string | null
                    internal_billing_iban: string | null
                    internal_billing_street: string | null
                    internal_billing_house_num: string | null
                    internal_billing_postal_code: string | null
                    internal_billing_city: string | null
                    internal_billing_country: string | null
                    internal_billing_logo_path: string | null
                }>('/regions/me/internal-billing', session.access_token)
                if (!isActive) return
                setInternalBillingForm({
                    internal_billing_name: data.internal_billing_name || '',
                    internal_billing_iban: data.internal_billing_iban || '',
                    internal_billing_street: data.internal_billing_street || '',
                    internal_billing_house_num: data.internal_billing_house_num || '',
                    internal_billing_postal_code: data.internal_billing_postal_code || '',
                    internal_billing_city: data.internal_billing_city || '',
                    internal_billing_country: data.internal_billing_country || 'CH',
                    internal_billing_logo_path: data.internal_billing_logo_path || '',
                })
            } catch (error: unknown) {
                toast.error(`Erreur facturation interne: ${getErrorMessage(error, 'Erreur inconnue')}`)
            } finally {
                if (isActive) {
                    setInternalBillingLoading(false)
                }
            }
        }
        loadInternalBilling()
        return () => {
            isActive = false
        }
    }, [user?.role])

    const handlePasswordUpdate = async (e: FormEvent) => {
        e.preventDefault()
        if (!newPassword) return
        if (newPassword !== confirmPassword) {
            toast.error('Les mots de passe ne correspondent pas')
            return
        }

        setUpdating(true)
        const supabase = createClient()

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            })

            if (error) throw error

            toast.success('Mot de passe mis a jour avec succes')
            setNewPassword('')
            setConfirmPassword('')
        } catch (error: unknown) {
            toast.error(`Erreur: ${getErrorMessage(error, 'Erreur inconnue')}`)
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
            toast.success('Email mis a jour. Verification envoyee a la nouvelle adresse.')
        } catch (error: unknown) {
            toast.error(`Erreur email: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setEmailUpdating(false)
        }
    }

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = '/login'
    }

    const handleVatUpdate = async (e: FormEvent) => {
        e.preventDefault()
        const parsedPercent = Number(vatRatePercent.replace(',', '.'))
        if (!Number.isFinite(parsedPercent) || parsedPercent <= 0 || parsedPercent >= 100) {
            toast.error('Valeur TVA invalide')
            return
        }

        setVatSaving(true)
        const supabase = createClient()

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            const rate = parsedPercent / 100
            const response = await apiPost<{ rate: number; effective_from: string }>(
                '/settings/vat-rate',
                { rate, effective_from: vatMonth },
                session.access_token
            )
            setVatEffectiveFrom(response.effective_from)
            toast.success('TVA mise a jour')
        } catch (error: unknown) {
            toast.error(`Erreur TVA: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setVatSaving(false)
        }
    }

    const handleBillingUpdate = async (e: FormEvent) => {
        e.preventDefault()
        setBillingSaving(true)
        const supabase = createClient()

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            const response = await apiPut<typeof billingForm>(
                '/regions/me/billing',
                {
                    billing_name: billingForm.billing_name,
                    billing_iban: billingForm.billing_iban,
                    billing_street: billingForm.billing_street,
                    billing_house_num: billingForm.billing_house_num,
                    billing_postal_code: billingForm.billing_postal_code,
                    billing_city: billingForm.billing_city,
                    billing_country: billingForm.billing_country,
                },
                session.access_token
            )
            setBillingForm((prev) => ({
                ...prev,
                ...response,
                billing_logo_path: response.billing_logo_path || prev.billing_logo_path,
            }))
            toast.success('Parametres de facturation mis a jour')
        } catch (error: unknown) {
            toast.error(`Erreur facturation: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setBillingSaving(false)
        }
    }

    const handleInternalBillingUpdate = async (e: FormEvent) => {
        e.preventDefault()
        setInternalBillingSaving(true)
        const supabase = createClient()

        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            const response = await apiPut<typeof internalBillingForm>(
                '/regions/me/internal-billing',
                {
                    internal_billing_name: internalBillingForm.internal_billing_name,
                    internal_billing_iban: internalBillingForm.internal_billing_iban,
                    internal_billing_street: internalBillingForm.internal_billing_street,
                    internal_billing_house_num: internalBillingForm.internal_billing_house_num,
                    internal_billing_postal_code: internalBillingForm.internal_billing_postal_code,
                    internal_billing_city: internalBillingForm.internal_billing_city,
                    internal_billing_country: internalBillingForm.internal_billing_country,
                },
                session.access_token
            )
            setInternalBillingForm((prev) => ({
                ...prev,
                ...response,
                internal_billing_logo_path: response.internal_billing_logo_path || prev.internal_billing_logo_path,
            }))
            toast.success('Facturation interne mise a jour')
        } catch (error: unknown) {
            toast.error(`Erreur facturation interne: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setInternalBillingSaving(false)
        }
    }

    const handleLogoUpload = async (file: File | null) => {
        if (!file) return
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Logo trop volumineux (max 2MB)')
            return
        }
        setLogoUploading(true)
        const supabase = createClient()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            const form = new FormData()
            form.append('file', file)
            const res = await fetch(`${API_BASE_URL}/regions/me/logo`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: form,
            })
            if (!res.ok) {
                const text = await res.text()
                throw new Error(text)
            }
            const data = await res.json()
            setBillingForm((prev) => ({
                ...prev,
                billing_logo_path: data.billing_logo_path || '',
            }))
            toast.success('Logo charge')
        } catch (error: unknown) {
            toast.error(`Erreur logo: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setLogoUploading(false)
        }
    }

    const handleLogoRemove = async () => {
        setLogoUploading(true)
        const supabase = createClient()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            await apiDelete('/regions/me/logo', session.access_token)
            setBillingForm((prev) => ({ ...prev, billing_logo_path: '' }))
            toast.success('Logo supprime')
        } catch (error: unknown) {
            toast.error(`Erreur logo: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setLogoUploading(false)
        }
    }

    const handleInternalLogoUpload = async (file: File | null) => {
        if (!file) return
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Logo trop volumineux (max 2MB)')
            return
        }
        setInternalLogoUploading(true)
        const supabase = createClient()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            const form = new FormData()
            form.append('file', file)
            const res = await fetch(`${API_BASE_URL}/regions/me/internal-logo`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: form,
            })
            if (!res.ok) {
                const text = await res.text()
                throw new Error(text)
            }
            const data = await res.json()
            setInternalBillingForm((prev) => ({
                ...prev,
                internal_billing_logo_path: data.internal_billing_logo_path || '',
            }))
            toast.success('Logo interne charge')
        } catch (error: unknown) {
            toast.error(`Erreur logo interne: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setInternalLogoUploading(false)
        }
    }

    const handleInternalLogoRemove = async () => {
        setInternalLogoUploading(true)
        const supabase = createClient()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                toast.error('Session invalide')
                return
            }
            await apiDelete('/regions/me/internal-logo', session.access_token)
            setInternalBillingForm((prev) => ({ ...prev, internal_billing_logo_path: '' }))
            toast.success('Logo interne supprime')
        } catch (error: unknown) {
            toast.error(`Erreur logo interne: ${getErrorMessage(error, 'Erreur inconnue')}`)
        } finally {
            setInternalLogoUploading(false)
        }
    }

    if (loading) {
        return <div className="p-8">Chargement du profil...</div>
    }

    if (!user) {
        return <div className="p-8">Utilisateur non trouve</div>
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-16 pt-6 md:px-8">
                <header className="space-y-2">
                    <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Parametres du compte</h1>
                    <p className="text-sm text-slate-600 md:text-base">Gerez vos informations et la securite du compte.</p>
                </header>

                <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900">Profil</h2>
                    <form onSubmit={handleEmailUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label htmlFor="account-email" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Email</label>
                            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <input
                                    id="account-email"
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
                                    {emailUpdating ? 'Mise a jour...' : 'Modifier email'}
                                </button>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">Un email de verification peut etre requis par Supabase.</p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Role</label>
                            <div className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                {roleLabel(user.role ?? undefined)}
                            </div>
                        </div>
                        {user.shop_id && (
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ID Boutique</label>
                                <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
                                    {user.shop_id}
                                </div>
                            </div>
                        )}
                        {user.city_id && (
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ID Commune</label>
                                <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
                                    {user.city_id}
                                </div>
                            </div>
                        )}
                        {user.hq_id && (
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ID HQ</label>
                                <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
                                    {user.hq_id}</div>
                            </div>
                        )}
                        {user.admin_region_id && (
                            <div className="md:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">ID Region</label>
                                <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
                                    {user.admin_region_id}
                                </div>
                            </div>
                        )}
                    </form>
                </section>

                {user.role === 'super_admin' && (
                    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-slate-900">Parametres TVA</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            La TVA est appliquee aux factures PDF. Vous pouvez planifier une nouvelle valeur par mois.
                        </p>
                        <form onSubmit={handleVatUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-slate-600">Taux TVA (%)</label>
                                <input
                                    type="text"
                                    value={vatRatePercent}
                                    onChange={(e) => setVatRatePercent(e.target.value)}
                                    placeholder="8.1"
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                                <p className="mt-1 text-xs text-slate-400">
                                    Actif depuis: {vatEffectiveFrom || vatMonth}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">Mois d&apos;effet</label>
                                <MonthInput
                                    value={vatMonth}
                                    onChange={(e) => setVatMonth(e.target.value)}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                                <p className="mt-1 text-xs text-slate-400">
                                    {vatLoading ? 'Chargement...' : 'Selectionnez un mois pour previsualiser le taux.'}
                                </p>
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={vatSaving || vatLoading}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {vatSaving ? 'Mise a jour...' : 'Mettre a jour la TVA'}
                                </button>
                            </div>
                        </form>
                    </section>
                )}

                {user.role === 'admin_region' && (
                    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-slate-900">Facturation regionale</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Definissez les coordonnees bancaires et le logo pour les factures de votre region.
                        </p>
                        <form onSubmit={handleBillingUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Raison sociale</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_name}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_name: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">IBAN</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_iban}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_iban: e.target.value }))}
                                    placeholder="CHxx xxxx xxxx xxxx xxxx x"
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Rue</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_street}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_street: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">No</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_house_num}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_house_num: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">NPA</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_postal_code}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_postal_code: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">Ville</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_city}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_city: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">Pays</label>
                                <input
                                    type="text"
                                    value={billingForm.billing_country}
                                    onChange={(e) => setBillingForm((prev) => ({ ...prev, billing_country: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Logo facture</label>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                                        disabled={logoUploading}
                                        className="block text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                                    />
                                    <span className="text-xs text-slate-400">
                                        {billingForm.billing_logo_path ? 'Logo charge' : 'Aucun logo'}
                                    </span>
                                    {billingForm.billing_logo_path && (
                                        <button
                                            type="button"
                                            onClick={handleLogoRemove}
                                            disabled={logoUploading}
                                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                                        >
                                            Supprimer
                                        </button>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-slate-400">Formats PNG/JPEG, max 2MB.</p>
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={billingSaving || billingLoading}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {billingSaving ? 'Mise a jour...' : 'Mettre a jour la facturation'}
                                </button>
                            </div>
                        </form>
                    </section>
                )}

                {user.role === 'admin_region' && (
                    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-slate-900">Facturation interne (prestataire)</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Utilise pour la facture interne du prestataire de livraison vers l&apos;association.
                        </p>
                        <form onSubmit={handleInternalBillingUpdate} className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Raison sociale</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_name}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_name: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">IBAN</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_iban}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_iban: e.target.value }))}
                                    placeholder="CHxx xxxx xxxx xxxx xxxx x"
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Rue</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_street}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_street: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">No</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_house_num}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_house_num: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">NPA</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_postal_code}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_postal_code: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">Ville</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_city}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_city: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600">Pays</label>
                                <input
                                    type="text"
                                    value={internalBillingForm.internal_billing_country}
                                    onChange={(e) => setInternalBillingForm((prev) => ({ ...prev, internal_billing_country: e.target.value }))}
                                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-slate-600">Logo interne</label>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg"
                                        onChange={(e) => handleInternalLogoUpload(e.target.files?.[0] || null)}
                                        disabled={internalLogoUploading}
                                        className="block text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                                    />
                                    <span className="text-xs text-slate-400">
                                        {internalBillingForm.internal_billing_logo_path ? 'Logo charge' : 'Aucun logo'}
                                    </span>
                                    {internalBillingForm.internal_billing_logo_path && (
                                        <button
                                            type="button"
                                            onClick={handleInternalLogoRemove}
                                            disabled={internalLogoUploading}
                                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                                        >
                                            Supprimer
                                        </button>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-slate-400">Formats PNG/JPEG, max 2MB.</p>
                            </div>
                            <div className="md:col-span-2 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={internalBillingSaving || internalBillingLoading}
                                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {internalBillingSaving ? 'Mise a jour...' : 'Mettre a jour la facturation interne'}
                                </button>
                            </div>
                        </form>
                    </section>
                )}

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
                        <div>
                            <label htmlFor="confirm-password" className="text-sm font-medium text-slate-600">Confirmer le mot de passe</label>
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
                                {updating ? 'Mise a jour...' : 'Mettre a jour'}
                            </button>
                        </div>
                    </form>
                </section>

                <section className="pt-4">
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
