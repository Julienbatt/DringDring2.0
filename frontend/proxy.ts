import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  const publicPaths = ['/', '/login', '/register', '/forgot-password', '/auth/callback', '/set-password', '/DringDring']
  const isPublic = publicPaths.includes(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith('/api/public')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isPublic) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/'
      return NextResponse.redirect(loginUrl)
    }
    return res
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        res.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        res.cookies.set({ name, value: '', ...options })
      },
    },
  })

  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null = null
  try {
    const result = await supabase.auth.getSession()
    session = result.data.session
  } catch {
    session = null
  }

  if (!isPublic && !session) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/'
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
