// Local visual fixture only. Vite's production entry remains index.html.
import React from 'react'
import { createRoot } from 'react-dom/client'
import Dashboard from '../src/components/Dashboard.jsx'
import { api } from '../src/api.js'
import '../src/index.css'
import '../src/refinement.css'

if (import.meta.env.DEV) {
  const today = new Date().toLocaleDateString('en-CA')
  const sample = {
    profiel: { name: 'Alex', doel_kcal: 2400, doel_eiwit_g: 150, doel_koolhydraten_g: 280, doel_vetten_g: 80 },
    herstel: { datum: today, hrv_ochtend: 72, slaap_uur: 7.6, slaap_score: 89, herstel_balans: 8 },
    vandaag: { kcal: 1640, eiwit: 112, koolhydraten: 180, vetten: 52 },
    week_trainingen: [{ id: 1, datum: today, sport: 'hardlopen', duur_min: 42, kcal: 430, afstand_km: 7.2 }],
    doelen: [], gewicht_trend: [], streak: 4,
  }
  api.get = async path => path === '/dashboard' ? sample : { wellness: [] }
  api.post = async () => { throw new Error('Voorbeeldmodus: gegevens worden niet opgeslagen.') }
  function Preview() {
    const [notice, setNotice] = React.useState('Voorbeeldgegevens · lokale designpreview')
    return <div className="app"><header className="app-brand"><div className="brand-lockup"><span className="brand-symbol">Λ</span>APEX <span className="brand-secondary">Coach</span></div><button className="btn btn-secondary" onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }}>Thema wisselen</button></header><p role="status" style={{ padding:'12px 28px', fontSize:12, color:'var(--amber)' }}>{notice}</p><Dashboard user={{name:'Alex'}} onNavigeer={s => setNotice(`Voorbeeldmodus · ${s} is beschikbaar in de volledige app`)} onUitloggen={() => location.assign('/')} /><nav className="bottom-nav" aria-label="Voorbeeldnavigatie">{['Overzicht','Coach','Training','Voeding','Lichaam','Meer'].map((label,i) => <button key={label} className={`nav-btn ${i===0?'active':''}`} onClick={() => setNotice(`Voorbeeldmodus · ${label}`)}><span className="nav-icon" aria-hidden="true">{['⌂','↗','⌁','+','◎','•••'][i]}</span><span className="nav-label">{label}</span></button>)}</nav></div>
  }
  createRoot(document.getElementById('root')).render(<Preview />)
}
