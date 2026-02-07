'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, LogIn, ArrowRight } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                toast.error('Identifiants incorrects. Veuillez reessayer.')
                return
            }

            if (!data.session) {
                toast.error('Erreur de session. Veuillez actualiser.')
                return
            }

            toast.success('Bon retour parmi nous !')
            router.refresh()
            router.push('/dashboard')
        } catch (err: unknown) {
            console.error('Login Error:', err)
            toast.error('Une erreur systeme est survenue.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mb-2">
                        <Lock className="w-6 h-6" />
                    </div>
                    <div className="flex justify-center">
                        <BrandLogo width={180} height={54} className="h-12 w-auto" priority />
                    </div>
                    <p className="text-slate-500">Portail unifie d acces</p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="relative h-40 bg-slate-100">
                        <Image
                            src="/brand/poster2.png"
                            alt="DringDring"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                    <div className="space-y-3 p-4 text-sm text-slate-600">
                        <p className="text-base font-semibold text-slate-900">Vous achetez, nous livrons</p>
                        <ul className="list-disc space-y-1 pl-4">
                            <li>Vous vous rendez chez un de nos commerces partenaires ou vous passez commande en ligne ou par telephone.</li>
                            <li>Vous faites vos courses.</li>
                            <li>Vous laissez vos courses a la caisse ou au service client.</li>
                            <li>Vos courses vous seront livrees a velo directement chez vous depuis le commerce partenaire.</li>
                        </ul>
                    </div>
                </div>

                <Card className="border-0 shadow-xl bg-white/90 backdrop-blur">
                    <CardHeader>
                        <CardTitle>Connexion</CardTitle>
                        <CardDescription>
                            Accedez a votre espace client, commerce, commune ou admin.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="nom@exemple.ch"
                                    className="bg-white"
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Mot de passe</Label>
                                    <Link
                                        href="#"
                                        className="text-xs text-emerald-700 hover:underline"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            toast.info('Contactez votre administrateur.')
                                        }}
                                    >
                                        Oubli ?
                                    </Link>
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    className="bg-white"
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                                <LogIn className="w-4 h-4 mr-2" />
                                {loading ? 'Connexion...' : 'Se connecter'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 bg-gray-50/50 p-6 border-t">
                        <div className="text-center text-sm text-gray-500">
                            Nouveau client ?
                        </div>
                        <Link href="/register" className="w-full">
                            <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                Creer un compte client <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                        <p className="text-xs text-center text-gray-400 mt-2">
                            Les partenaires (commerces, communes partenaires) doivent utiliser les identifiants fournis par l administration.
                        </p>
                    </CardFooter>
                </Card>

                <p className="text-center text-xs text-slate-400">
                    &copy; 2025 DringDring. Secure Logistics.
                </p>
            </div>
        </div>
    )
}
