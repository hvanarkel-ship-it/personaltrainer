import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [gebruiker, setGebruiker] = useState(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('apex_token')
    const savedUser = localStorage.getItem('apex_user')
    if (token && savedUser) {
      try {
        setGebruiker(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('apex_token')
        localStorage.removeItem('apex_user')
      }
    }
    setLaden(false)
  }, [])

  async function inloggen(email, wachtwoord) {
    const data = await api.post('/auth-login', { email, wachtwoord })
    localStorage.setItem('apex_token', data.token)
    localStorage.setItem('apex_user', JSON.stringify(data.gebruiker))
    setGebruiker(data.gebruiker)
    return data
  }

  async function registreren(email, wachtwoord, naam) {
    const data = await api.post('/auth-register', { email, wachtwoord, naam })
    localStorage.setItem('apex_token', data.token)
    localStorage.setItem('apex_user', JSON.stringify(data.gebruiker))
    setGebruiker(data.gebruiker)
    return data
  }

  function uitloggen() {
    localStorage.removeItem('apex_token')
    localStorage.removeItem('apex_user')
    setGebruiker(null)
  }

  return (
    <AuthContext.Provider value={{ gebruiker, laden, inloggen, registreren, uitloggen }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
