'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { apiGet } from '@/lib/api'
import { toast } from 'sonner'

// Define the shape of the User (MeResponse)
export type UserIdentity = {
    user_id: string
    email: string | null
    role: string | null
    city_id: string | null
    hq_id: string | null
    admin_region_id: string | null
    shop_id?: string | null
    client_id?: string | null
    courier_id?: string | null
    can_dispatch?: boolean
}

export type AdminRegionContext = {
    id: string
    name: string
} | null

type AuthContextType = {
    user: UserIdentity | null
    adminContextRegion: AdminRegionContext
    loading: boolean
    error: string | null
    refresh: () => Promise<void>
    signOut: () => Promise<void>
    setAdminContext: (ctx: AdminRegionContext) => void
    session: any | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<UserIdentity | null>(null)
    const [adminContextRegion, setAdminContextRegion] = useState<AdminRegionContext>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sessionData, setSessionData] = useState<any | null>(null)
    const router = useRouter()
    const supabase = createClient()

    // Helper to persist context
    const setAdminContext = (ctx: AdminRegionContext) => {
        setAdminContextRegion(ctx)
        if (ctx) {
            localStorage.setItem('admin_context_region', JSON.stringify(ctx))
        } else {
            localStorage.removeItem('admin_context_region')
        }
    }

    const loadUser = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            // 1. Check Supabase Session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()

            if (sessionError || !session) {
                throw new Error("Pas de session active")
            }
            setSessionData(session)

            // 2. Fetch Backend Identity
            const identity = await apiGet<UserIdentity>('/me', session.access_token)
            setUser(identity)

            // 3. Load Admin Context (Impersonation)
            if (identity.role === 'super_admin') {
                const storedContext = localStorage.getItem('admin_context_region')
                if (storedContext) {
                    try {
                        const parsed = JSON.parse(storedContext)
                        setAdminContextRegion(parsed)
                    } catch (e) {
                        localStorage.removeItem('admin_context_region')
                    }
                }
            } else {
                // Clear validation if not super admin
                localStorage.removeItem('admin_context_region')
                setAdminContextRegion(null)
            }

        } catch (err: any) {
            console.error("Auth Load Error:", err)
            // Only redirect if we are strictly protecting (which we are in this provider)
            // But be careful of infinite loops if this provider is used in /login (it shouldn't be).
            // This provider is for (protected) routes.
            setError(err.message || 'Erreur authentification')
            setUser(null)
            // Redirect to login handled by proper effect or guard component? 
            // Let's do it here for simplicity of "State of the Art" - fail fast.
            router.push('/login')
        } finally {
            setLoading(false)
        }
    }, [router, supabase])

    useEffect(() => {
        loadUser()
    }, [loadUser])

    const signOut = async () => {
        await supabase.auth.signOut()
        setUser(null)
        router.push('/login')
    }

    return (
        <AuthContext.Provider value={{ user, adminContextRegion, loading, error, refresh: loadUser, signOut, setAdminContext, session: sessionData }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
