// src/pages/ShipyardPage.jsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Rocket, ChevronDown, ChevronUp, Lock, Hammer, Clock } from 'lucide-react'

const CLASS_LABELS = { Z: 'Klasse Z', A: 'Klasse A', B: 'Klasse B', C: 'Klasse C', D: 'Klasse D', E: 'Klasse E' }
const CLASS_COLORS = { Z: '#94a3b8', A: '#34d399', B: '#38bdf8', C: '#a78bfa', D: '#fb923c', E: '#f472b6' }

const PROFESSION_LABELS = { admiral: 'Admiral', trader: 'Händler', privateer: 'Freibeuter' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return n.toLocaleString()
}

function ChassisCard({ chassis, planet, player, shipyardLevel, hasTech }) {
  const [expanded, setExpanded] = useState(false)
  const [building, setBuilding] = useState(false)
  const { addNotification } = useGameStore()

  const locked = chassis.required_tech && !hasTech(chassis.required_tech)
  const wrongProfession = chassis.required_profession && player?.profession !== chassis.required_profession
  const noShipyard = shipyardLevel < 1

  const costs = {
    titan:      chassis.cost_titan      || 0,
    silizium:   chassis.cost_silizium   || 0,
    aluminium:  chassis.cost_aluminium  || 0,
    uran:       chassis.cost_uran       || 0,
    plutonium:  chassis.cost_plutonium  || 0,
  }

  const canAfford = Object.entries(costs).every(([res, amt]) => (planet?.[res] ?? 0) >= amt)
  const canBuild = !locked && !wrongProfession && !noShipyard && canAfford

  const handleBuild = async () => {
    if (!canBuild || building) return
    setBuilding(true)
    try {
      // Kosten abziehen
      const updates = {}
      for (const [res, amt] of Object.entries(costs)) {
        if (amt > 0) updates[res] = (planet[res] || 0) - amt
      }
      await supabase.from('planets').update(updates).eq('id', planet.id)

      // Flotte erstellen oder zu bestehender hinzufügen
      const { data: fleet } = await supabase
        .from('fleets')
        .select('id')
        .eq('player_id', player.id)
        .eq('status', 'docked')
        .single()

      let fleetId = fleet?.id
      if (!fleetId) {
        const { data: newFleet } = await supabase
          .from('fleets')
          .insert({ player_id: player.id, planet_id: planet.id, status: 'docked', name: 'Flotte 1' })
          .select()
          .single()
        fleetId = newFleet?.id
      }

      if (fleetId) {
        await supabase.from('ships').insert({
          fleet_id: fleetId,
          chassis_id: chassis.id,
          name: chassis.name,
          hp: chassis.base_hp,
          max_hp: chassis.base_hp,
          attack: chassis.base_attack,
          defense: chassis.base_defense,
          speed: chassis.base_speed,
          maneuver: chassis.base_maneuver,
          cargo_capacity: chassis.base_cargo,
          status: 'active'
        })
      }

      addNotification(`${chassis.name} gebaut!`, 'success')
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setBuilding(false)
    }
  }

  return (
    <motion.div
      layout
      className="panel overflow-hidden"
      style={{ opacity: (locked || wrongProfession || noShipyard) ? 0.5 : 1 }}
      whileHover={{ borderColor: 'rgba(34,211,238,0.25)' }}>

      {/* Header */}
      <div className="panel-header cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 flex-1">
          <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold"
            style={{ background: `${CLASS_COLORS[chassis.class]}20`, color: CLASS_COLORS[chassis.class], border: `1px solid ${CLASS_COLORS[chassis.class]}40` }}>
            {chassis.class}
          </span>
          <span className="font-semibold text-sm text-slate-200">{chassis.name}</span>
          {chassis.required_profession && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              {PROFESSION_LABELS[chassis.required_profession]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {locked && <Lock size={13} className="text-slate-600" />}
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>

      {/* Stats row */}
      <div className="px-3 py-2 grid grid-cols-4 gap-2 text-xs font-mono border-b border-cyan-500/10">
        {[
          { label: 'HP', value: chassis.base_hp },
          { label: 'ATK', value: chassis.base_attack },
          { label: 'DEF', value: chassis.base_defense },
          { label: 'SPD', value: chassis.base_speed },
          { label: 'MNV', value: chassis.base_maneuver },
          { label: 'Slots', value: chassis.total_cells },
          { label: 'Cargo', value: fmt(chassis.base_cargo) },
          { label: 'Werft', value: chassis.shipyard_space },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-slate-600 text-[10px]">{s.label}</div>
            <div className="text-slate-300">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Expanded: costs + build button */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="p-3 space-y-3">

              {/* Unlock info */}
              {locked && (
                <div className="text-sm text-amber-400/70 px-2 py-1.5 rounded"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  🔬 Benötigt Tech: {chassis.required_tech}
                </div>
              )}
              {wrongProfession && (
                <div className="text-sm text-red-400/70 px-2 py-1.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  ⚔️ Nur für {PROFESSION_LABELS[chassis.required_profession]}
                </div>
              )}
              {noShipyard && (
                <div className="text-sm text-red-400/70 px-2 py-1.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  🚀 Schiffswerft benötigt
                </div>
              )}

              {/* Kosten */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-1.5">Baukosten</p>
                <div className="space-y-1">
                  {Object.entries(costs).filter(([,v]) => v > 0).map(([res, amt]) => {
                    const have = planet?.[res] ?? 0
                    const rest = have - amt
                    const ok = rest >= 0
                    return (
                      <div key={res} className="grid text-sm font-mono px-2 py-1 rounded"
                        style={{ gridTemplateColumns: '1fr 70px 80px', background: 'rgba(4,13,26,0.6)' }}>
                        <span className="text-slate-400 capitalize">{res}</span>
                        <span className="text-right text-slate-300">{amt.toLocaleString()}</span>
                        <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                          {ok ? rest.toLocaleString() : `−${Math.abs(rest).toLocaleString()}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={handleBuild}
                disabled={!canBuild || building}
                className={`w-full btn-primary py-2 text-sm flex items-center justify-center gap-2 ${!canBuild ? 'opacity-40' : ''}`}>
                {building
                  ? <><Hammer size={14} className="animate-pulse" /> Wird gebaut...</>
                  : <><Rocket size={14} /> {chassis.name} bauen</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function ShipyardPage() {
  const { planet, player, buildings, hasTech } = useGameStore()
  const [classFilter, setClassFilter] = useState('all')

  const shipyardLevel = buildings.find(b => b.building_id === 'shipyard')?.level ?? 0

  const { data: chassisDefs } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*').order('class')
      return data ?? []
    },
    staleTime: Infinity
  })

  const { data: myShips } = useQuery({
    queryKey: ['my-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, fleets!inner(player_id)')
        .eq('fleets.player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 10000
  })

  const classes = ['all', ...new Set((chassisDefs ?? []).map(c => c.class))]
  const filtered = (chassisDefs ?? []).filter(c => classFilter === 'all' || c.class === classFilter)

  if (shipyardLevel < 1) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="panel p-8 text-center space-y-3">
          <Rocket size={48} className="mx-auto text-slate-600" />
          <h2 className="text-xl font-display text-slate-300">Schiffswerft nicht gebaut</h2>
          <p className="text-slate-500">Baue zuerst eine Schiffswerft auf deinem Planeten um Schiffe zu bauen.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Schiffswerft</h2>
          <p className="text-sm text-slate-500 font-mono">Lvl {shipyardLevel} · {shipyardLevel * 500} Kapazität</p>
        </div>
        <div className="text-sm text-slate-400 font-mono">
          {myShips?.length ?? 0} Schiffe in deiner Flotte
        </div>
      </div>

      {/* Klassen Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {classes.map(cls => (
          <button key={cls} onClick={() => setClassFilter(cls)}
            className="px-3 py-1.5 rounded text-sm font-mono transition-all"
            style={{
              background: classFilter === cls ? `${CLASS_COLORS[cls] ?? 'rgba(34,211,238,1)'}20` : 'rgba(255,255,255,0.04)',
              border: classFilter === cls ? `1px solid ${CLASS_COLORS[cls] ?? 'rgba(34,211,238,0.5)'}60` : '1px solid rgba(255,255,255,0.08)',
              color: classFilter === cls ? (CLASS_COLORS[cls] ?? '#22d3ee') : '#64748b'
            }}>
            {cls === 'all' ? 'Alle' : CLASS_LABELS[cls]}
          </button>
        ))}
      </div>

      {/* Chassis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(chassis => (
          <ChassisCard
            key={chassis.id}
            chassis={chassis}
            planet={planet}
            player={player}
            shipyardLevel={shipyardLevel}
            hasTech={hasTech}
          />
        ))}
      </div>
    </div>
  )
}
