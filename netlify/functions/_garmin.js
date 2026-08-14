// ── Garmin Connect client (dependency-vrij) ────────────────────────────────
// Garmin biedt geen persoonlijke API-key aan. De officiële mobiele app logt in
// via Garmin SSO en wisselt een ticket om voor OAuth1- en daarna OAuth2-tokens.
// Deze module reproduceert dat flow met alleen `fetch` en node:crypto, in
// dezelfde stijl als de garth / python-garminconnect bibliotheken.
//
// LET OP: accounts met verplichte 2FA/MFA of een captcha-uitdaging kunnen niet
// zonder interactie inloggen — dan geven we een duidelijke NL-foutmelding terug.

import crypto from 'node:crypto'

const SSO = 'https://sso.garmin.com/sso'
const SSO_EMBED = 'https://sso.garmin.com/sso/embed'
const API = 'https://connectapi.garmin.com'
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
const UA_APP = 'com.garmin.android.apps.connectmobile'

// ── Cookie-jar (Garmin SSO leunt op sessie-cookies tussen de stappen) ───────
function maakCookieJar() {
  const jar = new Map()
  return {
    opslaan(res) {
      const raw = res.headers.getSetCookie?.() ?? res.headers.raw?.()['set-cookie'] ?? []
      const lijst = Array.isArray(raw) ? raw : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : [])
      for (const c of lijst) {
        const [pair] = c.split(';')
        const idx = pair.indexOf('=')
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    },
  }
}

// ── OAuth1 (HMAC-SHA1) — alleen de Authorization-header, geen body-params ───
function pct(v) {
  return encodeURIComponent(v).replace(/[!*()']/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function oauth1Header({ method, url, consumer, token, params = {} }) {
  const oauth = {
    oauth_consumer_key: consumer.consumer_key,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  }
  if (token?.token) oauth.oauth_token = token.token

  const alle = { ...params, ...oauth }
  const basisParams = Object.keys(alle)
    .sort()
    .map((k) => `${pct(k)}=${pct(alle[k])}`)
    .join('&')

  const basis = [method.toUpperCase(), pct(url), pct(basisParams)].join('&')
  const sleutel = `${pct(consumer.consumer_secret)}&${pct(token?.secret ?? '')}`
  const sig = crypto.createHmac('sha1', sleutel).update(basis).digest('base64')
  oauth.oauth_signature = sig

  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
      .join(', ')
  )
}

async function fetchTimeout(url, options, ms = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ── Inloggen: email + wachtwoord → OAuth2 token-bundle ──────────────────────
export async function garminLogin(email, wachtwoord) {
  const jar = maakCookieJar()

  // 0) Publieke consumer-credentials (zoals de Garmin-app ze gebruikt)
  const consumerRes = await fetchTimeout(OAUTH_CONSUMER_URL, {})
  if (!consumerRes.ok) throw new Error('Kan Garmin OAuth-configuratie niet ophalen')
  const consumer = await consumerRes.json()

  // 1) Embed-widget aanroepen om sessie-cookies te zetten
  const embedRes = await fetchTimeout(
    `${SSO_EMBED}?${new URLSearchParams({ id: 'gauth-widget', embedWidget: 'true', gauthHost: SSO }).toString()}`,
    { headers: { 'User-Agent': UA_BROWSER } }
  )
  jar.opslaan(embedRes)

  // 2) Signin-pagina ophalen → CSRF-token
  const signinParams = new URLSearchParams({
    id: 'gauth-widget',
    embedWidget: 'true',
    gauthHost: SSO,
    service: SSO_EMBED,
    source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED,
    redirectAfterAccountCreationUrl: SSO_EMBED,
  })
  const signinUrl = `${SSO}/signin?${signinParams.toString()}`
  const signinRes = await fetchTimeout(signinUrl, {
    headers: { 'User-Agent': UA_BROWSER, Cookie: jar.header() },
  })
  jar.opslaan(signinRes)
  const signinHtml = await signinRes.text()
  const csrf = signinHtml.match(/name="_csrf"\s+value="([^"]+)"/)?.[1]
  if (!csrf) throw new Error('Kan Garmin-loginpagina niet laden (CSRF ontbreekt)')

  // 3) Inloggen (POST)
  const loginBody = new URLSearchParams({
    username: email,
    password: wachtwoord,
    embed: 'true',
    _csrf: csrf,
  })
  const loginRes = await fetchTimeout(signinUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA_BROWSER,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.header(),
      Referer: signinUrl,
    },
    body: loginBody.toString(),
  })
  jar.opslaan(loginRes)
  const loginHtml = await loginRes.text()

  if (/mfa|verificationCode|multi-factor/i.test(loginHtml) && !/embed\?ticket=/.test(loginHtml)) {
    throw new Error('Garmin vraagt om tweestapsverificatie (MFA). Schakel MFA tijdelijk uit om te koppelen.')
  }
  const ticket = loginHtml.match(/embed\?ticket=([^"]+)"/)?.[1] || loginHtml.match(/ticket=([\w-]+)/)?.[1]
  if (!ticket) {
    throw new Error('Inloggen mislukt — controleer je e-mailadres en wachtwoord.')
  }

  // 4) Ticket → OAuth1 token
  const preAuthUrl = `${API}/oauth-service/oauth/preauthorized`
  const preAuthParams = {
    ticket,
    'login-url': SSO_EMBED,
    'accepts-mfa-tokens': 'true',
  }
  const preAuthQuery = new URLSearchParams(preAuthParams).toString()
  const oauth1Res = await fetchTimeout(`${preAuthUrl}?${preAuthQuery}`, {
    headers: {
      'User-Agent': UA_APP,
      Authorization: oauth1Header({ method: 'GET', url: preAuthUrl, consumer, params: preAuthParams }),
    },
  })
  if (!oauth1Res.ok) throw new Error(`Garmin OAuth1 fout (${oauth1Res.status})`)
  const oauth1Text = await oauth1Res.text()
  const oauth1 = Object.fromEntries(new URLSearchParams(oauth1Text))
  if (!oauth1.oauth_token || !oauth1.oauth_token_secret) {
    throw new Error('Garmin gaf geen OAuth1-token terug')
  }

  // 5) OAuth1 → OAuth2 bearer token
  const exchangeUrl = `${API}/oauth-service/oauth/exchange/user/2.0`
  const token1 = { token: oauth1.oauth_token, secret: oauth1.oauth_token_secret }
  const oauth2Res = await fetchTimeout(exchangeUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA_APP,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: oauth1Header({ method: 'POST', url: exchangeUrl, consumer, token: token1 }),
    },
    body: '',
  })
  if (!oauth2Res.ok) throw new Error(`Garmin OAuth2 fout (${oauth2Res.status})`)
  const oauth2 = await oauth2Res.json()
  if (!oauth2.access_token) throw new Error('Garmin gaf geen toegangstoken terug')

  return {
    access_token: oauth2.access_token,
    refresh_token: oauth2.refresh_token,
    token_type: oauth2.token_type || 'Bearer',
    // Iets vóór de echte vervaltijd verlopen zodat we op tijd verversen
    expires_at: Date.now() + Math.max(0, (oauth2.expires_in || 3600) - 120) * 1000,
    // OAuth1 bewaren zodat we later stil kunnen verversen
    oauth1_token: oauth1.oauth_token,
    oauth1_secret: oauth1.oauth_token_secret,
  }
}

