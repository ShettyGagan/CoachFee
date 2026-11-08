const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

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
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = data?.error ?? (typeof data?.detail === 'object' && data?.detail?.error ? data.detail.error : {})
    const code = err.code ?? (typeof data?.detail === 'string' ? 'ERROR' : 'UNKNOWN')
    const message = err.message ?? (typeof data?.detail === 'string' ? data.detail : 'Something went wrong.')

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
