// src/components/ui/Layout.jsx
import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import ChatPanel from '@/components/chat/ChatPanel'
import NotificationStack from '@/components/ui/NotificationStack'
import {
  LayoutDashboard, Rocket, FlaskConical, Anchor,
  Shield, Crosshair, Navigation, Radar,
  LogOut, Settings, Clock, Hammer, Beaker
} from 'lucide-react'

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: 'Herrscher',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Übersicht' },
    ]
  },
  {
    label: 'Industrie',
    items: [
      { to: '/shipyard',  icon: Rocket,          label: 'Werft'       },
      { to: '/research',  icon: FlaskConical,     label: 'Forschen'    },
    ]
  },
  {
    label: 'Militär',
    items: [
      { to: '/dock',      icon: Anchor,           label: 'Dock'        },
      { to: '/bunker',    icon: Shield,            label: 'Bunker'      },
      { to: '/defense',   icon: Crosshair,         label: 'Verteidigung'},
      { to: '/fleet',     icon: Navigation,        label: 'Flotten'     },
      { to: '/scan',      icon: Radar,             label: 'Scan'        },
    ]
  },
]

// ─── Resources ────────────────────────────────────────────────────────────────

const RESOURCES = [
  { key: 'titan',       label: 'Titan',       icon: '⬡', color: '#94a3b8' },
  { key: 'silizium',    label: 'Silizium',    icon: '◇', color: '#a78bfa' },
  { key: 'helium',      label: 'Helium',      icon: '◎', color: '#34d399' },
  { key: 'nahrung',     label: 'Nahrung',     icon: '◈', color: '#86efac' },
  { key: 'wasser',      label: 'Wasser',      icon: '〇', color: '#67e8f9' },
  { key: 'bauxit',      label: 'Bauxit',      icon: '◆', color: '#fb923c' },
  { key: 'aluminium',   label: 'Aluminium',   icon: '▽', color: '#c0c0c0' },
  { key: 'uran',        label: 'Uran',        icon: '☢', color: '#4ade80' },
  { key: 'plutonium',   label: 'Plutonium',   icon: '⚛', color: '#f472b6' },
  { key: 'wasserstoff', label: 'Wasserstoff', icon: '↑', color: '#38bdf8' },
  { key: 'energie',     label: 'Energie',     icon: '⚡', color: '#fbbf24' },
  { key: 'credits',     label: 'Credits',     icon: '¢', color: '#fde68a' },
]

// Volle Zahl ohne Abkürzung
function fmtFull(n) {
  if (n === undefined || n === null) return '—'
  return Math.floor(n).toLocaleString('de-DE')
}

// Produktion / h — kann auch Abkürzung haben da klein
function fmtProd(n) {
  if (!n) return null
  const abs = Math.abs(n)
  let s
  if (abs >= 1000000) s = `${(abs / 1000000).toFixed(1)}M`
  else if (abs >= 1000) s = `${(abs / 1000).toFixed(1)}k`
  else s = Math.floor(abs).toLocaleString('de-DE')
  return n >= 0 ? `+${s}/h` : `-${s}/h`
}

// Countdown mm:ss
function useCountdown(finishAt) {
  const [t, setT] = useState('')
  useEffect(() => {
    if (!finishAt) { setT(''); return }
    const tick = () => {
      const d = new Date(finishAt) - new Date()
      if (d <= 0) { setT('Fertig!'); return }
      const h = Math.floor(d / 3600000)
      const m = Math.floor((d % 3600000) / 60000)
      const s = Math.floor((d % 60000) / 1000)
      if (h > 0) setT(`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
      else setT(`${m}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [finishAt])
  return t
}

// ─── Top Bar Queues ────────────────────────────────────────────────────────────

function BuildQueueItem({ item, buildingDefs }) {
  const countdown = useCountdown(item.finish_at)
  const def = buildingDefs?.find(d => d.id === item.building_id)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded"
      style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)' }}>
      <Hammer size={11} style={{ color: '#fbbf24', flexShrink: 0 }} />
      <span className="text-xs font-mono text-slate-300 truncate max-w-[120px]">
        {def?.name ?? item.building_id} <span className="text-slate-500">Lv{item.target_level}</span>
      </span>
      <span className="text-xs font-mono text-amber-400 flex-shrink-0">{countdown}</span>
    </div>
  )
}

function ResearchQueueItem({ item, techDefs }) {
  const countdown = useCountdown(item.finish_at)
  const def = techDefs?.find(d => d.id === item.tech_id)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded"
      style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.15)' }}>
      <FlaskConical size={11} style={{ color: '#22d3ee', flexShrink: 0 }} />
      <span className="text-xs font-mono text-slate-300 truncate max-w-[140px]">
        {def?.name ?? item.tech_id} <span className="text-slate-500">Lv{item.target_level}</span>
      </span>
      <span className="text-xs font-mono text-cyan-400 flex-shrink-0">{countdown}</span>
    </div>
  )
}

function FleetQueueItem({ fleet }) {
  const countdown = useCountdown(fleet.arrive_at)
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded"
      style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.15)' }}>
      <Navigation size={11} style={{ color: '#a855f7', flexShrink: 0 }} />
      <span className="text-xs font-mono text-slate-300 truncate max-w-[120px]">
        {fleet.name ?? 'Flotte'} <span className="text-slate-500">→ {fleet.target_x}/{fleet.target_y}</span>
      </span>
      <span className="text-xs font-mono text-purple-400 flex-shrink-0">{countdown || '—'}</span>
    </div>
  )
}

