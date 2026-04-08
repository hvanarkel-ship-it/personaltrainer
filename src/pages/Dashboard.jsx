import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Dashboard() {
  const { gebruiker } = useAuth()
  const [data, setData] = useState(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    api.get('/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setLaden(false))
  }, [])

  const vandaag = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  if (laden) return <div className="page-loading"><div className="spinner" /></div>

  const kcalDoel = data?.instellingen?.dagelijks_calorie_doel
  const kcalGegeten = data?.vandaag?.kcal_gegeten || 0
  const eiwitDoel = data?.instellingen?.dagelijks_eiwitdoel_g
  const eiwitGegeten = data?.vandaag?.eiwit_gegeten || 0
  const kcalPct = kcalDoel ? Math.min(100, Math.round((kcalGegeten / kcalDoel) * 100)) : null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Goedemiddag, {gebruiker?.naam?.split(' ')[0]} ⚡</h1>
          <p className="page-subtitle">{vandaag}</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Gewicht kaart */}
        <div className="card stat-card">
          <div className="stat-label">Gewicht</div>
          {data?.laatste_meting?.gewicht_kg ? (
            <>
              <div className="stat-value">{data.laatste_meting.gewicht_kg} <span>kg</span></div>
              {data?.instellingen?.doelgewicht_kg && (
                <div className="stat-sub">
                  Doel: {data.instellingen.doelgewicht_kg} kg
                  <span className="stat-delta">
                    {(data.laatste_meting.gewicht_kg - data.instellingen.doelgewicht_kg).toFixed(1)} kg te gaan
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="stat-empty">
              <Link to="/metingen">+ Meting toevoegen</Link>
            </div>
          )}
        </div>

        {/* Calorieën kaart */}
        <div className="card stat-card">
          <div className="stat-label">Calorieën vandaag</div>
          <div className="stat-value">{kcalGegeten} <span>kcal</span></div>
          {kcalDoel && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${kcalPct}%` }} />
              </div>
              <div className="stat-sub">{kcalPct}% van {kcalDoel} kcal doel</div>
            </>
          )}
          {!kcalDoel && <div className="stat-sub"><Link to="/instellingen">Stel doel in</Link></div>}
        </div>

        {/* Eiwit kaart */}
        <div className="card stat-card">
          <div className="stat-label">Eiwit vandaag</div>
          <div className="stat-value">{eiwitGegeten} <span>g</span></div>
          {eiwitDoel && (
            <>
              <div className="progress-bar">
                <div className="progress-fill progress-fill--green"
                  style={{ width: `${Math.min(100, Math.round((eiwitGegeten / eiwitDoel) * 100))}%` }} />
              </div>
              <div className="stat-sub">
                {Math.min(100, Math.round((eiwitGegeten / eiwitDoel) * 100))}% van {eiwitDoel}g doel
              </div>
            </>
          )}
        </div>

        {/* Trainingen kaart */}
        <div className="card stat-card">
          <div className="stat-label">Training vandaag</div>
          {data?.vandaag?.trainingen?.length > 0 ? (
            data.vandaag.trainingen.map((t, i) => (
              <div key={i} className="workout-item">
                <span>{t.naam || t.type}</span>
                {t.duur_minuten && <span className="badge">{t.duur_minuten} min</span>}
              </div>
            ))
          ) : (
            <div className="stat-empty">
              <Link to="/trainingen">+ Training loggen</Link>
            </div>
          )}
        </div>

        {/* Vetpercentage */}
        {data?.laatste_meting?.vetpercentage && (
          <div className="card stat-card">
            <div className="stat-label">Vetpercentage</div>
            <div className="stat-value">{data.laatste_meting.vetpercentage} <span>%</span></div>
          </div>
        )}

        {/* Spiermassa */}
        {data?.laatste_meting?.spiermassa_kg && (
          <div className="card stat-card">
            <div className="stat-label">Spiermassa</div>
            <div className="stat-value">{data.laatste_meting.spiermassa_kg} <span>kg</span></div>
          </div>
        )}
      </div>

      {/* Gewichtsgrafiek */}
      {data?.gewicht_trend?.length > 1 && (
        <div className="card mt-4">
          <h3>Gewichtstrend</h3>
          <div className="weight-chart">
            {data.gewicht_trend.map((m, i) => {
              const values = data.gewicht_trend.map(x => x.gewicht_kg)
              const min = Math.min(...values)
              const max = Math.max(...values)
              const range = max - min || 1
              const pct = ((m.gewicht_kg - min) / range) * 70
              return (
                <div key={i} className="chart-point">
                  <div className="chart-bar-wrap">
                    <div className="chart-bar" style={{ height: `${30 + pct}px` }} />
                  </div>
                  <div className="chart-label">{new Date(m.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</div>
                  <div className="chart-value">{m.gewicht_kg}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Snelle acties */}
      <div className="quick-actions mt-4">
        <h3>Snelle acties</h3>
        <div className="quick-grid">
          <Link to="/coach" className="quick-card">
            <span>🤖</span>
            <span>Vraag de coach</span>
          </Link>
          <Link to="/voeding" className="quick-card">
            <span>🍽️</span>
            <span>Maaltijd toevoegen</span>
          </Link>
          <Link to="/trainingen" className="quick-card">
            <span>💪</span>
            <span>Training starten</span>
          </Link>
          <Link to="/metingen" className="quick-card">
            <span>📊</span>
            <span>Meting invoeren</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
