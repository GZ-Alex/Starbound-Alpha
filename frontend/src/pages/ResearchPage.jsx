// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, ChevronDown, ChevronRight, Search, CheckCircle, Clock, Loader2, X, Plus, Minus } from 'lucide-react'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const BRANCH_LABELS = {
  1: 'Naturkunde', 2: 'Ingenieurswesen', 3: 'Strategie & Konflikt',
  4: 'Verteidigung & Struktur', 5: 'Analytik & Navigation', 6: 'Gesellschaft & Handel'
}
const BRANCH_COLORS = {
  1: '#34d399', 2: '#38bdf8', 3: '#f472b6',
  4: '#fb923c', 5: '#a78bfa', 6: '#fbbf24'
}
const BRANCH_ICONS = { 1: '🌿', 2: '⚙️', 3: '⚔️', 4: '🛡️', 5: '📐', 6: '⚖️' }
const RESOURCE_LABELS = { silizium: 'Silizium', helium: 'Helium', titan: 'Titan', credits: 'Credits' }
const PROFESSION_LABELS = { admiral: 'Admiral', trader: 'Händler', privateer: 'Freibeuter' }

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

// Cost for next level, scaled
function calcCost(tech, currentLevel) {
  const scale = Math.pow(tech.cost_per_level_scale ?? 1.3, currentLevel)
  return {
    silizium: Math.floor((tech.cost_silizium || 0) * scale),
    helium:   Math.floor((tech.cost_helium   || 0) * scale),
    titan:    Math.floor((tech.cost_titan    || 0) * scale),
    credits:  Math.floor((tech.cost_credits  || 0) * scale),
  }
}

// Total cost for N cycles
function calcCycleCost(tech, currentLevel, cycles) {
  const base = calcCost(tech, currentLevel)
  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, v * cycles])
  )
}

// Cumulative success chance: 1 - (1-p)^n, capped at 99.99%
function calcChance(basePct, cycles) {
  const p = Math.min(0.9999, basePct / 100)
  return Math.min(99.99, (1 - Math.pow(1 - p, cycles)) * 100)
}

