// Dashboard.jsx — v1.1
// src/pages/Dashboard.jsx
import { useState, useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Plus, Minus, ChevronDown, ChevronUp, FlaskConical } from 'lucide-react'

// ─── Konstanten ───────────────────────────────────────────────────────────────

const CHEAT_RESOURCES = [
  'titan','silizium','helium','nahrung','wasser',
  'bauxit','aluminium','uran','plutonium','wasserstoff','credits'
]

// Erhöhbare Rassen-Felder (mit zugehörigem skill_key und Bonus je Punkt)
const RACE_BONUS_FIELDS = [
  { key: 'mine_production_bonus',     label: 'Minenproduktion',            unit: '%',  skill: 'mine_production',    bonusPerPt: 10,  flatUnit: '%'    },
  { key: 'extra_mines_per_hq_level',  label: 'Zusatzminen / HQ-Level',     unit: '',   skill: 'extra_mines_per_hq', bonusPerPt: 5,   flatUnit: ' Minen/Lvl' },
  { key: 'research_chance_bonus',     label: 'Forschungschance',           unit: '%',  skill: 'research_chance',    bonusPerPt: 5,   flatUnit: '%'    },
  { key: 'research_cost_bonus',       label: 'Forschungskosten',           unit: '%',  skill: 'research_cost',      bonusPerPt: -5,  flatUnit: '%'    },
  { key: 'researcher_cost_bonus',     label: 'Forscherausbildung',         unit: '%',  skill: 'researcher_cost',    bonusPerPt: -3,  flatUnit: '%'    },
  { key: 'ship_attack_bonus',         label: 'Schiffsangriff',             unit: '%',  skill: 'ship_attack',        bonusPerPt: 3,   flatUnit: '%'    },
  { key: 'ship_defense_bonus',        label: 'Schiffsverteidigung',        unit: '%',  skill: 'ship_defense',       bonusPerPt: 5,   flatUnit: '%'    },
  { key: 'ship_hp_bonus',             label: 'Hüllenpunkte',               unit: '%',  skill: 'ship_hp',            bonusPerPt: 2,   flatUnit: '%'    },
  { key: 'ship_cargo_bonus',          label: 'Schiffsladeraum',            unit: '%',  skill: 'ship_cargo',         bonusPerPt: 3,   flatUnit: '%'    },
  { key: 'military_speed_bonus',      label: 'Militärgeschwindigkeit',     unit: '%',  skill: 'military_speed',     bonusPerPt: 4,   flatUnit: '%'    },
  { key: 'civilian_speed_bonus',      label: 'Zivilgeschwindigkeit',       unit: '%',  skill: 'civilian_speed',     bonusPerPt: 4,   flatUnit: '%'    },
  { key: 'def_defense_bonus',         label: 'Verteidigung (Türme)',       unit: '%',  skill: 'def_defense',        bonusPerPt: 5,   flatUnit: '%'    },
  { key: 'def_attack_bonus',          label: 'Angriff (Türme)',            unit: '%',  skill: 'def_attack',         bonusPerPt: 5,   flatUnit: '%'    },
  { key: 'shipyard_capacity_bonus',   label: 'Werftkapazität',             unit: '',   skill: 'shipyard_capacity',  bonusPerPt: 150, flatUnit: ''     },
]

// Fixwerte (nicht erhöhbar per Skillpunkt)
const RACE_FIXED_FIELDS = [
  { key: 'accuracy_fixed',   label: 'Zielgenauigkeit', unit: '' },
  { key: 'maneuver_fixed',   label: 'Manöver',         unit: '' },
  { key: 'scan_range_fixed', label: 'Scanreichweite',  unit: ' Parsec' },
  { key: 'tax_income_fixed', label: 'Steuereinnahmen', unit: '%' },
]

function fmtVal(val, unit) {
  const sign = val > 0 ? '+' : ''
  if (unit === '%')       return `${sign}${val}%`
  if (unit === ' Parsec') return `${sign}${val} Parsec`
  return `${sign}${val}`
}

