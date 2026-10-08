import {Routes, Route, useNavigate} from 'react-router-dom'
import { useState } from 'react'
import Home from './pages/Home'
import VehicleEntry from './pages/VehicleEntry'
import VehicleOut from './pages/VehicleOut'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/AdminDashboard'
import Login from './pages/Login'
import { useIsDesktop } from './hooks/useIsDesktop'

const PAGE_PATHS = {
  home: '/',
  out: '/out',
  entries: '/entries',
  admin: '/admin',
}

function App(){
  const navigate = useNavigate()
  const [isReady, setIsReady] = useState(false)
  const isDesktop = useIsDesktop()

  const handleNavigate = (page, type) => {
    if (page === 'in') navigate(`/in/${type}`)
    else navigate(PAGE_PATHS[page] || '/')
  }

  if (!isReady) {
    return <Login onReady={() => setIsReady(true)} />
  }

  return (
    <div className="app">
      <Routes>
        {/* Admins open this on a laptop, guards open it on a phone at the
            gate — the root URL shows each their own default view instead of
            needing a manual toggle or separate link. */}
        <Route path="/" element={isDesktop ? <AdminDashboard onNavigate={handleNavigate}/> : <Home onNavigate={handleNavigate}/>} />
        <Route path="/in/:entryType" element={<VehicleEntry onNavigate={handleNavigate}/>} />
       <Route path="/out" element={<VehicleOut onNavigate={handleNavigate}/>} />
        <Route path="/entries" element={<Dashboard onNavigate={handleNavigate}/>} />
        <Route path="/admin" element={<AdminDashboard onNavigate={handleNavigate}/>} />
      </Routes>
    </div>
  )
}
export default App