function TopBar({ player, planet }) {
  const { buildings } = useGameStore()

  const { data: buildQueue = [] } = useQuery({
    queryKey: ['build-queue-bar', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('build_queue').select('*')
        .eq('planet_id', planet.id).order('queue_position')
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 5000,
  })

  const { data: researchQueue = [] } = useQuery({
    queryKey: ['research-queue-bar', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('research_queue').select('*')
        .eq('player_id', player.id).order('started_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 5000,
  })

  const { data: fleetQueue = [] } = useQuery({
    queryKey: ['fleet-queue-bar', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('fleets').select('*')
        .eq('player_id', player.id).eq('status', 'traveling')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 5000,
  })

  const { data: buildingDefs = [] } = useQuery({
    queryKey: ['building-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('building_definitions').select('id,name')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const { data: techDefs = [] } = useQuery({
    queryKey: ['tech-defs-bar'],
    queryFn: async () => {
      const { data } = await supabase.from('tech_definitions').select('id,name')
      return data ?? []
    },
    staleTime: 60000,
  })

  const hasAnything = buildQueue.length > 0 || researchQueue.length > 0 || fleetQueue.length > 0

  if (!hasAnything) return (
    <div className="flex-shrink-0 h-9 flex items-center px-4 gap-2"
      style={{ borderBottom: '1px solid rgba(34,211,238,0.06)', background: 'rgba(4,13,26,0.6)' }}>
      <span className="text-xs font-mono text-slate-700">Keine aktiven Aufträge</span>
    </div>
  )

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 flex-wrap"
      style={{ borderBottom: '1px solid rgba(34,211,238,0.08)', background: 'rgba(4,13,26,0.6)', minHeight: 40 }}>

      {buildQueue.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-600 mr-1">BAU</span>
          {buildQueue.map(item => (
            <BuildQueueItem key={item.id} item={item} buildingDefs={buildingDefs} />
          ))}
        </div>
      )}

      {buildQueue.length > 0 && researchQueue.length > 0 && (
        <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
      )}

      {researchQueue.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-600 mr-1">FORSCHUNG</span>
          {researchQueue.map(item => (
            <ResearchQueueItem key={item.id} item={item} techDefs={techDefs} />
          ))}
        </div>
      )}

      {researchQueue.length > 0 && fleetQueue.length > 0 && (
        <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
      )}

      {fleetQueue.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-600 mr-1">FLOTTEN</span>
          {fleetQueue.map(fleet => (
            <FleetQueueItem key={fleet.id} fleet={fleet} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar Resources ────────────────────────────────────────────────────────

function SidebarResources({ planet }) {
  const [lastPlanet, setLastPlanet] = useState(planet)

  // 30s refresh zur vollen und halben Minute
  useEffect(() => {
    if (!planet) return

    const scheduleNext = () => {
      const now = new Date()
      const seconds = now.getSeconds()
      // Nächste volle oder halbe Minute
      let secsUntilNext
      if (seconds < 30) secsUntilNext = 30 - seconds
      else secsUntilNext = 60 - seconds

      return setTimeout(async () => {
        const { data } = await supabase.from('planets')
          .select('*').eq('id', planet.id).single()
        if (data) setLastPlanet(data)
        scheduleNext()
      }, secsUntilNext * 1000)
    }

    const timer = scheduleNext()
    return () => clearTimeout(timer)
  }, [planet?.id])

  // Sofort updaten wenn planet sich ändert (durch gameStore)
  useEffect(() => {
    if (planet) setLastPlanet(planet)
  }, [planet])

  const p = lastPlanet
  if (!p) return null

  return (
    <div className="px-2 py-3 border-t border-cyan-500/10 space-y-0.5">
      <p className="text-xs text-slate-600 uppercase tracking-widest font-mono px-1 mb-2">Ressourcen</p>
      {RESOURCES.map(({ key, label, icon, color }) => {
        const val  = p[key] ?? 0
        const prod = p[`prod_${key}`] ?? 0
        const prodStr = fmtProd(prod)
        return (
          <div key={key} className="flex items-center gap-1.5 px-1 py-0.5 rounded"
            style={{ background: 'rgba(7,20,40,0.4)' }}>
            <span style={{ color, fontSize: 12, width: 15, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span className="text-slate-500 text-xs flex-1 truncate">{label}</span>
            <span className="font-mono text-slate-200 text-xs">{fmtFull(val)}</span>
            {prodStr && (
              <span className="font-mono text-xs flex-shrink-0"
                style={{ color: prod >= 0 ? '#4ade80' : '#f87171' }}>
                {prodStr}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { player, planet, buildings, logout } = useGameStore()
  const navigate = useNavigate()

  return (
    <div className="scanlines flex h-screen overflow-hidden star-bg">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-cyan-500/15 overflow-y-auto"
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
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f2d54, #071428)', border: '1px solid rgba(34,211,238,0.3)' }}>
              {player?.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-200 font-display truncate">{player?.username}</div>
              <div className="text-xs text-slate-500 flex gap-1">
                {player?.race_id && <span className="text-cyan-600">{player.race_id}</span>}
                {player?.profession && <span className="text-slate-600">· {player.profession}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-2 py-2 flex-shrink-0 space-y-3">
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <p className="text-xs font-mono text-slate-700 uppercase tracking-widest px-2 mb-1">{label}</p>
              <div className="space-y-0.5">
                {items.map(({ to, icon: Icon, label: itemLabel }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Icon size={14} />
                    <span className="text-sm">{itemLabel}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {player?.is_admin && (
            <div>
              <p className="text-xs font-mono text-slate-700 uppercase tracking-widest px-2 mb-1">System</p>
              <NavLink to="/admin"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Settings size={14} />
                <span className="text-sm">Admin</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* Resources */}
        <div className="flex-1">
          <SidebarResources planet={planet} />
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
        {/* Top queue bar */}
        <TopBar player={player} planet={planet} />

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
      <NotificationStack />
    </div>
  )
}
