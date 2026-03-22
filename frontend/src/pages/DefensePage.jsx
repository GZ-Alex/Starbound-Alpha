// src/pages/DefensePage.jsx — v1.0
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Shield, ShieldOff, ShieldCheck, Crosshair, Hammer,
  Clock, AlertTriangle, X, ChevronRight, ZapOff, Zap,
  Lock, CheckCircle
} from 'lucide-react'
import { formatTime } from '@/lib/utils'

// ─── Konstanten ───────────────────────────────────────────────────────────────

const CLASS_COLORS = {
  Z: '#94a3b8', A: '#34d399', B: '#38bdf8',
  C: '#a78bfa', D: '#fb923c', E: '#f472b6',
}

const CLASS_LABELS = {
  Z: 'Klasse Z', A: 'Klasse A', B: 'Klasse B',
  C: 'Klasse C', D: 'Klasse D', E: 'Klasse E',
}

const CLASS_DESC = {
  Z: 'Gegen Frachter und Sonden. Einzige Klasse die Z-Chassis bekämpft.',
  A: 'Leichte Abwehr gegen kleine Jäger.',
  B: 'Mittelklasse-Abwehr. Gutes Verhältnis aus Kosten und Wirkung.',
  C: 'Schwere Abwehr gegen mittlere Kampfschiffe.',
  D: 'Hochleistungsabwehr gegen schwere Kreuzer.',
  E: 'Eliteabwehr gegen Schlachtschiffe. Hohe Kosten.',
}

const PROFILE_LABELS = {
  armored:     'Gepanzert',
  high_attack: 'Offensiv',
  balanced:    'Ausgewogen',
}

const PROFILE_COLORS = {
  armored:     '#38bdf8',
  high_attack: '#f87171',
  balanced:    '#4ade80',
}

const RESOURCE_LABELS = {
  titan: 'Titan', silizium: 'Silizium', aluminium: 'Aluminium',
  uran: 'Uran', plutonium: 'Plutonium',
}

const RESOURCE_ICONS = {
  titan:      '/Starbound-Alpha/resources/titan.png',
  silizium:   '/Starbound-Alpha/resources/silizium.png',
  aluminium:  '/Starbound-Alpha/resources/aluminium.png',
  uran:       '/Starbound-Alpha/resources/uran.png',
  plutonium:  '/Starbound-Alpha/resources/plutonium.png',
}

const CAPACITY_PER_LEVEL = 500

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString('de-DE')
}

