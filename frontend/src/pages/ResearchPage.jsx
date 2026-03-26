// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Search, CheckCircle, Clock, Loader2, X, Plus, Minus, ScanSearch } from 'lucide-react'

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

// Flavor-Texte für Suche — je Anzahl Zyklen (1–5)
const SEARCH_FLAVOR = {
  1: 'Deine Forscher werfen einen kurzen Blick. Ob da wirklich etwas wartet? Eher unwahrscheinlich.',
  2: 'Ein paar Köpfe werden zusammengesteckt. Vielleicht findet sich ja was — vielleicht auch nicht.',
  3: 'In den Laboren herrscht verhaltene Neugier. Irgendjemand hat eine Idee — ob sie trägt, wird sich zeigen.',
  4: 'Die Whiteboards füllen sich. Deine Forscher tippen auf etwas Handfestes — die Chancen stehen nicht schlecht.',
  5: 'Ungewöhnliche Betriebsamkeit in den Laboren. Kaffeekonsum gestiegen. Die Forscher riechen den Durchbruch.',
}

// Suchkosten: fix, unabhängig von Tech-Level
const SEARCH_COST = { silizium: 300, helium: 200, credits: 500 }
// Suchzeit: 5 min pro Zyklus
const SEARCH_CYCLE_MINUTES = 5

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
      const d = new Date(finishAt).getTime() - Date.now()
      if (d <= 0) { setT('Fertig!'); return }
      setT(`${Math.floor(d / 60000)}:${String(Math.floor((d % 60000) / 1000)).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [finishAt])
  return t
}

// ─── Forschungs-Popup ─────────────────────────────────────────────────────────

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
            <p className="text-xs text-slate-600 font-mono">→ Level {currentLevel + 1} erforschen</p>
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

// ─── Suchen-Popup ─────────────────────────────────────────────────────────────

function SearchPopup({ tech, planet, onConfirm, onClose }) {
  const [cycles, setCycles] = useState(1)

  // Chance: 1→20%, 2→40%, 3→60%, 4→80%, 5→100%
  // Chance wird dem Spieler NICHT angezeigt
  const totalCost = Object.fromEntries(
    Object.entries(SEARCH_COST).map(([k, v]) => [k, v * cycles])
  )
  const canAfford = Object.entries(totalCost).every(([r, a]) => (planet?.[r] ?? 0) >= a)
  const flavorText = SEARCH_FLAVOR[Math.min(5, cycles)] ?? SEARCH_FLAVOR[5]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{ background: '#040d1a', border: '1px solid rgba(56,189,248,0.2)' }}>

        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <p className="font-semibold text-slate-200 text-sm flex items-center gap-2">
              <ScanSearch size={14} className="text-sky-400" />
              Neue Technologien suchen
            </p>
            <p className="text-xs text-slate-600 font-mono">in: {tech.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-700 hover:text-slate-400 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Zyklen */}
          <div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-widest mb-2">Suchtiefe</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setCycles(n)}
                  className="flex-1 py-2 rounded text-sm font-mono font-bold transition-all"
                  style={{
                    background: cycles === n ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.04)',
                    border: cycles === n ? '1px solid rgba(56,189,248,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    color: cycles === n ? '#38bdf8' : '#475569',
                  }}>{n}</button>
              ))}
            </div>
            <p className="text-xs text-slate-700 font-mono mt-1.5 text-center">
              {fmtTime(SEARCH_CYCLE_MINUTES * cycles)}
            </p>
          </div>

          {/* Flavor Text */}
          <div className="px-3 py-2.5 rounded-lg text-sm text-slate-400 italic leading-relaxed"
            style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
            "{flavorText}"
          </div>

          {/* Kosten */}
          <div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-widest mb-1">
              Kosten ({cycles} Zyklus{cycles > 1 ? 'en' : ''})
            </p>
            <div className="space-y-0.5">
              {Object.entries(totalCost).map(([r, a]) => {
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

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded text-sm font-mono text-slate-600"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              Abbrechen
            </button>
            <button onClick={() => onConfirm(cycles)} disabled={!canAfford}
              className={`flex-1 py-2 rounded text-sm font-mono font-semibold transition-all ${!canAfford ? 'opacity-40' : ''}`}
              style={{
                background: canAfford ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.03)',
                border: canAfford ? '1px solid rgba(56,189,248,0.35)' : '1px solid rgba(255,255,255,0.07)',
                color: canAfford ? '#38bdf8' : '#334155',
              }}>
              {canAfford ? 'Suche starten' : '✗ Ressourcen fehlen'}
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
  const [open,          setOpen]          = useState(true)
  const [showPopup,     setShowPopup]     = useState(false)
  const [showSearch,    setShowSearch]    = useState(false)
  const [searching,     setSearching]     = useState(false)
  const [loading,       setLoading]       = useState(false)
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

  const children = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    (myDiscoveries[t.id] || (myTechMap[t.id]?.level ?? 0) > 0)
  )
  const searchableHidden = allTechs.filter(t =>
    t.parent_tech === tech.id &&
    !myDiscoveries[t.id] &&
    !(myTechMap[t.id]?.level ?? 0) &&
    currentLevel >= (t.discover_at_level ?? 4)
  )
  const hasSearchable = searchableHidden.length > 0

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
        player_id: player.id,
        planet_id: planet.id,
        tech_id: tech.id,
        branch: tech.branch ?? 1,
        ticks_per_cycle: (tech.cycle_minutes ?? 2) * 2,
        cycles_done: 0,
        current_chance: Math.min(95, tech.base_success_chance ?? 80),
        finish_at: finishAt,
      })
      addNotification(`🔬 ${tech.name} Level ${currentLevel + 1} gestartet (${cycles} Zyklen)`, 'success')
      onRefresh()
    } catch (e) { addNotification('Fehler: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  const handleSearchConfirm = async (cycles) => {
    setShowSearch(false)
    setSearching(true)
    try {
      const upd = {}
      for (const [r, a] of Object.entries(SEARCH_COST)) {
        const total = a * cycles
        if (total > 0) upd[r] = (planet[r] || 0) - total
      }
      await supabase.from('planets').update(upd).eq('id', planet.id)

      const chance = cycles * 20
      const roll   = Math.random() * 100

      if (roll <= chance && hasSearchable) {
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

  // Summary shown when collapsed (erforschte Boni/Bauteile)
  const collapseSummary = !open && currentLevel > 0 && (
    revealed && (tech.unlocks_part || tech.unlocks_chassis || (tech.effects && Object.keys(tech.effects).length > 0))
  )

  return (
    <div style={{ display: 'table' }}>
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
            className="flex-shrink-0 mt-1 w-[18px] h-[18px] rounded flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ border: `1px solid ${open ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.45)'}`, color: '#64748b' }}>
            {open ? <Minus size={9} /> : <Plus size={9} />}
          </button>

          <div className="flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {/* LARGER title */}
              <span className="font-display font-bold text-base leading-tight"
                style={{ color: currentLevel > 0 ? accent : '#64748b' }}>
                {tech.name}
              </span>

              {currentLevel > 0 && (
                <span className="text-xs font-mono" style={{ color: accent, opacity: 0.7 }}>
                  Level {currentLevel}
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

            {/* Discover info — readable */}
            {parentTech && tech.discover_at_level && (
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Entdeckt ab <span className="text-slate-400">{parentTech.name}</span> Level {tech.discover_at_level}
              </p>
            )}

            {/* Collapsed summary — show unlocked content even when closed */}
            {collapseSummary && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {tech.unlocks_part && (
                  <span className="text-xs font-mono" style={{ color: '#fbbf24' }}>🔧 {tech.unlocks_part}</span>
                )}
                {tech.unlocks_chassis && (
                  <span className="text-xs font-mono" style={{ color: '#fbbf24' }}>🚀 {tech.unlocks_chassis}</span>
                )}
                {tech.effects && Object.entries(tech.effects).map(([k, v]) => {
                  const per = typeof v === 'number' ? v : 0
                  const tot = per * currentLevel
                  const isPct = per < 1
                  const fv = n => isPct ? `${(n * 100).toFixed(1)}%` : n.toFixed(1)
                  return (
                    <span key={k} className="text-xs font-mono" style={{ color: '#34d399' }}>
                      +{fv(tot)} {k}
                    </span>
                  )
                })}
              </div>
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

                <p className="text-sm text-slate-400 leading-relaxed pt-2">{tech.description}</p>

                {/* Modules */}
                {revealed && (tech.unlocks_part || tech.unlocks_chassis) && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">
                      Freigeschaltete Module
                    </p>
                    {tech.unlocks_part && (
                      <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                        🔧 {tech.unlocks_part}
                        <span className="text-xs font-normal font-mono ml-2" style={{ color: '#92400e' }}>
                          ab Level {tech.reveal_level ?? 5}
                        </span>
                      </p>
                    )}
                    {tech.unlocks_chassis && (
                      <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>
                        🚀 {tech.unlocks_chassis}
                        <span className="text-xs font-normal font-mono ml-2" style={{ color: '#92400e' }}>
                          ab Level {tech.reveal_level ?? 5}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {!revealed && currentLevel > 0 && (
                  <p className="text-xs text-slate-600 font-mono">
                    🔒 Module / Effekte sichtbar ab Level {tech.reveal_level ?? 5}
                  </p>
                )}

                {/* Boni — readable size */}
                {revealed && tech.effects && Object.keys(tech.effects).length > 0 && currentLevel > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">Boni</p>
                    {Object.entries(tech.effects).map(([k, v]) => {
                      const per   = typeof v === 'number' ? v : 0
                      const tot   = per * currentLevel
                      const isPct = per < 1
                      const fv    = n => isPct ? `${(n * 100).toFixed(2)}%` : n.toFixed(1)
                      return (
                        <p key={k} className="text-sm font-mono" style={{ color: '#34d399' }}>
                          <span className="text-slate-400">+{fv(per)} {k} / Level</span>
                          {'  '}
                          <span style={{ color: '#34d399' }}>gesamt +{fv(tot)}</span>
                        </p>
                      )
                    })}
                  </div>
                )}

                {/* Buttons — always visible */}
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  {/* Erforschen / Max-Level / Queue */}
                  {myQueue ? (
                    <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                      <Clock size={10} />{countdown}
                    </span>
                  ) : isMaxed ? (
                    <button disabled
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#334155',
                        cursor: 'not-allowed',
                      }}>
                      <CheckCircle size={11} /> Max-Level
                    </button>
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
                          {currentLevel === 0 ? 'Erforschen' : `Level ${currentLevel + 1} erforschen`}
                        </>}
                    </button>
                  )}

                  {/* Suchen — immer sichtbar wenn erforscht */}
                  {currentLevel > 0 && (
                    <button
                      onClick={() => hasSearchable && !searching && setShowSearch(true)}
                      disabled={searching}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        background: hasSearchable ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.02)',
                        border: hasSearchable ? '1px solid rgba(56,189,248,0.2)' : '1px solid rgba(255,255,255,0.06)',
                        color: hasSearchable ? '#38bdf8' : '#334155',
                        cursor: hasSearchable && !searching ? 'pointer' : 'not-allowed',
                      }}>
                      {searching
                        ? <><Loader2 size={11} className="animate-spin" />Suche…</>
                        : <><Search size={11} />{hasSearchable ? 'Neue Techs suchen' : 'Suchen'}</>}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Children */}
      {children.length > 0 && (
        <div style={{ display: 'flex', marginTop: 4 }}>
          <div style={{ width: 20, flexShrink: 0, position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 9, top: 0, bottom: 12,
              width: 1, background: 'rgba(148,163,184,0.12)',
            }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {children.map(child => (
              <div key={child.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
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

      {/* Popups */}
      <AnimatePresence>
        {showPopup && (
          <CyclePopup
            tech={tech} currentLevel={currentLevel} planet={planet}
            researcherBonus={researcherBonus}
            onConfirm={handleConfirm} onClose={() => setShowPopup(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showSearch && (
          <SearchPopup
            tech={tech} planet={planet}
            onConfirm={handleSearchConfirm} onClose={() => setShowSearch(false)}
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
          className="px-2 py-1 rounded text-xs font-mono transition-all hover:bg-white/5"
          style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#475569' }}>
          ▲ Alle
        </button>
        <button onClick={() => setCollapseSignal(s => s === 'expand' ? null : 'expand')}
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
      const ups = allTechs.map(t => ({ player_id: player.id, tech_id: t.id, level: Math.min(t.max_level ?? 20, 20) }))
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
          const newLevel = (ex?.level ?? 0) + 1
          if (ex) await supabase.from('player_technologies')
            .update({ level: newLevel }).eq('player_id', player.id).eq('tech_id', entry.tech_id)
          else await supabase.from('player_technologies')
            .insert({ player_id: player.id, tech_id: entry.tech_id, level: 1 })
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

  const branches = [...new Set(allTechs.map(t => t.branch))].sort()

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
