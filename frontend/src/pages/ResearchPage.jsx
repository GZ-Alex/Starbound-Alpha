// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Search, CheckCircle, Clock, Loader2, X, Plus, Minus } from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────

const BRANCHES = {
  1: { label: 'Naturwissenschaften',         icon: '🔬' },
  2: { label: 'Ingenieurswesen',             icon: '⚙️'  },
  3: { label: 'Mathematik & Informatik',     icon: '📐' },
  4: { label: 'Politikwissenschaft & Recht', icon: '⚖️'  },
  5: { label: 'Geisteswissenschaften',       icon: '📜' },
  6: { label: 'Xenologie & Raumfahrt',       icon: '🌌' },
}

const PROF_COLOR = {
  trader:    { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.5)',  text: '#22c55e', label: 'Händler'    },
  admiral:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.5)',  text: '#ef4444', label: 'Admiral'    },
  privateer: { bg: 'rgba(56,189,248,0.15)', border: 'rgba(56,189,248,0.5)', text: '#38bdf8', label: 'Freibeuter' },
}
const RACE_COLOR = { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.5)', text: '#eab308' }

function accentColor(tech) {
  if (tech.required_race)       return RACE_COLOR.text
  if (tech.required_profession) return PROF_COLOR[tech.required_profession]?.text ?? '#94a3b8'
  return '#94a3b8'
}

const RES_LABELS = { silizium: 'Silizium', helium: 'Helium', titan: 'Titan', credits: 'Credits' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k'
  return Math.floor(n).toLocaleString()
}
function fmtTime(m) {
  if (!m) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}min` : `${h}h`
}
function calcCost(tech, lvl) {
  const s = Math.pow(tech.cost_per_level_scale ?? 1.3, lvl)
  return {
    silizium: Math.floor((tech.cost_silizium || 0) * s),
    helium:   Math.floor((tech.cost_helium   || 0) * s),
    titan:    Math.floor((tech.cost_titan    || 0) * s),
    credits:  Math.floor((tech.cost_credits  || 0) * s),
  }
}
function calcChance(basePct, cycles) {
  const p = Math.min(0.9999, basePct / 100)
  return Math.min(99.99, (1 - Math.pow(1 - p, cycles)) * 100)
}
function useCountdown(finishAt) {
  const [t, setT] = useState('')
  useEffect(() => {
    if (!finishAt) { setT(''); return }
    const tick = () => {
      const d = new Date(finishAt) - new Date()
      if (d <= 0) { setT('Fertig!'); return }
      setT(`${Math.floor(d / 60000)}:${String(Math.floor((d % 60000) / 1000)).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [finishAt])
  return t
}

// ─── Cycle Popup ──────────────────────────────────────────────────────────────

