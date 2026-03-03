// src/components/ui/Layout.jsx
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import ResourceBar from '@/components/planet/ResourceBar'
import ChatPanel from '@/components/chat/ChatPanel'
import NotificationStack from '@/components/ui/NotificationStack'
import {
  LayoutDashboard, Globe2, Rocket, Navigation, FlaskConical,
  Radar, Shield, LogOut, Settings, ChevronRight
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Übersicht' },
  { to: '/planet',    icon: Globe2,          label: 'Planet' },
  { to: '/shipyard',  icon: Rocket,          label: 'Werft' },
  { to: '/fleet',     icon: Navigation,      label: 'Flotten' },
  { to: '/research',  icon: FlaskConical,    label: 'Forschung' },
  { to: '/scan',      icon: Radar,           label: 'Scan' },
]

export default function Layout() {
  const { player, planet, logout } = useGameStore()

  return (
    <div className="scanlines flex h-screen overflow-hidden star-bg">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-cyan-500/15"
        style={{ background: 'linear-gradient(180deg, rgba(4,13,26,0.98) 0%, rgba(2,4,9,0.99) 100%)' }}>
        
        {/* Logo */}
        <div className="p-4 border-b border-cyan-500/15">
          <h1 className="font-display font-bold text-xl tracking-[0.15em] text-cyan-400"
            style={{ textShadow: '0 0 20px rgba(34,211,238,0.5)' }}>
            ✦ STARBOUND
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">ALPHA v0.1</p>
        </div>

        {/* Player info */}
        <div className="px-3 py-3 border-b border-cyan-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #0f2d54, #071428)', border: '1px solid rgba(34,211,238,0.3)' }}>
              {player?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200 font-display">{player?.username}</div>
              <div className="text-xs text-slate-500">
                {player?.race_id ? <span className="text-cyan-600">{player.race_id}</span> : 
                  <span className="text-amber-500/70">Keine Rasse</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}

          {player?.is_admin && (
            <NavLink to="/admin"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} mt-4`}>
              <Settings size={15} />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Race/Profession chooser if not chosen */}
        {(!player?.race_id || !player?.profession) && player?.tutorial_done && (
          <div className="px-3 pb-3">
            <div className="rounded p-2.5 text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <div className="text-amber-400 font-semibold font-display mb-1.5">AUSSTEHEND</div>
              {!player?.race_id && (
                <button className="w-full text-left text-amber-300/70 hover:text-amber-300 flex items-center justify-between py-0.5">
                  <span>Rasse wählen</span><ChevronRight size={10} />
                </button>
              )}
              {!player?.profession && (
                <button className="w-full text-left text-amber-300/70 hover:text-amber-300 flex items-center justify-between py-0.5">
                  <span>Beruf wählen</span><ChevronRight size={10} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Logout */}
        <div className="p-3 border-t border-cyan-500/10">
          <button onClick={logout}
            className="w-full nav-item text-slate-500 hover:text-red-400">
            <LogOut size={14} />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top resource bar */}
        <ResourceBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full p-4"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Right panel: Chat */}
      <ChatPanel />

      {/* Notifications */}
      <NotificationStack />
    </div>
  )
}
