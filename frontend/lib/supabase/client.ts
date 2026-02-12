import { createBrowserClient } from '@supabase/ssr'

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]
  if (!value) {
    if (process.env.NODE_ENV !== 'production') {
      return name === 'NEXT_PUBLIC_SUPABASE_URL' ? 'https://example.supabase.co' : 'dev-anon-key'
    }
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

export function createClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
}
