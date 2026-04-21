import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service Worker registratie met update-detectie
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Controleer op updates elke 60 seconden
      setInterval(() => reg.update(), 60_000)

      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing
        newSW?.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Nieuwe versie beschikbaar — stuur event naar app
            window.dispatchEvent(new CustomEvent('sw-update-available', { detail: { reg } }))
          }
        })
      })
    }).catch(() => {})
  })
}
