// src/components/ui/Layout.jsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import ChatPanel from '@/components/chat/ChatPanel'
import NotificationStack from '@/components/ui/NotificationStack'
import {
  Building2, Hammer, Rocket, FlaskConical, Anchor,
  Shield, Crosshair, Radio, Navigation, Radar,
  LogOut, Settings, Clock, Ship
} from 'lucide-react'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/planet',    icon: Building2,   label: 'Gebäude'          },
  { to: '/mines',     icon: Hammer,      label: 'Minen'            },
  { to: '/shipyard',  icon: Rocket,      label: 'Werft'            },
  { to: '/research',  icon: FlaskConical, label: 'Forschungszentrum'},
  { to: '/dock',      icon: Anchor,      label: 'Dock'             },
  { to: '/bunker',    icon: Shield,      label: 'Bunker'           },
  { to: '/defense',   icon: Crosshair,   label: 'Verteidigung'     },
  { to: '/comms',     icon: Radio,       label: 'Komm'             },
  { to: '/ships',     icon: Ship,        label: 'Schiffe'          },
  { to: '/fleet',     icon: Navigation,  label: 'Flotten'          },
  { to: '/scan',      icon: Radar,       label: 'Scan'             },
]

// ─── Resources ────────────────────────────────────────────────────────────────

const RESOURCES = [
  { key: 'titan',       label: 'Titan',       icon: '/Starbound-Alpha/resources/titan.png',       color: '#94a3b8', isImg: true },
  { key: 'silizium',    label: 'Silizium',    icon: '/Starbound-Alpha/resources/silizium.png',    color: '#a78bfa', isImg: true },
  { key: 'helium',      label: 'Helium',      icon: '/Starbound-Alpha/resources/helium.png',      color: '#34d399', isImg: true },
  { key: 'nahrung',     label: 'Nahrung',     icon: '/Starbound-Alpha/resources/nahrung.png',     color: '#86efac', isImg: true },
  { key: 'wasser',      label: 'Wasser',      icon: '/Starbound-Alpha/resources/wasser.png',      color: '#67e8f9', isImg: true },
  { key: 'bauxit',      label: 'Bauxit',      icon: '/Starbound-Alpha/resources/bauxit.png',      color: '#fb923c', isImg: true },
  { key: 'aluminium',   label: 'Aluminium',   icon: '/Starbound-Alpha/resources/aluminium.png',   color: '#c0c0c0', isImg: true },
  { key: 'uran',        label: 'Uran',        icon: '/Starbound-Alpha/resources/uran.png',        color: '#4ade80', isImg: true },
  { key: 'plutonium',   label: 'Plutonium',   icon: '/Starbound-Alpha/resources/plutonium.png',   color: '#f472b6', isImg: true },
  { key: 'wasserstoff', label: 'Wasserstoff', icon: '/Starbound-Alpha/resources/wasserstoff.png', color: '#38bdf8', isImg: true },
  { key: 'energie',     label: 'Energie Verfügbar', icon: '⚡', color: '#fbbf24', isImg: false },
  { key: 'credits',     label: 'Credits',     icon: '¢',  color: '#fde68a', isImg: false },
]

// Volle Zahl, keine Abkürzung, deutsche Formatierung (1.000)
function fmtFull(n) {
  if (n === undefined || n === null) return '—'
  return Math.floor(n).toLocaleString('de-DE')
}

// Produktion /h — kleine Abkürzung OK da platzsparend
function fmtProd(n) {
  if (!n) return null
  const abs = Math.abs(n)
  let s
  if (abs >= 1000000) s = `${(abs / 1000000).toFixed(1)}M`
  else if (abs >= 1000) s = `${(abs / 1000).toFixed(1)}k`
  else s = Math.floor(abs).toString()
  return n >= 0 ? `+${s}/h` : `-${s}/h`
}

// Countdown mm:ss oder h:mm:ss
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

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function QueuePill({ icon: Icon, color, label, name, level, countdown }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded"
      style={{ background: `${color}11`, border: `1px solid ${color}28` }}>
      <Icon size={10} style={{ color, flexShrink: 0 }} />
      <span className="text-xs font-mono truncate max-w-[110px]" style={{ color: '#cbd5e1' }}>
        {name}{level ? <span style={{ color: '#475569' }}> Lv{level}</span> : null}
      </span>
      <span className="text-xs font-mono flex-shrink-0" style={{ color }}>{countdown}</span>
    </div>
  )
}

