'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, UserPlus, ArrowLeft } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { apiPost } from '@/lib/api'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { normalizePhone, isValidSwissPhone, formatSwissPhone } from '@/lib/phone'

export default function RegisterPage() {
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [address, setAddress] = useState('')
    const [postalCode, setPostalCode] = useState('')
    const [cityName, setCityName] = useState('')
    const [floor, setFloor] = useState('')
    const [doorCode, setDoorCode] = useState('')
    const [phone, setPhone] = useState('')
    const [lat, setLat] = useState<number | null>(null)
    const [lng, setLng] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()
    const { t } = useLanguage()

    const handleAddressSelect = (selected: { street: string; number: string; zip: string; city: string; lat?: number; lng?: number }) => {
        const formattedAddress = `${selected.street} ${selected.number}`.trim()
        setAddress(formattedAddress)
        setPostalCode(selected.zip)
        setCityName(selected.city)
        setLat(selected.lat ?? null)
        setLng(selected.lng ?? null)
    }

    const getErrorMessage = (error: unknown) => {
        if (error instanceof Error) return error.message
        return t('register.unexpected')
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!fullName.trim()) {
            toast.error(t('register.errName'))
            return
        }
        if (!address.trim() || !postalCode.trim() || !cityName.trim()) {
            toast.error(t('register.errAddress'))
            return
        }
        if (password !== confirmPassword) {
            toast.error(t('register.errPwdMatch'))
            return
        }
        if (password.length < 6) {
            toast.error(t('register.errPwdLength'))
            return
        }
        const normalizedPhone = phone ? normalizePhone(phone) : ''
        if (normalizedPhone && !isValidSwissPhone(normalizedPhone)) {
            toast.error(t('register.errPhone'))
            return
        }

        setLoading(true)

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${location.origin}/auth/callback`,
                    data: {
                        role: 'customer',
                    }
                },
            })

            if (error) {
                toast.error(error.message)
                return
            }

            if (!data.user) {
                toast.error(t('register.errCreate'))
                return
            }

            const token = data.session?.access_token
            if (!token) {
                toast.success(t('register.needEmailValidation'))
                router.push('/login')
                return
            }

            await apiPost(
                '/clients/me',
                {
                    name: fullName.trim(),
                    address: address.trim(),
                    postal_code: postalCode.trim(),
                    city_name: cityName.trim(),
                    lat,
                    lng,
                    phone: normalizedPhone || null,
                    floor: floor.trim() || null,
                    door_code: doorCode.trim() || null,
                    email: email.trim(),
                },
                token
            )

            toast.success(t('register.success'))
            router.push('/dashboard')
        } catch (err: unknown) {
            console.error('Registration Error:', err)
            toast.error(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-2xl shadow-lg border-0 bg-white/90 backdrop-blur">
                <CardHeader className="space-y-1">
                    <div className="flex justify-center mb-4">
                        <div className="bg-green-100 p-3 rounded-full">
                            <UserPlus className="w-8 h-8 text-green-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl text-center font-bold">{t('register.title')}</CardTitle>
                    <CardDescription className="text-center">
                        {t('register.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="fullName">{t('register.fullName')}</Label>
                            <Input
                                id="fullName"
                                type="text"
                                placeholder={t('register.fullNamePlaceholder')}
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>{t('register.addressSearch')}</Label>
                            <AddressAutocomplete onSelect={handleAddressSelect} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="address">{t('register.address')}</Label>
                            <Input
                                id="address"
                                type="text"
                                placeholder={t('register.addressPlaceholder')}
                                value={address}
                                onChange={e => {
                                    setAddress(e.target.value)
                                    setLat(null)
                                    setLng(null)
                                }}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="postalCode">{t('register.postalCode')}</Label>
                            <Input
                                id="postalCode"
                                type="text"
                                placeholder={t('register.postalCodePlaceholder')}
                                value={postalCode}
                                onChange={e => setPostalCode(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cityName">{t('register.city')}</Label>
                            <Input
                                id="cityName"
                                type="text"
                                placeholder={t('register.cityPlaceholder')}
                                value={cityName}
                                onChange={e => setCityName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="floor">{t('register.floor')}</Label>
                            <Input
                                id="floor"
                                type="text"
                                placeholder={t('register.floorPlaceholder')}
                                value={floor}
                                onChange={e => setFloor(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="doorCode">{t('register.doorCode')}</Label>
                            <Input
                                id="doorCode"
                                type="text"
                                placeholder={t('register.doorCodePlaceholder')}
                                value={doorCode}
                                onChange={e => setDoorCode(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">{t('register.phone')}</Label>
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="+4179..."
                                value={phone}
                                onChange={e => setPhone(formatSwissPhone(e.target.value))}
                                onBlur={(e) => setPhone(normalizePhone(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">{t('register.email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder={t('register.emailPlaceholder')}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">{t('register.password')}</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm">{t('register.confirmPassword')}</Label>
                            <Input
                                id="confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 md:col-span-2" disabled={loading}>
                            {loading ? t('register.submitting') : t('register.submit')}
                        </Button>
                    </form>

                    <div className="mt-4 md:mt-6">
                        <Alert className="bg-blue-50 border-blue-100 text-blue-800">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm font-semibold">{t('register.infoTitle')}</AlertTitle>
                            <AlertDescription className="text-xs">
                                {t('register.infoBody')}
                            </AlertDescription>
                        </Alert>
                    </div>

                </CardContent>
                <CardFooter className="flex flex-col gap-4 text-center text-sm text-gray-500">
                    <div className="relative w-full">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-muted-foreground">{t('register.already')}</span>
                        </div>
                    </div>
                    <Link href="/login" className="flex items-center justify-center text-blue-600 hover:underline">
                        <ArrowLeft className="w-4 h-4 mr-1" /> {t('register.backToLogin')}
                    </Link>
                </CardFooter>
            </Card>
        </div>
    )
}
