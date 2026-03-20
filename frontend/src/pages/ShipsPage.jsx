// src/pages/ShipsPage.jsx — v1.1
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Info, X, Navigation, Package, Zap, Shield, Crosshair, Cpu, PlusCircle, LogOut } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function coords(fleet) {
  if (!fleet) return '—'
  return `${fleet.x ?? 0} / ${fleet.y ?? 0} / ${fleet.z ?? 0}`
}

const PART_CATEGORY_ICONS = {
  engine:           { icon: Zap,       label: 'Antrieb',     color: '#fbbf24' },
  booster:          { icon: Zap,       label: 'Booster',     color: '#fb923c' },
  primary_weapon:   { icon: Crosshair, label: 'Primärwaffe', color: '#f87171' },
  turret:           { icon: Crosshair, label: 'Turret',      color: '#fca5a5' },
  armor:            { icon: Shield,    label: 'Panzerung',   color: '#94a3b8' },
  shield_hp:        { icon: Shield,    label: 'HP-Schild',   color: '#38bdf8' },
  shield_def:       { icon: Shield,    label: 'Def-Schild',  color: '#a78bfa' },
  cargo:            { icon: Package,   label: 'Ladebucht',   color: '#34d399' },
  mining:           { icon: Cpu,       label: 'Bergbau',     color: '#86efac' },
  scanner_asteroid: { icon: Cpu,       label: 'Ast-Scanner', color: '#67e8f9' },
  scanner_npc:      { icon: Cpu,       label: 'NPC-Scanner', color: '#c084fc' },
  extension:        { icon: Cpu,       label: 'Erweiterung', color: '#cbd5e1' },
}

// ─── Detail Popup ──────────────────────────────────────────────────────────────

