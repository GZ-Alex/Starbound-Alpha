// src/components/ui/Layout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import ChatPanel from '@/components/chat/ChatPanel'
import NotificationStack from '@/components/ui/NotificationStack'
import {
  LayoutDashboard, Globe2, Rocket, Navigation, FlaskConical,
  Radar, LogOut, Settings, ChevronRight
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Übersicht' },
  { to: '/planet',    icon: Globe2,          label: 'Planet' },
  { to: '/shipyard',  icon: Rocket,          label: 'Werft' },
  { to: '/fleet',     icon: Navigation,      label: 'Flotten' },
  { to: '/research',  icon: FlaskConical,    label: 'Forschung' },
  { to: '/scan',      icon: Radar,           label: 'Scan' },
]

const RESOURCES = [
  { key: 'titan',       label: 'Titan',        icon: '⬡', color: '#94a3b8' },
  { key: 'silizium',    label: 'Silizium',      icon: '◇', color: '#a78bfa' },
  { key: 'helium',      label: 'Helium',        icon: '◎', color: '#34d399' },
  { key: 'nahrung',     label: 'Nahrung',       icon: '◈', color: '#86efac' },
  { key: 'wasser',      label: 'Wasser',        icon: '〇', color: '#67e8f9' },
  { key: 'bauxit',      label: 'Bauxit',        icon: '◆', color: '#fb923c' },
  { key: 'aluminium',   label: 'Aluminium',     icon: '▽', color: '#c0c0c0' },
  { key: 'uran',        label: 'Uran',          icon: '☢', color: '#4ade80' },
  { key: 'plutonium',   label: 'Plutonium',     icon: '⚛', color: '#f472b6' },
  { key: 'wasserstoff', label: 'Wasserstoff',   icon: '↑', color: '#38bdf8' },
  { key: 'energie',     label: 'Energie',       icon: '⚡', color: '#fbbf24' },
  { key: 'credits',     label: 'Credits',       icon: '¢', color: '#fde68a' },
]

function fmt(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString()
}

function SidebarResources({ planet, buildings }) {
  if (!planet) return null

  const bunkerLevel = buildings.find(b => b.building_id === 'bunker')?.level ?? 0
  const bunkerCap = bunkerLevel > 0 ? 500 + bunkerLevel * 400 : 0
  // Ressourcen die im Bunker geschützt sind (vereinfacht: erste N Ressourcen bis zur Kapazität)
  const protectedResources = ['titan','silizium','helium','nahrung','wasser','bauxit','aluminium','uran','plutonium','wasserstoff']
  const totalInBunker = protectedResources.reduce((sum, k) => sum + Math.min(planet[k] ?? 0, bunkerCap / protectedResources.length), 0)
  const bunkerFill = bunkerCap > 0 ? Math.min(totalInBunker / bunkerCap, 1) : 0
  const bunkerFull = bunkerFill >= 0.99

  return (
    <div className="px-2 py-2 border-t border-cyan-500/10 space-y-1">
      <p className="text-xs text-slate-600 uppercase tracking-widest font-mono px-1 mb-2">Ressourcen</p>

      {RESOURCES.map(({ key, label, icon, color }) => {
        const val = planet[key] ?? 0
        const prod = planet[`prod_${key}`] ?? 0
        return (
          <div key={key} className="flex items-center gap-2 px-1 py-0.5 rounded text-sm"
            style={{ background: 'rgba(7,20,40,0.4)' }}>
            <span style={{ color, fontSize: 13, width: 16, textAlign: 'center' }}>{icon}</span>
            <span className="text-slate-400 flex-1 text-xs">{label}</span>
            <span className="font-mono text-slate-200 text-xs">{fmt(val)}</span>
            {prod > 0 && (
              <span className="font-mono text-green-500/70 text-xs">+{fmt(prod)}</span>
            )}
            {prod < 0 && (
              <span className="font-mono text-red-500/70 text-xs">{fmt(prod)}</span>
            )}
          </div>
        )
      })}

      {/* Bunkeranzeige */}
      {bunkerLevel > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-slate-600 uppercase tracking-widest font-mono px-1">Bunker</p>
          <div className="px-1">
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className={bunkerFull ? 'text-red-400' : 'text-slate-400'}>
                {bunkerFull ? '⚠ Voll' : `Lvl ${bunkerLevel}`}
              </span>
              <span className={bunkerFull ? 'text-red-400' : 'text-slate-500'}>
                {fmt(totalInBunker)} / {fmt(bunkerCap)}
              </span>
            </div>
            <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <motion.div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${bunkerFill * 100}%`,
                  background: bunkerFull ? '#ef4444' : bunkerFill > 0.8 ? '#fbbf24' : '#22d3ee'
                }}
                initial={false}
                animate={{ width: `${bunkerFill * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { player, planet, buildings, logout } = useGameStore()
  const navigate = useNavigate()

  return (
    <div className="scanlines flex h-screen overflow-hidden star-bg">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-cyan-500/15 overflow-y-auto"
        style={{ background: 'linear-gradient(180deg, rgba(4,13,26,0.98) 0%, rgba(2,4,9,0.99) 100%)' }}>

        {/* Logo */}
        <div className="p-4 border-b border-cyan-500/15 flex-shrink-0">
          <h1 className="font-display font-bold text-xl tracking-[0.15em] text-cyan-400"
            style={{ textShadow: '0 0 20px rgba(34,211,238,0.5)' }}>
            ✦ STARBOUND
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">ALPHA v0.1</p>
        </div>

        {/* Player info */}
        <div className="px-3 py-3 border-b border-cyan-500/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f2d54, #071428)', border: '1px solid rgba(34,211,238,0.3)' }}>
              {player?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200 font-display">{player?.username}</div>
              <div className="text-xs text-slate-500 flex gap-1">
                {player?.race_id && <span className="text-cyan-600">{player.race_id}</span>}
                {player?.profession && <span className="text-slate-600">· {player.profession}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-2 py-3 space-y-0.5 flex-shrink-0">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={15} />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}
          {player?.is_admin && (
            <NavLink to="/admin"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} mt-2`}>
              <Settings size={15} />
              <span className="text-sm">Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Ressourcen + Bunker */}
        <div className="flex-1">
          <SidebarResources planet={planet} buildings={buildings} />
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-cyan-500/10 flex-shrink-0">
          <button onClick={logout}
            className="w-full nav-item text-slate-500 hover:text-red-400">
            <LogOut size={14} />
            <span className="text-sm">Abmelden</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full p-4">
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
