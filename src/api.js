const BASE = '/api'

// Neon driver geeft DATE-kolommen terug als Date-object, niet als string.
// Deze helper normaliseert altijd naar 'YYYY-MM-DD'.
export function datumStr(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  if (d instanceof Date) return d.toISOString().split('T')[0]
  return null
}

// Formateer datum voor weergave (neemt zowel string als Date-object).
export function datumNl(d, opties = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const s = datumStr(d)
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('nl-NL', opties)
}

const getToken = () => localStorage.getItem('apex_token')

async function req(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Er is een fout opgetreden')
  return data
}

export const api = {
  get: (path) => req(path),
  post: (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => req(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => req(path, { method: 'DELETE' }),
}
