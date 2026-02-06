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
        return 'Une erreur inattendue est survenue.'
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!fullName.trim()) {
            toast.error('Le nom complet est obligatoire')
            return
        }
        if (!address.trim() || !postalCode.trim() || !cityName.trim()) {
            toast.error('Adresse, NPA et commune sont obligatoires')
            return
        }
        if (password !== confirmPassword) {
            toast.error("Les mots de passe ne correspondent pas")
            return
        }
        if (password.length < 6) {
            toast.error("Le mot de passe doit faire au moins 6 caractères")
            return
        }
        const normalizedPhone = phone ? normalizePhone(phone) : ''
        if (normalizedPhone && !isValidSwissPhone(normalizedPhone)) {
            toast.error('Numero invalide. Format attendu: +41...')
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
                toast.error("Impossible de creer le compte.")
                return
            }

            const token = data.session?.access_token
            if (!token) {
                toast.success("Compte cree. Verifiez votre email puis connectez-vous pour finaliser votre profil.")
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

            toast.success('Compte client cree avec succes')
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
                    <CardTitle className="text-2xl text-center font-bold">Créer un compte</CardTitle>
                    <CardDescription className="text-center">
                        Inscription client DringDring.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="fullName">Nom complet</Label>
                            <Input
                                id="fullName"
                                type="text"
                                placeholder="Prenom Nom"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Recherche adresse (Suisse)</Label>
                            <AddressAutocomplete onSelect={handleAddressSelect} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="address">Adresse</Label>
                            <Input
                                id="address"
                                type="text"
                                placeholder="Rue, numero"
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
                            <Label htmlFor="postalCode">NPA</Label>
                            <Input
                                id="postalCode"
                                type="text"
                                placeholder="1950"
                                value={postalCode}
                                onChange={e => setPostalCode(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cityName">Commune</Label>
                            <Input
                                id="cityName"
                                type="text"
                                placeholder="Sion"
                                value={cityName}
                                onChange={e => setCityName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="floor">Etage (optionnel)</Label>
                            <Input
                                id="floor"
                                type="text"
                                placeholder="3eme"
                                value={floor}
                                onChange={e => setFloor(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="doorCode">Digicode (optionnel)</Label>
                            <Input
                                id="doorCode"
                                type="text"
                                placeholder="1234A"
                                value={doorCode}
                                onChange={e => setDoorCode(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telephone (optionnel)</Label>
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
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="votre@email.ch"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Mot de passe</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                            <Input
                                id="confirm"
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 md:col-span-2" disabled={loading}>
                            {loading ? 'Création en cours...' : "S'inscrire"}
                        </Button>
                    </form>

                    <div className="mt-4 md:mt-6">
                        <Alert className="bg-blue-50 border-blue-100 text-blue-800">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm font-semibold">Information</AlertTitle>
                            <AlertDescription className="text-xs">
                                Votre commune doit exister dans le reseau DringDring. En cas de doute, contactez le support.
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
                            <span className="bg-white px-2 text-muted-foreground">Déjà inscrit ?</span>
                        </div>
                    </div>
                    <Link href="/login" className="flex items-center justify-center text-blue-600 hover:underline">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Retour à la connexion
                    </Link>
                </CardFooter>
            </Card>
        </div>
    )
}