function CyclePopup({ tech, currentLevel, planet, researcherBonus, onConfirm, onClose }) {
  const [cycles, setCycles] = useState(1)
  const baseChance  = Math.min(95, (tech.base_success_chance || 80) + researcherBonus)
  const totalChance = calcChance(baseChance, cycles)
  const baseCost    = calcCost(tech, currentLevel)
  const totalCost   = Object.fromEntries(Object.entries(baseCost).map(([k, v]) => [k, v * cycles]))
  const hasCost     = Object.values(totalCost).some(v => v > 0)
  const canAfford   = !hasCost || Object.entries(totalCost).every(([r, a]) => a === 0 || (planet?.[r] ?? 0) >= a)
  const cc = totalChance >= 90 ? '#22c55e' : totalChance >= 70 ? '#fbbf24' : '#f87171'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{ background: '#040d1a', border: '1px solid rgba(148,163,184,0.18)' }}>

        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <p className="font-semibold text-slate-200 text-sm">{tech.name}</p>
            <p className="text-xs text-slate-600 font-mono">→ Stufe {currentLevel + 1} erforschen</p>
          </div>
          <button onClick={onClose} className="text-slate-700 hover:text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-widest mb-2">Zyklen</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setCycles(c => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Minus size={13} className="text-slate-400" />
              </button>
              <div className="flex-1 text-center">
                <p className="text-3xl font-mono font-bold text-slate-100">{cycles}</p>
                <p className="text-xs text-slate-700 font-mono">{fmtTime((tech.cycle_minutes ?? 2) * cycles)}</p>
              </div>
              <button onClick={() => setCycles(c => c + 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Plus size={13} className="text-slate-400" />
              </button>
            </div>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 5, 7, 10].map(n => (
                <button key={n} onClick={() => setCycles(n)}
                  className="flex-1 py-1 rounded text-xs font-mono transition-all"
                  style={{
                    background: cycles === n ? 'rgba(148,163,184,0.18)' : 'rgba(255,255,255,0.04)',
                    border: cycles === n ? '1px solid rgba(148,163,184,0.45)' : '1px solid rgba(255,255,255,0.07)',
                    color: cycles === n ? '#e2e8f0' : '#475569',
                  }}>{n}×</button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-slate-600">Erfolgschance ({cycles} Zyklus{cycles > 1 ? 'en' : ''})</span>
              <span style={{ color: cc }}>{totalChance.toFixed(2)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div className="h-1.5 rounded-full"
                animate={{ width: `${Math.min(100, totalChance)}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{ background: cc }} />
            </div>
            <p className="text-xs text-slate-700 font-mono mt-1">Basis: {baseChance}% / Zyklus</p>
          </div>

          {hasCost && (
            <div>
              <p className="text-xs text-slate-600 font-mono uppercase tracking-widest mb-1">
                Kosten ({cycles} Zyklen)
              </p>
              <div className="space-y-0.5">
                {Object.entries(totalCost).filter(([, v]) => v > 0).map(([r, a]) => {
                  const have = planet?.[r] ?? 0
                  const rest = have - a
                  const ok   = rest >= 0
                  return (
                    <div key={r} className="flex items-center gap-3 text-xs font-mono px-2 py-0.5 rounded"
                      style={{ background: 'rgba(4,13,26,0.8)' }}>
                      <span className="text-slate-500 w-16">{RES_LABELS[r] ?? r}</span>
                      <span className="text-slate-300">{fmt(a)}</span>
                      <span className={`font-bold ${ok ? 'text-slate-700' : 'text-red-400'}`}>
                        {ok ? `→ ${fmt(rest)}` : `✗ ${fmt(Math.abs(rest))} fehlen`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded text-sm font-mono text-slate-600"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              Abbrechen
            </button>
            <button onClick={() => onConfirm(cycles)} disabled={!canAfford}
              className={`flex-1 btn-primary py-2 text-sm ${!canAfford ? 'opacity-40' : ''}`}>
              {canAfford ? 'Starten' : '✗ Ressourcen fehlen'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Tech Card ────────────────────────────────────────────────────────────────

function TechCard({ tech, depth, myTechMap, myDiscoveries, planet,
  researcherBonus, onRefresh, queueByBranch, allTechs, branch,
  parentTech, collapseSignal }) {

  const { player, addNotification } = useGameStore()
  const [open,      setOpen]      = useState(true)
  const [showPopup, setShowPopup] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const prevSignal = useRef(collapseSignal)

  useEffect(() => {
    if (collapseSignal !== prevSignal.current) {
      setOpen(collapseSignal === 'expand')
      prevSignal.current = collapseSignal
    }
  }, [collapseSignal])

  const myEntry      = myTechMap[tech.id]
  const currentLevel = myEntry?.level ?? 0
  const isMaxed      = tech.max_level && currentLevel >= tech.max_level
  const revealed     = currentLevel >= (tech.reveal_level ?? 5)
  const accent       = accentColor(tech)
  const prof         = tech.required_profession ? PROF_COLOR[tech.required_profession] : null
  const isRace       = !!tech.required_race

  const branchQueue = queueByBranch[branch] ?? []
  const myQueue     = branchQueue.find(q => q.tech_id === tech.id)
  const branchBusy  = branchQueue.length >= 1 && !myQueue
  const countdown   = useCountdown(myQueue?.finish_at)

  // Only show children that have been discovered or researched
  const children = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    (!t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0)
  )
  // Hidden children eligible for search (parent researched to sufficient level)
  const searchableHidden = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    t.hidden &&
    !myDiscoveries[t.id] &&
    !(myTechMap[t.id]?.level ?? 0) &&
    currentLevel >= (t.discover_at_level ?? 4)
  )

  const handleConfirm = async (cycles) => {
    setShowPopup(false); setLoading(true)
    try {
      const cost  = calcCost(tech, currentLevel)
      const total = Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, v * cycles]))
      if (Object.values(total).some(v => v > 0)) {
        const upd = {}
        for (const [r, a] of Object.entries(total)) if (a > 0) upd[r] = (planet[r] || 0) - a
        await supabase.from('planets').update(upd).eq('id', planet.id)
      }
      const finishAt = new Date(Date.now() + (tech.cycle_minutes ?? 2) * cycles * 60000).toISOString()
      await supabase.from('research_queue').insert({
        player_id: player.id, tech_id: tech.id,
        target_level: currentLevel + 1, cycles_remaining: cycles, finish_at: finishAt,
      })
      addNotification(`🔬 ${tech.name} Lv${currentLevel + 1} gestartet (${cycles} Zyklen)`, 'success')
      onRefresh()
    } catch (e) { addNotification('Fehler: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  const handleSearch = async () => {
    if (searching) return
    setSearching(true)
    try {
      if (searchableHidden.length > 0 && Math.random() * 100 <= Math.min(60, 30 + researcherBonus)) {
        const pick = searchableHidden[Math.floor(Math.random() * searchableHidden.length)]
        await supabase.from('player_discoveries').upsert({ player_id: player.id, tech_id: pick.id })
        addNotification(`🔭 Neue Technologie entdeckt: ${pick.name}!`, 'success')
      } else {
        addNotification('🔭 Suche abgeschlossen – nichts gefunden.', 'info')
      }
      onRefresh()
    } catch (e) { addNotification('Fehler: ' + e.message, 'error') }
    finally { setSearching(false) }
  }

  const borderColor = prof ? prof.border : isRace ? RACE_COLOR.border : 'rgba(148,163,184,0.14)'
  const bgColor     = currentLevel > 0
    ? (prof ? prof.bg : isRace ? RACE_COLOR.bg : 'rgba(148,163,184,0.05)')
    : 'rgba(4,13,26,0.55)'

  return (
    <div style={{ display: 'table' /* shrink to content width */ }}>
      {/* Card — min-width so it's readable, but not stretched */}
      <div className="rounded-lg overflow-hidden"
        style={{
          border: `1px solid ${borderColor}`,
          background: bgColor,
          minHeight: 64,
          minWidth: 280,
          maxWidth: 520,
          width: 'max-content',
        }}>

        {/* Header row */}
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
          <button onClick={() => setOpen(o => !o)}
            className="flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ border: `1px solid ${open ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.45)'}`, color: '#64748b' }}>
            {open ? <Minus size={9} /> : <Plus size={9} />}
          </button>

          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-display font-semibold text-sm"
                style={{ color: currentLevel > 0 ? accent : '#64748b' }}>
                {tech.name}
              </span>

              {currentLevel > 0 && (
                <span className="text-xs font-mono text-slate-500">
                  Stufe {currentLevel}{tech.max_level ? `/${tech.max_level}` : ''}
                </span>
              )}
              {!currentLevel && (
                <span className="text-xs font-mono text-slate-700">nicht erforscht</span>
              )}

              {prof && (
                <span className="text-xs font-mono px-1.5 rounded"
                  style={{ background: prof.bg, border: `1px solid ${prof.border}`, color: prof.text }}>
                  {prof.label}
                </span>
              )}
              {isRace && (
                <span className="text-xs font-mono px-1.5 rounded"
                  style={{ background: RACE_COLOR.bg, border: `1px solid ${RACE_COLOR.border}`, color: RACE_COLOR.text }}>
                  {tech.required_race}
                </span>
              )}

              {myQueue && (
                <span className="text-xs font-mono text-amber-400 flex items-center gap-0.5">
                  <Clock size={9} />{countdown}
                </span>
              )}
              {currentLevel > 0 && !myQueue && (
                <CheckCircle size={11} style={{ color: accent }} />
              )}
            </div>

            {parentTech && tech.discover_at_level && (
              <p className="text-xs text-slate-700 font-mono mt-0.5">
                Entdeckt in <span className="text-slate-600">{parentTech.name}</span> Stufe {tech.discover_at_level}
              </p>
            )}
          </div>
        </div>

        {/* Expanded body */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }}
              className="overflow-hidden">
              <div className="px-3 pb-3 space-y-2.5"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>

                {/* Flavor */}
                <p className="text-sm text-slate-400 leading-relaxed pt-2">{tech.description}</p>

                {/* Unlocked modules — amber to stand out */}
                {revealed && (tech.unlocks_part || tech.unlocks_chassis) && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-600 font-mono uppercase tracking-widest">
                      Freigeschaltete Module
                    </p>
                    {tech.unlocks_part && (
                      <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                        🔧 {tech.unlocks_part}
                        <span className="text-xs font-normal font-mono ml-2" style={{ color: '#92400e' }}>
                          {tech.name} Stufe {tech.reveal_level ?? 5}
                        </span>
                      </p>
                    )}
                    {tech.unlocks_chassis && (
                      <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                        🚀 {tech.unlocks_chassis}
                        <span className="text-xs font-normal font-mono ml-2" style={{ color: '#92400e' }}>
                          {tech.name} Stufe {tech.reveal_level ?? 5}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {!revealed && currentLevel > 0 && (
                  <p className="text-xs text-slate-700 font-mono">
                    🔒 Module / Effekte sichtbar ab Stufe {tech.reveal_level ?? 5}
                  </p>
                )}

                {/* Effects — same color for per-level and total, larger text */}
                {revealed && tech.effects && Object.keys(tech.effects).length > 0 && currentLevel > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-600 font-mono uppercase tracking-widest">Boni</p>
                    {Object.entries(tech.effects).map(([k, v]) => {
                      const per  = typeof v === 'number' ? v : 0
                      const tot  = per * currentLevel
                      const isPct = per < 1
                      const fv   = n => isPct ? `${(n * 100).toFixed(2)}%` : n.toFixed(1)
                      return (
                        <p key={k} className="text-sm font-mono" style={{ color: '#34d399' }}>
                          +{fv(per)} {k} / Stufe&nbsp;
                          <span style={{ color: '#34d399', opacity: 0.65 }}>
                            (gesamt: +{fv(tot)})
                          </span>
                        </p>
                      )
                    })}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  {isMaxed ? (
                    <span className="text-xs font-mono text-slate-700">
                      ✓ Maximalstufe {tech.max_level} erreicht
                    </span>
                  ) : myQueue ? (
                    <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                      <Clock size={10} />{countdown}
                    </span>
                  ) : (
                    <button
                      onClick={() => !branchBusy && !loading && setShowPopup(true)}
                      disabled={branchBusy || loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        background: branchBusy ? 'rgba(255,255,255,0.03)' : 'rgba(34,211,238,0.1)',
                        border: branchBusy ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(34,211,238,0.3)',
                        color: branchBusy ? '#334155' : '#22d3ee',
                        opacity: loading ? 0.6 : 1,
                      }}>
                      {loading
                        ? <><Loader2 size={11} className="animate-spin" />Starte…</>
                        : branchBusy ? '⏳ Zweig belegt'
                        : <><FlaskConical size={11} />
                          {currentLevel === 0 ? 'Erforschen' : `Stufe ${currentLevel + 1} erforschen`}
                        </>}
                    </button>
                  )}

                  {/* Suchen — always visible once researched */}
                  {currentLevel > 0 && (
                    <button onClick={handleSearch} disabled={searching}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#475569',
                      }}>
                      {searching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                      Suchen
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Children — indented with connector lines */}
      {children.length > 0 && (
        <div style={{ display: 'flex', marginTop: 4 }}>
          {/* Vertical line column */}
          <div style={{ width: 20, flexShrink: 0, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 9, top: 0, bottom: 12,
              width: 1, background: 'rgba(148,163,184,0.12)',
            }} />
          </div>
          {/* Children stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children.map((child, idx) => (
              <div key={child.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
                {/* Horizontal connector */}
                <div style={{
                  width: 14, flexShrink: 0, height: 20, marginTop: 12,
                  borderLeft: '1px solid rgba(148,163,184,0.12)',
                  borderBottom: '1px solid rgba(148,163,184,0.12)',
                  borderBottomLeftRadius: 3,
                  marginLeft: -20,
                }} />
                <div style={{ marginLeft: 6 }}>
                  <TechCard
                    tech={child} depth={depth + 1}
                    myTechMap={myTechMap} myDiscoveries={myDiscoveries}
                    planet={planet} researcherBonus={researcherBonus}
                    onRefresh={onRefresh} queueByBranch={queueByBranch}
                    allTechs={allTechs} branch={branch}
                    parentTech={tech} collapseSignal={collapseSignal}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popup */}
      <AnimatePresence>
        {showPopup && (
          <CyclePopup
            tech={tech} currentLevel={currentLevel} planet={planet}
            researcherBonus={researcherBonus}
            onConfirm={handleConfirm} onClose={() => setShowPopup(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Branch Panel ─────────────────────────────────────────────────────────────

function BranchPanel({ branch, allTechs, myTechMap, myDiscoveries, planet,
  researcherBonus, onRefresh, queueByBranch }) {

  const [collapseSignal, setCollapseSignal] = useState(null)
  const cfg     = BRANCHES[branch] ?? { label: `Zweig ${branch}`, icon: '🔷' }
  const branchT = allTechs.filter(t => t.branch === branch)
  const roots   = branchT.filter(t => !t.parent_tech)
  const known   = branchT.filter(t => !t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0).length
  const done    = branchT.filter(t => (myTechMap[t.id]?.level ?? 0) > 0).length
  const bq      = queueByBranch[branch] ?? []

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(148,163,184,0.1)', background: 'rgba(4,13,26,0.45)' }}>

      <div className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(148,163,184,0.08)', background: 'rgba(148,163,184,0.03)' }}>
        <span className="text-lg">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-slate-300 text-sm">{cfg.label}</p>
          <p className="text-xs text-slate-700 font-mono">{done}/{known} erforscht</p>
        </div>

        {bq.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-500/70">
            <Loader2 size={10} className="animate-spin" />
            <span>{allTechs.find(x => x.id === bq[0].tech_id)?.name ?? bq[0].tech_id}</span>
          </div>
        )}

        <div className="w-20 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full transition-all"
            style={{ width: `${known > 0 ? done / known * 100 : 0}%`, background: '#94a3b8' }} />
        </div>

        <button onClick={() => setCollapseSignal(s => s === 'collapse' ? null : 'collapse')}
          title="Alle einklappen"
          className="px-2 py-1 rounded text-xs font-mono transition-all hover:bg-white/5"
          style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#475569' }}>
          ▲ Alle
        </button>
        <button onClick={() => setCollapseSignal(s => s === 'expand' ? null : 'expand')}
          title="Alle aufklappen"
          className="px-2 py-1 rounded text-xs font-mono transition-all hover:bg-white/5"
          style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#475569' }}>
          ▼ Alle
        </button>
      </div>

      <div className="p-3" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {roots.map(t => (
            <TechCard key={t.id} tech={t} depth={0}
              myTechMap={myTechMap} myDiscoveries={myDiscoveries}
              planet={planet} researcherBonus={researcherBonus}
              onRefresh={onRefresh} queueByBranch={queueByBranch}
              allTechs={allTechs} branch={branch}
              parentTech={null} collapseSignal={collapseSignal}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Cheat Button ─────────────────────────────────────────────────────────────

function CheatButton({ allTechs, player, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const go = async () => {
    if (!player || loading) return; setLoading(true)
    try {
      const ups = allTechs.map(t => ({ player_id: player.id, tech_id: t.id, level: t.max_level ?? 99 }))
      for (let i = 0; i < ups.length; i += 50)
        await supabase.from('player_technologies').upsert(ups.slice(i, i + 50), { onConflict: 'player_id,tech_id' })
      const dis = allTechs.map(t => ({ player_id: player.id, tech_id: t.id }))
      for (let i = 0; i < dis.length; i += 50)
        await supabase.from('player_discoveries').upsert(dis.slice(i, i + 50), { onConflict: 'player_id,tech_id' })
      setDone(true); onRefresh()
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  const reset = async () => {
    if (!player || loading) return; setLoading(true)
    try {
      await supabase.from('player_technologies').delete().eq('player_id', player.id)
      await supabase.from('player_discoveries').delete().eq('player_id', player.id)
      setDone(false); onRefresh()
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  return (
    <div className="flex gap-2 items-center px-3 py-1.5 rounded"
      style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.16)' }}>
      <span className="text-xs font-mono text-red-600/60">🧪 DEV</span>
      <button onClick={go} disabled={loading || done}
        className="px-2 py-1 rounded text-xs font-mono"
        style={{ background: 'rgba(239,68,68,0.1)', color: done ? '#475569' : '#f87171',
          border: '1px solid rgba(239,68,68,0.2)', opacity: done ? 0.5 : 1 }}>
        {loading ? <Loader2 size={10} className="animate-spin inline" /> : done ? '✓ Fertig' : 'Alles freischalten'}
      </button>
      <button onClick={reset} disabled={loading}
        className="px-2 py-1 rounded text-xs font-mono text-slate-600 hover:text-slate-400 transition-colors"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        Reset
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const { planet, player, buildings, researchers } = useGameStore()
  const [activeBranch, setActiveBranch] = useState(1)
  const processedRef = useRef(new Set())

  const labLevel        = buildings?.find(b => b.building_id === 'research_lab')?.level ?? 0
  const researcherBonus = (researchers?.length ?? 0) * 5

  const { data: allTechs = [] } = useQuery({
    queryKey: ['tech-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('tech_definitions').select('*').order('branch').order('tier').order('id')
      return data ?? []
    },
    staleTime: 60000,
  })

  const { data: myTechRows = [], refetch: refetchTechs } = useQuery({
    queryKey: ['my-techs', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_technologies').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  const { data: discoveryRows = [], refetch: refetchDisc } = useQuery({
    queryKey: ['my-disc', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('player_discoveries').select('tech_id').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
  })

  const { data: queueRows = [], refetch: refetchQueue } = useQuery({
    queryKey: ['research-queue', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('research_queue').select('*')
        .eq('player_id', player.id).order('started_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 3000,
  })

  const handleRefresh = useCallback(() => {
    refetchTechs(); refetchDisc(); refetchQueue()
  }, [refetchTechs, refetchDisc, refetchQueue])

  // Process finished queue entries
  useEffect(() => {
    if (!queueRows.length || !allTechs.length) return
    queueRows.forEach(async entry => {
      if (new Date(entry.finish_at) > new Date()) return
      if (processedRef.current.has(entry.id)) return
      processedRef.current.add(entry.id)
      try {
        const tech   = allTechs.find(t => t.id === entry.tech_id)
        const chance = Math.min(95, (tech?.base_success_chance ?? 80) + researcherBonus)
        if (Math.random() * 100 <= chance) {
          const ex = myTechRows.find(r => r.tech_id === entry.tech_id)
          if (ex) await supabase.from('player_technologies')
            .update({ level: entry.target_level }).eq('player_id', player.id).eq('tech_id', entry.tech_id)
          else await supabase.from('player_technologies')
            .insert({ player_id: player.id, tech_id: entry.tech_id, level: entry.target_level })
        }
        await supabase.from('research_queue').delete().eq('id', entry.id)
        handleRefresh()
      } catch (e) { console.error(e) }
    })
  }, [queueRows, allTechs])

  const myTechMap     = Object.fromEntries(myTechRows.map(r => [r.tech_id, r]))
  const myDiscoveries = Object.fromEntries(discoveryRows.map(r => [r.tech_id, true]))
  const queueByBranch = queueRows.reduce((acc, q) => {
    const t = allTechs.find(x => x.id === q.tech_id)
    if (!t) return acc
    if (!acc[t.branch]) acc[t.branch] = []
    acc[t.branch].push(q)
    return acc
  }, {})

  const branches  = [...new Set(allTechs.map(t => t.branch))].sort()

  // Root techs: only non-hidden ones (hidden=false) — always visible as branch roots
  // Children become visible only after discovery/research

  if (labLevel < 1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <FlaskConical size={48} className="mx-auto text-slate-700" />
        <h2 className="text-xl font-display text-slate-400">Forschungszentrum nicht gebaut</h2>
        <p className="text-slate-600">Baue zuerst ein Forschungszentrum auf deinem Planeten.</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-300">Forschung</h2>
          <p className="text-xs text-slate-600 font-mono">
            {myTechRows.length} Technologien erforscht
            {researcherBonus > 0 && ` · +${researcherBonus}% Basiswert`}
            {queueRows.length > 0 && ` · ${queueRows.length}/2 aktiv`}
          </p>
        </div>
        <CheatButton allTechs={allTechs} player={player} onRefresh={handleRefresh} />
      </div>

      {/* Branch tabs — one at a time */}
      <div className="flex gap-1.5 flex-wrap">
        {branches.map(b => {
          const cfg    = BRANCHES[b] ?? { label: `Zweig ${b}`, icon: '🔷' }
          const bDone  = allTechs.filter(t => t.branch === b && (myTechMap[t.id]?.level ?? 0) > 0).length
          const bKnown = allTechs.filter(t => t.branch === b && (!t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0)).length
          const active = activeBranch === b
          return (
            <button key={b} onClick={() => setActiveBranch(b)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-mono transition-all"
              style={{
                background: active ? 'rgba(148,163,184,0.12)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid rgba(148,163,184,0.35)' : '1px solid rgba(255,255,255,0.07)',
                color: active ? '#e2e8f0' : '#475569',
              }}>
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span className="text-xs opacity-50">{bDone}/{bKnown}</span>
            </button>
          )
        })}
      </div>

      {/* Active branch panel */}
      <BranchPanel
        key={activeBranch}
        branch={activeBranch}
        allTechs={allTechs}
        myTechMap={myTechMap}
        myDiscoveries={myDiscoveries}
        planet={planet}
        researcherBonus={researcherBonus}
        onRefresh={handleRefresh}
        queueByBranch={queueByBranch}
      />
    </div>
  )
}
