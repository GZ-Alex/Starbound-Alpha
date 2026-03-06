// src/pages/FleetPage.jsx — v1.0
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Navigation, ChevronLeft, Package, Shield, Zap,
  Clock, Crosshair, AlertTriangle, Plus, X, Gem, Store, Globe
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function coords(x, y, z) {
  if (x == null) return '—'
  return `${x} / ${y} / ${z}`
}

function etaString(ticks) {
  if (!ticks || ticks <= 0) return null
  const seconds = ticks * 60
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `~${h}h ${m}m`
  return `~${m}m`
}

const MISSION_LABELS = {
  idle:   { label: 'Stationär', color: '#64748b' },
  move:   { label: 'Im Flug',   color: '#22d3ee' },
  mine:   { label: 'Abbau',     color: '#34d399' },
  return: { label: 'Rückkehr',  color: '#a78bfa' },
}

const FLIGHT_MODE_LABELS = {
  neutral:      { label: 'Neutral',      color: '#64748b' },
  enemy:        { label: 'Feindlich',    color: '#f87171' },
  bounty:       { label: 'Kopfgeld',     color: '#fb923c' },
  annihilation: { label: 'Vernichtung',  color: '#ef4444' },
}

// Gesamtladeraum und aktuelle Ladung einer Flotte
function fleetCargo(fleet, ships) {
  const maxCargo = ships.reduce((s, sh) => s + (sh.ship_designs?.total_cargo ?? 0), 0)
  const currentCargo = Object.values(fleet.cargo ?? {}).reduce((s, v) => s + v, 0)
  return { current: currentCargo, max: maxCargo }
}

// Durchschnittliche HP % einer Flotte
function fleetHpPct(ships) {
  if (!ships.length) return 0
  const total = ships.reduce((s, sh) => s + sh.max_hp, 0)
  const current = ships.reduce((s, sh) => s + sh.current_hp, 0)
  return total > 0 ? Math.round((current / total) * 100) : 0
}

// Langsamste Geschwindigkeit in der Flotte
function fleetSpeed(ships) {
  if (!ships.length) return 0
  return Math.min(...ships.map(sh => sh.ship_designs?.total_speed ?? 0).filter(s => s > 0))
}

// ─── Neue Flotte erstellen Modal ───────────────────────────────────────────────

function CreateFleetModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const { player, planet } = useGameStore()

  const handleCreate = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('fleets').insert({
      player_id: player.id,
      name: name.trim(),
      x: planet?.x ?? 0,
      y: planet?.y ?? 0,
      z: planet?.z ?? 0,
      target_x: planet?.x ?? 0,
      target_y: planet?.y ?? 0,
      target_z: planet?.z ?? 0,
      mission: 'idle',
      flight_mode: 'neutral',
    }).select().single()
    setSaving(false)
    if (!error && data) onCreate(data)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-slate-200">Neue Flotte</h3>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Flottenname..."
          autoFocus
          className="w-full rounded px-3 py-2 text-sm font-mono"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(34,211,238,0.2)',
            color: '#e2e8f0', outline: 'none',
          }}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded text-sm font-mono"
            style={{ color: '#475569' }}>
            Abbrechen
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || saving}
            className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: name.trim() ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${name.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: name.trim() ? '#22d3ee' : '#334155',
            }}>
            {saving ? 'Erstellt...' : 'Erstellen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}


// ─── Fleet Scan Area ──────────────────────────────────────────────────────────

const ASTEROID_TYPE_LABELS = {
  metall:      { label: 'Metallasteroid',  color: '#94a3b8' },
  silikat:     { label: 'Silikatasteroid', color: '#a78bfa' },
  eis:         { label: 'Eisasteroid',     color: '#67e8f9' },
  gas:         { label: 'Gasblase',        color: '#34d399' },
  erz:         { label: 'Erzasteroid',     color: '#f472b6' },
  reichhaltig: { label: 'Reichhaltiger Asteroid', color: '#fbbf24' },
}

const NPC_TYPE_LABELS = {
  pirat_leicht:    { label: 'Piraten-Patrouille', color: '#f87171', threat: 'Leicht' },
  pirat_mittel:    { label: 'Piratengruppe',       color: '#fb923c', threat: 'Mittel' },
  piraten_verbund: { label: 'Piraten-Verbund',     color: '#ef4444', threat: 'Schwer' },
  haendler_konvoi: { label: 'Händler-Konvoi',      color: '#34d399', threat: 'Passiv' },
  npc_streitmacht: { label: 'NPC-Streitmacht',     color: '#8b5cf6', threat: 'Extrem' },
}

function dist3d(ax, ay, az, bx, by, bz) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function FleetScanArea({ fleet, ships }) {
  // Scanreichweite = bestes Schiff in der Flotte
  const scanRange = useMemo(() => {
    if (!ships.length) return 0
    return Math.max(...ships.map(s => s.ship_designs?.total_scan_range ?? 0))
  }, [ships])

  const fx = fleet.x ?? 0
  const fy = fleet.y ?? 0
  const fz = fleet.z ?? 0

  const inRange = (x, y, z) => dist3d(fx, fy, fz, x, y, z) <= scanRange

  const { data: asteroids = [] } = useQuery({
    queryKey: ['fleet-scan-asteroids', fleet.id],
    queryFn: async () => {
      const { data } = await supabase.from('asteroids').select('*').eq('is_depleted', false)
      return data ?? []
    },
    enabled: scanRange > 0,
    refetchInterval: 60000,
  })

  const { data: npcFleets = [] } = useQuery({
    queryKey: ['fleet-scan-npc', fleet.id],
    queryFn: async () => {
      const { data } = await supabase.from('npc_fleets').select('*, npc_ships(id)')
      return data ?? []
    },
    enabled: scanRange > 0,
    refetchInterval: 30000,
  })

  const { data: stations = [] } = useQuery({
    queryKey: ['trade-stations'],
    queryFn: async () => {
      const { data } = await supabase.from('trade_stations').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const nearAsteroids = asteroids.filter(a => inRange(a.x, a.y, a.z))
  const nearNPC       = npcFleets.filter(f => inRange(f.x, f.y, f.z))
  const nearStations  = stations.filter(s => inRange(s.x, s.y, s.z))
  const total = nearAsteroids.length + nearNPC.length + nearStations.length

  if (scanRange === 0) return (
    <div className="panel p-4">
      <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Scanbereich</p>
      <p className="text-sm font-mono text-slate-700">Kein Scanner in dieser Flotte.</p>
    </div>
  )

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
          Scanbereich · {scanRange} pc
        </p>
        <span className="text-xs font-mono text-slate-600">{total} Objekte</span>
      </div>

      {total === 0 ? (
        <p className="text-sm font-mono text-slate-700">Keine Objekte in Scanreichweite.</p>
      ) : (
        <div className="space-y-1.5">
          {nearNPC.map(f => {
            const meta = NPC_TYPE_LABELS[f.npc_type] ?? { label: f.npc_type, color: '#f87171', threat: '?' }
            return (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <AlertTriangle size={11} style={{ color: meta.color, flexShrink: 0 }} />
                <span className="text-xs font-mono text-slate-300 flex-1 truncate">{f.name}</span>
                <span className="text-xs font-mono" style={{ color: meta.color }}>{meta.threat}</span>
                <span className="text-xs font-mono text-slate-600">
                  {dist3d(fx, fy, fz, f.x, f.y, f.z).toFixed(1)} pc
                </span>
              </div>
            )
          })}
          {nearStations.map(s => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Store size={11} style={{ color: '#34d399', flexShrink: 0 }} />
              <span className="text-xs font-mono text-slate-300 flex-1 truncate">{s.name}</span>
              <span className="text-xs font-mono text-slate-600">WIP</span>
              <span className="text-xs font-mono text-slate-600">
                {dist3d(fx, fy, fz, s.x, s.y, s.z).toFixed(1)} pc
              </span>
            </div>
          ))}
          {nearAsteroids.map(a => {
            const meta = ASTEROID_TYPE_LABELS[a.asteroid_type] ?? { label: a.asteroid_type, color: '#94a3b8' }
            return (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Gem size={11} style={{ color: meta.color, flexShrink: 0 }} />
                <span className="text-xs font-mono text-slate-300 flex-1 truncate">{meta.label}</span>
                <span className="text-xs font-mono text-slate-600">WIP</span>
                <span className="text-xs font-mono text-slate-600">
                  {dist3d(fx, fy, fz, a.x, a.y, a.z).toFixed(1)} pc
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Fleet Detail View ────────────────────────────────────────────────────────

function FleetDetail({ fleet, ships, chassisDefs, onBack }) {
  const hpPct = fleetHpPct(ships)
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
  const { current: cargoUsed, max: cargoMax } = fleetCargo(fleet, ships)
  const mission = MISSION_LABELS[fleet.mission] ?? MISSION_LABELS.idle
  const flightMode = FLIGHT_MODE_LABELS[fleet.flight_mode] ?? FLIGHT_MODE_LABELS.neutral
  const speed = fleetSpeed(ships)

  const cargoEntries = Object.entries(fleet.cargo ?? {}).filter(([, v]) => v > 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm font-mono transition-colors"
        style={{ color: '#475569' }}>
        <ChevronLeft size={14} />
        Zurück zur Übersicht
      </button>

      {/* Fleet Header */}
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">
              {fleet.name ?? 'Unbenannte Flotte'}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: `${mission.color}15`, border: `1px solid ${mission.color}30`, color: mission.color }}>
                {mission.label}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: `${flightMode.color}15`, border: `1px solid ${flightMode.color}30`, color: flightMode.color }}>
                {flightMode.label}
              </span>
              {fleet.is_in_transit && fleet.ticks_to_arrive > 0 && (
                <span className="text-xs font-mono flex items-center gap-1" style={{ color: '#22d3ee' }}>
                  <Clock size={10} />
                  ETA: {etaString(fleet.ticks_to_arrive)}
                </span>
              )}
            </div>
          </div>

          {/* WIP Badge */}
          <div className="flex-shrink-0 px-3 py-1.5 rounded"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <p className="text-xs font-mono" style={{ color: '#fbbf24' }}>⚙ Parameter-Steuerung WIP</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Position</p>
            <p className="text-sm font-mono text-slate-300">{coords(fleet.x, fleet.y, fleet.z)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Ziel</p>
            <p className="text-sm font-mono" style={{ color: fleet.is_in_transit ? '#22d3ee' : '#475569' }}>
              {coords(fleet.target_x, fleet.target_y, fleet.target_z)}
            </p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Geschwindigkeit</p>
            <p className="text-sm font-mono font-semibold" style={{ color: '#fbbf24' }}>
              {fmt(speed)} <span className="text-xs text-slate-600">({fleet.speed_percent}%)</span>
            </p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Hüllenstatus</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-mono font-semibold" style={{ color: hpColor }}>{hpPct}%</p>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${hpPct}%`, background: hpColor }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schiffe in der Flotte */}
      <div className="panel p-5">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">
          Schiffe ({ships.length})
        </p>
        {ships.length === 0 ? (
          <p className="text-sm font-mono text-slate-700">Keine Schiffe in dieser Flotte.</p>
        ) : (
          <div className="space-y-2">
            {ships.map(ship => {
              const chassis = chassisDefs.find(c => c.id === ship.ship_designs?.chassis_id)
              const hpPct = ship.max_hp > 0 ? Math.round((ship.current_hp / ship.max_hp) * 100) : 0
              const hpCol = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
              const imgSrc = chassis?.image_key ? `/Starbound-Alpha/ships/${chassis.image_key}.png` : null
              return (
                <div key={ship.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded"
                    style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)' }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-0.5" />
                      : <span className="text-slate-600">🚀</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono text-slate-200 truncate">{ship.name ?? ship.ship_designs?.name ?? '—'}</p>
                    <p className="text-xs font-mono text-slate-600">{chassis?.name ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono" style={{ color: hpCol }}>{hpPct}% HP</span>
                    <div className="w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-1 rounded-full" style={{ width: `${hpPct}%`, background: hpCol }} />
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-500 w-24 text-right">
                    <Package size={9} className="inline mr-1" />
                    {fmt(ship.ship_designs?.total_cargo)}
                  </div>
                  <div className="text-xs font-mono w-20 text-right" style={{ color: '#fbbf24' }}>
                    <Zap size={9} className="inline mr-1" />
                    {fmt(ship.ship_designs?.total_speed)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ladung */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
            Ladung
          </p>
          <span className="text-xs font-mono" style={{ color: cargoUsed > cargoMax ? '#f87171' : '#64748b' }}>
            {fmt(cargoUsed)} / {fmt(cargoMax)}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1.5 rounded-full transition-all"
            style={{
              width: cargoMax > 0 ? `${Math.min((cargoUsed / cargoMax) * 100, 100)}%` : '0%',
              background: cargoUsed > cargoMax ? '#f87171' : '#34d399',
            }} />
        </div>
        {cargoEntries.length === 0 ? (
          <p className="text-sm font-mono text-slate-700">Laderaum leer.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {cargoEntries.map(([res, amount]) => (
              <div key={res} className="flex items-center justify-between px-2 py-1.5 rounded"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-xs font-mono text-slate-400 capitalize">{res}</span>
                <span className="text-xs font-mono text-slate-200">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs font-mono text-slate-700 mt-3">
          ⚙ Ladung aufnehmen / abwerfen — WIP
        </p>
      </div>

      {/* Scan-Bereich */}
      <FleetScanArea fleet={fleet} ships={ships} />
    </div>
  )
}

// ─── Fleet Row (Übersicht) ────────────────────────────────────────────────────

function FleetRow({ fleet, ships, onClick }) {
  const hpPct = fleetHpPct(ships)
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
  const { current: cargoUsed, max: cargoMax } = fleetCargo(fleet, ships)
  const speed = fleetSpeed(ships)
  const mission = MISSION_LABELS[fleet.mission] ?? MISSION_LABELS.idle
  const eta = etaString(fleet.ticks_to_arrive)

  return (
    <motion.div layout
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
      style={{
        background: 'rgba(4,13,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      whileHover={{ borderColor: 'rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.03)' }}>

      {/* Fleet Icon */}
      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
        <Navigation size={15} style={{ color: fleet.is_in_transit ? '#22d3ee' : '#475569' }} />
      </div>

      {/* Name + Status */}
      <div className="w-40 flex-shrink-0">
        <p className="font-mono text-sm font-semibold text-slate-200 truncate">
          {fleet.name ?? 'Unbenannt'}
        </p>
        <span className="text-xs font-mono" style={{ color: mission.color }}>{mission.label}</span>
      </div>

      {/* Schiffe */}
      <div className="w-16 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Schiffe</p>
        <p className="text-sm font-mono font-semibold text-slate-300">{ships.length}</p>
      </div>

      {/* Position */}
      <div className="w-32 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Position</p>
        <p className="text-xs font-mono text-slate-400">{coords(fleet.x, fleet.y, fleet.z)}</p>
      </div>

      {/* Ziel */}
      <div className="w-32 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Ziel</p>
        <p className="text-xs font-mono" style={{ color: fleet.is_in_transit ? '#22d3ee' : '#475569' }}>
          {coords(fleet.target_x, fleet.target_y, fleet.target_z)}
        </p>
      </div>

      {/* Geschwindigkeit */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Geschw.</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>{fmt(speed)}</p>
      </div>

      {/* Ladung */}
      <div className="w-24 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Ladung</p>
        <p className="text-xs font-mono text-slate-300">{fmt(cargoUsed)} / {fmt(cargoMax)}</p>
      </div>

      {/* HP Status */}
      <div className="w-24 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-mono text-slate-600">Status</p>
          <p className="text-xs font-mono font-semibold" style={{ color: hpColor }}>{hpPct}%</p>
        </div>
        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* ETA */}
      <div className="flex-shrink-0 ml-auto text-right min-w-[60px]">
        {eta ? (
          <span className="text-xs font-mono flex items-center gap-1 justify-end" style={{ color: '#22d3ee' }}>
            <Clock size={10} />{eta}
          </span>
        ) : (
          <span className="text-xs font-mono text-slate-700">—</span>
        )}
      </div>
    </motion.div>
  )
}

// ─── FleetPage ────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const { player } = useGameStore()
  const queryClient = useQueryClient()
  const [selectedFleet, setSelectedFleet] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  // ?highlight=<id> von ShipsPage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const highlight = params.get('highlight')
    if (highlight) {
      // Nach dem Laden die Flotte öffnen
      setSelectedFleet(highlight)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const { data: fleets = [], isLoading } = useQuery({
    queryKey: ['fleets', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('player_id', player.id)
        .order('created_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: ships = [] } = useQuery({
    queryKey: ['all-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, ship_designs(*)')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: chassisDefs = [] } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const getShipsForFleet = (fleetId) => ships.filter(s => s.fleet_id === fleetId)

  // Wenn highlight gesetzt: Flotte nach dem Laden öffnen
  const detailFleet = useMemo(() => {
    if (!selectedFleet) return null
    return fleets.find(f => f.id === selectedFleet) ?? null
  }, [selectedFleet, fleets])

  const handleCreated = (newFleet) => {
    queryClient.invalidateQueries(['fleets', player?.id])
    setShowCreate(false)
    setSelectedFleet(newFleet.id)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Lade Flotten...
    </div>
  )

  // Detail-Ansicht
  if (detailFleet) {
    return (
      <FleetDetail
        fleet={detailFleet}
        ships={getShipsForFleet(detailFleet.id)}
        chassisDefs={chassisDefs}
        onBack={() => setSelectedFleet(null)}
      />
    )
  }

  // Übersicht
  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Flotten</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {fleets.length} Flotte{fleets.length !== 1 ? 'n' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-semibold transition-all"
          style={{
            background: 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.25)',
            color: '#22d3ee',
          }}>
          <Plus size={14} />
          Neue Flotte
        </button>
      </div>

      {/* Spalten-Header */}
      {fleets.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1">
          <div className="w-9 flex-shrink-0" />
          <div className="w-40 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Name</span>
          </div>
          <div className="w-16 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Schiffe</span>
          </div>
          <div className="w-32 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Position</span>
          </div>
          <div className="w-32 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Ziel</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Geschw.</span>
          </div>
          <div className="w-24 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Ladung</span>
          </div>
          <div className="w-24 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Status</span>
          </div>
          <div className="ml-auto">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">ETA</span>
          </div>
        </div>
      )}

      {/* Flottenliste */}
      {fleets.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">🚀</p>
          <p className="font-display text-slate-400 text-lg">Keine Flotten vorhanden</p>
          <p className="text-slate-600 font-mono text-sm">
            Erstelle deine erste Flotte und weise ihr Schiffe zu.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="mt-2 px-5 py-2 rounded-lg text-sm font-mono font-semibold transition-all inline-flex items-center gap-2"
            style={{
              background: 'rgba(34,211,238,0.1)',
              border: '1px solid rgba(34,211,238,0.25)',
              color: '#22d3ee',
            }}>
            <Plus size={13} />
            Neue Flotte erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {fleets.map(fleet => (
            <FleetRow
              key={fleet.id}
              fleet={fleet}
              ships={getShipsForFleet(fleet.id)}
              onClick={() => setSelectedFleet(fleet.id)}
            />
          ))}
        </div>
      )}

      {/* Schiffe ohne Flotte */}
      {(() => {
        const unassigned = ships.filter(s => !s.fleet_id)
        if (!unassigned.length) return null
        return (
          <div className="panel p-4">
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">
              Schiffe ohne Flotte ({unassigned.length})
            </p>
            <p className="text-xs font-mono text-slate-700">
              {unassigned.map(s => s.name ?? s.ship_designs?.name ?? 'Unbenannt').join(', ')}
            </p>
          </div>
        )
      })()}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateFleetModal
            onClose={() => setShowCreate(false)}
            onCreate={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
