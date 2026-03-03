// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  FlaskConical, ChevronDown, ChevronRight, Lock, Loader2,
  Search, CheckCircle, AlertTriangle, Clock
} from 'lucide-react'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const BRANCH_LABELS = { 1:'Naturkunde', 2:'Technik', 3:'Kriegskunst', 4:'Schutz & Struktur', 5:'Mathematik & Analytik', 6:'Politik & Wirtschaft' }
const BRANCH_COLORS = { 1:'#34d399', 2:'#38bdf8', 3:'#f472b6', 4:'#fb923c', 5:'#a78bfa', 6:'#fbbf24' }
const BRANCH_ICONS  = { 1:'🌿', 2:'⚙️', 3:'⚔️', 4:'🛡️', 5:'📐', 6:'⚖️' }

const RESOURCE_LABELS = { silizium:'Silizium', helium:'Helium', titan:'Titan', credits:'Credits' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString()
}

function fmtTime(minutes) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// Cost for researching to next level
function calcCost(tech, currentLevel) {
  const scale = Math.pow(tech.cost_per_level_scale ?? 1.3, currentLevel)
  return {
    silizium: Math.floor((tech.cost_silizium || 0) * scale),
    helium:   Math.floor((tech.cost_helium   || 0) * scale),
    titan:    Math.floor((tech.cost_titan    || 0) * scale),
    credits:  Math.floor((tech.cost_credits  || 0) * scale),
  }
}