function fmtBonus(bonusPerPt, pts, flatUnit) {
  const v = bonusPerPt * pts
  const sign = v > 0 ? '+' : ''
  return `${sign}${v}${flatUnit}`
}

// EP-Berechnung: Lvl 2 → 1 Punkt, dann alle 2 Level +1, max 15
function calcAvailablePoints(hqLevel) {
  if (!hqLevel || hqLevel < 2) return 0
  return Math.min(15, Math.floor((hqLevel - 2) / 2) + 1)
}

// ─── SkillRow ─────────────────────────────────────────────────────────────────

function SkillRow({ field, race, skillPoints, freePoints, onAdd, onRemove, saving }) {
  const raceVal  = Number(race?.[field.key] ?? 0)
  const spent    = skillPoints[field.skill] ?? 0
  const bonusVal = field.bonusPerPt * spent
  const total    = raceVal + bonusVal

  const isNegGood  = field.bonusPerPt < 0
  const totalColor = total === 0 ? '#94a3b8'
    : isNegGood
      ? (total < 0 ? '#34d399' : '#f87171')
      : (total > 0 ? '#34d399' : '#f87171')
  const raceColor  = raceVal === 0 ? '#94a3b8'
    : isNegGood
      ? (raceVal < 0 ? '#34d399' : '#f87171')
      : (raceVal > 0 ? '#34d399' : '#f87171')

  const canAdd    = freePoints > 0 && !saving
  const canRemove = spent > 0 && !saving

  // Bonus/Punkt — immer anzeigen, unabhängig von spent
  const bonusLabel = field.flatUnit.includes('/') 
    ? `${field.bonusPerPt > 0 ? '+' : ''}${field.bonusPerPt}${field.flatUnit}`
    : `${field.bonusPerPt > 0 ? '+' : ''}${field.bonusPerPt}${field.flatUnit} / EP`


  const TECH_LABELS = {
    attack:          'Schiff Angriff',
    defense:         'Schiff Verteidigung',
    hp:              'Schiff HP',
    speed:           'Schiff Geschwindigkeit',
    military_speed:  'Schiff Militärgeschw.',
    civilian_speed:  'Schiff Zivilgeschw.',
    cargo:           'Schiff Laderaum',
    maneuver:        'Schiff Manöver',
    accuracy:        'Schiff Trefferchance',
    accuracy_fixed:  'Schiff Trefferchance',
    def_attack:      'Verteidigung Angriff',
    def_defense:     'Verteidigung Abwehr',
    def_hp:          'Verteidigung HP',
    research_chance: 'Forschung Chance',
    research_speed:  'Forschung Geschw.',
    mine_production: 'Planet Minenertrag',
    planet_defense:  'Planet Verteidigung',
  }
  const techLbl = (key) => TECH_LABELS[key.replace(/_fixed$|_flat$|_bonus$/, '')] ?? key.replace(/_/g, ' ')
  const techBonusItems = [
    ...Object.entries(techBonuses.pct).map(([key, val]) => ({
      key,
      label: techLbl(key),
      display: `${val * 100 > 0 ? '+' : ''}${(val * 100).toFixed(1)}%`,
    })),
    ...Object.entries(techBonuses.flat).map(([key, val]) => ({
      key: key + '_flat',
      label: techLbl(key),
      display: `${val > 0 ? '+' : ''}${Number.isInteger(val) ? val : val.toFixed(1)}`,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="grid items-center py-2.5 px-3 rounded transition-colors hover:bg-white/[0.03]"
      style={{ gridTemplateColumns: '1fr 64px 96px 96px 72px', gap: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>

      {/* Attribut */}
      <span className="text-sm text-slate-200 leading-tight">{field.label}</span>

      {/* Rasse */}
      <span className="text-sm font-mono text-right" style={{ color: raceColor }}>
        {fmtVal(raceVal, field.unit)}
      </span>

      {/* EP-Steuerung */}
      <div className="flex items-center justify-center gap-1.5">
        <button onClick={() => canRemove && onRemove(field.skill)} disabled={!canRemove}
          className="w-6 h-6 rounded flex items-center justify-center transition-all"
          style={{
            background: canRemove ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: `1px solid ${canRemove ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`,
            color: canRemove ? '#94a3b8' : '#2d3f52',
          }}>
          <Minus size={9} />
        </button>
        <span className="w-5 text-center text-sm font-mono font-bold"
          style={{ color: spent > 0 ? '#f1f5f9' : '#94a3b8' }}>
          {spent}
        </span>
        <button onClick={() => canAdd && onAdd(field.skill)} disabled={!canAdd}
          className="w-6 h-6 rounded flex items-center justify-center transition-all"
          style={{
            background: canAdd ? 'rgba(34,211,238,0.1)' : 'transparent',
            border: `1px solid ${canAdd ? 'rgba(34,211,238,0.28)' : 'rgba(255,255,255,0.05)'}`,
            color: canAdd ? '#22d3ee' : '#2d3f52',
          }}>
          <Plus size={9} />
        </button>
      </div>

      {/* Bonus / EP — immer sichtbar */}
      <span className="text-sm font-mono text-right" style={{ color: '#94a3b8' }}>
        {bonusLabel}
      </span>

      {/* Gesamt */}
      <span className="text-base font-mono font-bold text-right" style={{ color: totalColor }}>
        {fmtVal(total, field.unit)}
      </span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { player, planet, buildings, refreshPlanet } = useGameStore()
  const queryClient = useQueryClient()
  const [cheating,  setCheating]  = useState(false)
  const [cheatDone, setCheatDone] = useState(false)
  const [showTechs, setShowTechs] = useState(false)
  const [saving,    setSaving]    = useState(false)

  const hqLevel     = buildings?.find(b => b.building_id === 'hq')?.level ?? 0
  const totalPoints = calcAvailablePoints(hqLevel)
  const nextPointAt = hqLevel < 2 ? 2 : hqLevel % 2 === 0 ? hqLevel + 2 : hqLevel + 1

  // Rasse
  const { data: race } = useQuery({
    queryKey: ['race', player?.race_id],
    queryFn: async () => {
      const { data } = await supabase.from('races').select('*').eq('id', player.race_id).single()
      return data
    },
    enabled: !!player?.race_id,
    staleTime: Infinity,
  })

  // Skillpunkte
  const { data: skillRows = [] } = useQuery({
    queryKey: ['player-skills', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_skills').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  // Tech-Defs + eigene Techs
  const { data: allTechs = [] } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('tech_definitions').select('*')
      return data ?? []
    },
    staleTime: 60000,
  })

  const { data: myTechRows = [] } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_technologies').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  const skillPoints = useMemo(() =>
    Object.fromEntries(skillRows.map(r => [r.skill_key, r.points_spent ?? 0])),
    [skillRows]
  )
  const spentTotal = Object.values(skillPoints).reduce((a, b) => a + b, 0)
  const freePoints = totalPoints - spentTotal

  // Tech-Boni: _fixed/_flat = absolute Zahlen, sonst Dezimal-Prozent (0.05 = 5%)
  const isFlat = (key) => key.endsWith('_fixed') || key.endsWith('_flat')

  const techBonuses = useMemo(() => {
    const pct  = {}  // Dezimal-Prozent: 0.05 × level
    const flat = {}  // Absolute Zahlen: 1 × level
    for (const row of myTechRows) {
      const tech = allTechs.find(t => t.id === row.tech_id)
      if (!tech?.effects || (row.level ?? 0) <= 0) continue
      if ((row.level ?? 0) < (tech.reveal_level ?? 5)) continue
      for (const [k, v] of Object.entries(tech.effects)) {
        const per = typeof v === 'number' ? v : 0
        if (isFlat(k)) {
          flat[k] = (flat[k] ?? 0) + per * row.level
        } else {
          pct[k] = (pct[k] ?? 0) + per * row.level
        }
      }
    }
    return { pct, flat }
  }, [myTechRows, allTechs])

  const updateSkill = async (skillKey, delta) => {
    if (saving || !player) return
    const current = skillPoints[skillKey] ?? 0
    const next    = current + delta
    if (next < 0 || (delta > 0 && freePoints <= 0)) return
    setSaving(true)
    try {
      await supabase.from('player_skills').upsert(
        { player_id: player.id, skill_key: skillKey, points_spent: next },
        { onConflict: 'player_id,skill_key' }
      )
      await supabase.rpc('recalc_ship_stats_for_player', { p_player_id: player.id })
      queryClient.invalidateQueries(['player-skills', player.id])
    } finally { setSaving(false) }
  }

  const handleCheat = async () => {
    if (!planet || cheating) return
    setCheating(true)
    try {
      const upd = {}
      for (const r of CHEAT_RESOURCES) upd[r] = (planet[r] ?? 0) + 10000
      await supabase.from('planets').update(upd).eq('id', planet.id)
      await refreshPlanet()
      setCheatDone(true)
      setTimeout(() => setCheatDone(false), 3000)
    } catch (e) { console.error(e) } finally { setCheating(false) }
  }

  const profLabel = { trader: 'Händler', admiral: 'Admiral', privateer: 'Freibeuter' }

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">
        Willkommen, Commander {player?.username}
      </h2>

      {/* ── Rasse + Skills — volle Breite ── */}
      <div className="panel p-4 space-y-3">

          {/* Panel-Header */}
          <div className="panel-header -mx-4 -mt-4 px-4 flex items-center justify-between">
            <span>
              <span className="text-slate-200">{race?.name ?? player?.race_id ?? '—'}</span>
              {player?.profession && (
                <span className="ml-2 text-xs font-mono text-slate-300">
                  · {profLabel[player.profession] ?? player.profession}
                </span>
              )}
            </span>
            {/* EP-Badge */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-slate-400">EP</span>
              <span className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                style={{
                  background: freePoints > 0 ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${freePoints > 0 ? 'rgba(34,211,238,0.28)' : 'rgba(255,255,255,0.08)'}`,
                  color: freePoints > 0 ? '#22d3ee' : '#94a3b8',
                }}>
                {freePoints} / {totalPoints}
              </span>
            </div>
          </div>

          {race?.description && (
            <p className="text-xs text-slate-300 italic px-1">{race.description}</p>
          )}

          {/* HQ-Info */}
          <p className="text-sm font-mono px-1" style={{ color: '#94a3b8' }}>
            HQ Level <span style={{ color: '#94a3b8' }}>{hqLevel}</span>
            {totalPoints < 15 && <span> · nächster EP bei Level <span style={{ color: '#22d3ee' }}>{nextPointAt}</span></span>}
            {totalPoints >= 15 && <span style={{ color: '#f59e0b' }}> · Maximale EP erreicht</span>}
          </p>

          {/* Spalten-Header */}
          <div className="grid px-3 pb-2 text-xs font-mono uppercase tracking-wider"
            style={{ gridTemplateColumns: '1fr 64px 96px 96px 72px', gap: '0 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: '#94a3b8' }}>Attribut</span>
            <span className="text-right" style={{ color: '#94a3b8' }}>Rasse</span>
            <span className="text-center" style={{ color: '#94a3b8' }}>EP</span>
            <span className="text-right" style={{ color: '#94a3b8' }}>Bonus / EP</span>
            <span className="text-right" style={{ color: '#94a3b8' }}>Gesamt</span>
          </div>

          {RACE_BONUS_FIELDS.map(field => (
            <SkillRow
              key={field.skill}
              field={field}
              race={race}
              skillPoints={skillPoints}
              freePoints={freePoints}
              onAdd={k => updateSkill(k, 1)}
              onRemove={k => updateSkill(k, -1)}
              saving={saving}
            />
          ))}

          {/* Fixwerte */}
          <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-xs font-mono text-slate-400 uppercase tracking-widest px-2 mb-1">
              Fixwerte
            </p>
            {RACE_FIXED_FIELDS.map(f => {
              const val = Number(race?.[f.key] ?? 0)
              return (
                <div key={f.key} className="flex justify-between px-2 py-1">
                  <span className="text-sm text-slate-300">{f.label}</span>
                  <span className="text-sm font-mono" style={{ color: val === 0 ? '#64748b' : '#cbd5e1' }}>
                    {fmtVal(val, f.unit)}
                  </span>
                </div>
              )
            })}
          </div>
      </div>

      {/* ── Status + Tech-Boni ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Status */}
        <div className="panel p-4">
          <div className="panel-header -mx-4 -mt-4 mb-3 px-4">Status</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-300">Planet</span>
              <span className="font-mono text-cyan-400">{planet?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Koordinaten</span>
              <span className="font-mono text-xs text-slate-400">
                {planet ? `${planet.x} / ${planet.y} / ${planet.z}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Techs erforscht</span>
              <span className="font-mono text-slate-400">{myTechRows.length}</span>
            </div>
          </div>
        </div>

          {/* Technologie-Boni */}
          <div className="panel p-4">
            <button
              onClick={() => setShowTechs(v => !v)}
              className="w-full text-left panel-header -mx-4 -mt-4 px-4 flex items-center justify-between"
              style={{ cursor: 'pointer' }}>
              <span className="flex items-center gap-2">
                <FlaskConical size={12} className="text-slate-300" />
                Technologie-Boni
                <span className="text-xs font-mono text-slate-400">
                  ({Object.keys(techBonuses.pct).length + Object.keys(techBonuses.flat).length})
                </span>
              </span>
              {showTechs
                ? <ChevronUp size={13} className="text-slate-400" />
                : <ChevronDown size={13} className="text-slate-400" />}
            </button>

            <AnimatePresence initial={false}>
              {showTechs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden">
                  <div className="pt-3 space-y-0.5">
                    {Object.keys(techBonuses.pct).length + Object.keys(techBonuses.flat).length === 0 ? (
                      <p className="text-sm text-slate-400 px-1">
                        Noch keine sichtbaren Technologieboni erforscht.
                      </p>
                    ) : techBonusItems.map(({ key, label, display }) => (
                            <div key={key}
                              className="flex justify-between items-center px-2 py-1 rounded"
                              style={{ background: 'rgba(52,211,153,0.03)', border: '1px solid rgba(52,211,153,0.06)' }}>
                              <span className="text-sm text-slate-400 font-mono">{label}</span>
                              <span className="text-sm font-mono font-semibold" style={{ color: '#34d399' }}>
                                {display}
                              </span>
                            </div>
                          ))
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!showTechs && (
              <p className="text-xs text-slate-400 font-mono pt-3 px-1">
                {Object.keys(techBonuses.pct).length + Object.keys(techBonuses.flat).length === 0
                  ? 'Noch keine sichtbaren Technologieboni.'
                  : `${Object.keys(techBonuses.pct).length + Object.keys(techBonuses.flat).length} aktive Boni — zum Anzeigen klicken`}
              </p>
            )}
          </div>

      </div>

      {/* Dev-Tools */}
      <div className="panel p-4" style={{ borderColor: 'rgba(251,191,36,0.18)' }}>
        <div className="panel-header -mx-4 -mt-4 mb-3 px-4 text-amber-400">⚠ Dev-Tools</div>
        <button onClick={handleCheat} disabled={cheating || !planet}
          className="flex items-center gap-2 px-4 py-2 rounded font-mono text-sm font-bold transition-all"
          style={{
            background: cheatDone ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.1)',
            border: `1px solid ${cheatDone ? 'rgba(34,197,94,0.4)' : 'rgba(251,191,36,0.3)'}`,
            color: cheatDone ? '#4ade80' : '#fbbf24',
            opacity: cheating ? 0.5 : 1,
          }}>
          <Zap size={14} />
          {cheatDone ? '✓ +10.000 erhalten!' : cheating ? 'Lädt...' : '+10.000 alle Ressourcen'}
        </button>
        <p className="text-xs text-slate-400 mt-2 font-mono">Gibt 10.000 von jeder Ressource (außer Energie)</p>
      </div>

    </div>
  )
}
