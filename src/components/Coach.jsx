import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const UPLOAD_TYPES = [
  { id: 'maaltijd', label: 'Maaltijdfoto', icon: '🍽️' },
  { id: 'suunto', label: 'Suunto screenshot', icon: '⌚' },
  { id: 'inbody', label: 'InBody scan', icon: '📊' },
  { id: 'apple_health', label: 'Apple Health', icon: '❤️' },
  { id: 'lab', label: 'Bloedtest / lab', icon: '🔬' },
  { id: 'overig', label: 'Andere app', icon: '📱' },
]

const SNELLE_VRAGEN = [
  'Analyseer mijn herstel van de afgelopen 7 dagen',
  'Wat moet ik eten voor mijn training?',
  'Maak een weekschema op basis van mijn doelen',
  'Wat zijn mijn zwakste macro\'s vandaag?',
]


export default function Coach({ user, coachTrigger, onCoachTriggerUsed }) {
  const [berichten, setBerichten] = useState([])
  const [input, setInput] = useState('')
  const [laden, setLaden] = useState(false)
  const [histLaden, setHistLaden] = useState(true)
  const [toonUploadMenu, setToonUploadMenu] = useState(false)
  const [uploads, setUploads] = useState([])
  const [uploadType, setUploadType] = useState(null)
  const [opname, setOpname] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)

  const heeftStem = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function toggleOpname() {
    if (opname) {
      recognitionRef.current?.stop()
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    try {
      const rec = new SR()
      rec.lang = 'nl-NL'
      rec.continuous = false
      rec.interimResults = false
      recognitionRef.current = rec

      rec.onstart = () => setOpname(true)
      rec.onresult = (e) => {
        let final = ''
        for (const res of e.results) {
          if (res.isFinal) final += res[0].transcript
        }
        if (final) setInput(prev => (prev + ' ' + final).trimStart())
      }
      rec.onerror = () => setOpname(false)
      rec.onend = () => { setOpname(false); inputRef.current?.focus() }
      rec.start()
    } catch (err) {
      console.error('SpeechRecognition fout:', err)
      setOpname(false)
    }
  }

  useEffect(() => {
    // Start elke sessie met een leeg gesprek — de AI heeft DB-context via de backend
    setHistLaden(false)
  }, [])

  // Auto-trigger upload wanneer we via dashboard navigeren (bijv. 'suunto')
  useEffect(() => {
    if (coachTrigger && !histLaden) {
      setUploadType(coachTrigger)
      fileRef.current?.click()
      onCoachTriggerUsed?.()
    }
  }, [coachTrigger, histLaden])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [berichten])

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
    return new Promise((res) => {
      const reader = new FileReader()
      reader.onload = e => res(e.target.result)
      reader.readAsDataURL(file)
    })
  }

  async function verstuur(e) {
    e?.preventDefault()
    if ((!input.trim() && !uploads.length) || laden) return

    const tekst = input.trim()
    const bestanden = uploads.map(u => ({ base64: u.base64, naam: u.bestand.name }))
    const type = uploads[0]?.type || null

    // Toon in chat
    const previewTekst = uploads.length
      ? `${tekst ? tekst + '\n' : ''}📎 ${uploads.length} bestand(en): ${uploads.map(u => u.bestand.name).join(', ')}`
      : tekst

    const nu = new Date().toISOString()
    setBerichten(b => [...b, { rol: 'user', tekst: previewTekst, datum: nu }])
    setInput('')
    setUploads([])
    setLaden(true)

    try {
      const res = await api.post('/coach-chat', { bericht: tekst, bestanden, upload_type: type })
      const nieuweB = []
      if (res.opgeslagen) {
        nieuweB.push({ rol: 'systeem', opgeslagen: res.opgeslagen })
      }
      nieuweB.push({ rol: 'ai', tekst: res.antwoord, datum: nu })
      setBerichten(b => [...b, ...nieuweB])
    } catch (err) {
      setBerichten(b => [...b, { rol: 'ai', tekst: 'Sorry, er is een fout opgetreden: ' + err.message, fout: true }])
    } finally {
      setLaden(false)
      inputRef.current?.focus()
    }
  }

  async function wisGesprek() {
    if (!confirm('Wil je het volledige gesprek wissen?')) return
    await api.delete('/coach-chat')
    setBerichten([])
  }

  return (
    <div className="coach-pagina">
      <header className="coach-header">
        <div>
          <h1>APEX Coach</h1>
          <p className="subtitle">AI personal trainer & coach</p>
        </div>
        {berichten.length > 0 && (
          <button className="link-btn small" onClick={wisGesprek}>Wis gesprek</button>
        )}
      </header>

      <div className="chat-berichten">
        {histLaden ? (
          <div className="center-loader"><div className="spinner" /></div>
        ) : berichten.length === 0 ? (
          <div className="chat-welkom">
            <div className="coach-avatar">⚡</div>
            <h3>Hallo {user.name?.split(' ')[0]}!</h3>
            <p>Stel me een vraag, of upload een foto/screenshot voor analyse.</p>
            <button
              className="suunto-ochtend-btn"
              onClick={() => { setUploadType('suunto'); fileRef.current?.click() }}
            >
              ⌚ Deel Suunto ochtend dashboard
            </button>
            <div className="snelle-vragen">
              {SNELLE_VRAGEN.map(v => (
                <button key={v} className="snelle-vraag-btn" onClick={() => { setInput(v); inputRef.current?.focus() }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (() => {
          // Groepeer berichten op datum met datum-scheidingslijn
          let vorigeDatum = null
          return berichten.map((b, i) => {
            const datumLabel = b.datum
              ? new Date(b.datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
              : null
            const toonDatum = datumLabel && datumLabel !== vorigeDatum
            if (toonDatum) vorigeDatum = datumLabel

            if (b.rol === 'systeem' && b.opgeslagen) {
              const cfg = {
                inbody:   { icoon: '📊', bg: '#f0fdf4', border: '#bbf7d0', kleur: '#166534' },
                suunto:   { icoon: '⌚', bg: '#eff6ff', border: '#bfdbfe', kleur: '#1e40af' },
                maaltijd: { icoon: '🍽️', bg: '#fff7ed', border: '#fed7aa', kleur: '#9a3412' },
              }[b.opgeslagen.type] || { icoon: '✓', bg: '#f0fdf4', border: '#bbf7d0', kleur: '#166534' }
              return (
                <div key={i} className="opgeslagen-pill" style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.kleur }}>
                  {cfg.icoon} <strong>Opgeslagen:</strong> {b.opgeslagen.type === 'maaltijd' ? b.opgeslagen.samenvatting : b.opgeslagen.label}
                </div>
              )
            }
            return (
              <div key={i}>
                {toonDatum && <div className="chat-datum-lijn"><span>{datumLabel}</span></div>}
                <div className={`bericht bericht--${b.rol} ${b.fout ? 'bericht--fout' : ''}`}>
                  {b.rol === 'ai' && <div className="bericht-avatar">⚡</div>}
                  <div className="bericht-bubble">
                    <div className="bericht-tekst" dangerouslySetInnerHTML={{
                      __html: formatBericht(b.tekst)
                    }} />
                  </div>
                </div>
              </div>
            )
          })
        })()}

        {laden && (
          <div className="bericht bericht--ai">
            <div className="bericht-avatar">⚡</div>
            <div className="bericht-bubble typing-indicator">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Upload previews */}
      {uploads.length > 0 && (
        <div className="upload-previews">
          {uploads.map((u, i) => (
            <div key={`${u.bestand.name}-${i}`} className="upload-preview">
              {u.preview
                ? <img src={u.preview} alt={u.bestand.name} />
                : <div className="upload-doc-icon">📄</div>
              }
              <div className="upload-label">{UPLOAD_TYPES.find(t => t.id === u.type)?.icon} {u.bestand.name}</div>
              <button className="upload-remove" onClick={() => setUploads(arr => arr.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload type menu */}
      {toonUploadMenu && (
        <div className="upload-menu">
          {UPLOAD_TYPES.map(t => (
            <button key={t.id} className="upload-type-btn" onClick={() => selectUploadType(t.id)}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={onFileSelect} />

      <form className="chat-invoer" onSubmit={verstuur}>
        <button
          type="button"
          className="upload-btn"
          onClick={() => setToonUploadMenu(m => !m)}
          title="Bestand uploaden"
        >
          📎
        </button>
        {heeftStem && (
          <button
            type="button"
            className={`mic-btn ${opname ? 'mic-btn--actief' : ''}`}
            onClick={toggleOpname}
            title={opname ? 'Stop opname' : 'Inspreken'}
          >
            🎙️
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Stel een vraag of beschrijf wat je at..."
          disabled={laden}
          className="chat-input"
        />
        <button type="submit" className="verstuur-btn" disabled={laden || (!input.trim() && !uploads.length)}>
          ↑
        </button>
      </form>
    </div>
  )
}

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
  const kopRij = rijen[0]
  const datarijen = rijen.slice(1).filter(r => !isScheidingslijn(r))

  const koppen = parseRij(kopRij).map(k => `<th>${k}</th>`).join('')
  const rijHtml = datarijen.map(r =>
    `<tr>${parseRij(r).map(cel => `<td>${cel}</td>`).join('')}</tr>`
  ).join('')

  return `<div class="tabel-wrapper"><table class="coach-tabel"><thead><tr>${koppen}</tr></thead><tbody>${rijHtml}</tbody></table></div>`
}

function formatBericht(tekst) {
  // Splits tekst in tabel-blokken en gewone tekst-blokken
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
