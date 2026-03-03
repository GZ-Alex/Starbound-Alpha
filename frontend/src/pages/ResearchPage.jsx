// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  FlaskConical, ChevronDown, ChevronRight, Lock, Loader2,
  Search, CheckCircle, Clock, AlertTriangle, Microscope
} from 'lucide-react'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const BRANCH_LABELS = {
  1: 'Naturkunde', 2: 'Technik', 3: 'Kriegskunst',
  4: 'Schutz & Struktur', 5: 'Mathematik & Analytik', 6: 'Politik & Wirtschaft'
}
const BRANCH_COLORS = {
  1: '#34d399', 2: '#38bdf8', 3: '#f472b6',
  4: '#fb923c', 5: '#a78bfa', 6: '#fbbf24'
}
const BRANCH_ICONS = { 1: '🌿', 2: '⚙️', 3: '⚔️', 4: '🛡️', 5: '📐', 6: '⚖️' }

const RESOURCE_LABELS = { silizium: 'Silizium', helium: 'Helium', titan: 'Titan', credits: 'Credits' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString()
}

function fmtTime(minutes) {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

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
// Countdown
// ─────────────────────────────────────────────
function useCountdown(finishAt) {
  const [remaining, setRemaining] = useState('')
  useEffect(() => {
    if (!finishAt) { setRemaining(''); return }
    const tick = () => {
      const diff = new Date(finishAt) - new Date()
      if (diff <= 0) { setRemaining('Fertig!'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [finishAt])
  return remaining
}

// ─────────────────────────────────────────────
// Queue Entry Display
// ─────────────────────────────────────────────
function QueueEntry({ entry, allTechs, color }) {
  const countdown = useCountdown(entry?.finish_at)
  if (!entry) return null
  const tech = allTechs.find(t => t.id === entry.tech_id)
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded text-sm"
      style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
      <Loader2 size={13} className="animate-spin flex-shrink-0" style={{ color }} />
      <span className="font-mono text-slate-300 truncate">
        {tech?.name ?? entry.tech_id}
      </span>
      <span className="font-mono text-xs flex-shrink-0" style={{ color }}>
        Lv{entry.target_level}
      </span>
      <Clock size={11} className="flex-shrink-0 text-slate-600" />
      <span className="font-mono text-xs text-slate-500 flex-shrink-0">{countdown}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// Tech Node
// ─────────────────────────────────────────────
function TechNode({
  tech, myTechMap, myDiscoveries, planet, labLevel,
  researcherCount, color, depth, onRefresh, queueByBranch,
  allTechs, branch
}) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [searching, setSearching] = useState(false)
  const { player, addNotification } = useGameStore()

  const myEntry       = myTechMap[tech.id]
  const currentLevel  = myEntry?.level ?? 0
  const isKnown       = !!myDiscoveries[tech.id] || currentLevel > 0 || !tech.hidden
  const isMaxed       = tech.max_level && currentLevel >= tech.max_level
  const revealed      = currentLevel >= (tech.reveal_level ?? 5)

  // Queue: each branch can have 1 active research
  const branchQueue   = queueByBranch[branch] ?? []
  const myQueueEntry  = branchQueue.find(q => q.tech_id === tech.id)
  const branchBusy    = branchQueue.length >= 1 && !myQueueEntry
  const countdown     = useCountdown(myQueueEntry?.finish_at)

  // Children visible to this player
  const children = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    (myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0 || !t.hidden)
  )

  // Hidden children that can still be discovered
  const hiddenChildren = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    t.hidden &&
    !myDiscoveries[t.id] &&
    !(myTechMap[t.id]?.level ?? 0)
  )

  const costs    = calcCost(tech, currentLevel)
  const hasCosts = Object.values(costs).some(v => v > 0)
  const canAfford = !hasCosts || Object.entries(costs).every(([res, amt]) =>
    amt === 0 || (planet?.[res] ?? 0) >= amt
  )
  const labOk    = labLevel >= (tech.requires_lab_level ?? 1)
  const canResearch = !isMaxed && !myQueueEntry && !branchBusy && labOk && canAfford

  const successChance = Math.min(95, (tech.base_success_chance || 80) + researcherCount * 5)

  const handleResearch = async () => {
    if (!canResearch || loading) return
    setLoading(true)
    try {
      if (hasCosts) {
        const updates = {}
        for (const [res, amt] of Object.entries(costs)) {
          if (amt > 0) updates[res] = (planet[res] || 0) - amt
        }
        await supabase.from('planets').update(updates).eq('id', planet.id)
      }
      const finishAt = new Date(
        Date.now() + (tech.cycle_minutes ?? 2) * 60 * 1000
      ).toISOString()
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
    if (searching || hiddenChildren.length === 0) return
    setSearching(true)
    try {
      const discoveryChance = Math.min(60, 30 + researcherCount * 5)
      const roll = Math.random() * 100
      if (roll <= discoveryChance) {
        const pick = hiddenChildren[Math.floor(Math.random() * hiddenChildren.length)]
        await supabase.from('player_discoveries')
          .upsert({ player_id: player.id, tech_id: pick.id })
        addNotification(`🔭 Neue Technologie entdeckt: ${pick.name}!`, 'success')
      } else {
        addNotification(
          `🔭 Suche abgeschlossen — nichts gefunden (${Math.round(roll)}% > ${discoveryChance}%)`,
          'info'
        )
      }
      onRefresh()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  if (!isKnown) return null

  const borderColor = currentLevel > 0
    ? color
    : `${color}35`

  return (
    <div>
      {/* Indent line */}
      <div className="flex">
        {depth > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center mr-2"
            style={{ width: 16 }}>
            <div className="w-px flex-1 mt-1" style={{ background: `${color}25` }} />
            <div className="w-3 h-px mb-3" style={{ background: `${color}25` }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <motion.div layout className="rounded-lg overflow-hidden mb-1"
            style={{
              border: `1px solid ${borderColor}`,
              background: currentLevel > 0 ? `${color}0a` : 'rgba(4,13,26,0.5)',
              opacity: (!isKnown) ? 0.5 : 1
            }}>

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
              onClick={() => setExpanded(e => !e)}>

              <div className="flex-shrink-0 w-4">
                {currentLevel > 0
                  ? <CheckCircle size={14} style={{ color }} />
                  : <FlaskConical size={14} className="text-slate-600" />}
              </div>

              <span className={`flex-1 text-sm font-semibold truncate ${currentLevel > 0 ? '' : 'text-slate-400'}`}
                style={currentLevel > 0 ? { color } : {}}>
                {tech.name}
              </span>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {currentLevel > 0 && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
                    Lv {currentLevel}{tech.max_level ? `/${tech.max_level}` : ''}
                  </span>
                )}
                {myQueueEntry && (
                  <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                    <Clock size={10} />{countdown}
                  </span>
                )}
                {expanded
                  ? <ChevronDown size={12} className="text-slate-600" />
                  : <ChevronRight size={12} className="text-slate-600" />}
              </div>
            </div>

            {/* Expanded */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-white/5">

                    {/* Description */}
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {tech.description}
                    </p>

                    {/* Effect — only visible after reveal_level */}
                    {currentLevel > 0 && (
                      revealed
                        ? tech.effects && Object.keys(tech.effects).length > 0
                          ? (
                            <div className="px-2 py-2 rounded"
                              style={{ background: `${color}0d`, border: `1px solid ${color}20` }}>
                              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">
                                Aktiver Effekt (Lv {currentLevel})
                              </p>
                              {Object.entries(tech.effects).map(([k, v]) => (
                                <p key={k} className="text-sm font-mono" style={{ color }}>
                                  +{typeof v === 'number'
                                    ? v >= 0.1
                                      ? (v * currentLevel * 100).toFixed(1) + '%'
                                      : (v * currentLevel).toFixed(3)
                                    : v} {k}
                                </p>
                              ))}
                            </div>
                          ) : null
                        : (
                          <div className="px-2 py-1.5 rounded text-xs text-slate-600 font-mono"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            🔒 Effekt / Freischaltung bei Lv {tech.reveal_level ?? 5} sichtbar
                          </div>
                        )
                    )}

                    {/* Unlocks — only after reveal */}
                    {revealed && (tech.unlocks_part || tech.unlocks_chassis) && (
                      <div className="px-2 py-1.5 rounded text-sm"
                        style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
                        {tech.unlocks_part    && <p style={{ color }}>🔧 Schaltet frei: {tech.unlocks_part}</p>}
                        {tech.unlocks_chassis && <p style={{ color }}>🚀 Schaltet frei: {tech.unlocks_chassis}</p>}
                      </div>
                    )}

                    {/* Costs */}
                    {!isMaxed && (
                      <div>
                        <p className="text-xs text-slate-600 font-mono uppercase tracking-widest mb-1">
                          Kosten → Lv {currentLevel + 1} · {fmtTime(tech.cycle_minutes)}
                        </p>
                        {hasCosts
                          ? (
                            <div className="space-y-0.5">
                              {Object.entries(costs).filter(([, v]) => v > 0).map(([res, amt]) => {
                                const have = planet?.[res] ?? 0
                                const rest = have - amt
                                const ok   = rest >= 0
                                return (
                                  <div key={res}
                                    className="grid text-xs font-mono px-2 py-1 rounded"
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
                          ) : (
                            <p className="text-xs text-slate-600 font-mono">Kostenlos</p>
                          )}
                      </div>
                    )}

                    {/* Success chance */}
                    {!isMaxed && (
                      <div>
                        <div className="flex justify-between text-xs font-mono mb-1">
                          <span className="text-slate-600">Erfolgschance</span>
                          <span style={{
                            color: successChance >= 80 ? '#34d399'
                              : successChance >= 60 ? '#fbbf24' : '#f87171'
                          }}>
                            {successChance}%
                          </span>
                        </div>
                        <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-1 rounded-full transition-all" style={{
                            width: `${successChance}%`,
                            background: successChance >= 80 ? '#34d399'
                              : successChance >= 60 ? '#fbbf24' : '#f87171'
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Profession/Race lock hint */}
                    {tech.required_profession && (
                      <p className="text-xs font-mono text-amber-400/60">
                        ⚔️ Nur für: {tech.required_profession}
                      </p>
                    )}
                    {tech.required_race && (
                      <p className="text-xs font-mono text-purple-400/60">
                        🧬 Nur für Rasse: {tech.required_race}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {isMaxed ? (
                        <div className="flex-1 text-center text-xs py-1.5 rounded font-mono text-slate-600"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          ✓ Maximalstufe erreicht
                        </div>
                      ) : myQueueEntry ? (
                        <div className="flex-1 text-center text-xs py-1.5 rounded font-mono text-amber-400"
                          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                          <Clock size={11} className="inline mr-1" />{countdown}
                        </div>
                      ) : (
                        <button
                          onClick={handleResearch}
                          disabled={!canResearch || loading}
                          className={`flex-1 btn-primary py-1.5 text-xs flex items-center justify-center gap-1.5 ${!canResearch ? 'opacity-40' : ''}`}>
                          {loading
                            ? <><Loader2 size={11} className="animate-spin" /> Starte...</>
                            : branchBusy      ? '⏳ Zweig belegt'
                            : !labOk          ? `🔬 Labor Lv${tech.requires_lab_level} nötig`
                            : !canAfford      ? '✗ Ressourcen fehlen'
                            : <><FlaskConical size={11} /> Lv {currentLevel + 1} erforschen</>}
                        </button>
                      )}

                      {/* Search button */}
                      {currentLevel > 0 && hiddenChildren.length > 0 && (
                        <button
                          onClick={handleSearch}
                          disabled={searching || branchBusy}
                          title="Nach versteckten Folgetechnologien suchen"
                          className="px-2.5 py-1.5 text-xs rounded flex items-center gap-1 transition-all"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#64748b'
                          }}>
                          {searching
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Search size={11} />}
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
          {children.length > 0 && expanded && (
            <div className="ml-2 space-y-0">
              {children.map(child => (
                <TechNode
                  key={child.id}
                  tech={child}
                  myTechMap={myTechMap}
                  myDiscoveries={myDiscoveries}
                  planet={planet}
                  labLevel={labLevel}
                  researcherCount={researcherCount}
                  color={color}
                  depth={depth + 1}
                  onRefresh={onRefresh}
                  queueByBranch={queueByBranch}
                  allTechs={allTechs}
                  branch={branch}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Branch Section
// ─────────────────────────────────────────────
function BranchSection({
  branch, allTechs, myTechMap, myDiscoveries,
  planet, labLevel, researcherCount, onRefresh, queueByBranch
}) {
  const [collapsed, setCollapsed] = useState(false)
  const color    = BRANCH_COLORS[branch] ?? '#94a3b8'
  const branchTechs = allTechs.filter(t => t.branch === branch)
  const rootTechs   = branchTechs.filter(t => !t.parent_tech)
  const total    = branchTechs.filter(t => !t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0).length
  const done     = branchTechs.filter(t => (myTechMap[t.id]?.level ?? 0) > 0).length
  const branchQueue = queueByBranch[branch] ?? []

  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: `1px solid ${color}20`, background: 'rgba(4,13,26,0.4)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        style={{ background: `${color}08`, borderBottom: collapsed ? 'none' : `1px solid ${color}15` }}
        onClick={() => setCollapsed(c => !c)}>
        <span className="text-xl flex-shrink-0">{BRANCH_ICONS[branch]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold" style={{ color }}>{BRANCH_LABELS[branch]}</p>
          <p className="text-xs text-slate-500 font-mono">{done}/{total} erforscht</p>
        </div>

        {/* Active queue for this branch */}
        {branchQueue.length > 0 && (
          <div className="hidden sm:flex items-center gap-1.5">
            {branchQueue.map(q => (
              <QueueEntry key={q.id} entry={q} allTechs={allTechs} color={color} />
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div className="w-20 h-1.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div className="h-1.5 rounded-full transition-all"
            style={{ width: `${total > 0 ? (done / total * 100) : 0}%`, background: color }} />
        </div>

        {collapsed
          ? <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-600 flex-shrink-0" />}
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="p-3 space-y-0.5">
              {rootTechs.map(tech => (
                <TechNode
                  key={tech.id}
                  tech={tech}
                  myTechMap={myTechMap}
                  myDiscoveries={myDiscoveries}
                  planet={planet}
                  labLevel={labLevel}
                  researcherCount={researcherCount}
                  color={color}
                  depth={0}
                  onRefresh={onRefresh}
                  queueByBranch={queueByBranch}
                  allTechs={allTechs}
                  branch={branch}
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
  const processedRef = useRef(new Set())

  const labLevel        = buildings.find(b => b.building_id === 'research_lab')?.level ?? 0
  const researcherCount = researchers?.length ?? 0

  // All tech definitions
  const { data: allTechs = [] } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tech_definitions')
        .select('*')
        .order('branch').order('tier').order('id')
      return data ?? []
    },
    staleTime: 60000
  })

  // Player's researched techs
  const { data: myTechRows = [], refetch: refetchTechs } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_technologies')
        .select('*')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player
  })

  // Discoveries
  const { data: discoveryRows = [], refetch: refetchDiscoveries } = useQuery({
    queryKey: ['my-discoveries', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_discoveries')
        .select('tech_id')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player
  })

  // Research queue — max 2 total, 1 per branch
  const { data: queueRows = [], refetch: refetchQueue } = useQuery({
    queryKey: ['research-queue', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('research_queue')
        .select('*')
        .eq('player_id', player.id)
        .order('started_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 3000
  })

  // Group queue by branch
  const queueByBranch = queueRows.reduce((acc, q) => {
    const tech = allTechs.find(t => t.id === q.tech_id)
    if (!tech) return acc
    const b = tech.branch
    if (!acc[b]) acc[b] = []
    acc[b].push(q)
    return acc
  }, {})

  const handleRefresh = useCallback(() => {
    refetchTechs()
    refetchDiscoveries()
    refetchQueue()
  }, [refetchTechs, refetchDiscoveries, refetchQueue])

  // Process finished queue entries
  useEffect(() => {
    if (!queueRows.length || !allTechs.length) return
    const now = new Date()
    queueRows.forEach(async (entry) => {
      if (new Date(entry.finish_at) > now) return
      if (processedRef.current.has(entry.id)) return
      processedRef.current.add(entry.id)

      try {
        const tech   = allTechs.find(t => t.id === entry.tech_id)
        const chance = Math.min(95, (tech?.base_success_chance ?? 80) + researcherCount * 5)
        const roll   = Math.random() * 100
        const success = roll <= chance

        if (success) {
          const existing = myTechRows.find(r => r.tech_id === entry.tech_id)
          if (existing) {
            await supabase.from('player_technologies')
              .update({ level: entry.target_level })
              .eq('player_id', player.id)
              .eq('tech_id', entry.tech_id)
          } else {
            await supabase.from('player_technologies')
              .insert({ player_id: player.id, tech_id: entry.tech_id, level: entry.target_level })
          }
        }
        await supabase.from('research_queue').delete().eq('id', entry.id)
        handleRefresh()
      } catch (err) {
        console.error('Queue processing error', err)
      }
    })
  }, [queueRows, allTechs])

  const myTechMap    = Object.fromEntries(myTechRows.map(r => [r.tech_id, r]))
  const myDiscoveries = Object.fromEntries(discoveryRows.map(r => [r.tech_id, true]))

  const branches     = [...new Set(allTechs.map(t => t.branch))].sort()
  const shownBranches = branchFilter === 0 ? branches : [branchFilter]
  const totalDone    = myTechRows.length
  const totalQueue   = queueRows.length

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Forschung</h2>
          <p className="text-sm text-slate-500 font-mono">
            Labor Lv {labLevel} · {totalDone} erforscht
            {researcherCount > 0 && ` · ${researcherCount} Forscher (+${researcherCount * 5}%)`}
          </p>
        </div>

        {/* Global queue overview */}
        {totalQueue > 0 && (
          <div className="flex flex-col gap-1 text-xs font-mono text-slate-500">
            <span>{totalQueue}/2 Forschungsslots belegt</span>
            <div className="flex gap-1">
              {[0, 1].map(i => (
                <div key={i} className="w-4 h-4 rounded"
                  style={{
                    background: i < totalQueue ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(34,211,238,0.2)'
                  }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Branch filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setBranchFilter(0)}
          className="px-3 py-1.5 rounded text-sm font-mono transition-all"
          style={{
            background: branchFilter === 0 ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: branchFilter === 0 ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
            color: branchFilter === 0 ? '#22d3ee' : '#64748b'
          }}>
          Alle
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

      {/* Branches */}
      <div className="space-y-3">
        {shownBranches.map(branch => (
          <BranchSection
            key={branch}
            branch={branch}
            allTechs={allTechs}
            myTechMap={myTechMap}
            myDiscoveries={myDiscoveries}
            planet={planet}
            labLevel={labLevel}
            researcherCount={researcherCount}
            onRefresh={handleRefresh}
            queueByBranch={queueByBranch}
          />
        ))}
      </div>
    </div>
  )
}