// ── Access-token verversen zonder opnieuw wachtwoord ────────────────────────
async function ververToken(bundle) {
  const consumerRes = await fetchTimeout(OAUTH_CONSUMER_URL, {})
  if (!consumerRes.ok) throw new Error('Kan Garmin OAuth-configuratie niet ophalen')
  const consumer = await consumerRes.json()

  const exchangeUrl = `${API}/oauth-service/oauth/exchange/user/2.0`
  const token1 = { token: bundle.oauth1_token, secret: bundle.oauth1_secret }
  const res = await fetchTimeout(exchangeUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA_APP,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: oauth1Header({ method: 'POST', url: exchangeUrl, consumer, token: token1 }),
    },
    body: '',
  })
  if (!res.ok) throw new Error('Garmin-sessie verlopen — koppel opnieuw.')
  const oauth2 = await res.json()
  return {
    ...bundle,
    access_token: oauth2.access_token,
    refresh_token: oauth2.refresh_token || bundle.refresh_token,
    expires_at: Date.now() + Math.max(0, (oauth2.expires_in || 3600) - 120) * 1000,
  }
}

// ── Geauthenticeerde GET tegen de Connect-API (ververst indien nodig) ───────
export async function garminGet(bundleRef, pad) {
  if (Date.now() >= (bundleRef.bundle.expires_at || 0)) {
    bundleRef.bundle = await ververToken(bundleRef.bundle)
    bundleRef.veranderd = true
  }
  const res = await fetchTimeout(`${API}${pad}`, {
    headers: {
      'User-Agent': UA_APP,
      Authorization: `Bearer ${bundleRef.bundle.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const err = new Error(`Garmin API ${res.status} op ${pad.split('?')[0]}`)
    err.status = res.status
    throw err
  }
  const tekst = await res.text()
  return tekst ? JSON.parse(tekst) : null
}
