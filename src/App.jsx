import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Coach from './pages/Coach.jsx'
import Measurements from './pages/Measurements.jsx'
import Meals from './pages/Meals.jsx'
import Workouts from './pages/Workouts.jsx'
import Settings from './pages/Settings.jsx'

function PrivateRoute({ children }) {
  const { gebruiker, laden } = useAuth()
  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  return gebruiker ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { gebruiker, laden } = useAuth()
  if (laden) return <div className="loading-screen"><div className="spinner" /></div>
  return gebruiker ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/registreren" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="coach" element={<Coach />} />
            <Route path="metingen" element={<Measurements />} />
            <Route path="voeding" element={<Meals />} />
            <Route path="trainingen" element={<Workouts />} />
            <Route path="instellingen" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
