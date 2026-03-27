import { createBrowserClient } from '@supabase/ssr'

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim()
}

function resolveSupabaseUrl(): string {
  const url = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.PROJECT_URL_STAGING
  )
  if (url) return url
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    console.error('[supabase/client] Missing NEXT_PUBLIC_SUPABASE_URL in production')
  }
  return 'https://example.supabase.co'
}

function resolveSupabaseAnonKey(): string {
  const key = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING,
    process.env.EXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING
  )
  if (key) return key
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    console.error('[supabase/client] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in production')
  }
  return 'dev-anon-key'
}

export function createClient() {
  return createBrowserClient(resolveSupabaseUrl(), resolveSupabaseAnonKey())
}
