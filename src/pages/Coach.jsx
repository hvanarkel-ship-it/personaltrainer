import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api.js'

export default function Coach() {
  const [berichten, setBerichten] = useState([])
  const [input, setInput] = useState('')
  const [laden, setLaden] = useState(false)
  const [historyLaden, setHistoryLaden] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    api.get('/coach/history')
      .then(history => {
        setBerichten(history.map(h => ({ rol: h.rol, tekst: h.bericht, tijd: h.created_at })))
      })
      .catch(console.error)
      .finally(() => setHistoryLaden(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [berichten])

  async function verstuur(e) {
    e.preventDefault()
    if (!input.trim() || laden) return

    const tekst = input.trim()
    setInput('')
    setBerichten(b => [...b, { rol: 'user', tekst, tijd: new Date().toISOString() }])
    setLaden(true)

    try {
      const res = await api.post('/coach', { bericht: tekst })
      setBerichten(b => [...b, { rol: 'assistant', tekst: res.antwoord, tijd: new Date().toISOString() }])
    } catch (err) {
      setBerichten(b => [...b, { rol: 'assistant', tekst: 'Sorry, er is iets misgegaan. Probeer het opnieuw.', fout: true }])
    } finally {
      setLaden(false)
      inputRef.current?.focus()
    }
  }

  async function wisGesprek() {
    if (!confirm('Wil je het hele gesprek wissen?')) return
    await api.delete('/coach/history')
    setBerichten([])
  }

  const suggesties = [
    'Wat moet ik vandaag eten?',
    'Geef me een trainingsschema',
    'Hoe verbeter ik mijn herstel?',
    'Analyseer mijn voortgang',
  ]

  return (
    <div className="coach-page">
      <div className="coach-header">
        <div>
          <h1>🤖 AI Coach</h1>
          <p className="page-subtitle">Jouw persoonlijke fitness assistent</p>
        </div>
        {berichten.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={wisGesprek}>
            Gesprek wissen
          </button>
        )}
      </div>

      <div className="coach-messages">
        {historyLaden ? (
          <div className="coach-loading"><div className="spinner" /></div>
        ) : berichten.length === 0 ? (
          <div className="coach-empty">
            <div className="coach-avatar">⚡</div>
            <h3>Hallo! Ik ben jouw APEX Coach.</h3>
            <p>Stel me een vraag over training, voeding of herstel.</p>
            <div className="suggesties">
              {suggesties.map(s => (
                <button key={s} className="suggestie-btn" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          berichten.map((b, i) => (
            <div key={i} className={`message message--${b.rol} ${b.fout ? 'message--error' : ''}`}>
              {b.rol === 'assistant' && <div className="message-avatar">⚡</div>}
              <div className="message-bubble">
                <div className="message-text" dangerouslySetInnerHTML={{
                  __html: b.tekst
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^- (.+)/gm, '<li>$1</li>')
                    .replace(/<li>/g, '<ul><li>').replace(/<\/li>(?!<li>)/g, '</li></ul>')
                }} />
                <div className="message-time">
                  {b.tijd ? new Date(b.tijd).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
          ))
        )}

        {laden && (
          <div className="message message--assistant">
            <div className="message-avatar">⚡</div>
            <div className="message-bubble message-typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form className="coach-input-form" onSubmit={verstuur}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Stel een vraag aan je coach..."
          disabled={laden}
          className="coach-input"
        />
        <button type="submit" className="btn btn-primary" disabled={laden || !input.trim()}>
          ➤
        </button>
      </form>
    </div>
  )
}