function TopBar({ player, planet }) {
  const { data: buildQueue = [] } = useQuery({
    queryKey: ['bq-bar', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('build_queue').select('*')
        .eq('planet_id', planet.id).order('queue_position')
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 5000,
  })

  const { data: researchQueue = [] } = useQuery({
    queryKey: ['rq-bar', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('research_queue').select('*')
        .eq('player_id', player.id).order('started_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 5000,
  })

  const { data: fleetQueue = [] } = useQuery({
    queryKey: ['fq-bar', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('fleets').select('*')
        .eq('player_id', player.id).eq('is_in_transit', true)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 5000,
  })

  const { data: buildingDefs = [] } = useQuery({
    queryKey: ['building-defs-names'],
    queryFn: async () => { const { data } = await supabase.from('building_definitions').select('id,name'); return data ?? [] },
    staleTime: Infinity,
  })

  const { data: techDefs = [] } = useQuery({
    queryKey: ['tech-defs-bar'],
    queryFn: async () => { const { data } = await supabase.from('tech_definitions').select('id,name'); return data ?? [] },
    staleTime: 60000,
  })

  const hasAnything = buildQueue.length > 0 || researchQueue.length > 0 || fleetQueue.length > 0

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 flex-wrap"
      style={{
        borderBottom: '1px solid rgba(34,211,238,0.08)',
        background: 'rgba(2,8,20,0.7)',
        minHeight: 38,
        paddingTop: 5,
        paddingBottom: 5,
      }}>

      {!hasAnything && (
        <span className="text-xs font-mono text-slate-700">Keine aktiven Aufträge</span>
      )}

      {buildQueue.map(item => {
        const def = buildingDefs.find(d => d.id === item.building_id)
        return (
          <BuildQueuePill key={item.id} item={item} name={def?.name ?? item.building_id} />
        )
      })}

      {buildQueue.length > 0 && researchQueue.length > 0 && (
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
      )}

      {researchQueue.map(item => {
        const def = techDefs.find(d => d.id === item.tech_id)
        return (
          <ResearchQueuePill key={item.id} item={item} name={def?.name ?? item.tech_id} />
        )
      })}

      {researchQueue.length > 0 && fleetQueue.length > 0 && (
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
      )}

      {fleetQueue.map(fleet => (
        <FleetQueuePill key={fleet.id} fleet={fleet} />
      ))}
    </div>
  )
}

function BuildQueuePill({ item, name }) {
  const countdown = useCountdown(item.finish_at)
  return (
    <QueuePill icon={Building2} color="#fbbf24"
      name={name} level={item.target_level} countdown={countdown} />
  )
}

function ResearchQueuePill({ item, name }) {
  const countdown = useCountdown(item.finish_at)
  return (
    <QueuePill icon={FlaskConical} color="#22d3ee"
      name={name} level={item.target_level} countdown={countdown} />
  )
}

function FleetQueuePill({ fleet }) {
  const countdown = useCountdown(fleet.arrive_at)
  return (
    <QueuePill icon={Navigation} color="#a855f7"
      name={fleet.name ?? 'Flotte'}
      level={null}
      countdown={countdown || '→'} />
  )
}

// ─── Sidebar Resources ────────────────────────────────────────────────────────

function SidebarResources({ planet: initialPlanet }) {
  const [planet, setPlanet] = useState(initialPlanet)
  const { buildings, mineProductionBonus } = useGameStore()

  const { data: buildingDefsEnergy = [] } = useQuery({
    queryKey: ['building-defs-energy-only'],
    queryFn: async () => { const { data } = await supabase.from('building_definitions').select('id,energy_per_level'); return data ?? [] },
    staleTime: Infinity,
  })

  const energieVerbrauch = buildings.reduce((sum, pb) => {
    const def = buildingDefsEnergy.find(d => d.id === pb.building_id)
    return sum + (def?.energy_per_level ?? 0) * pb.level
  }, 0)

  // Energieproduktion: Kraftwerk level × 100
  const kraftwerkLevel = buildings.find(b => b.building_id === 'power_plant')?.level ?? 0
  const energieProduktion = kraftwerkLevel * 100

  const energieSaldo = energieProduktion - energieVerbrauch
  const energieMangel = energieSaldo < 0

  // Immer aktuell halten wenn gameStore-Planet sich ändert
  useEffect(() => {
    if (initialPlanet) setPlanet(initialPlanet)
  }, [initialPlanet])

  // Refresh zur vollen und halben Minute
  useEffect(() => {
    if (!initialPlanet?.id) return
    let timer
    const scheduleNext = () => {
      const now = new Date()
      const secs = now.getSeconds()
      const wait = secs < 30 ? (30 - secs) : (60 - secs)
      timer = setTimeout(async () => {
        const { data } = await supabase.from('planets')
          .select('*').eq('id', initialPlanet.id).single()
        if (data) setPlanet(data)
        scheduleNext()
      }, wait * 1000)
    }
    scheduleNext()
    return () => clearTimeout(timer)
  }, [initialPlanet?.id])

  if (!planet) return null

  return (
    <div className="px-2 py-3 border-t border-cyan-500/10">
      <p className="text-xs text-slate-600 uppercase tracking-widest font-mono px-1 mb-2">Ressourcen</p>
      <div className="space-y-0.5">
        {RESOURCES.map(({ key, label, icon, color, isImg }) => {
          const val  = planet[key] ?? 0
          // Produktion live berechnen: minen * 50 * bonus
          const mines = planet?.mine_distribution?.[key] ?? 0
          const isMineable = !['energie','credits'].includes(key)
          const prod = isMineable
            ? Math.round(mines * 50 * (mineProductionBonus ?? 1.0))
            : (planet[`prod_${key}`] ?? 0)
          const prodStr = fmtProd(prod)
          const isEnergie = key === 'energie'
          const isCredits = key === 'credits'

          // Energie: saldo = produktion - verbrauch
          const energieFrei = energieProduktion - energieVerbrauch
          const energieMangel = energieFrei <= 0

          return (
            <div key={key} className="flex items-center gap-1.5 px-1.5 py-1 rounded"
              style={{ background: 'rgba(7,20,40,0.4)' }}>
              {/* Icon */}
              {isImg
                ? <img src={icon} alt={label} style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }} />
                : <span style={{ color, fontSize: 12, width: 15, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
              }
              <span className="font-mono text-slate-300 text-sm flex-1 truncate">{label}</span>
              {isEnergie ? (
                // Energie: "frei / total" — rot wenn mangel
                <span className="font-mono tabular-nums text-sm font-semibold flex-shrink-0"
                  style={{ color: energieMangel ? '#f87171' : '#4ade80' }}>
                  {energieFrei} / {energieProduktion}
                </span>
              ) : (
                <>
                  <span className="font-mono text-slate-100 text-sm tabular-nums font-semibold">{fmtFull(val)}</span>
                  {(prodStr || isCredits) && (
                    <span className="font-mono tabular-nums flex-shrink-0"
                      style={{ color: prod >= 0 ? '#4ade80' : '#f87171', fontSize: 11 }}>
                      {prodStr || '—'}
                    </span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout() {
  const { player, planet, logout } = useGameStore()
  const navigate = useNavigate()

  // Rassen-Bild: /races/{race_id}.png, Fallback auf Platzhalter
  const raceImg = player?.race_id
    ? `/Starbound-Alpha/races/${player.race_id}.png`
    : `/Starbound-Alpha/races/placeholder.png`

  return (
    <div className="scanlines flex h-screen overflow-hidden star-bg">

      {/* ── Sidebar ── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-cyan-500/15 overflow-y-auto"
        style={{ background: 'linear-gradient(180deg, rgba(4,13,26,0.98) 0%, rgba(2,4,9,0.99) 100%)' }}>

        {/* Rassen-Bild + Spielername — klickbar → Dashboard */}
        <button onClick={() => navigate('/dashboard')}
          className="flex-shrink-0 group w-full text-left"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.1)' }}>
          <div className="relative w-full overflow-hidden"
            style={{ height: 120 }}>
            <img
              src={raceImg}
              alt="Rasse"
              className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-80"
              style={{ filter: 'brightness(0.85)' }}
              onError={e => { e.target.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }}
            />
            {/* Gradient overlay unten */}
            <div className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(4,13,26,0.95) 100%)' }} />
            {/* Spielername */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-2">
              <p className="font-display font-bold text-sm text-slate-200 truncate"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                {player?.username}
              </p>
              <div className="flex gap-1.5 text-xs font-mono">
                {player?.race_id && (
                  <span style={{ color: '#22d3ee', opacity: 0.8 }}>{player.race_id}</span>
                )}
                {player?.profession && (
                  <span style={{ color: '#94a3b8', opacity: 0.6 }}>· {player.profession}</span>
                )}
              </div>
            </div>
            {/* Hover-Indikator */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs font-mono text-cyan-400/60">Dossier →</span>
            </div>
          </div>
        </button>

        {/* Navigation */}
        <nav className="px-2 py-2 flex-shrink-0 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={14} />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}

          {player?.is_admin && (
            <>
              <div className="my-1 mx-2 border-t border-cyan-500/10" />
              <NavLink to="/admin"
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Settings size={14} />
                <span className="text-sm">Admin</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Ressourcen */}
        <div className="flex-1">
          <SidebarResources planet={planet} />
        </div>

        {/* Logout */}
        <div className="p-2 border-t border-cyan-500/10 flex-shrink-0">
          <button onClick={logout}
            className="w-full nav-item text-slate-500 hover:text-red-400">
            <LogOut size={13} />
            <span className="text-sm">Abmelden</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
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

      <ChatPanel />
      <NotificationStack />
    </div>
  )
}