// ─────────────────────────────────────────────
// Countdown hook
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
// Cycle Picker Popup
// ─────────────────────────────────────────────
function CyclePopup({ tech, currentLevel, planet, researcherCount, onConfirm, onClose }) {
  const [cycles, setCycles] = useState(1)

  const baseChance  = Math.min(95, (tech.base_success_chance || 80) + researcherCount * 5)
  const totalChance = calcChance(baseChance, cycles)
  const costs       = calcCycleCost(tech, currentLevel, cycles)
  const totalTime   = (tech.cycle_minutes ?? 2) * cycles

  const hasCosts  = Object.values(costs).some(v => v > 0)
  const canAfford = !hasCosts || Object.entries(costs).every(([res, amt]) =>
    amt === 0 || (planet?.[res] ?? 0) >= amt
  )

  const chanceColor = totalChance >= 90 ? '#34d399' : totalChance >= 70 ? '#fbbf24' : '#f87171'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-lg overflow-hidden"
        style={{ background: '#040d1a', border: '1px solid rgba(34,211,238,0.25)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div>
            <p className="text-sm font-semibold text-slate-200">{tech.name}</p>
            <p className="text-xs text-slate-500 font-mono">→ Stufe {currentLevel + 1} erforschen</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Cycle selector */}
          <div>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-2">
              Anzahl Zyklen
            </p>
            <div className="flex items-center gap-3">
              <button onClick={() => setCycles(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Minus size={14} className="text-slate-400" />
              </button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-mono font-bold text-slate-200">{cycles}</span>
                <p className="text-xs text-slate-600 font-mono">
                  {fmtTime(totalTime)} gesamt
                </p>
              </div>
              <button onClick={() => setCycles(c => c + 1)}
                className="w-8 h-8 rounded flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Plus size={14} className="text-slate-400" />
              </button>
            </div>
            {/* Quick cycle buttons */}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[1, 2, 3, 5, 7, 10].map(n => (
                <button key={n} onClick={() => setCycles(n)}
                  className="px-2 py-0.5 rounded text-xs font-mono transition-all"
                  style={{
                    background: cycles === n ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                    border: cycles === n ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    color: cycles === n ? '#22d3ee' : '#64748b'
                  }}>
                  {n}×
                </button>
              ))}
            </div>
          </div>

          {/* Success chance */}
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-slate-500">Erfolgschance ({cycles} Zyklus{cycles > 1 ? 'en' : ''})</span>
              <span style={{ color: chanceColor }}>{totalChance.toFixed(2)}%</span>
            </div>
            <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-2 rounded-full"
                animate={{ width: `${Math.min(totalChance, 100)}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{ background: chanceColor }} />
            </div>
            <p className="text-xs text-slate-600 font-mono mt-1">
              Basis: {baseChance}% pro Zyklus
            </p>
          </div>

          {/* Costs */}
          {hasCosts && (
            <div>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">
                Gesamtkosten ({cycles} Zyklen)
              </p>
              <div className="space-y-0.5">
                {Object.entries(costs).filter(([, v]) => v > 0).map(([res, amt]) => {
                  const have = planet?.[res] ?? 0
                  const rest = have - amt
                  const ok   = rest >= 0
                  return (
                    <div key={res} className="grid text-xs font-mono px-2 py-1 rounded"
                      style={{ gridTemplateColumns: '1fr 60px 70px', background: 'rgba(4,13,26,0.7)' }}>
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

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded text-sm font-mono text-slate-500 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Abbrechen
            </button>
            <button onClick={() => onConfirm(cycles)}
              disabled={!canAfford}
              className={`flex-1 btn-primary py-2 text-sm ${!canAfford ? 'opacity-40' : ''}`}>
              {!canAfford ? '✗ Ressourcen fehlen' : `Starten`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Tech Card
// ─────────────────────────────────────────────
function TechCard({
  tech, myTechMap, myDiscoveries, planet,
  researcherCount, color, depth, onRefresh,
  queueByBranch, allTechs, branch, parentTech
}) {
  const [expanded,   setExpanded]   = useState(false)
  const [showPopup,  setShowPopup]  = useState(false)
  const [searching,  setSearching]  = useState(false)
  const [loading,    setLoading]    = useState(false)
  const { player, addNotification } = useGameStore()

  const myEntry      = myTechMap[tech.id]
  const currentLevel = myEntry?.level ?? 0
  const isMaxed      = tech.max_level && currentLevel >= tech.max_level
  const revealed     = currentLevel >= (tech.reveal_level ?? 5)

  const branchQueue  = queueByBranch[branch] ?? []
  const myQueueEntry = branchQueue.find(q => q.tech_id === tech.id)
  const branchBusy   = branchQueue.length >= 1 && !myQueueEntry
  const countdown    = useCountdown(myQueueEntry?.finish_at)

  const baseChance   = Math.min(95, (tech.base_success_chance || 80) + researcherCount * 5)

  // Visible children
  const children = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    (myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0 || !t.hidden)
  )

  const hiddenChildren = allTechs.filter(t =>
    t.parent_tech === tech.id && t.hidden &&
    !myDiscoveries[t.id] && !(myTechMap[t.id]?.level ?? 0) &&
    currentLevel >= (t.discover_at_level ?? 4)
  )

  // Unlocks already triggered
  const unlockedParts = tech.unlocks_part
    ? allTechs.filter(t => t.id === tech.id && revealed && tech.unlocks_part)
    : []

  const handleConfirmResearch = async (cycles) => {
    setShowPopup(false)
    setLoading(true)
    try {
      const costs = calcCycleCost(tech, currentLevel, cycles)
      const hasCosts = Object.values(costs).some(v => v > 0)
      if (hasCosts) {
        const updates = {}
        for (const [res, amt] of Object.entries(costs)) {
          if (amt > 0) updates[res] = (planet[res] || 0) - amt
        }
        await supabase.from('planets').update(updates).eq('id', planet.id)
      }
      const totalMinutes = (tech.cycle_minutes ?? 2) * cycles
      const finishAt = new Date(Date.now() + totalMinutes * 60 * 1000).toISOString()
      await supabase.from('research_queue').insert({
        player_id: player.id,
        tech_id: tech.id,
        target_level: currentLevel + 1,
        cycles_remaining: cycles,
        finish_at: finishAt,
      })
      addNotification(`🔬 ${tech.name} Lv${currentLevel + 1} gestartet (${cycles} Zyklen)`, 'success')
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
      const chance = Math.min(60, 30 + researcherCount * 5)
      if (Math.random() * 100 <= chance) {
        const pick = hiddenChildren[Math.floor(Math.random() * hiddenChildren.length)]
        await supabase.from('player_discoveries')
          .upsert({ player_id: player.id, tech_id: pick.id })
        addNotification(`🔭 Neue Technologie entdeckt: ${pick.name}!`, 'success')
      } else {
        addNotification(`🔭 Suche abgeschlossen – diesmal nichts entdeckt.`, 'info')
      }
      onRefresh()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const borderColor = currentLevel > 0 ? color : `${color}30`
  const bgColor     = currentLevel > 0 ? `${color}08` : 'rgba(4,13,26,0.5)'

  return (
    <div>
      {/* Indent connector */}
      <div className="flex gap-0">
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-5 flex justify-center">
            <div className="w-px h-full" style={{ background: `${color}18` }} />
          </div>
        ))}

        <div className="flex-1 min-w-0 mb-1.5">
          {/* Connector line for non-root */}
          {depth > 0 && (
            <div className="flex items-center mb-1 gap-0">
              {Array.from({ length: depth - 1 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-5" />
              ))}
              <div className="flex items-center" style={{ width: 20 }}>
                <div className="w-3 h-px" style={{ background: `${color}30` }} />
                <ChevronRight size={10} style={{ color: `${color}40` }} />
              </div>
            </div>
          )}

          <motion.div layout className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${borderColor}`, background: bgColor }}>

            {/* ── Card Header ── */}
            <div className="px-4 py-3 cursor-pointer select-none"
              onClick={() => setExpanded(e => !e)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Name + Level */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-base"
                      style={{ color: currentLevel > 0 ? color : '#94a3b8' }}>
                      {tech.name}
                    </span>
                    {currentLevel > 0
                      ? (
                        <span className="text-sm font-mono" style={{ color }}>
                          – Stufe: {currentLevel}{tech.max_level ? `/${tech.max_level}` : ''}
                        </span>
                      )
                      : (
                        <span className="text-xs font-mono text-slate-600">– nicht erforscht</span>
                      )}
                    {myQueueEntry && (
                      <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                        <Clock size={10} />{countdown}
                      </span>
                    )}
                  </div>

                  {/* Parent reference */}
                  {parentTech && tech.discover_at_level && (
                    <p className="text-xs text-slate-600 font-mono mt-0.5">
                      Entdeckt in <span className="text-slate-500">{parentTech.name}</span> Stufe {tech.discover_at_level}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                  {currentLevel > 0 && <CheckCircle size={14} style={{ color }} />}
                  {expanded
                    ? <ChevronDown size={14} className="text-slate-600" />
                    : <ChevronRight size={14} className="text-slate-600" />}
                </div>
              </div>
            </div>

            {/* ── Expanded Content ── */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/5">

                    {/* Flavortext */}
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {tech.description}
                    </p>

                    {/* Unlocked modules */}
                    {revealed && tech.unlocks_part && (
                      <div className="text-sm" style={{ color }}>
                        <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">
                          Freigeschaltete Module
                        </p>
                        <p>🔧 {tech.unlocks_part}
                          <span className="text-xs text-slate-600 ml-2 font-mono">
                            {tech.name} Stufe {tech.reveal_level ?? 5}
                          </span>
                        </p>
                      </div>
                    )}
                    {revealed && tech.unlocks_chassis && (
                      <div className="text-sm" style={{ color }}>
                        <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">
                          Freigeschaltete Chassis
                        </p>
                        <p>🚀 {tech.unlocks_chassis}
                          <span className="text-xs text-slate-600 ml-2 font-mono">
                            {tech.name} Stufe {tech.reveal_level ?? 5}
                          </span>
                        </p>
                      </div>
                    )}
                    {!revealed && currentLevel > 0 && (
                      <p className="text-xs text-slate-600 font-mono">
                        🔒 Module / Effekte sichtbar ab Stufe {tech.reveal_level ?? 5}
                      </p>
                    )}

                    {/* Effect with per-level and total */}
                    {revealed && tech.effects && Object.keys(tech.effects).length > 0 && currentLevel > 0 && (
                      <div className="px-3 py-2 rounded space-y-1"
                        style={{ background: `${color}0d`, border: `1px solid ${color}18` }}>
                        <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">
                          Aktiver Effekt
                        </p>
                        {Object.entries(tech.effects).map(([k, v]) => {
                          const perLevel = typeof v === 'number' ? v : 0
                          const total    = perLevel * currentLevel
                          const isPct    = perLevel < 0.5
                          const fmtVal   = (n) => isPct
                            ? `${(n * 100).toFixed(2)}%`
                            : n.toFixed(1)
                          return (
                            <div key={k} className="flex justify-between text-sm font-mono">
                              <span className="text-slate-400">{k}</span>
                              <span style={{ color }}>
                                +{fmtVal(perLevel)} / Stufe
                                <span className="text-slate-500 ml-2">
                                  (gesamt: +{fmtVal(total)})
                                </span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Profession/race lock */}
                    {tech.required_profession && (
                      <p className="text-xs font-mono text-amber-400/70">
                        ⚔️ Nur für {PROFESSION_LABELS[tech.required_profession] ?? tech.required_profession}
                      </p>
                    )}
                    {tech.required_race && (
                      <p className="text-xs font-mono text-purple-400/70">
                        🧬 Nur für Rasse: {tech.required_race}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {/* Research / Improve button */}
                      {isMaxed ? (
                        <div className="flex-1 text-center py-2 rounded text-xs font-mono text-slate-600"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          ✓ Maximalstufe {tech.max_level} erreicht
                        </div>
                      ) : myQueueEntry ? (
                        <div className="flex-1 text-center py-2 rounded text-xs font-mono text-amber-400"
                          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                          <Clock size={11} className="inline mr-1" />{countdown}
                        </div>
                      ) : (
                        <button
                          onClick={() => !branchBusy && !loading && setShowPopup(true)}
                          disabled={branchBusy || loading}
                          className={`flex-1 btn-primary py-2 text-sm flex items-center justify-center gap-1.5 ${branchBusy ? 'opacity-40' : ''}`}>
                          {loading
                            ? <><Loader2 size={12} className="animate-spin" /> Starte...</>
                            : branchBusy ? '⏳ Zweig belegt'
                            : currentLevel === 0
                            ? <><FlaskConical size={13} /> Erforschen</>
                            : <><FlaskConical size={13} /> Stufe {currentLevel + 1} erforschen</>}
                        </button>
                      )}

                      {/* Search button */}
                      {currentLevel > 0 && hiddenChildren.length > 0 && (
                        <button
                          onClick={handleSearch}
                          disabled={searching || branchBusy}
                          title="Nach versteckten Untertechnologien suchen"
                          className="px-3 py-2 text-xs rounded flex items-center gap-1.5 transition-all"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#64748b'
                          }}>
                          {searching
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Search size={12} />}
                          Suchen
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Children — rendered below, indented */}
          {expanded && children.length > 0 && (
            <div className="mt-1 space-y-0 pl-5">
              {children.map(child => (
                <TechCard
                  key={child.id}
                  tech={child}
                  myTechMap={myTechMap}
                  myDiscoveries={myDiscoveries}
                  planet={planet}
                  researcherCount={researcherCount}
                  color={color}
                  depth={depth + 1}
                  onRefresh={onRefresh}
                  queueByBranch={queueByBranch}
                  allTechs={allTechs}
                  branch={branch}
                  parentTech={tech}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cycle popup */}
      <AnimatePresence>
        {showPopup && (
          <CyclePopup
            tech={tech}
            currentLevel={currentLevel}
            planet={planet}
            researcherCount={researcherCount}
            onConfirm={handleConfirmResearch}
            onClose={() => setShowPopup(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────
// Branch Section
// ─────────────────────────────────────────────
function BranchSection({
  branch, allTechs, myTechMap, myDiscoveries,
  planet, researcherCount, onRefresh, queueByBranch
}) {
  const [collapsed, setCollapsed] = useState(false)
  const color       = BRANCH_COLORS[branch] ?? '#94a3b8'
  const branchTechs = allTechs.filter(t => t.branch === branch)
  const rootTechs   = branchTechs.filter(t => !t.parent_tech)
  const known       = branchTechs.filter(t =>
    !t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0
  ).length
  const done        = branchTechs.filter(t => (myTechMap[t.id]?.level ?? 0) > 0).length
  const branchQueue = queueByBranch[branch] ?? []

  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: `1px solid ${color}20`, background: 'rgba(4,13,26,0.35)' }}>

      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: `${color}08`, borderBottom: collapsed ? 'none' : `1px solid ${color}12` }}
        onClick={() => setCollapsed(c => !c)}>
        <span className="text-xl flex-shrink-0">{BRANCH_ICONS[branch]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold" style={{ color }}>{BRANCH_LABELS[branch]}</p>
          <p className="text-xs text-slate-500 font-mono">{done}/{known} bekannte Technologien erforscht</p>
        </div>

        {/* Active queue entries */}
        {branchQueue.map(q => {
          const tech = allTechs.find(t => t.id === q.tech_id)
          return (
            <div key={q.id} className="hidden sm:flex items-center gap-1.5 text-xs font-mono"
              style={{ color: `${color}cc` }}>
              <Loader2 size={11} className="animate-spin" />
              <span className="truncate max-w-24">{tech?.name ?? q.tech_id}</span>
            </div>
          )
        })}

        {/* Progress bar */}
        <div className="w-16 h-1.5 rounded-full flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div className="h-1.5 rounded-full transition-all"
            style={{ width: `${known > 0 ? done / known * 100 : 0}%`, background: color }} />
        </div>

        {collapsed
          ? <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
          : <ChevronDown size={14} className="text-slate-600 flex-shrink-0" />}
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className="p-3 space-y-1.5">
              {rootTechs.map(tech => (
                <TechCard
                  key={tech.id}
                  tech={tech}
                  myTechMap={myTechMap}
                  myDiscoveries={myDiscoveries}
                  planet={planet}
                  researcherCount={researcherCount}
                  color={color}
                  depth={0}
                  onRefresh={onRefresh}
                  queueByBranch={queueByBranch}
                  allTechs={allTechs}
                  branch={branch}
                  parentTech={null}
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
// Cheat Button
// ─────────────────────────────────────────────
function CheatButton({ allTechs, player, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)

  const handleCheat = async () => {
    if (!player || loading) return
    setLoading(true)
    try {
      const upserts = allTechs.map(t => ({
        player_id: player.id, tech_id: t.id, level: t.max_level ?? 99
      }))
      for (let i = 0; i < upserts.length; i += 50) {
        await supabase.from('player_technologies')
          .upsert(upserts.slice(i, i + 50), { onConflict: 'player_id,tech_id' })
      }
      const discoveries = allTechs.map(t => ({ player_id: player.id, tech_id: t.id }))
      for (let i = 0; i < discoveries.length; i += 50) {
        await supabase.from('player_discoveries')
          .upsert(discoveries.slice(i, i + 50), { onConflict: 'player_id,tech_id' })
      }
      setDone(true)
      onRefresh()
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  const handleReset = async () => {
    if (!player || loading) return
    setLoading(true)
    try {
      await supabase.from('player_technologies').delete().eq('player_id', player.id)
      await supabase.from('player_discoveries').delete().eq('player_id', player.id)
      setDone(false)
      onRefresh()
    } catch (err) { console.error(err) } finally { setLoading(false) }
  }

  return (
    <div className="flex gap-2 items-center px-3 py-2 rounded"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
      <span className="text-xs font-mono text-red-400/70">🧪 DEV</span>
      <button onClick={handleCheat} disabled={loading || done}
        className="px-2 py-1 rounded text-xs font-mono"
        style={{ background: 'rgba(239,68,68,0.12)', color: done ? '#475569' : '#f87171', border: '1px solid rgba(239,68,68,0.25)', opacity: done ? 0.5 : 1 }}>
        {loading ? <Loader2 size={11} className="animate-spin inline" /> : done ? '✓ Fertig' : 'Alles freischalten'}
      </button>
      <button onClick={handleReset} disabled={loading}
        className="px-2 py-1 rounded text-xs font-mono"
        style={{ background: 'rgba(100,116,139,0.08)', color: '#64748b', border: '1px solid rgba(100,116,139,0.15)' }}>
        Reset
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function ResearchPage() {
  const { planet, player, buildings, researchers } = useGameStore()
  const [branchFilter, setBranchFilter] = useState(0)
  const queryClient    = useQueryClient()
  const processedRef   = useRef(new Set())

  const labLevel        = buildings.find(b => b.building_id === 'research_lab')?.level ?? 0
  const researcherCount = researchers?.length ?? 0

  const { data: allTechs = [] } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('tech_definitions').select('*').order('branch').order('tier').order('id')
      return data ?? []
    },
    staleTime: 60000
  })

  const { data: myTechRows = [], refetch: refetchTechs } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_technologies').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player
  })

  const { data: discoveryRows = [], refetch: refetchDiscoveries } = useQuery({
    queryKey: ['my-discoveries', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_discoveries').select('tech_id').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player
  })

  const { data: queueRows = [], refetch: refetchQueue } = useQuery({
    queryKey: ['research-queue', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('research_queue').select('*').eq('player_id', player.id).order('started_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 3000
  })

  const queueByBranch = queueRows.reduce((acc, q) => {
    const tech = allTechs.find(t => t.id === q.tech_id)
    if (!tech) return acc
    if (!acc[tech.branch]) acc[tech.branch] = []
    acc[tech.branch].push(q)
    return acc
  }, {})

  const handleRefresh = useCallback(() => {
    refetchTechs(); refetchDiscoveries(); refetchQueue()
  }, [refetchTechs, refetchDiscoveries, refetchQueue])

  // Process finished queue entries
  useEffect(() => {
    if (!queueRows.length || !allTechs.length) return
    queueRows.forEach(async (entry) => {
      if (new Date(entry.finish_at) > new Date()) return
      if (processedRef.current.has(entry.id)) return
      processedRef.current.add(entry.id)
      try {
        const tech    = allTechs.find(t => t.id === entry.tech_id)
        const chance  = Math.min(95, (tech?.base_success_chance ?? 80) + researcherCount * 5)
        const success = Math.random() * 100 <= chance
        if (success) {
          const existing = myTechRows.find(r => r.tech_id === entry.tech_id)
          if (existing) {
            await supabase.from('player_technologies')
              .update({ level: entry.target_level })
              .eq('player_id', player.id).eq('tech_id', entry.tech_id)
          } else {
            await supabase.from('player_technologies')
              .insert({ player_id: player.id, tech_id: entry.tech_id, level: entry.target_level })
          }
        }
        await supabase.from('research_queue').delete().eq('id', entry.id)
        handleRefresh()
      } catch (err) { console.error('Queue error', err) }
    })
  }, [queueRows, allTechs])

  const myTechMap     = Object.fromEntries(myTechRows.map(r => [r.tech_id, r]))
  const myDiscoveries = Object.fromEntries(discoveryRows.map(r => [r.tech_id, true]))
  const branches      = [...new Set(allTechs.map(t => t.branch))].sort()
  const shownBranches = branchFilter === 0 ? branches : [branchFilter]
  const totalDone     = myTechRows.length
  const totalQueue    = queueRows.length

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
            {totalDone} Technologien erforscht
            {researcherCount > 0 && ` · ${researcherCount} Forscher (+${researcherCount * 5}% Basiswert)`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <CheatButton allTechs={allTechs} player={player} onRefresh={handleRefresh} />

          {totalQueue > 0 && (
            <div className="flex flex-col gap-1 text-xs font-mono text-slate-500">
              <span>{totalQueue}/2 Slots belegt</span>
              <div className="flex gap-1">
                {[0, 1].map(i => (
                  <div key={i} className="w-4 h-4 rounded"
                    style={{ background: i < totalQueue ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(34,211,238,0.15)' }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Branch filter */}
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
        {shownBranches.map(branch => (
          <BranchSection
            key={branch}
            branch={branch}
            allTechs={allTechs}
            myTechMap={myTechMap}
            myDiscoveries={myDiscoveries}
            planet={planet}
            researcherCount={researcherCount}
            onRefresh={handleRefresh}
            queueByBranch={queueByBranch}
          />
        ))}
      </div>
    </div>
  )
}