function useCountdown(finishAt) {
  const [t, setT] = useState('')
  useState(() => {
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

// ─── Turm-Kosten berechnen ────────────────────────────────────────────────────

function calcCost(def, qty) {
  if (!def || !qty) return {}
  const keys = ['titan','silizium','aluminium','uran','plutonium']
  const costs = {}
  for (const k of keys) {
    const base = def[`cost_${k}`] ?? 0
    if (base > 0) costs[k] = base * qty
  }
  return costs
}

function canAfford(planet, costs) {
  return Object.entries(costs).every(([res, amt]) => (planet[res] ?? 0) >= amt)
}

// ─── TowerCard ────────────────────────────────────────────────────────────────

function TowerCard({ def, planet, defenseLevel, onBuild, hasTech, inQueue, playerProfession }) {
  const [qty, setQty] = useState(1)
  const capacity = defenseLevel * CAPACITY_PER_LEVEL
  const costs = calcCost(def, qty)
  const affordable = canAfford(planet, costs)
  const color = CLASS_COLORS[def.tower_class] ?? '#64748b'
  const profileColor = PROFILE_COLORS[def.profile] ?? '#64748b'
  const locked = (!hasTech && def.required_tech) || (def.required_profession && def.required_profession !== playerProfession)

  return (
    <motion.div
      layout
      className="panel overflow-hidden flex flex-col"
      style={{ opacity: locked ? 0.5 : 1 }}
      whileHover={!locked ? { borderColor: `${color}44` } : {}}
    >
      {/* Header mit Klassen-Banner */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ background: `${color}0d`, borderBottom: `1px solid ${color}22` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
            style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>
            {CLASS_LABELS[def.tower_class]}
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: `${profileColor}12`, color: profileColor, border: `1px solid ${profileColor}28` }}>
            {PROFILE_LABELS[def.profile] ?? def.profile}
          </span>
        </div>
        {locked && <Lock size={13} style={{ color: '#475569' }} />}
          {def.required_profession && def.required_profession !== playerProfession && (
            <span className="text-xs font-mono px-2 py-0.5 rounded ml-auto"
              style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}>
              Nur Händler
            </span>
          )}
      </div>

      {/* Name */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <h3 className="font-display text-sm text-slate-200">{def.name}</h3>
        {def.required_tech && (
          <p className="text-xs font-mono mt-0.5"
            style={{ color: hasTech ? '#4ade80' : '#ef4444' }}>
            {hasTech ? '✓ Technologie freigeschaltet' : `Benötigt: ${def.required_tech}`}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 py-2 grid grid-cols-3 gap-2 flex-shrink-0">
        {[
          { label: 'HP',       val: fmt(def.hp),       color: '#4ade80' },
          { label: 'Angriff',  val: fmt(def.attack),   color: '#f87171' },
          { label: 'Verteid.', val: fmt(def.defense),  color: '#38bdf8' },
        ].map(s => (
          <div key={s.label} className="text-center px-2 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-0.5">{s.label}</p>
            <p className="text-sm font-mono font-bold" style={{ color: s.color }}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2 flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1 text-xs font-mono text-slate-600">
          <Clock size={10} />
          {def.build_ticks} Ticks
        </div>
        <div className="flex items-center gap-1 text-xs font-mono text-slate-600">
          <Crosshair size={10} style={{ color }} />
          {def.capacity_cost} Kap./Stück
        </div>
      </div>

      {/* Kosten */}
      <div className="mx-4 rounded overflow-hidden flex-shrink-0"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid font-mono px-2 py-1 text-slate-600 text-xs"
          style={{ gridTemplateColumns: '1fr 60px 70px', background: 'rgba(0,0,0,0.3)' }}>
          <span>Ressource</span>
          <span className="text-right">Kosten</span>
          <span className="text-right">Rest</span>
        </div>
        {Object.entries(costs).map(([res, amt]) => {
          const have = planet[res] ?? 0
          const rest = have - amt
          const ok = rest >= 0
          return (
            <div key={res} className="grid font-mono px-2 py-0.5 text-xs"
              style={{ gridTemplateColumns: '1fr 60px 70px', background: 'rgba(4,13,26,0.5)', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-1">
                <img src={RESOURCE_ICONS[res]} alt={res} style={{ width: 12, height: 12, objectFit: 'contain' }} />
                <span className="text-slate-400">{RESOURCE_LABELS[res]}</span>
              </div>
              <span className="text-right text-slate-300">{fmt(amt)}</span>
              <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                {ok ? fmt(rest) : `−${fmt(Math.abs(rest))}`}
              </span>
            </div>
          )
        })}
      </div>

      {/* Menge + Bau-Button */}
      <div className="p-4 mt-auto flex flex-col gap-2">
        {/* Mengenauswahl */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-600">Anzahl:</span>
          <div className="flex items-center gap-1">
            {[1, 5, 10, 25, 50].map(n => (
              <button key={n} onClick={() => setQty(n)}
                className="w-8 h-7 rounded text-xs font-mono transition-all"
                style={{
                  background: qty === n ? `${color}18` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${qty === n ? `${color}44` : 'rgba(255,255,255,0.07)'}`,
                  color: qty === n ? color : '#64748b',
                }}>
                {n}
              </button>
            ))}
            <input
              type="number" min={1} max={999} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              className="w-14 h-7 rounded text-xs font-mono text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#cbd5e1', outline: 'none' }}
            />
          </div>
        </div>

        {/* Kapazitäts-Check */}
        {qty * def.capacity_cost > capacity && (
          <p className="text-xs font-mono text-amber-400/80 flex items-center gap-1">
            <AlertTriangle size={10} />
            Benötigt {qty * def.capacity_cost} Kap. — nur {capacity} verfügbar
          </p>
        )}

        {inQueue && (
          <div className="text-xs text-center py-1.5 rounded text-amber-500/70 font-mono"
            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
            ⏳ In Bau-Queue
          </div>
        )}

        {!inQueue && (
          <button
            onClick={() => onBuild(def, qty)}
            disabled={locked || !affordable || qty * def.capacity_cost > capacity}
            className="w-full py-2 rounded text-sm font-mono flex items-center justify-center gap-1.5 transition-all"
            style={{
              background: (!locked && affordable && qty * def.capacity_cost <= capacity)
                ? `${color}14` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${(!locked && affordable && qty * def.capacity_cost <= capacity)
                ? `${color}35` : 'rgba(255,255,255,0.06)'}`,
              color: (!locked && affordable && qty * def.capacity_cost <= capacity)
                ? color : '#334155',
            }}>
            {locked ? (
              def.required_profession && def.required_profession !== playerProfession
                ? <><Lock size={12} /> Nur für Händler</>
                : <><Lock size={12} /> Technologie fehlt</>
            )
              : !affordable ? '✗ Ressourcen fehlen'
              : qty * def.capacity_cost > capacity ? '✗ Kapazität überschritten'
              : <><Hammer size={13} /> {qty}× bauen</>}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── BuildQueueRow ────────────────────────────────────────────────────────────

function BuildQueueRow({ item, defs }) {
  const def = defs.find(d => d.id === item.tower_id)
  const color = CLASS_COLORS[def?.tower_class] ?? '#64748b'
  // ticks_remaining * 30s pro tick
  const secsLeft = (item.ticks_remaining ?? 0) * 30
  const finishAt = useMemo(() => {
    const d = new Date()
    d.setSeconds(d.getSeconds() + secsLeft)
    return d.toISOString()
  }, [secsLeft])
  const countdown = useCountdown(finishAt)

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <Hammer size={13} className="animate-pulse flex-shrink-0" style={{ color: '#fbbf24' }} />
      <span className="text-sm font-mono text-slate-200 flex-1">{def?.name ?? item.tower_id}</span>
      <span className="text-xs font-mono text-slate-600">{item.quantity}×</span>
      <span className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
        style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
        {countdown || `${item.ticks_remaining} Ticks`}
      </span>
    </div>
  )
}

// ─── InstallledTowerRow ───────────────────────────────────────────────────────

function InstalledTowerRow({ item, def }) {
  const color = CLASS_COLORS[def?.tower_class] ?? '#64748b'
  const hpPct = def ? Math.round((item.current_hp / item.max_hp) * 100) : 100

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${color}18` }}>
      <Crosshair size={13} style={{ color, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono text-slate-200 truncate">{def?.name ?? item.tower_id}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)', maxWidth: 80 }}>
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${hpPct}%`,
                background: hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#ef4444',
              }} />
          </div>
          <span className="text-xs font-mono text-slate-600">{item.current_hp}/{item.max_hp} HP</span>
        </div>
      </div>
      <span className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ background: `${color}12`, color, border: `1px solid ${color}28` }}>
        {CLASS_LABELS[def?.tower_class]}
      </span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DefensePage() {
  const { planet, buildings, player } = useGameStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [building, setBuilding] = useState(false)
  const [notification, setNotification] = useState(null)

  const defenseLevel = buildings?.find(b => b.building_id === 'defense_base')?.level ?? 0
  const capacity = defenseLevel * CAPACITY_PER_LEVEL

  // Defense active state (aus planet)
  const defenseActive = planet?.defense_active ?? true

  // Toggle defense active
  const handleToggleDefense = async () => {
    if (!planet) return
    const newState = !defenseActive
    await supabase.from('planets')
      .update({ defense_active: newState })
      .eq('id', planet.id)
    queryClient.invalidateQueries(['planet', planet.id])
    // Update gameStore planet
    const { loadPlanetData } = useGameStore.getState()
    if (loadPlanetData) loadPlanetData(planet.id)
    notify(newState ? 'Verteidigung aktiviert' : 'Verteidigung deaktiviert', newState ? 'success' : 'warn')
  }

  // Tower definitions
  const { data: towerDefs = [] } = useQuery({
    queryKey: ['defense-tower-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('defense_tower_definitions').select('*').order('tower_class')
      return data ?? []
    },
    staleTime: 300000,
  })

  // Installed towers
  const { data: installed = [] } = useQuery({
    queryKey: ['planet-defense', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('planet_defense_towers')
        .select('*').eq('planet_id', planet.id)
      return data ?? []
    },
    enabled: !!planet?.id,
    refetchInterval: 10000,
  })

  // Build queue
  const { data: buildQueue = [] } = useQuery({
    queryKey: ['defense-build-queue', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('defense_build_queue')
        .select('*').eq('planet_id', planet.id).order('id')
      return data ?? []
    },
    enabled: !!planet?.id,
    refetchInterval: 5000,
  })

  // Player techs for lock-check
  const { data: playerTechs = [] } = useQuery({
    queryKey: ['player-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_technologies')
        .select('tech_id').eq('player_id', player.id)
      return data?.map(t => t.tech_id) ?? []
    },
    enabled: !!player?.id,
    staleTime: 60000,
  })

  const hasTech = (techId) => !techId || playerTechs.includes(techId)

  // Used capacity
  const usedCapacity = useMemo(() => {
    return installed.reduce((sum, item) => {
      const def = towerDefs.find(d => d.id === item.tower_id)
      return sum + (def?.capacity_cost ?? 0)
    }, 0)
  }, [installed, towerDefs])

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleBuild = async (def, qty) => {
    if (!planet || building) return
    setBuilding(true)
    try {
      const costs = calcCost(def, qty)
      // Ressourcen abziehen
      const updates = {}
      for (const [res, amt] of Object.entries(costs)) {
        updates[res] = (planet[res] ?? 0) - amt
      }
      await supabase.from('planets').update(updates).eq('id', planet.id)

      // Build-Queue Eintrag (build_ticks = Ticks pro Stück × Anzahl)
      const buildTicks = def.build_ticks * qty
      await supabase.from('defense_build_queue').insert({
        planet_id: planet.id,
        tower_id: def.id,
        quantity: qty,
        ticks_remaining: buildTicks,
      })

      queryClient.invalidateQueries(['defense-build-queue', planet.id])
      queryClient.invalidateQueries(['planet', planet.id])
      notify(`${qty}× ${def.name} in Bau-Queue`)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setBuilding(false)
    }
  }

  // Klassen-Filter
  const classes = ['all', 'Z', 'A', 'B', 'C', 'D', 'E']
  const filtered = filter === 'all'
    ? towerDefs
    : towerDefs.filter(d => d.tower_class === filter)

  if (defenseLevel === 0) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <div className="panel p-8 text-center space-y-3">
          <Shield size={32} className="mx-auto" style={{ color: '#334155' }} />
          <h2 className="font-display text-slate-400">Planetenverteidigung nicht errichtet</h2>
          <p className="text-sm font-mono text-slate-600">
            Baue die Planetenverteidigung, um Türme zu errichten und deinen Planeten zu schützen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-5">

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-12 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-mono flex items-center gap-2"
            style={{
              background: notification.type === 'error' ? 'rgba(239,68,68,0.15)' : notification.type === 'warn' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)',
              border: `1px solid ${notification.type === 'error' ? 'rgba(239,68,68,0.35)' : notification.type === 'warn' ? 'rgba(251,191,36,0.3)' : 'rgba(74,222,128,0.3)'}`,
              color: notification.type === 'error' ? '#fca5a5' : notification.type === 'warn' ? '#fcd34d' : '#4ade80',
            }}>
            {notification.type === 'success' ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {notification.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="panel p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)' }}>
              <Shield size={18} style={{ color: '#f87171' }} />
            </div>
            <div>
              <h1 className="font-display text-base text-slate-200">Planetenverteidigung</h1>
              <p className="text-xs font-mono text-slate-600">Level {defenseLevel} — {capacity} Kapazität gesamt</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Kapazitätsbalken */}
            <div className="min-w-[180px] space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-600">Kapazität</span>
                <span style={{ color: usedCapacity > capacity ? '#f87171' : '#64748b' }}>
                  {usedCapacity} / {capacity}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, capacity > 0 ? (usedCapacity / capacity) * 100 : 0)}%`,
                    background: usedCapacity > capacity
                      ? 'linear-gradient(90deg,#f87171,#ef4444)'
                      : 'linear-gradient(90deg,#f87171,#dc2626)',
                  }} />
              </div>
            </div>

            {/* Aktivieren / Deaktivieren */}
            <button
              onClick={handleToggleDefense}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono transition-all"
              style={{
                background: defenseActive
                  ? 'rgba(74,222,128,0.1)' : 'rgba(100,116,139,0.08)',
                border: `1px solid ${defenseActive ? 'rgba(74,222,128,0.3)' : 'rgba(100,116,139,0.2)'}`,
                color: defenseActive ? '#4ade80' : '#64748b',
              }}>
              {defenseActive
                ? <><ShieldCheck size={14} /> Aktiv</>
                : <><ShieldOff size={14} /> Inaktiv</>}
            </button>
          </div>
        </div>

        {/* Inaktiv-Hinweis */}
        {!defenseActive && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.15)', color: '#94a3b8' }}>
            <ShieldOff size={12} />
            Verteidigung deaktiviert — Türme nehmen nicht an Kämpfen teil und sind für Scanner unsichtbar.
          </div>
        )}
      </div>

      {/* Bau-Queue */}
      {buildQueue.length > 0 && (
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">Bau-Queue</p>
          {buildQueue.map(item => (
            <BuildQueueRow key={item.id} item={item} defs={towerDefs} />
          ))}
        </div>
      )}

      {/* Installierte Türme */}
      {installed.length > 0 && (
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">
            Installierte Türme ({installed.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {installed.map(item => {
              const def = towerDefs.find(d => d.id === item.tower_id)
              return <InstalledTowerRow key={item.id} item={item} def={def} />
            })}
          </div>
        </div>
      )}

      {/* Klassen-Filter */}
      <div className="flex items-center gap-1 flex-wrap">
        {classes.map(cls => (
          <button key={cls}
            onClick={() => setFilter(cls)}
            className="px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{
              background: filter === cls
                ? cls === 'all' ? 'rgba(255,255,255,0.08)' : `${CLASS_COLORS[cls]}18`
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === cls
                ? cls === 'all' ? 'rgba(255,255,255,0.15)' : `${CLASS_COLORS[cls]}44`
                : 'rgba(255,255,255,0.06)'}`,
              color: filter === cls
                ? cls === 'all' ? '#e2e8f0' : CLASS_COLORS[cls]
                : '#475569',
            }}>
            {cls === 'all' ? 'Alle' : CLASS_LABELS[cls]}
          </button>
        ))}
      </div>

      {/* Klassen-Beschreibung */}
      {filter !== 'all' && (
        <p className="text-xs font-mono text-slate-600 px-1">{CLASS_DESC[filter]}</p>
      )}

      {/* Tower Grid */}
      {towerDefs.length === 0 ? (
        <div className="panel p-8 text-center">
          <Crosshair size={28} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-mono text-slate-600">
            Keine Verteidigungsanlagen in der Datenbank gefunden.
          </p>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {filtered.map(def => (
            <TowerCard
              key={def.id}
              def={def}
              planet={planet}
              defenseLevel={defenseLevel}
              onBuild={handleBuild}
              hasTech={hasTech(def.required_tech)}
              inQueue={buildQueue.some(q => q.tower_id === def.id)}
              playerProfession={player?.profession}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}
