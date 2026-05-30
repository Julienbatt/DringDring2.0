import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim()
}

export async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  const publicPaths = ['/', '/login', '/register', '/forgot-password', '/auth/callback', '/set-password', '/DringDring']
  const isPublic = publicPaths.includes(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith('/api/public')
  const supabaseUrl = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.PROJECT_URL_STAGING
  )
  const supabaseAnonKey = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING,
    process.env.EXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING
  )

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
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
