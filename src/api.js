const BASE = '/api'

// Neon driver geeft DATE-kolommen terug als Date-object, niet als string.
// Deze helper normaliseert altijd naar 'YYYY-MM-DD' (lokale tijd, niet UTC).
const pad2 = n => String(n).padStart(2, '0')
export function datumStr(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  if (d instanceof Date) return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
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
  // Bij een gateway-timeout (502/504) stuurt Netlify geen JSON terug;
  // res.json() zou dan in Safari een cryptische pattern-fout gooien
  let data
  try { data = await res.json() } catch {
    data = { error: res.status === 502 || res.status === 504
      ? 'De server deed er te lang over. Probeer het opnieuw — een kortere vraag helpt.'
      : `Onverwacht serverantwoord (${res.status})` }
  }
  if (!res.ok) {
    // Verlopen of ongeldige sessie: token opruimen en terug naar het
    // inlogscherm. Auth-endpoints uitgezonderd (daar betekent 401 fout wachtwoord).
    if (res.status === 401 && token && !path.startsWith('/auth-')) {
      localStorage.removeItem('apex_token')
      localStorage.removeItem('apex_user')
      window.location.reload()
      return new Promise(() => {}) // pagina herlaadt — laat callers niet doorgaan
    }
    throw new Error(data.error || 'Er is een fout opgetreden')
  }
  return data
}

export const api = {
  get: (path) => req(path),
  post: (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => req(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => req(path, { method: 'DELETE' }),
}
