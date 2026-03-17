// src/App.jsx
import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useGameStore } from '@/store/gameStore'
import Layout from '@/components/ui/Layout'
import Landing from '@/pages/Landing'
import OverviewPage from '@/pages/OverviewPage'
import Dashboard from '@/pages/Dashboard'
import PlanetPage from '@/pages/PlanetPage'
import ShipyardPage from '@/pages/ShipyardPage'
import ShipsPage from './pages/ShipsPage'
import FleetPage from '@/pages/FleetPage'
import MinesPage from '@/pages/MinesPage'
import ResearchPage from '@/pages/ResearchPage'
import ScanPage from '@/pages/ScanPage'
import BattleReportsPage from '@/pages/BattleReportsPage'
import AdminPage from '@/pages/AdminPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
})

function PlaceholderPage({ title }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <h2 className="text-xl font-display text-slate-400">{title}</h2>
        <p className="text-slate-600 text-sm font-mono">In Entwicklung</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { player, isLoading } = useGameStore()
  if (isLoading) return <LoadingScreen />
  if (!player) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { initFromStorage } = useGameStore()
  useEffect(() => { initFromStorage() }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/overview"  element={<OverviewPage />} />
            <Route path="/planet"    element={<PlanetPage />} />
            <Route path="/mines"     element={<MinesPage />} />
            <Route path="/shipyard"  element={<ShipyardPage />} />
            <Route path="/research"  element={<ResearchPage />} />
            <Route path="/dock"      element={<PlaceholderPage title="Dock" />} />
            <Route path="/bunker"    element={<PlaceholderPage title="Bunker" />} />
            <Route path="/defense"   element={<PlaceholderPage title="Planetenverteidigung" />} />
            <Route path="/comms"     element={<PlaceholderPage title="Kommunikationsnetzwerk" />} />
            <Route path="ships"      element={<ShipsPage />} />
            <Route path="/fleet"     element={<FleetPage />} />
            <Route path="/scan"      element={<ScanPage />} />
            <Route path="/battle-reports" element={<BattleReportsPage />} />
            <Route path="/admin"     element={<AdminPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
