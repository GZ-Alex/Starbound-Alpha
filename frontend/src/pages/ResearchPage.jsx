// src/pages/ResearchPage.jsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, CheckCircle, Lock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

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

const RESOURCE_LABELS = {
  silizium: 'Silizium', helium: 'Helium',
  titan: 'Titan', credits: 'Credits'
}

function TechCard({ tech, planet, hasTech, labLevel, researchers, onResearch }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const { addNotification } = useGameStore()

  const isResearched = hasTech(tech.id)
  const requiresMet = !tech.requires_techs?.length || tech.requires_techs.every(r => hasTech(r))
  const labOk = (labLevel ?? 0) >= 1
  const researcherBonus = (researchers?.length ?? 0) * 5

  const costs = {
    silizium: tech.cost_silizium || 0,
    helium:   tech.cost_helium   || 0,
    titan:    tech.cost_titan    || 0,
    credits:  tech.cost_credits  || 0,
  }

  const canAfford = Object.entries(costs).every(([res, amt]) => amt === 0 || (planet?.[res] ?? 0) >= amt)
  const canResearch = !isResearched && requiresMet && labOk && canAfford

  const successChance = Math.min(99, (tech.base_success_chance || 80) + researcherBonus)

  const handleResearch = async () => {
    if (!canResearch || loading) return
    setLoading(true)
    try {
      // Kosten abziehen
      const updates = {}
      for (const [res, amt] of Object.entries(costs)) {
        if (amt > 0) updates[res] = (planet[res] || 0) - amt
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('planets').update(updates).eq('id', planet.id)
      }

      // Würfelwurf für Erfolg
      const roll = Math.random() * 100
      if (roll <= successChance) {
        await supabase.from('player_technologies').insert({
          player_id: (await supabase.auth.getUser()).data?.user?.id || planet.owner_id,
          tech_id: tech.id
        })
        addNotification(`✅ ${tech.name} erfolgreich erforscht!`, 'success')
        onResearch?.()
      } else {
        addNotification(`❌ Forschung fehlgeschlagen (${Math.round(roll)}% > ${successChance}%). Ressourcen verbraucht.`, 'error')
        onResearch?.()
      }
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const branchColor = BRANCH_COLORS[tech.branch] ?? '#94a3b8'

  return (
    <motion.div
      layout
      className="panel overflow-hidden"
      style={{ opacity: (!requiresMet || !labOk) ? 0.5 : 1 }}
      whileHover={{ borderColor: isResearched ? 'rgba(34,211,238,0.3)' : 'rgba(34,211,238,0.2)' }}>

      {/* Header */}
      <div className="panel-header cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 flex-1">
          {isResearched
            ? <CheckCircle size={15} className="text-cyan-400 flex-shrink-0" />
            : requiresMet && labOk
            ? <FlaskConical size={15} className="text-slate-500 flex-shrink-0" />
            : <Lock size={15} className="text-slate-600 flex-shrink-0" />
          }
          <span className={`font-semibold text-sm ${isResearched ? 'text-cyan-400' : 'text-slate-200'}`}>
            {tech.name}
          </span>
          <span className="ml-auto text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: `${branchColor}15`, color: branchColor, border: `1px solid ${branchColor}30` }}>
            T{tech.tier}
          </span>
        </div>
        <div className="ml-2">
          {expanded ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </div>
      </div>

      {/* Description */}
      <div className="px-3 pb-2">
        <p className="text-sm text-slate-400">{tech.description}</p>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-3 pb-3 space-y-3 border-t border-cyan-500/10 pt-3">

              {/* Voraussetzungen */}
              {tech.requires_techs?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-1">Voraussetzungen</p>
                  <div className="flex flex-wrap gap-1">
                    {tech.requires_techs.map(r => (
                      <span key={r} className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{
                          background: hasTech(r) ? 'rgba(34,211,238,0.1)' : 'rgba(239,68,68,0.1)',
                          color: hasTech(r) ? '#22d3ee' : '#f87171',
                          border: `1px solid ${hasTech(r) ? 'rgba(34,211,238,0.2)' : 'rgba(239,68,68,0.2)'}`
                        }}>
                        {hasTech(r) ? '✓' : '✗'} {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Kosten */}
              {Object.entries(costs).some(([,v]) => v > 0) && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-1">Forschungskosten</p>
                  <div className="space-y-1">
                    {Object.entries(costs).filter(([,v]) => v > 0).map(([res, amt]) => {
                      const have = planet?.[res] ?? 0
                      const rest = have - amt
                      const ok = rest >= 0
                      return (
                        <div key={res} className="grid text-sm font-mono px-2 py-1 rounded"
                          style={{ gridTemplateColumns: '1fr 70px 80px', background: 'rgba(4,13,26,0.6)' }}>
                          <span className="text-slate-400">{RESOURCE_LABELS[res] ?? res}</span>
                          <span className="text-right text-slate-300">{amt.toLocaleString()}</span>
                          <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                            {ok ? rest.toLocaleString() : `−${Math.abs(rest).toLocaleString()}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Erfolgschance */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-mono">Erfolgschance</span>
                <span className="font-mono font-bold"
                  style={{ color: successChance >= 90 ? '#34d399' : successChance >= 70 ? '#fbbf24' : '#f87171' }}>
                  {successChance}%
                </span>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${successChance}%`,
                    background: successChance >= 90 ? '#34d399' : successChance >= 70 ? '#fbbf24' : '#f87171'
                  }} />
              </div>

              {/* Forschungszeit */}
              <div className="text-sm text-slate-500 font-mono">
                Dauer: {tech.base_research_min} min
                {researcherBonus > 0 && <span className="text-green-500 ml-1">(+{researcherBonus}% durch Forscher)</span>}
              </div>

              {isResearched ? (
                <div className="text-sm text-center py-2 text-cyan-400 font-mono"
                  style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: 6 }}>
                  ✓ Bereits erforscht
                </div>
              ) : (
                <button
                  onClick={handleResearch}
                  disabled={!canResearch || loading}
                  className={`w-full btn-primary py-2 text-sm flex items-center justify-center gap-2 ${!canResearch ? 'opacity-40' : ''}`}>
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /> Forsche...</>
                    : !labOk ? '🔬 Labor benötigt'
                    : !requiresMet ? '🔒 Voraussetzungen fehlen'
                    : !canAfford ? '✗ Ressourcen fehlen'
                    : <><FlaskConical size={14} /> Erforschen</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function ResearchPage() {
  const { planet, player, technologies, hasTech, buildings, researchers } = useGameStore()
  const [branchFilter, setBranchFilter] = useState(0)
  const [refresh, setRefresh] = useState(0)

  const labLevel = buildings.find(b => b.building_id === 'research_lab')?.level ?? 0

  const { data: techDefs, refetch } = useQuery({
    queryKey: ['tech-defs', refresh],
    queryFn: async () => {
      const { data } = await supabase
        .from('tech_definitions')
        .select('*')
        .order('branch')
        .order('tier')
      return data ?? []
    },
    staleTime: 30000
  })

  const branches = [0, ...new Set((techDefs ?? []).map(t => t.branch))]
  const filtered = (techDefs ?? []).filter(t => branchFilter === 0 || t.branch === branchFilter)

  const researchedCount = (techDefs ?? []).filter(t => hasTech(t.id)).length

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
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Forschung</h2>
          <p className="text-sm text-slate-500 font-mono">
            Labor Lvl {labLevel} · {researchedCount}/{techDefs?.length ?? 0} erforscht
            {researchers?.length > 0 && ` · ${researchers.length} Forscher aktiv`}
          </p>
        </div>
      </div>

      {/* Branch Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {branches.map(b => (
          <button key={b} onClick={() => setBranchFilter(b)}
            className="px-3 py-1.5 rounded text-sm font-mono transition-all"
            style={{
              background: branchFilter === b ? `${BRANCH_COLORS[b] ?? 'rgba(34,211,238,1)'}20` : 'rgba(255,255,255,0.04)',
              border: branchFilter === b ? `1px solid ${BRANCH_COLORS[b] ?? 'rgba(34,211,238,0.5)'}50` : '1px solid rgba(255,255,255,0.08)',
              color: branchFilter === b ? (BRANCH_COLORS[b] ?? '#22d3ee') : '#64748b'
            }}>
            {b === 0 ? 'Alle' : BRANCH_LABELS[b]}
          </button>
        ))}
      </div>

      {/* Tech Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(tech => (
          <TechCard
            key={tech.id}
            tech={tech}
            planet={planet}
            hasTech={hasTech}
            labLevel={labLevel}
            researchers={researchers}
            onResearch={() => { refetch(); setRefresh(r => r + 1) }}
          />
        ))}
      </div>
    </div>
  )
}
