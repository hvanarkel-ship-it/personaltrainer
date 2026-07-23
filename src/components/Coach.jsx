import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const UPLOAD_TYPES = [
  { id: 'maaltijd',     label: 'Maaltijd',     icon: '🍽️' },
  { id: 'inbody',       label: 'InBody',       icon: '📊' },
  { id: 'suunto',       label: 'Suunto',       icon: '⌚' },
  { id: 'apple_health', label: 'Apple Health', icon: '❤️' },
  { id: 'lab',          label: 'Bloedtest',    icon: '🔬' },
  { id: 'garmin',       label: 'Garmin',       icon: '⌚' },
  { id: 'overig',       label: 'Overig',       icon: '📱' },
]

const SNELLE_VRAGEN = [
  'Analyseer mijn herstel van de afgelopen 7 dagen',
  'Wat moet ik eten voor mijn training vandaag?',
  'Maak een weekplan op basis van mijn doelen',
  'Hoe staat mijn voeding ervoor deze week?',
]

const SAVED_CFG = {
  inbody:   { kleur: 'var(--green)', label: 'InBody opgeslagen' },
  suunto:   { kleur: 'var(--blue)',  label: 'Workout opgeslagen' },
  maaltijd: { kleur: 'var(--amber)', label: 'Maaltijd opgeslagen' },
}