function ShipDetailPopup({ ship, design, chassis, partDefs, fleet, planet, onClose }) {
  const imgSrc = chassis?.image_key
    ? `/Starbound-Alpha/ships/${chassis.image_key}.png`
    : null

  const installedParts = (design?.installed_parts ?? []).map(p => {
    const def = partDefs.find(d => d.id === p.part_id)
    return def ? { ...def, slot_index: p.slot_index } : null
  }).filter(Boolean)

  const stats = [
    { label: 'Hülle',       value: `${ship.current_hp} / ${ship.max_hp}`, color: '#4ade80' },
    { label: 'Angriff',     value: fmt(design?.total_attack),              color: '#f87171' },
    { label: 'Verteidigung',value: fmt(design?.total_defense),             color: '#38bdf8' },
    { label: 'Geschw.',     value: fmt(design?.total_speed),               color: '#fbbf24' },
    { label: 'Manöver',     value: fmt(design?.total_maneuver),            color: '#a78bfa' },
    { label: 'Laderaum',    value: fmt(design?.total_cargo),               color: '#34d399' },
    { label: 'Scanweite',   value: fmt(design?.total_scan_range),          color: '#67e8f9' },
    { label: 'Zellen',      value: `${design?.total_cells_used ?? 0}`,     color: '#94a3b8' },
  ]

  // Teile nach Kategorie gruppieren
  const byCategory = {}
  for (const p of installedParts) {
    if (!byCategory[p.category]) byCategory[p.category] = []
    byCategory[p.category].push(p)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}>

        {/* Header */}
        <div className="flex items-center gap-4 p-5"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          {imgSrc && (
            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-1" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-xl text-slate-100 truncate">{ship.name ?? design?.name ?? 'Unbenannt'}</h2>
            <p className="text-sm font-mono text-slate-500">{chassis?.name} · Klasse {chassis?.class}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#475569' }}>
              {fleet ? `Flotte: ${fleet.name ?? 'Unbenannt'} · ${coords(fleet)}` : `Heimatplanet · ${planet?.name ?? '—'}`}
            </p>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded hover:bg-white/5 transition-colors"
            style={{ color: '#475569' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Stats Grid */}
          <div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Schiffswerte</p>
            <div className="grid grid-cols-4 gap-2">
              {stats.map(s => (
                <div key={s.label} className="rounded-lg p-2.5 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-mono text-slate-600 mb-1">{s.label}</p>
                  <p className="font-mono font-bold text-sm" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Eingebaute Teile */}
          <div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Eingebaute Bauteile</p>
            {installedParts.length === 0 ? (
              <p className="text-xs font-mono text-slate-700">Keine Bauteile eingebaut.</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(byCategory).map(([cat, parts]) => {
                  const meta = PART_CATEGORY_ICONS[cat] ?? { label: cat, color: '#94a3b8', icon: Cpu }
                  const Icon = meta.icon
                  return (
                    <div key={cat}>
                      <p className="text-xs font-mono mb-0.5 flex items-center gap-1.5"
                        style={{ color: meta.color }}>
                        <Icon size={10} />
                        {meta.label}
                      </p>
                      {parts.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded ml-4"
                          style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="text-xs font-mono text-slate-300 flex-1">{p.name}</span>
                          {p.effects && Object.entries(p.effects).slice(0, 3).map(([k, v]) => (
                            <span key={k} className="text-xs font-mono"
                              style={{ color: '#475569' }}>
                              {k}: <span style={{ color: meta.color }}>{v > 0 ? `+${v}` : v}</span>
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Erfahrung */}
          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-lg p-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-mono text-slate-600 mb-1">Erfahrung</p>
              <p className="font-mono font-bold text-sm text-slate-300">{fmt(ship.experience)} XP · Lvl {ship.ship_level}</p>
            </div>
            <div className="flex-1 rounded-lg p-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-mono text-slate-600 mb-1">Rückzug bei</p>
              <p className="font-mono font-bold text-sm text-slate-300">
                {ship.auto_retreat_at > 0 ? `${ship.auto_retreat_at}% HP` : 'Deaktiviert'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Ship Row ─────────────────────────────────────────────────────────────────

// ─── Flotte zuweisen Modal ─────────────────────────────────────────────────────

function AssignFleetModal({ ships, fleets, onClose, onAssigned }) {
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [busy, setBusy] = useState(false)
  const { addNotification } = useGameStore()

  const handleAssign = async () => {
    if (!selectedFleetId) return
    setBusy(true)
    try {
      const ids = ships.map(s => s.id)
      const { error } = await supabase
        .from('ships')
        .update({ fleet_id: selectedFleetId })
        .in('id', ids)
      if (error) throw error
      addNotification(`✅ ${ids.length} Schiff${ids.length !== 1 ? 'e' : ''} zugewiesen`, 'success')
      onAssigned()
      onClose()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      const ids = ships.map(s => s.id)
      const { error } = await supabase
        .from('ships')
        .update({ fleet_id: null })
        .in('id', ids)
      if (error) throw error
      addNotification(`✅ ${ids.length} Schiff${ids.length !== 1 ? 'e' : ''} aus Flotte entfernt`, 'success')
      onAssigned()
      onClose()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const availableFleets = fleets.filter(f => !f.is_in_transit)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="panel p-5 w-full max-w-sm space-y-4"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <p className="text-sm font-mono font-semibold text-slate-200">
            {ships.length} Schiff{ships.length !== 1 ? 'e' : ''} zuweisen
          </p>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={14} /></button>
        </div>

        {/* Schiffsnamen */}
        <div className="space-y-1">
          {ships.map(s => (
            <p key={s.id} className="text-xs font-mono text-slate-400">
              · {s.name ?? s.ship_designs?.name ?? '—'}
            </p>
          ))}
        </div>

        {/* Flotte wählen */}
        {availableFleets.length === 0 ? (
          <p className="text-xs font-mono text-slate-600">Keine Flotten verfügbar. Erstelle zuerst eine Flotte.</p>
        ) : (
          <div className="space-y-1.5">
            {availableFleets.map(f => (
              <button key={f.id}
                onClick={() => setSelectedFleetId(f.id)}
                className="w-full text-left px-3 py-2 rounded text-xs font-mono transition-all"
                style={{
                  background: selectedFleetId === f.id ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedFleetId === f.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: selectedFleetId === f.id ? '#a78bfa' : '#94a3b8',
                }}>
                <div className="flex justify-between items-center">
                  <span>{f.name ?? 'Flotte'}</span>
                  <span className="text-slate-600">{f.x} / {f.y} / {f.z}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {/* Aus Flotte entfernen — nur wenn mind. ein Schiff bereits in einer Flotte */}
          {ships.some(s => s.fleet_id) && (
            <button onClick={handleRemove} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <LogOut size={11} /> Aus Flotte
            </button>
          )}
          <button onClick={handleAssign}
            disabled={!selectedFleetId || busy}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-mono transition-all"
            style={{
              background: selectedFleetId ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selectedFleetId ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: selectedFleetId ? '#a78bfa' : '#334155',
            }}>
            <PlusCircle size={11} /> Zuweisen
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function ShipRow({ ship, design, chassis, fleet, planet, partDefs, onDetail, onGoToFleet, onAssign }) {
  const imgSrc = chassis?.image_key
    ? `/Starbound-Alpha/ships/${chassis.image_key}.png`
    : null

  const hpPct = ship.max_hp > 0 ? (ship.current_hp / ship.max_hp) * 100 : 0
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'

  return (
    <motion.div layout
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        background: 'rgba(4,13,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center"
        style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)' }}>
        {imgSrc
          ? <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-1" />
          : <span className="text-slate-600 text-lg">🚀</span>
        }
      </div>

      {/* Name */}
      <div className="w-36 flex-shrink-0">
        <p className="font-mono text-sm font-semibold text-slate-200 truncate">
          {ship.name ?? design?.name ?? 'Unbenannt'}
        </p>
        <p className="text-xs font-mono text-slate-600 truncate">{chassis?.name ?? '—'}</p>
      </div>

      {/* Flotte / Zuweisen */}
      <div className="w-28 flex-shrink-0">
        {fleet ? (
          <button onClick={() => onGoToFleet(fleet.id)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all"
            style={{
              background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.25)',
              color: '#a78bfa',
            }}>
            <Navigation size={10} />
            {fleet.name ?? 'Flotte'}
          </button>
        ) : (
          <button onClick={() => onAssign([ship])}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all"
            style={{
              background: 'rgba(34,211,238,0.06)',
              border: '1px solid rgba(34,211,238,0.15)',
              color: '#475569',
            }}>
            <PlusCircle size={10} />
            Zuweisen
          </button>
        )}
      </div>

      {/* HP */}
      <div className="w-28 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-slate-600">HP</span>
          <span className="text-xs font-mono font-semibold" style={{ color: hpColor }}>
            {fmt(ship.current_hp)} / {fmt(ship.max_hp)}
          </span>
        </div>
        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full transition-all"
            style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* Laderaum */}
      <div className="w-24 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Laderaum</p>
        <p className="text-xs font-mono font-semibold text-slate-300">{fmt(design?.total_cargo)}</p>
      </div>

      {/* Koordinaten */}
      <div className="w-32 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Position</p>
        <p className="text-xs font-mono text-slate-400">
          {fleet ? coords(fleet) : (planet ? `${planet.x ?? 0}/${planet.y ?? 0}/${planet.z ?? 0}` : '—')}
        </p>
      </div>

      {/* Geschwindigkeit */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Geschw.</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>
          {fmt(design?.total_speed)}
        </p>
      </div>

      {/* Detail Button */}
      <div className="flex-shrink-0 ml-auto">
        <button onClick={() => onDetail(ship)}
          className="p-1.5 rounded-full transition-all hover:bg-white/5"
          style={{
            border: '1px solid rgba(34,211,238,0.2)',
            color: '#22d3ee',
          }}
          title="Details">
          <Info size={13} />
        </button>
      </div>
    </motion.div>
  )
}

// ─── ShipsPage ────────────────────────────────────────────────────────────────

export default function ShipsPage() {
  const { player, planet } = useGameStore()
  const queryClient = useQueryClient()
  const [selectedShip, setSelectedShip] = useState(null)
  const [assignShips, setAssignShips] = useState(null) // Array von Schiffen für Modal

  // Schiffe laden mit Design
  const { data: ships = [], isLoading } = useQuery({
    queryKey: ['ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, ship_designs(*)')
        .eq('player_id', player.id)
        .order('created_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  // Flotten laden
  const { data: fleets = [] } = useQuery({
    queryKey: ['fleets-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  // Chassis-Definitionen
  const { data: chassisDefs = [] } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  // Bauteil-Definitionen
  const { data: partDefs = [] } = useQuery({
    queryKey: ['part-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('part_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const getFleet = (fleetId) => fleets.find(f => f.id === fleetId)
  const getChassis = (chassisId) => chassisDefs.find(c => c.id === chassisId)

  const selectedDesign = selectedShip?.ship_designs
  const selectedChassis = selectedDesign ? getChassis(selectedDesign.chassis_id) : null
  const selectedFleet = selectedShip?.fleet_id ? getFleet(selectedShip.fleet_id) : null

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Lade Schiffe...
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Schiffe</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {ships.length} Schiff{ships.length !== 1 ? 'e' : ''} in deiner Flotte
          </p>
        </div>
      </div>

      {/* Spalten-Header */}
      {ships.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1">
          <div className="w-10 flex-shrink-0" />
          <div className="w-36 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Name / Chassis</span>
          </div>
          <div className="w-28 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Flotte</span>
          </div>
          <div className="w-28 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Hülle</span>
          </div>
          <div className="w-24 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Laderaum</span>
          </div>
          <div className="w-32 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Position</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Geschw.</span>
          </div>
        </div>
      )}

      {/* Schiffsliste */}
      {ships.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">🚀</p>
          <p className="font-display text-slate-400 text-lg">Keine Schiffe vorhanden</p>
          <p className="text-slate-600 font-mono text-sm">
            Baue dein erstes Schiff in der Werft.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ships.map(ship => (
            <ShipRow
              key={ship.id}
              ship={ship}
              design={ship.ship_designs}
              chassis={getChassis(ship.ship_designs?.chassis_id)}
              fleet={ship.fleet_id ? getFleet(ship.fleet_id) : null}
              planet={planet}
              partDefs={partDefs}
              onDetail={setSelectedShip}
              onAssign={setAssignShips}
              onGoToFleet={(fleetId) => {
                window.location.href = `/fleet?highlight=${fleetId}`
              }}
            />
          ))}
        </div>
      )}

      {/* Detail Popup */}
      <AnimatePresence>
        {selectedShip && (
          <ShipDetailPopup
            ship={selectedShip}
            design={selectedDesign}
            chassis={selectedChassis}
            partDefs={partDefs}
            fleet={selectedFleet}
            planet={planet}
            onClose={() => setSelectedShip(null)}
          />
        )}
      </AnimatePresence>

      {/* Flotte zuweisen Modal */}
      <AnimatePresence>
        {assignShips && (
          <AssignFleetModal
            ships={assignShips}
            fleets={fleets}
            onClose={() => setAssignShips(null)}
            onAssigned={() => queryClient.invalidateQueries(['ships', player?.id])}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
