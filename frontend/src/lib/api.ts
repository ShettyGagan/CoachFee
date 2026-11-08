const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export const AUTH_TOKEN_KEY = 'coachfee_auth_token'

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token)
    else localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers,
    ...init,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = data?.error ?? (typeof data?.detail === 'object' && data?.detail?.error ? data.detail.error : {})
    const code = err.code ?? (typeof data?.detail === 'string' ? 'ERROR' : 'UNKNOWN')
    const message = err.message ?? (typeof data?.detail === 'string' ? data.detail : 'Something went wrong.')

    // Clear token if 401 unauthenticated
    if (res.status === 401 && !path.startsWith('/auth/')) {
      setStoredToken(null)
    }

    // Never redirect to /login if we are already on /login or calling auth routes (like /auth/me or /auth/staff/login)
    if (res.status === 401 && !path.startsWith('/auth/') && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }

    throw new ApiError(code, message, res.status)
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
}
