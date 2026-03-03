// src/App.jsx
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useGameStore } from '@/store/gameStore'
import Layout from '@/components/ui/Layout'
import Landing from '@/pages/Landing'
import Dashboard from '@/pages/Dashboard'
import PlanetPage from '@/pages/PlanetPage'
import ShipyardPage from '@/pages/ShipyardPage'
import FleetPage from '@/pages/FleetPage'
import ResearchPage from '@/pages/ResearchPage'
import ScanPage from '@/pages/ScanPage'
import AdminPage from '@/pages/AdminPage'
import LoadingScreen from '@/components/ui/LoadingScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000 },
  },
})

function ProtectedRoute({ children }) {
  const { player, isLoading } = useGameStore()
  if (isLoading) return <LoadingScreen />
  if (!player) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { initFromStorage } = useGameStore()

  useEffect(() => {
    initFromStorage()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/planet" element={<PlanetPage />} />
            <Route path="/shipyard" element={<ShipyardPage />} />
            <Route path="/fleet" element={<FleetPage />} />
            <Route path="/research" element={<ResearchPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
