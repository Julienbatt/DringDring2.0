import { createBrowserClient } from '@supabase/ssr'

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]
  if (!value) {
    if (typeof window !== 'undefined') {
      // Avoid hard crash in browser if env is missing; auth calls will fail gracefully.
      console.error(`Missing required env: ${name}`)
    }
    return name === 'NEXT_PUBLIC_SUPABASE_URL' ? 'https://example.supabase.co' : 'dev-anon-key'
  }
  return value
}

export function createClient() {
  return createBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  )
}