export default function Coach({ user, coachTrigger, onCoachTriggerUsed }) {
  const [berichten, setBerichten]       = useState([])
  const [input, setInput]               = useState('')
  const [laden, setLaden]               = useState(false)
  const [histLaden, setHistLaden]       = useState(true)
  const [toonUploadMenu, setToonUploadMenu] = useState(false)
  const [uploads, setUploads]           = useState([])
  const [uploadType, setUploadType]     = useState(null)
  const [opname, setOpname]             = useState(false)
  const [nieuweMsg, setNieuweMsg]       = useState(false)
  const [toonScrollBtn, setToonScrollBtn] = useState(false)
  const [laatstePoging, setLaatstePoging] = useState(null)
  const [copiedIdx, setCopiedIdx]       = useState(null)

  const bottomRef     = useRef(null)
  const chatRef       = useRef(null)
  const inputRef      = useRef(null)
  const fileRef       = useRef(null)
  const recognitionRef = useRef(null)
  const scrollInstantRef = useRef(false)

  const heeftStem = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // Load history
  useEffect(() => {
    api.get('/coach-chat')
      .then(rows => {
        if (!rows?.length) return
        scrollInstantRef.current = true
        setBerichten(rows.map(r => ({
          rol: r.is_ai ? 'ai' : 'user',
          tekst: r.bericht,
          datum: r.created_at,
          upload_type: r.upload_type,
        })))
        setNieuweMsg(true)
      })
      .catch(() => {})
      .finally(() => setHistLaden(false))
  }, [])

  // Navigate to upload on external trigger
  useEffect(() => {
    if (coachTrigger && !histLaden) {
      setUploadType(coachTrigger)
      fileRef.current?.click()
      onCoachTriggerUsed?.()
    }
  }, [coachTrigger, histLaden])

  // Auto-scroll on new message
  useEffect(() => {
    if (nieuweMsg) {
      bottomRef.current?.scrollIntoView({ behavior: scrollInstantRef.current ? 'instant' : 'smooth' })
      scrollInstantRef.current = false
      setNieuweMsg(false)
    }
  }, [berichten, nieuweMsg])

  // Close upload menu on outside click
  useEffect(() => {
    if (!toonUploadMenu) return
    const handler = (e) => {
      if (!e.target.closest('.upload-menu-overlay') && !e.target.closest('.coach-icon-btn')) {
        setToonUploadMenu(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [toonUploadMenu])

  function toggleOpname() {
    if (opname) { recognitionRef.current?.stop(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    try {
      const rec = new SR()
      rec.lang = 'nl-NL'; rec.continuous = false; rec.interimResults = false
      recognitionRef.current = rec
      rec.onstart  = () => setOpname(true)
      rec.onresult = (e) => {
        let final = ''
        for (const r of e.results) if (r.isFinal) final += r[0].transcript
        if (final) setInput(prev => (prev + ' ' + final).trimStart())
      }
      rec.onerror = () => setOpname(false)
      rec.onend   = () => { setOpname(false); inputRef.current?.focus() }
      rec.start()
    } catch { setOpname(false) }
  }

  function selectUploadType(type) {
    setUploadType(type)
    setToonUploadMenu(false)
    fileRef.current.click()
  }

  async function onFileSelect(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const nieuweUploads = await Promise.all(files.map(async f => {
      const base64 = await leesAlsBase64(f)
      const preview = f.type.startsWith('image/') ? base64 : null
      return { bestand: f, preview, base64, type: uploadType }
    }))
    setUploads(u => [...u, ...nieuweUploads])
    e.target.value = ''
  }

  function leesAlsBase64(file) {
    return new Promise(res => {
      const reader = new FileReader()
      reader.onload = e => res(e.target.result)
      reader.readAsDataURL(file)
    })
  }

  // Stuur een payload naar de coach en verwerk antwoord/fout. Bewaart de poging
  // bij een fout zodat 'opnieuw proberen' hem exact kan herhalen.
  async function stuurNaarCoach(tekst, bestanden, type) {
    setLaden(true)
    try {
      const res = await api.post('/coach-chat', { bericht: tekst, bestanden, upload_type: type })
      const nieuw = []
      if (res.opgeslagen) nieuw.push({ rol: 'systeem', opgeslagen: res.opgeslagen })
      nieuw.push({ rol: 'ai', tekst: res.antwoord, datum: new Date().toISOString() })
      setBerichten(b => [...b, ...nieuw])
      setNieuweMsg(true)
      setLaatstePoging(null)
    } catch (err) {
      setBerichten(b => [...b, { rol: 'ai', tekst: 'Sorry, er is een fout opgetreden: ' + err.message, fout: true }])
      setNieuweMsg(true)
      setLaatstePoging({ tekst, bestanden, type })
    } finally {
      setLaden(false)
      inputRef.current?.focus()
    }
  }

  async function verstuur(e) {
    e?.preventDefault()
    if ((!input.trim() && !uploads.length) || laden) return

    const tekst    = input.trim()
    const bestanden = uploads.map(u => ({ base64: u.base64, naam: u.bestand.name }))
    const type     = uploads[0]?.type || null

    const previewTekst = uploads.length
      ? `${tekst ? tekst + '\n' : ''}📎 ${uploads.length} bestand(en): ${uploads.map(u => u.bestand.name).join(', ')}`
      : tekst

    setBerichten(b => [...b, { rol: 'user', tekst: previewTekst, datum: new Date().toISOString() }])
    setNieuweMsg(true)
    setInput('')
    setUploads([])
    setToonUploadMenu(false)

    stuurNaarCoach(tekst, bestanden, type)
  }

  function opnieuwProberen() {
    if (!laatstePoging || laden) return
    // Verwijder de laatste fout-melding voordat we opnieuw sturen
    setBerichten(b => {
      const kopie = [...b]
      if (kopie.length && kopie[kopie.length - 1].fout) kopie.pop()
      return kopie
    })
    const p = laatstePoging
    setLaatstePoging(null)
    stuurNaarCoach(p.tekst, p.bestanden, p.type)
  }

  function kopieer(tekst, i) {
    navigator.clipboard?.writeText(tekst).then(() => {
      setCopiedIdx(i)
      setTimeout(() => setCopiedIdx(c => (c === i ? null : c)), 1500)
    }).catch(() => {})
  }

  async function wisGesprek() {
    if (!confirm('Wil je het volledige gesprek wissen?')) return
    await api.delete('/coach-chat')
    setBerichten([])
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  function renderBericht(b, i) {
    const datumLabel = b.datum
      ? new Date(b.datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
      : null
    const vorigeDatum = i > 0 && berichten[i - 1]?.datum
      ? new Date(berichten[i - 1].datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
      : null
    const toonDatum = datumLabel && datumLabel !== vorigeDatum

    if (b.rol === 'systeem' && b.opgeslagen) {
      const cfg = SAVED_CFG[b.opgeslagen.type] || SAVED_CFG.maaltijd
      const label = b.opgeslagen.type === 'maaltijd' ? b.opgeslagen.samenvatting : b.opgeslagen.label
      return (
        <div key={i} className="saved-pill" style={{ color: cfg.kleur, background: cfg.kleur.replace('var(--', 'var(--').replace(')', '-dim)') }}>
          ✓ <strong>Opgeslagen:</strong> {label}
        </div>
      )
    }

    return (
      <div key={i}>
        {toonDatum && (
          <div className="chat-date-sep"><span>{datumLabel}</span></div>
        )}
        {b.rol === 'ai' ? (
          <>
            <div className="msg-ai">
              <div className="msg-avatar">⚡</div>
              <div className="msg-bubble-ai"
                style={b.fout ? { borderLeft: '2px solid var(--red)' } : {}}
                dangerouslySetInnerHTML={{ __html: formatBericht(b.tekst) }}
              />
            </div>
            {!b.fout && b.tekst && b.tekst.length > 120 && (
              <div style={{ paddingLeft: 36, marginTop: 2 }}>
                <button
                  onClick={() => kopieer(b.tekst, i)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: copiedIdx === i ? 'var(--green)' : 'var(--text-3)',
                    fontSize: 'var(--t-xs)', fontWeight: 600, fontFamily: 'inherit',
                    padding: '2px 0', letterSpacing: '0.02em',
                  }}
                >
                  {copiedIdx === i ? '✓ Gekopieerd' : '⧉ Kopieer'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="msg-user">
            <div className="msg-bubble-user">{b.tekst}</div>
          </div>
        )}
      </div>
    )
  }

  // ── JSX ────────────────────────────────────────────────────────────────

  return (
    <div className="coach-page">

      {/* Header */}
      <div className="coach-header">
        <div>
          <h1 className="t-xl">Coach</h1>
          <p className="t-xs t-muted" style={{ marginTop: 2, letterSpacing: '0.04em', textTransform: 'none', fontSize: 'var(--t-sm)' }}>
            AI personal trainer
          </p>
        </div>
        {berichten.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={wisGesprek}>Wis gesprek</button>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {toonScrollBtn && (
        <button className="scroll-bottom-btn" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          ↓ Naar onderen
        </button>
      )}

      {/* Messages */}
      <div
        className="coach-scroll"
        ref={chatRef}
        onScroll={e => {
          const el = e.currentTarget
          setToonScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200)
        }}
      >
        {histLaden ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
          </div>
        ) : berichten.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 'var(--space-4)', padding: 'var(--space-6)',
            minHeight: 300,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--green-dim)', color: 'var(--green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>⚡</div>
            <div style={{ textAlign: 'center' }}>
              <h3 className="t-lg" style={{ marginBottom: 'var(--space-1)' }}>
                Hallo {user?.name?.split(' ')[0] || 'atleet'}!
              </h3>
              <p className="t-sm t-muted">Stel een vraag of upload een foto voor analyse.</p>
            </div>
            <button
              className="btn btn-secondary btn-full"
              onClick={() => { setUploadType('suunto'); fileRef.current?.click() }}
            >
              ⌚ Deel Suunto dashboard
            </button>
            <div className="quick-questions">
              {SNELLE_VRAGEN.map(v => (
                <button key={v} className="quick-btn" onClick={() => { setInput(v); inputRef.current?.focus() }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: 'var(--space-2) 0', fontSize: 'var(--t-xs)', color: 'var(--text-3)' }}>
              ↑ Begin van gesprek
            </div>
            {berichten.map((b, i) => renderBericht(b, i))}
          </>
        )}

        {/* Typing indicator */}
        {laden && (
          <div className="msg-ai">
            <div className="msg-avatar">⚡</div>
            <div className="msg-bubble-ai">
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        {/* Retry na mislukt antwoord */}
        {laatstePoging && !laden && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2)' }}>
            <button className="btn btn-secondary btn-sm" onClick={opnieuwProberen}>
              ↻ Opnieuw proberen
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Upload previews */}
      {uploads.length > 0 && (
        <div className="upload-previews-bar">
          {uploads.map((u, i) => (
            <div key={`${u.bestand.name}-${i}`} className="upload-preview-item">
              {u.preview
                ? <img src={u.preview} alt={u.bestand.name} />
                : <div className="upload-preview-doc">📄</div>
              }
              <button
                className="upload-preview-remove"
                onClick={() => setUploads(arr => arr.filter((_, j) => j !== i))}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload type menu */}
      {toonUploadMenu && (
        <div className="upload-menu-overlay">
          {UPLOAD_TYPES.map(t => (
            <button key={t.id} className="upload-type-btn" onClick={() => selectUploadType(t.id)}>
              <span className="upload-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={onFileSelect} />

      {/* Input bar */}
      <form className="coach-input-bar" onSubmit={verstuur}>
        <button
          type="button"
          className={`coach-icon-btn${toonUploadMenu ? ' active' : ''}`}
          onClick={() => setToonUploadMenu(m => !m)}
          title="Bestand uploaden"
          aria-label="Bestand uploaden"
        >📎</button>

        {heeftStem && (
          <button
            type="button"
            className={`coach-icon-btn${opname ? ' active' : ''}`}
            onClick={toggleOpname}
            title={opname ? 'Stop opname' : 'Inspreken'}
            aria-label={opname ? 'Stop opname' : 'Inspreken'}
          >🎙️</button>
        )}

        <input
          ref={inputRef}
          type="text"
          className="coach-text-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Stel een vraag..."
          disabled={laden}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) verstuur(e) }}
        />

        <button
          type="submit"
          className="coach-send-btn"
          disabled={laden || (!input.trim() && !uploads.length)}
          aria-label="Verstuur bericht"
        >↑</button>
      </form>
    </div>
  )
}

// ── Markdown → HTML helpers ───────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatTekstBlok(tekst) {
  return tekst
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
}

function markdownTabelNaarHtml(tabelTekst) {
  const rijen = tabelTekst.trim().split('\n').filter(r => r.trim().startsWith('|'))
  if (rijen.length < 2) return formatTekstBlok(tabelTekst)
  const parseRij = r => r.split('|').slice(1, -1).map(cel =>
    escHtml(cel.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  )
  const isScheidingslijn = r => /^\|[\s\-:|]+\|/.test(r)
  const koppen = parseRij(rijen[0]).map(k => `<th>${k}</th>`).join('')
  const rijHtml = rijen.slice(1).filter(r => !isScheidingslijn(r))
    .map(r => `<tr>${parseRij(r).map(cel => `<td>${cel}</td>`).join('')}</tr>`).join('')
  return `<div class="tabel-wrapper"><table class="coach-tabel"><thead><tr>${koppen}</tr></thead><tbody>${rijHtml}</tbody></table></div>`
}

function formatBericht(tekst) {
  if (!tekst) return ''
  const blokken = []
  const tabelRe = /^(\|.+\|[ \t]*\n?){2,}/gm
  let lastIdx = 0, m
  while ((m = tabelRe.exec(tekst)) !== null) {
    if (m.index > lastIdx) blokken.push({ tabel: false, s: tekst.slice(lastIdx, m.index) })
    blokken.push({ tabel: true, s: m[0] })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < tekst.length) blokken.push({ tabel: false, s: tekst.slice(lastIdx) })
  return blokken.map(b => b.tabel ? markdownTabelNaarHtml(b.s) : formatTekstBlok(b.s)).join('')
}