// ─────────────────────────────────────────────
// Countdown hook
// ─────────────────────────────────────────────
function useCountdown(finishAt) {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!finishAt) return
    const tick = () => {
      const diff = new Date(finishAt) - new Date()
      if (diff <= 0) { setRemaining('Fertig!'); return }
      const m = Math.floor(diff / 60000), s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${String(s).padStart(2,'0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [finishAt])
  return remaining
}

// ─────────────────────────────────────────────
// Single Tech Node
// ─────────────────────────────────────────────
function TechNode({ tech, myTechMap, myDiscoveries, planet, labLevel, researchers, color, depth, onRefresh, activeQueue, allTechs }) {
  const [expanded, setExpanded]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [searching, setSearching] = useState(false)
  const { player, addNotification } = useGameStore()
  const queueClient = useQueryClient()

  const myEntry      = myTechMap[tech.id]           // { level, ... } or undefined
  const currentLevel = myEntry?.level ?? 0
  const isDiscovered = !!myDiscoveries[tech.id] || currentLevel > 0
  const isMaxed      = tech.max_level && currentLevel >= tech.max_level
  const inQueue      = activeQueue?.tech_id === tech.id
  const countdown    = useCountdown(inQueue ? activeQueue.finish_at : null)

  // What the player can see about this tech
  const revealed     = currentLevel >= (tech.reveal_level ?? 5)

  // Children of this tech that the player has discovered or that are not hidden
  const children = allTechs.filter(t => t.parent_tech === tech.id && (myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0 || !t.hidden))

  const costs    = calcCost(tech, currentLevel)
  const hasCosts = Object.values(costs).some(v => v > 0)
  const canAfford = !hasCosts || Object.entries(costs).every(([res, amt]) => amt === 0 || (planet?.[res] ?? 0) >= amt)
  const labOk    = labLevel >= (tech.requires_lab_level ?? 1)
  const canResearch = !isMaxed && !inQueue && labOk && canAfford && !activeQueue

  const researcherBonus = (researchers?.length ?? 0) * 5
  const successChance   = Math.min(99, (tech.base_success_chance || 80) + researcherBonus)

  // Children that are still hidden (candidates for discovery)
  const hiddenChildren = allTechs.filter(t => t.parent_tech === tech.id && t.hidden && !myDiscoveries[t.id] && !(myTechMap[t.id]?.level ?? 0))

  const handleResearch = async () => {
    if (!canResearch || loading) return
    setLoading(true)
    try {
      // Deduct costs
      if (hasCosts) {
        const updates = {}
        for (const [res, amt] of Object.entries(costs)) {
          if (amt > 0) updates[res] = (planet[res] || 0) - amt
        }
        await supabase.from('planets').update(updates).eq('id', planet.id)
      }

      const finishAt = new Date(Date.now() + (tech.cycle_minutes ?? 2) * 60 * 1000).toISOString()
      await supabase.from('research_queue').insert({
        player_id: player.id,
        tech_id: tech.id,
        target_level: currentLevel + 1,
        cycles_remaining: 1,
        finish_at: finishAt,
      })
      addNotification(`🔬 ${tech.name} Lv${currentLevel + 1} gestartet`, 'success')
      onRefresh()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (searching || hiddenChildren.length === 0 || !canAfford) return
    setSearching(true)
    try {
      // Discovery roll: 30% base chance per cycle
      const roll = Math.random() * 100
      const discoveryChance = 30 + researcherBonus
      if (roll <= discoveryChance) {
        const pick = hiddenChildren[Math.floor(Math.random() * hiddenChildren.length)]
        await supabase.from('player_discoveries').upsert({ player_id: player.id, tech_id: pick.id })
        addNotification(`🔭 Neue Technologie entdeckt: ${pick.name}!`, 'success')
      } else {
        addNotification(`🔭 Suche abgeschlossen — nichts gefunden (${Math.round(roll)}% > ${discoveryChance}%)`, 'info')
      }
      onRefresh()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const indent = depth * 20
  const borderColor = currentLevel > 0 ? color : isDiscovered ? `${color}40` : 'rgba(255,255,255,0.06)'

  return (
    <div style={{ marginLeft: indent }}>
      <motion.div
        layout
        className="rounded-lg overflow-hidden mb-1.5"
        style={{ border: `1px solid ${borderColor}`, background: currentLevel > 0 ? `${color}10` : 'rgba(4,13,26,0.6)' }}>

        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          {/* Tree connector */}
          {depth > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1" style={{ color: `${color}40` }}>
              <ChevronRight size={12} />
            </div>
          )}

          {/* Status */}
          <div className="flex-shrink-0">
            {currentLevel > 0
              ? <CheckCircle size={14} style={{ color }} />
              : isDiscovered
              ? <FlaskConical size={14} className="text-slate-500" />
              : <Lock size={14} className="text-slate-700" />}
          </div>

          {/* Name — hidden if not discovered */}
          <span className={`flex-1 text-sm font-semibold ${currentLevel > 0 ? '' : 'text-slate-400'}`}
            style={currentLevel > 0 ? { color } : {}}>
            {isDiscovered ? tech.name : '??? Unbekannte Technologie'}
          </span>

          {/* Level badge */}
          {currentLevel > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
              Lv {currentLevel}{tech.max_level ? `/${tech.max_level}` : ''}
            </span>
          )}

          {/* In queue indicator */}
          {inQueue && (
            <span className="text-xs font-mono text-amber-400 flex items-center gap-1 flex-shrink-0">
              <Clock size={11} /> {countdown}
            </span>
          )}

          <div className="flex-shrink-0 ml-1">
            {expanded ? <ChevronDown size={12} className="text-slate-600" /> : <ChevronRight size={12} className="text-slate-600" />}
          </div>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && isDiscovered && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">

                {/* Description */}
                <p className="text-sm text-slate-400 leading-relaxed">{tech.description}</p>

                {/* Revealed effect */}
                {revealed && tech.effects && Object.keys(tech.effects).length > 0 && (
                  <div className="px-2 py-2 rounded text-sm"
                    style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">Effekt (Lv {currentLevel})</p>
                    {Object.entries(tech.effects).map(([k, v]) => (
                      <div key={k} className="text-sm font-mono" style={{ color }}>
                        +{(v * currentLevel).toFixed(1)} {k}
                      </div>
                    ))}
                  </div>
                )}

                {/* Locked effect hint */}
                {!revealed && currentLevel > 0 && (
                  <div className="px-2 py-2 rounded text-sm text-slate-600"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    🔒 Effekt wird bei Lv {tech.reveal_level ?? 5} enthüllt
                  </div>
                )}

                {/* Unlocks */}
                {revealed && (tech.unlocks_part || tech.unlocks_chassis) && (
                  <div className="px-2 py-1.5 rounded text-sm"
                    style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                    {tech.unlocks_part    && <p style={{ color }}>🔧 Schaltet frei: {tech.unlocks_part}</p>}
                    {tech.unlocks_chassis && <p style={{ color }}>🚀 Schaltet frei: {tech.unlocks_chassis}</p>}
                  </div>
                )}
                {!revealed && (tech.unlocks_part || tech.unlocks_chassis) && currentLevel > 0 && (
                  <p className="text-xs text-slate-600 font-mono">🔒 Freischaltung bei Lv {tech.reveal_level ?? 5} sichtbar</p>
                )}

                {/* Costs for next level */}
                {!isMaxed && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-1">
                      Kosten für Lv {currentLevel + 1}
                    </p>
                    <div className="space-y-0.5">
                      {Object.entries(costs).filter(([,v]) => v > 0).map(([res, amt]) => {
                        const have = planet?.[res] ?? 0
                        const rest = have - amt
                        const ok   = rest >= 0
                        return (
                          <div key={res} className="grid text-xs font-mono px-2 py-1 rounded"
                            style={{ gridTemplateColumns: '1fr 55px 65px', background: 'rgba(4,13,26,0.7)' }}>
                            <span className="text-slate-400">{RESOURCE_LABELS[res] ?? res}</span>
                            <span className="text-right text-slate-300">{fmt(amt)}</span>
                            <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                              {ok ? fmt(rest) : `−${fmt(Math.abs(rest))}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Research info */}
                <div className="flex justify-between text-xs font-mono text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={11} /> {fmtTime(tech.cycle_minutes ?? 2)} / Zyklus</span>
                  <span>{successChance}% Erfolgschance</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {/* Research button */}
                  {isMaxed ? (
                    <div className="flex-1 text-center text-xs py-1.5 rounded font-mono text-slate-600"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      Max. Level erreicht
                    </div>
                  ) : inQueue ? (
                    <div className="flex-1 text-center text-xs py-1.5 rounded font-mono text-amber-400"
                      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                      <Clock size={11} className="inline mr-1" />{countdown}
                    </div>
                  ) : activeQueue ? (
                    <div className="flex-1 text-center text-xs py-1.5 rounded font-mono text-slate-600"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      Labor belegt
                    </div>
                  ) : (
                    <button onClick={handleResearch} disabled={!canResearch || loading}
                      className={`flex-1 btn-primary py-1.5 text-xs flex items-center justify-center gap-1.5 ${!canResearch ? 'opacity-40' : ''}`}>
                      {loading
                        ? <><Loader2 size={11} className="animate-spin" /> Starte...</>
                        : !labOk     ? '🔬 Labor Lv ' + (tech.requires_lab_level ?? 1) + ' benötigt'
                        : !canAfford ? '✗ Ressourcen fehlen'
                        : <><FlaskConical size={11} /> Lv {currentLevel + 1} erforschen</>}
                    </button>
                  )}

                  {/* Search button — only if has hidden children and tech is leveled */}
                  {currentLevel > 0 && hiddenChildren.length > 0 && (
                    <button onClick={handleSearch} disabled={searching || !!activeQueue}
                      className="px-3 py-1.5 text-xs rounded flex items-center gap-1.5 transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}
                      title="Suche nach Folgetechnologien">
                      {searching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                      Suchen
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Children */}
      {children.length > 0 && (
        <div>
          {children.map(child => (
            <TechNode
              key={child.id}
              tech={child}
              myTechMap={myTechMap}
              myDiscoveries={myDiscoveries}
              planet={planet}
              labLevel={labLevel}
              researchers={researchers}
              color={color}
              depth={depth + 1}
              onRefresh={onRefresh}
              activeQueue={activeQueue}
              allTechs={allTechs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Branch Section
// ─────────────────────────────────────────────
function BranchSection({ branch, rootTechs, allTechs, myTechMap, myDiscoveries, planet, labLevel, researchers, onRefresh, activeQueue }) {
  const [collapsed, setCollapsed] = useState(false)
  const color = BRANCH_COLORS[branch] ?? '#94a3b8'
  const total  = allTechs.filter(t => t.branch === branch).length
  const done   = allTechs.filter(t => t.branch === branch && (myTechMap[t.id]?.level ?? 0) > 0).length

  return (
    <div className="panel overflow-hidden">
      {/* Branch header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/5"
        style={{ background: `${color}08` }}
        onClick={() => setCollapsed(c => !c)}>
        <span className="text-xl">{BRANCH_ICONS[branch]}</span>
        <div className="flex-1">
          <p className="font-display font-bold text-base" style={{ color }}>{BRANCH_LABELS[branch]}</p>
          <p className="text-xs text-slate-500 font-mono">{done}/{total} erforscht</p>
        </div>
        {/* Progress bar */}
        <div className="w-24 h-1.5 rounded-full mr-2" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-1.5 rounded-full transition-all" style={{ width: `${total > 0 ? (done/total*100) : 0}%`, background: color }} />
        </div>
        {collapsed ? <ChevronRight size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="p-4 space-y-1">
              {rootTechs.map(tech => (
                <TechNode
                  key={tech.id}
                  tech={tech}
                  myTechMap={myTechMap}
                  myDiscoveries={myDiscoveries}
                  planet={planet}
                  labLevel={labLevel}
                  researchers={researchers}
                  color={color}
                  depth={0}
                  onRefresh={onRefresh}
                  activeQueue={activeQueue}
                  allTechs={allTechs}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function ResearchPage() {
  const { planet, player, buildings, researchers } = useGameStore()
  const [branchFilter, setBranchFilter] = useState(0)
  const queryClient = useQueryClient()
  const timerRef = useRef(null)

  const labLevel = buildings.find(b => b.building_id === 'research_lab')?.level ?? 0

  // Tech definitions
  const { data: allTechs = [] } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('tech_definitions').select('*').order('branch').order('tier')
      return data ?? []
    },
    staleTime: 60000
  })

  // Player's researched techs (with level)
  const { data: myTechRows = [], refetch: refetchTechs } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_technologies').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  // Player's discoveries (hidden techs they found)
  const { data: discoveryRows = [], refetch: refetchDiscoveries } = useQuery({
    queryKey: ['my-discoveries', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_discoveries').select('tech_id').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  // Active research queue
  const { data: activeQueue, refetch: refetchQueue } = useQuery({
    queryKey: ['research-queue', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('research_queue')
        .select('*')
        .eq('player_id', player.id)
        .order('started_at')
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!player,
    refetchInterval: 5000
  })

  // Process finished queue items
  useEffect(() => {
    if (!activeQueue) return
    const finish = new Date(activeQueue.finish_at)
    const delay  = finish - new Date()
    if (delay <= 0) { processQueue(); return }
    timerRef.current = setTimeout(processQueue, delay + 500)
    return () => clearTimeout(timerRef.current)
  }, [activeQueue?.id])

  const processQueue = async () => {
    if (!activeQueue) return
    const now = new Date()
    if (new Date(activeQueue.finish_at) > now) return

    try {
      const roll = Math.random() * 100
      const chance = Math.min(99, (allTechs.find(t => t.id === activeQueue.tech_id)?.base_success_chance ?? 80) + (researchers?.length ?? 0) * 5)

      if (roll <= chance) {
        // Upsert level
        const existing = myTechRows.find(r => r.tech_id === activeQueue.tech_id)
        if (existing) {
          await supabase.from('player_technologies')
            .update({ level: activeQueue.target_level })
            .eq('player_id', player.id)
            .eq('tech_id', activeQueue.tech_id)
        } else {
          await supabase.from('player_technologies')
            .insert({ player_id: player.id, tech_id: activeQueue.tech_id, level: activeQueue.target_level })
        }
      }
      // Remove from queue regardless
      await supabase.from('research_queue').delete().eq('id', activeQueue.id)
      handleRefresh()
    } catch (err) {
      console.error('Queue processing error', err)
    }
  }

  const handleRefresh = () => {
    refetchTechs()
    refetchDiscoveries()
    refetchQueue()
  }

  // Build lookup maps
  const myTechMap    = Object.fromEntries(myTechRows.map(r => [r.tech_id, r]))
  const myDiscoveries = Object.fromEntries(discoveryRows.map(r => [r.tech_id, true]))

  // hasTech helper (for gameStore compatibility)
  const hasTech = (id) => (myTechMap[id]?.level ?? 0) > 0

  const branches = [...new Set(allTechs.map(t => t.branch))].sort()
  const shownBranches = branchFilter === 0 ? branches : [branchFilter]

  const totalDone = Object.keys(myTechMap).length

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
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Forschung</h2>
          <p className="text-sm text-slate-500 font-mono">
            Labor Lv {labLevel} · {totalDone} Technologien erforscht
            {researchers?.length > 0 && ` · ${researchers.length} Forscher (+${researchers.length * 5}% Chance)`}
          </p>
        </div>

        {/* Active queue indicator */}
        {activeQueue && (
          <div className="flex items-center gap-2 px-3 py-2 rounded text-sm"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Loader2 size={13} className="animate-spin text-amber-400" />
            <span className="text-amber-400 font-mono">
              {allTechs.find(t => t.id === activeQueue.tech_id)?.name ?? activeQueue.tech_id} Lv{activeQueue.target_level}
            </span>
          </div>
        )}
      </div>

      {/* Branch Filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setBranchFilter(0)}
          className="px-3 py-1.5 rounded text-sm font-mono transition-all"
          style={{ background: branchFilter === 0 ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', border: branchFilter === 0 ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)', color: branchFilter === 0 ? '#22d3ee' : '#64748b' }}>
          Alle
        </button>
        {branches.map(b => (
          <button key={b} onClick={() => setBranchFilter(b)}
            className="px-3 py-1.5 rounded text-sm font-mono transition-all"
            style={{ background: branchFilter === b ? `${BRANCH_COLORS[b]}20` : 'rgba(255,255,255,0.04)', border: branchFilter === b ? `1px solid ${BRANCH_COLORS[b]}50` : '1px solid rgba(255,255,255,0.08)', color: branchFilter === b ? BRANCH_COLORS[b] : '#64748b' }}>
            {BRANCH_ICONS[b]} {BRANCH_LABELS[b]}
          </button>
        ))}
      </div>

      {/* Branches */}
      <div className="space-y-3">
        {shownBranches.map(branch => {
          const branchTechs = allTechs.filter(t => t.branch === branch)
          // Root techs = no parent OR parent not in this branch
          const rootTechs   = branchTechs.filter(t => !t.parent_tech)
          return (
            <BranchSection
              key={branch}
              branch={branch}
              rootTechs={rootTechs}
              allTechs={branchTechs}
              myTechMap={myTechMap}
              myDiscoveries={myDiscoveries}
              planet={planet}
              labLevel={labLevel}
              researchers={researchers}
              onRefresh={handleRefresh}
              activeQueue={activeQueue}
            />
          )
        })}
      </div>
    </div>
  )
}
