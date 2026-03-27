import { createClient } from '@/lib/supabase/client'

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim()

if (!rawApiUrl && process.env.NODE_ENV !== 'production') {
  console.warn('[api] NEXT_PUBLIC_API_URL not set, falling back to http://127.0.0.1:8016/api/v1')
}

export const API_BASE_URL = (rawApiUrl || 'http://127.0.0.1:8016/api/v1')
  .replace(/\/+$/, '')

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }
  const supabase = createClient()
  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    return null
  }
  return data.session?.access_token || null
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
  token?: string
): Promise<T> {
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`API fetch failed (${API_BASE_URL}${path}): ${message}`)
  }

  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      try {
        res = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers: {
            ...headers,
            Authorization: `Bearer ${refreshed}`,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`API fetch failed (${API_BASE_URL}${path}): ${message}`)
      }
    }
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }

  return res.json()
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'GET',
    },
    token
  )
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    token
  )
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    token
  )
}


export async function apiDelete<T>(
  path: string,
  token?: string
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'DELETE',
    },
    token
  )
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token?: string
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    token
  )
}

export const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
};
