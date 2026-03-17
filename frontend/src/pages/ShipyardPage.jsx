// src/pages/ShipyardPage.jsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Rocket, X, ChevronRight, Hammer, AlertTriangle, Lock } from 'lucide-react'

const CLASS_LABELS  = { Z: 'Klasse Z', A: 'Klasse A', B: 'Klasse B', C: 'Klasse C', D: 'Klasse D', E: 'Klasse E' }
const CLASS_COLORS  = { Z: '#94a3b8', A: '#34d399', B: '#38bdf8', C: '#a78bfa', D: '#fb923c', E: '#f472b6' }
const CLASS_DESC    = {
  Z: 'Leichte Sonden und Frachter. Günstig, keine Bewaffnung.',
  A: 'Mittlere Frachter. Gute Kapazität, geringe Kampfkraft.',
  B: 'Leichte Kampfschiffe. Schnell und wendig.',
  C: 'Mittelschwere Kampfschiffe. Solide Allrounder.',
  D: 'Schwere Kreuzer. Hoher Schaden, träge.',
  E: 'Schlachtschiffe. Nur für Admirale. Vernichtende Kraft.',
}
const PROFESSION_LABELS = { admiral: 'Admiral', trader: 'Händler', privateer: 'Freibeuter' }

const PART_CATEGORIES = [
  { id: 'engine',           label: 'Antrieb',     required: true  },
  { id: 'booster',          label: 'Booster',     required: false },
  { id: 'primary_weapon',   label: 'Primärwaffe', required: false },
  { id: 'turret',           label: 'Turret',      required: false },
  { id: 'armor',            label: 'Panzerung',   required: false },
  { id: 'shield_hp',        label: 'HP-Schild',   required: false },
  { id: 'shield_def',       label: 'Def-Schild',  required: false },
  { id: 'cargo',            label: 'Ladebucht',   required: false },
  { id: 'mining',           label: 'Bergbau',     required: false },
  { id: 'scanner_asteroid', label: 'Ast-Scanner', required: false },
  { id: 'scanner_npc',      label: 'NPC-Scanner', required: false },
  { id: 'extension',        label: 'Erweiterung', required: false },
]

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

// ─── Ship Designer Modal ───────────────────────────────────────────────────────

