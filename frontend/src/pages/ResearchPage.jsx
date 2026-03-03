// src/pages/ResearchPage.jsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, CheckCircle, Lock, ChevronDown, ChevronUp, Loader2, BookOpen } from 'lucide-react'

const BRANCH_LABELS = {
  1: 'Naturkunde',
  2: 'Technik',
  3: 'Kriegskunst',
  4: 'Schutz & Struktur',
  5: 'Mathematik & Analytik',
  6: 'Politik & Wirtschaft',
}
const BRANCH_COLORS = {
  1: '#34d399', 2: '#38bdf8', 3: '#f472b6',
  4: '#fb923c', 5: '#a78bfa', 6: '#fbbf24',
}
const BRANCH_ICONS = {
  1: '🌿', 2: '⚙️', 3: '⚔️', 4: '🛡️', 5: '📐', 6: '⚖️',
}

const RESOURCE_LABELS = {
  silizium: 'Silizium', helium: 'Helium', titan: 'Titan', credits: 'Credits'
}

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return n.toLocaleString()
}

// -------------------------------------------------------
// Single Tech Node
// -------------------------------------------------------
function TechNode({ tech, planet, hasTech, labLevel, researchers, onResearched, color }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const { addNotification, player } = useGameStore()

  const isResearched  = hasTech(tech.id)
  const requiresMet   = !tech.requires_techs?.length || tech.requires_techs.every(r => hasTech(r))
  const labOk         = (labLevel ?? 0) >= 1
  const isFlavor      = false // Alle Techs verhalten sich gleich — keine Unterscheidung sichtbar

  const costs = {
    silizium: tech.cost_silizium || 0,
    helium:   tech.cost_helium   || 0,
    titan:    tech.cost_titan    || 0,
    credits:  tech.cost_credits  || 0,
  }
  const hasCosts      = Object.values(costs).some(v => v > 0)
  const canAfford     = !hasCosts || Object.entries(costs).every(([res, amt]) => amt === 0 || (planet?.[res] ?? 0) >= amt)
  const canResearch   = !isResearched && requiresMet && labOk && canAfford

  const researcherBonus = (researchers?.length ?? 0) * 5
  const successChance   = isFlavor ? 100 : Math.min(99, (tech.base_success_chance || 80) + researcherBonus)

  const handleResearch = async () => {
    if (!canResearch || loading) return
    setLoading(true)
    try {
      // Kosten abziehen
      if (hasCosts) {
        const updates = {}
        for (const [res, amt] of Object.entries(costs)) {
          if (amt > 0) updates[res] = (planet[res] || 0) - amt
        }
        await supabase.from('planets').update(updates).eq('id', planet.id)
      }

      const roll = Math.random() * 100
      if (roll <= successChance) {
        await supabase.from('player_technologies').insert({
          player_id: player.id,
          tech_id: tech.id
        })
        addNotification(`✅ ${tech.name} erforscht!`, 'success')
        onResearched?.()
      } else {
        addNotification(`❌ Fehlgeschlagen (${Math.round(roll)}% > ${successChance}%). Ressourcen verbraucht.`, 'error')
        onResearched?.()
      }
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const borderColor = isResearched ? color : requiresMet && labOk ? `${color}40` : 'rgba(255,255,255,0.06)'
  const bgColor     = isResearched ? `${color}12` : isFlavor ? 'rgba(255,255,255,0.02)' : 'rgba(4,13,26,0.6)'

  return (
    <motion.div
      layout
      className="rounded-lg overflow-hidden"
      style={{ border: `1px solid ${borderColor}`, background: bgColor, opacity: (!requiresMet) ? 0.55 : 1 }}>

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}>

        {/* Status icon */}
        <div className="flex-shrink-0">
          {isResearched
            ? <CheckCircle size={14} style={{ color }} />
            : isFlavor
            ? <BookOpen size={14} className="text-slate-500" />
            : requiresMet && labOk
            ? <FlaskConical size={14} className="text-slate-500" />
            : <Lock size={14} className="text-slate-700" />}
        </div>

        <span className={`flex-1 text-sm font-semibold ${isResearched ? '' : 'text-slate-300'}`}
          style={isResearched ? { color } : {}}>
          {tech.name}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Tier badge */}
          <span className="text-xs font-mono px-1 py-0.5 rounded"
            style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
            T{tech.tier}
          </span>
          {isFlavor && (
            <span className="text-xs font-mono px-1 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b' }}>
              Lore
            </span>
          )}
          {expanded ? <ChevronUp size={12} className="text-slate-600" /> : <ChevronDown size={12} className="text-slate-600" />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-2">

              {/* Description */}
              <p className="text-sm text-slate-400 leading-relaxed">{tech.description}</p>

              {/* Voraussetzungen */}
              {tech.requires_techs?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tech.requires_techs.map(r => (
                    <span key={r} className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{
                        background: hasTech(r) ? 'rgba(34,211,238,0.1)' : 'rgba(239,68,68,0.1)',
                        color: hasTech(r) ? '#22d3ee' : '#f87171',
                        border: `1px solid ${hasTech(r) ? 'rgba(34,211,238,0.2)' : 'rgba(239,68,68,0.2)'}`
                      }}>
                      {hasTech(r) ? '✓' : '✗'} {r}
                    </span>
                  ))}
                </div>
              )}

              {/* Kosten */}
              {hasCosts && (
                <div className="space-y-0.5">
                  {Object.entries(costs).filter(([,v]) => v > 0).map(([res, amt]) => {
                    const have  = planet?.[res] ?? 0
                    const rest  = have - amt
                    const ok    = rest >= 0
                    return (
                      <div key={res} className="grid text-xs font-mono px-2 py-1 rounded"
                        style={{ gridTemplateColumns: '1fr 55px 65px', background: 'rgba(4,13,26,0.6)' }}>
                        <span className="text-slate-400">{RESOURCE_LABELS[res] ?? res}</span>
                        <span className="text-right text-slate-300">{fmt(amt)}</span>
                        <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                          {ok ? fmt(rest) : `−${fmt(Math.abs(rest))}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Erfolgschance */}
              {!isFlavor && (
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span className="text-slate-500">Erfolgschance</span>
                    <span style={{ color: successChance >= 90 ? '#34d399' : successChance >= 70 ? '#fbbf24' : '#f87171' }}>
                      {successChance}%
                    </span>
                  </div>
                  <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-1 rounded-full" style={{
                      width: `${successChance}%`,
                      background: successChance >= 90 ? '#34d399' : successChance >= 70 ? '#fbbf24' : '#f87171'
                    }} />
                  </div>
                </div>
              )}

              {/* Button */}
              {isResearched ? (
                <div className="text-xs text-center py-1.5 rounded font-mono"
                  style={{ background: `${color}08`, border: `1px solid ${color}20`, color }}>
                  ✓ Erforscht
                </div>
              ) : (
                <button
                  onClick={handleResearch}
                  disabled={!canResearch || loading}
                  className={`w-full btn-primary py-1.5 text-xs flex items-center justify-center gap-1.5 ${!canResearch ? 'opacity-40' : ''}`}>
                  {loading
                    ? <><Loader2 size={12} className="animate-spin" /> Forsche...</>
                    : !labOk         ? '🔬 Labor benötigt'
                    : !requiresMet   ? '🔒 Voraussetzungen fehlen'
                    : !canAfford     ? '✗ Ressourcen fehlen'
                    : isFlavor       ? <><BookOpen size={12} /> Verstehen</>
                    : <><FlaskConical size={12} /> Erforschen</>}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// -------------------------------------------------------
// Branch Column
// -------------------------------------------------------
function BranchColumn({ branch, techs, planet, hasTech, labLevel, researchers, onResearched }) {
  const color = BRANCH_COLORS[branch] ?? '#94a3b8'
  // Group by tier
  const tiers = [...new Set(techs.map(t => t.tier))].sort((a, b) => a - b)

  return (
    <div className="flex flex-col min-w-0">
      {/* Branch header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b"
        style={{ borderColor: `${color}30` }}>
        <span className="text-lg">{BRANCH_ICONS[branch]}</span>
        <div>
          <p className="text-sm font-display font-bold" style={{ color }}>{BRANCH_LABELS[branch]}</p>
          <p className="text-xs text-slate-600 font-mono">
            {techs.filter(t => hasTech(t.id)).length}/{techs.length} erforscht
          </p>
        </div>
      </div>

      {/* Tiers */}
      <div className="space-y-2">
        {tiers.map(tier => {
          const tierTechs = techs.filter(t => t.tier === tier)
          return (
            <div key={tier}>
              {/* Tier label */}
              <p className="text-xs font-mono text-slate-700 mb-1 pl-1">Tier {tier}</p>
              <div className="space-y-1.5">
                {tierTechs.map(tech => (
                  <TechNode
                    key={tech.id}
                    tech={tech}
                    planet={planet}
                    hasTech={hasTech}
                    labLevel={labLevel}
                    researchers={researchers}
                    onResearched={onResearched}
                    color={color}
                  />
                ))}
              </div>
              {/* Connector line to next tier */}
              {tier < Math.max(...tiers) && (
                <div className="flex justify-center my-1">
                  <div className="w-px h-4" style={{ background: `${color}25` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -------------------------------------------------------
// Main Page
// -------------------------------------------------------
export default function ResearchPage() {
  const { planet, player, hasTech, buildings, researchers } = useGameStore()
  const [branchFilter, setBranchFilter] = useState(0)
  const queryClient = useQueryClient()

  const labLevel = buildings.find(b => b.building_id === 'research_lab')?.level ?? 0

  const { data: techDefs } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tech_definitions')
        .select('*')
        .order('branch')
        .order('tier')
        .order('id')
      return data ?? []
    },
    staleTime: 30000
  })

  const { data: myTechs, refetch: refetchTechs } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_technologies')
        .select('tech_id')
        .eq('player_id', player.id)
      return data?.map(t => t.tech_id) ?? []
    },
    enabled: !!player,
  })

  const handleResearched = () => {
    refetchTechs()
    queryClient.invalidateQueries(['tech-defs'])
  }

  const branches     = [...new Set((techDefs ?? []).map(t => t.branch))].sort()
  const totalDone    = (techDefs ?? []).filter(t => hasTech(t.id)).length
  const shownBranches = branchFilter === 0 ? branches : [branchFilter]

  if (labLevel < 1) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="panel p-8 text-center space-y-3">
          <FlaskConical size={48} className="mx-auto text-slate-600" />
          <h2 className="text-xl font-display text-slate-300">Forschungszentrum nicht gebaut</h2>
          <p className="text-slate-500">Baue zuerst ein Forschungszentrum auf deinem Planeten.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Forschung</h2>
          <p className="text-sm text-slate-500 font-mono">
            Labor Lvl {labLevel} · {totalDone}/{techDefs?.length ?? 0} erforscht
            {researchers?.length > 0 && ` · ${researchers.length} Forscher (+${researchers.length * 5}% Chance)`}
          </p>
        </div>
      </div>

      {/* Branch Filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setBranchFilter(0)}
          className="px-3 py-1.5 rounded text-sm font-mono transition-all"
          style={{
            background: branchFilter === 0 ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: branchFilter === 0 ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
            color: branchFilter === 0 ? '#22d3ee' : '#64748b'
          }}>
          Alle Zweige
        </button>
        {branches.map(b => (
          <button key={b} onClick={() => setBranchFilter(b)}
            className="px-3 py-1.5 rounded text-sm font-mono transition-all"
            style={{
              background: branchFilter === b ? `${BRANCH_COLORS[b]}20` : 'rgba(255,255,255,0.04)',
              border: branchFilter === b ? `1px solid ${BRANCH_COLORS[b]}50` : '1px solid rgba(255,255,255,0.08)',
              color: branchFilter === b ? BRANCH_COLORS[b] : '#64748b'
            }}>
            {BRANCH_ICONS[b]} {BRANCH_LABELS[b]}
          </button>
        ))}
      </div>

      {/* Tech Tree — columns per branch */}
      <div
        className="grid gap-6 overflow-x-auto pb-4"
        style={{ gridTemplateColumns: `repeat(${shownBranches.length}, minmax(240px, 1fr))` }}>
        {shownBranches.map(branch => {
          const branchTechs = (techDefs ?? []).filter(t => t.branch === branch)
          return (
            <BranchColumn
              key={branch}
              branch={branch}
              techs={branchTechs}
              planet={planet}
              hasTech={hasTech}
              labLevel={labLevel}
              researchers={researchers}
              onResearched={handleResearched}
            />
          )
        })}
      </div>
    </div>
  )
}
