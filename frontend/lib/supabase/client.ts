import { createBrowserClient } from '@supabase/ssr'

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim().length > 0)?.trim()
}

function resolveSupabaseUrl(): string {
  return (
    firstNonEmpty(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.PROJECT_URL_STAGING
    ) || 'https://example.supabase.co'
  )
}

function resolveSupabaseAnonKey(): string {
  return (
    firstNonEmpty(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING,
      process.env.EXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY_STAGING
    ) || 'dev-anon-key'
  )
}

export function createClient() {
  return createBrowserClient(resolveSupabaseUrl(), resolveSupabaseAnonKey())
}