function ShipDesigner({ chassis, planet, player, partDefs, hasTech, onClose, onBuilt }) {
  const [selectedParts, setSelectedParts] = useState([])
  const [building, setBuilding] = useState(false)
  const { addNotification } = useGameStore()

  const getAvailableParts = (category) =>
    (partDefs ?? []).filter(p => {
      if (p.category !== category) return false
      if (p.weapon_class && p.weapon_class !== chassis.class) return false
      if (p.required_profession && p.required_profession !== player?.profession) return false
      return true // required_tech wird unten pro Teil geprüft
    })

  const isPartLocked = (part) => part.required_tech && !hasTech(part.required_tech)

  const baseStats = {
    hp: chassis.base_hp, attack: chassis.base_attack, defense: chassis.base_defense,
    speed: chassis.base_speed, maneuver: chassis.base_maneuver, cargo: chassis.base_cargo,
    scan_range: 0, ast_scan_range: 0, npc_scan_range: 0,
  }

  const stats = selectedParts.reduce((acc, pid) => {
    const p = (partDefs ?? []).find(d => d.id === pid)
    if (!p) return acc
    return {
      hp:             acc.hp             + (p.hp_bonus       || 0),
      attack:         acc.attack         + (p.attack_bonus   || 0) - (p.attack_malus   || 0),
      defense:        acc.defense        + (p.defense_bonus  || 0),
      speed:          acc.speed          + (p.speed_bonus    || 0) - (p.speed_malus    || 0),
      maneuver:       acc.maneuver       + (p.maneuver_bonus || 0) - (p.maneuver_malus || 0),
      cargo:          acc.cargo          + (p.cargo_bonus    || 0),
      scan_range:     acc.scan_range     + (p.scan_range     || 0),
      ast_scan_range: acc.ast_scan_range + (p.category === 'scanner_asteroid' ? (p.scan_range || 0) : 0),
      npc_scan_range: acc.npc_scan_range + (p.category === 'scanner_npc'      ? (p.scan_range || 0) : 0),
    }
  }, { ...baseStats })

  const totalCells = selectedParts.reduce((sum, pid) => {
    const p = (partDefs ?? []).find(d => d.id === pid)
    return sum + (p?.cells_required || 0)
  }, 0)

  const COST_KEYS = ['titan', 'silizium', 'aluminium', 'uran', 'plutonium']
  const costs = COST_KEYS.reduce((acc, k) => {
    let total = chassis[`cost_${k}`] || 0
    selectedParts.forEach(pid => {
      const p = (partDefs ?? []).find(d => d.id === pid)
      total += p?.[`cost_${k}`] || 0
    })
    if (total > 0) acc[k] = total
    return acc
  }, {})

  const canAfford = Object.entries(costs).every(([res, amt]) => (planet?.[res] ?? 0) >= amt)
  const hasEngine = selectedParts.some(pid => (partDefs ?? []).find(d => d.id === pid)?.category === 'engine')
  const cellsOk   = totalCells <= chassis.total_cells
  const canBuild  = hasEngine && cellsOk && canAfford

  const togglePart = (pid) =>
    setSelectedParts(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid])

  const handleBuild = async () => {
    if (!canBuild || building) return
    setBuilding(true)
    try {
      const updates = {}
      for (const [res, amt] of Object.entries(costs)) updates[res] = (planet[res] || 0) - amt
      await supabase.from('planets').update(updates).eq('id', planet.id)

      const buildMinutes = Math.max(2, Math.floor((chassis.shipyard_space ?? 100) / 50))

      const { data: design, error: designErr } = await supabase.from('ship_designs').insert({
        player_id:       player.id,
        name:            chassis.name,
        chassis_id:      chassis.id,
        installed_parts: selectedParts,
        total_hp:        stats.hp,
        total_defense:   stats.defense,
        total_attack:    stats.attack,
        total_speed:     stats.speed,
        total_maneuver:  stats.maneuver,
        total_cargo:     stats.cargo,
        total_scan_range: stats.scan_range,
        ast_scan_range:  stats.ast_scan_range,
        npc_scan_range:  stats.npc_scan_range,
        total_cells_used: totalCells,
        shipyard_space:  chassis.shipyard_space ?? 100,
        build_minutes:   buildMinutes,
        cost_titan:      costs.titan ?? 0,
        cost_silizium:   costs.silizium ?? 0,
        cost_aluminium:  costs.aluminium ?? 0,
        cost_uran:       costs.uran ?? 0,
        cost_plutonium:  costs.plutonium ?? 0,
        is_valid:        true,
      }).select().single()

      if (designErr) throw designErr

      const finishAt = new Date(Date.now() + buildMinutes * 60000).toISOString()
      const { error: queueErr } = await supabase.from('ship_build_queue').insert({
        planet_id:         planet.id,
        design_id:         design.id,
        quantity:          1,
        minutes_remaining: buildMinutes,
        finish_at:         finishAt,
      })
      if (queueErr) throw queueErr

      addNotification(`🚀 ${chassis.name} in Bau (${buildMinutes} Min.)`, 'success')
      onBuilt?.()
      onClose()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setBuilding(false)
    }
  }

  const color = CLASS_COLORS[chassis.class]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-lg flex flex-col"
        style={{ background: '#040d1a', border: '1px solid rgba(34,211,238,0.2)' }}>

        <div className="flex items-center justify-between p-4 border-b border-cyan-500/15">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded text-sm font-mono font-bold"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
              {chassis.class}
            </span>
            <h2 className="text-lg font-display font-bold text-slate-200">{chassis.name} — Designer</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Part selector */}
          <div className="w-60 flex-shrink-0 border-r border-cyan-500/10 overflow-y-auto p-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-500 mb-1">
                <span>Zellen</span>
                <span style={{ color: totalCells > chassis.total_cells ? '#f87171' : '#22d3ee' }}>
                  {totalCells} / {chassis.total_cells}
                </span>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(totalCells / chassis.total_cells * 100, 100)}%`,
                    background: totalCells > chassis.total_cells ? '#ef4444' : '#22d3ee',
                  }} />
              </div>
            </div>

            {PART_CATEGORIES.map(({ id, label, required }) => {
              const parts = getAvailableParts(id)
              if (parts.length === 0) return null
              return (
                <div key={id}>
                  <p className="text-xs font-mono uppercase tracking-widest mb-1"
                    style={{ color: required ? '#fbbf24' : '#475569' }}>
                    {label}{required ? ' *' : ''}
                  </p>
                  <div className="space-y-0.5">
                    {parts.map(part => {
                      const sel    = selectedParts.includes(part.id)
                      const locked = isPartLocked(part)
                      const full   = !sel && !locked && (totalCells + (part.cells_required || 0)) > chassis.total_cells
                      const disabled = (full && !sel) || locked
                      return (
                        <button key={part.id} onClick={() => !disabled && togglePart(part.id)}
                          disabled={disabled}
                          className="w-full text-left px-2 py-1.5 rounded text-xs transition-all"
                          style={{
                            background: locked
                              ? 'rgba(255,255,255,0.01)'
                              : sel ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                            border: locked
                              ? '1px solid rgba(255,255,255,0.04)'
                              : sel ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.06)',
                            color: locked ? '#1e293b' : sel ? '#22d3ee' : full ? '#1e293b' : '#94a3b8',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}>
                          <div className="flex justify-between items-center">
                            <span className="truncate">{part.name}</span>
                            {locked
                              ? <Lock size={9} style={{ color: '#1e293b', flexShrink: 0 }} />
                              : <span className="text-slate-600 ml-1 flex-shrink-0">{part.cells_required}Z</span>
                            }
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-44 h-44 rounded overflow-hidden"
                style={{ border: '1px solid rgba(34,211,238,0.15)' }}>
                <img src={`/Starbound-Alpha/ships/${chassis.id}.png`} alt={chassis.name}
                  className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                {[
                  ['HP', stats.hp, baseStats.hp],
                  ['Angriff', stats.attack, baseStats.attack],
                  ['Verteidigung', stats.defense, baseStats.defense],
                  ['Geschw.', stats.speed, baseStats.speed],
                  ['Manöver', stats.maneuver, baseStats.maneuver],
                  ['Laderaum', stats.cargo, baseStats.cargo],
                ].map(([l, v, b]) => (
                  <div key={l} className="px-3 py-2 rounded"
                    style={{ background: 'rgba(7,20,40,0.6)', border: '1px solid rgba(34,211,238,0.08)' }}>
                    <div className="text-xs text-slate-500 font-mono">{l}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-mono font-bold text-slate-200">{v}</span>
                      {v - b !== 0 && (
                        <span className={`text-xs font-mono ${v > b ? 'text-green-400' : 'text-red-400'}`}>
                          {v > b ? `+${v - b}` : v - b}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!hasEngine && (
              <div className="flex items-center gap-2 text-sm text-amber-400 px-3 py-2 rounded"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <AlertTriangle size={14} /> Kein Antrieb — Schiff kann nicht gebaut werden
              </div>
            )}

            {Object.keys(costs).length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Gesamtkosten</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(costs).map(([res, amt]) => {
                    const rest = (planet?.[res] ?? 0) - amt
                    const ok   = rest >= 0
                    return (
                      <div key={res} className="grid text-sm font-mono px-2 py-1 rounded"
                        style={{ gridTemplateColumns: '1fr 55px 65px', background: 'rgba(4,13,26,0.6)' }}>
                        <span className="text-slate-400 capitalize">{res}</span>
                        <span className="text-right text-slate-300">{fmt(amt)}</span>
                        <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                          {ok ? fmt(rest) : `-${fmt(Math.abs(rest))}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-cyan-500/15">
          <button onClick={onClose} className="btn-ghost text-sm">Abbrechen</button>
          <button onClick={handleBuild} disabled={!canBuild || building}
            className={`btn-primary py-2 px-6 text-sm flex items-center gap-2 ${!canBuild ? 'opacity-40' : ''}`}>
            {building
              ? <><Hammer size={14} className="animate-pulse" /> Wird gebaut...</>
              : <><Rocket size={14} /> {chassis.name} bauen</>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Chassis Card ──────────────────────────────────────────────────────────────

function ChassisCard({ chassis, player, shipyardLevel, onSelect }) {
  const noYard    = shipyardLevel < 1
  const wrongProf = chassis.required_profession && player?.profession !== chassis.required_profession
  const disabled  = noYard || wrongProf
  const color     = CLASS_COLORS[chassis.class]

  return (
    <motion.div
      className="panel overflow-hidden"
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }}
      whileHover={!disabled ? { borderColor: `${color}50` } : {}}
      onClick={() => !disabled && onSelect(chassis)}>
      <div className="relative overflow-hidden" style={{ height: 300 }}>
        <img src={`/Starbound-Alpha/ships/${chassis.id}.png`} alt={chassis.name}
          className="w-full h-full object-cover"
          style={{ filter: disabled ? 'grayscale(80%) brightness(0.4)' : 'brightness(0.9)' }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(4,13,26,0.97) 100%)' }} />
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold"
          style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>
          {chassis.class}
        </div>
        {!disabled && (
          <div className="absolute bottom-8 right-2 text-xs text-cyan-400/50 font-mono flex items-center gap-1">
            <ChevronRight size={11} /> Designer
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-slate-200">{chassis.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{CLASS_DESC[chassis.class]}</p>
          </div>
          {chassis.required_profession && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              {PROFESSION_LABELS[chassis.required_profession]}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 text-xs font-mono text-center">
          {[['HP', chassis.base_hp], ['ATK', chassis.base_attack], ['SPD', chassis.base_speed], ['MNV', chassis.base_maneuver]].map(([l, v]) => (
            <div key={l} className="rounded py-1" style={{ background: 'rgba(7,20,40,0.5)' }}>
              <div className="text-slate-600">{l}</div>
              <div className="text-slate-300">{v}</div>
            </div>
          ))}
        </div>
        {wrongProf && (
          <p className="text-xs text-red-400/60 font-mono">
            Nur für {PROFESSION_LABELS[chassis.required_profession]}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ShipyardPage() {
  const { planet, player, buildings, hasTech, refreshTechnologies } = useGameStore()
  const [classFilter, setClassFilter] = useState('all')
  const [designer, setDesigner]       = useState(null)
  const [techReady, setTechReady]     = useState(false)
  const queryClient = useQueryClient()

  const shipyardLevel = buildings.find(b => b.building_id === 'shipyard')?.level ?? 0

  // Technologien beim Mount sofort laden, dann alle 30s auffrischen
  useEffect(() => {
    refreshTechnologies().then(() => setTechReady(true))
    const interval = setInterval(() => {
      refreshTechnologies()
      queryClient.invalidateQueries({ queryKey: ['part-defs'] })
      queryClient.invalidateQueries({ queryKey: ['chassis-defs'] })
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const { data: chassisDefs } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*').order('class')
      return data ?? []
    },
    staleTime: 30000, // 30s — wird oben manuell invalidiert
  })

  const { data: partDefs } = useQuery({
    queryKey: ['part-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('ship_part_definitions').select('*')
      return data ?? []
    },
    staleTime: 30000, // 30s — wird oben manuell invalidiert
  })

  const { data: myShips, refetch: refetchShips } = useQuery({
    queryKey: ['my-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('ships')
        .select('*, ship_designs(shipyard_space), fleets!inner(player_id)')
        .eq('fleets.player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: buildQueue = [], refetch: refetchBuildQueue } = useQuery({
    queryKey: ['ship-build-queue', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('ship_build_queue')
        .select('*, ship_designs(name, shipyard_space, chassis_id)')
        .eq('planet_id', planet.id)
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 10000,
  })

  const shipyardCapacity = shipyardLevel * 500
  const usedByShips = (myShips ?? []).reduce((sum, s) => sum + (s.ship_designs?.shipyard_space ?? 0), 0)
  const usedByQueue = buildQueue.reduce((sum, q) => sum + (q.ship_designs?.shipyard_space ?? 0) * (q.quantity ?? 1), 0)
  const usedCapacity = usedByShips + usedByQueue
  const freeCapacity = shipyardCapacity - usedCapacity

  const allChassis     = chassisDefs ?? []
  const available      = allChassis.filter(c => !c.required_tech || hasTech(c.required_tech))
  const classes        = ['all', ...new Set(allChassis.map(c => c.class))]
  const filtered       = available.filter(c => classFilter === 'all' || c.class === classFilter)

  if (shipyardLevel < 1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <Rocket size={48} className="mx-auto text-slate-600" />
        <h2 className="text-xl font-display text-slate-300">Schiffswerft nicht gebaut</h2>
        <p className="text-slate-500">Baue zuerst eine Schiffswerft auf deinem Planeten.</p>
      </div>
    </div>
  )

  if (!techReady) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Lade Werft...
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Schiffswerft</h2>
          <p className="text-sm text-slate-500 font-mono">Lvl {shipyardLevel} · {myShips?.length ?? 0} Schiffe</p>
        </div>
        <div className="panel p-3 min-w-[200px]">
          <div className="flex justify-between text-xs font-mono text-slate-500 mb-1.5">
            <span>Werftkapazität</span>
            <span style={{ color: freeCapacity <= 0 ? '#f87171' : '#22d3ee' }}>
              {usedCapacity} / {shipyardCapacity}
            </span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-2 rounded-full transition-all"
              style={{
                width: `${shipyardCapacity > 0 ? Math.min(usedCapacity / shipyardCapacity * 100, 100) : 0}%`,
                background: freeCapacity <= 0 ? '#ef4444' : '#22d3ee',
              }} />
          </div>
          <p className="text-xs font-mono mt-1" style={{ color: freeCapacity <= 0 ? '#f87171' : '#4ade80' }}>
            {freeCapacity <= 0 ? 'Keine Kapazität frei' : `${freeCapacity} frei`}
          </p>
        </div>
      </div>

      {/* Build Queue */}
      {buildQueue.length > 0 && (
        <div className="panel p-3 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">In Bau</p>
          {buildQueue.map(q => {
            const finishMs  = q.finish_at ? new Date(q.finish_at).getTime() : 0
            const remaining = Math.max(0, Math.floor((finishMs - Date.now()) / 1000))
            const mins = Math.floor(remaining / 60)
            const secs = remaining % 60
            return (
              <div key={q.id} className="flex items-center gap-3 text-sm font-mono">
                <Hammer size={13} className="text-amber-400 animate-pulse flex-shrink-0" />
                <span className="text-slate-300 flex-1">{q.ship_designs?.name ?? 'Schiff'}</span>
                <span className="text-amber-400">{mins}m {secs}s</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Class Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {classes.map(cls => {
          const clsColor = CLASS_COLORS[cls] ?? '#22d3ee'
          const isActive = classFilter === cls
          return (
            <button key={cls} onClick={() => setClassFilter(cls)}
              className="px-3 py-1.5 rounded text-sm font-mono transition-all"
              style={{
                background: isActive ? `${clsColor}20` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? `${clsColor}50` : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? clsColor : '#64748b',
              }}>
              {cls === 'all' ? 'Alle' : CLASS_LABELS[cls]}
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="panel p-8 text-center text-slate-500 text-sm">
          Keine Schiffe verfügbar. Erforsche neue Technologien im Forschungszentrum.
        </div>
      )}

      {/* Chassis Grid — nur freigeschaltete */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(chassis => (
            <ChassisCard key={chassis.id} chassis={chassis} player={player}
              shipyardLevel={shipyardLevel} onSelect={setDesigner}
              locked={false} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {designer && (
          <ShipDesigner
            chassis={designer} planet={planet} player={player}
            partDefs={partDefs} hasTech={hasTech}
            onClose={() => setDesigner(null)}
            onBuilt={() => { refetchShips(); refetchBuildQueue(); }}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
