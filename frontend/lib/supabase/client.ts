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
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL — cannot start in production without a Supabase URL'
    )
  }
  console.warn('[supabase/client] NEXT_PUBLIC_SUPABASE_URL not set, using placeholder for development')
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
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_ANON_KEY — cannot start in production without a Supabase anon key'
    )
  }
  console.warn('[supabase/client] NEXT_PUBLIC_SUPABASE_ANON_KEY not set, using placeholder for development')
  return 'dev-anon-key'
}

export function createClient() {
  return createBrowserClient(resolveSupabaseUrl(), resolveSupabaseAnonKey())
}
