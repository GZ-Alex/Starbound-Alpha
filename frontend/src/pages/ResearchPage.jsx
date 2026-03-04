// src/pages/ResearchPage.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FlaskConical, Search, CheckCircle, Clock, Loader2, X, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const BRANCH = {
  1: { label: 'Naturwissenschaften',          icon: '🔬', color: '#94a3b8' },
  2: { label: 'Ingenieurswesen',              icon: '⚙️',  color: '#94a3b8' },
  3: { label: 'Mathematik & Informatik',      icon: '📐', color: '#94a3b8' },
  4: { label: 'Politikwissenschaft & Recht',  icon: '⚖️',  color: '#94a3b8' },
  5: { label: 'Geisteswissenschaften',        icon: '📜', color: '#94a3b8' },
  6: { label: 'Xenologie & Raumfahrt',        icon: '🌌', color: '#94a3b8' },
}

// Per-card color: profession overrides, race overrides, else default slate
function cardColor(tech) {
  if (tech.required_race)        return '#eab308'   // yellow
  if (tech.required_profession === 'trader')    return '#22c55e'   // green
  if (tech.required_profession === 'privateer') return '#38bdf8'   // blue
  if (tech.required_profession === 'admiral')   return '#f87171'   // red
  return '#94a3b8'  // default slate
}

const RES_LABEL = { silizium: 'Silizium', helium: 'Helium', titan: 'Titan', credits: 'Credits' }
const PROF_LABEL = { trader: 'Händler', admiral: 'Admiral', privateer: 'Freibeuter' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M'
  if (n >= 1000) return (n/1000).toFixed(1)+'k'
  return Math.floor(n).toLocaleString()
}
function fmtTime(m) {
  if (!m) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m/60), r = m%60
  return r ? `${h}h ${r}min` : `${h}h`
}
function calcCost(tech, lvl) {
  const s = Math.pow(tech.cost_per_level_scale ?? 1.3, lvl)
  return {
    silizium: Math.floor((tech.cost_silizium||0)*s),
    helium:   Math.floor((tech.cost_helium||0)*s),
    titan:    Math.floor((tech.cost_titan||0)*s),
    credits:  Math.floor((tech.cost_credits||0)*s),
  }
}
function calcChance(basePct, cycles) {
  const p = Math.min(0.9999, basePct/100)
  return Math.min(99.99, (1-Math.pow(1-p,cycles))*100)
}
function useCountdown(finishAt) {
  const [t, setT] = useState('')
  useEffect(() => {
    if (!finishAt) { setT(''); return }
    const tick = () => {
      const d = new Date(finishAt)-new Date()
      if (d<=0) { setT('Fertig!'); return }
      setT(`${Math.floor(d/60000)}:${String(Math.floor((d%60000)/1000)).padStart(2,'0')}`)
    }
    tick(); const id = setInterval(tick,1000); return ()=>clearInterval(id)
  },[finishAt])
  return t
}

// ─────────────────────────────────────────
// Cycle Popup
// ─────────────────────────────────────────
function CyclePopup({ tech, currentLevel, planet, researcherBonus, onConfirm, onClose }) {
  const [cycles, setCycles] = useState(1)
  const baseChance = Math.min(95, (tech.base_success_chance||80) + researcherBonus)
  const totalChance = calcChance(baseChance, cycles)
  const baseCost = calcCost(tech, currentLevel)
  const totalCost = Object.fromEntries(Object.entries(baseCost).map(([k,v])=>[k,v*cycles]))
  const hasCost = Object.values(totalCost).some(v=>v>0)
  const canAfford = !hasCost || Object.entries(totalCost).every(([r,a])=>a===0||(planet?.[r]??0)>=a)
  const cc = totalChance>=90?'#22c55e':totalChance>=70?'#fbbf24':'#f87171'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.8)'}}>
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{background:'#040d1a',border:'1px solid rgba(148,163,184,0.2)'}}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div>
            <p className="font-semibold text-slate-200">{tech.name}</p>
            <p className="text-xs text-slate-500 font-mono">→ Stufe {currentLevel+1} erforschen</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Cycle selector */}
          <div>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-2">Zyklen</p>
            <div className="flex items-center gap-3">
              <button onClick={()=>setCycles(c=>Math.max(1,c-1))}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                <Minus size={14} className="text-slate-400"/>
              </button>
              <div className="flex-1 text-center">
                <p className="text-3xl font-mono font-bold text-slate-100">{cycles}</p>
                <p className="text-xs text-slate-600 font-mono">{fmtTime((tech.cycle_minutes??2)*cycles)} gesamt</p>
              </div>
              <button onClick={()=>setCycles(c=>c+1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
                style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                <Plus size={14} className="text-slate-400"/>
              </button>
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {[1,2,3,5,7,10].map(n=>(
                <button key={n} onClick={()=>setCycles(n)}
                  className="flex-1 py-1 rounded text-xs font-mono transition-all"
                  style={{
                    background:cycles===n?'rgba(148,163,184,0.2)':'rgba(255,255,255,0.04)',
                    border:cycles===n?'1px solid rgba(148,163,184,0.5)':'1px solid rgba(255,255,255,0.08)',
                    color:cycles===n?'#e2e8f0':'#64748b'
                  }}>{n}×</button>
              ))}
            </div>
          </div>
          {/* Chance bar */}
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-slate-500">Erfolgschance ({cycles} Zyklus{cycles>1?'en':''})</span>
              <span style={{color:cc}}>{totalChance.toFixed(2)}%</span>
            </div>
            <div className="w-full h-2 rounded-full" style={{background:'rgba(255,255,255,0.06)'}}>
              <motion.div className="h-2 rounded-full" animate={{width:`${Math.min(100,totalChance)}%`}}
                transition={{type:'spring',stiffness:200,damping:20}} style={{background:cc}}/>
            </div>
            <p className="text-xs text-slate-700 font-mono mt-1">Basis: {baseChance}% / Zyklus · Formel: 1−(1−p)ⁿ</p>
          </div>
          {/* Costs */}
          {hasCost && (
            <div>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-1">Kosten ({cycles} Zyklen)</p>
              <div className="space-y-0.5">
                {Object.entries(totalCost).filter(([,v])=>v>0).map(([r,a])=>{
                  const have=planet?.[r]??0; const rest=have-a; const ok=rest>=0
                  return (
                    <div key={r} className="grid text-xs font-mono px-2 py-1 rounded"
                      style={{gridTemplateColumns:'1fr 60px 70px',background:'rgba(4,13,26,0.8)'}}>
                      <span className="text-slate-400">{RES_LABEL[r]??r}</span>
                      <span className="text-right text-slate-300">{fmt(a)}</span>
                      <span className={`text-right font-bold ${ok?'text-slate-600':'text-red-400'}`}>
                        {ok?fmt(rest):`−${fmt(Math.abs(rest))}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded text-sm font-mono text-slate-500 transition-all hover:bg-white/5"
              style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)'}}>Abbrechen</button>
            <button onClick={()=>onConfirm(cycles)} disabled={!canAfford}
              className={`flex-1 btn-primary py-2 text-sm ${!canAfford?'opacity-40':''}`}>
              {canAfford?'Starten':'✗ Ressourcen fehlen'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────
// Tech Card
// ─────────────────────────────────────────
function TechCard({ tech, myTechMap, myDiscoveries, planet, researcherBonus,
  onRefresh, queueByBranch, allTechs, branch, parentTech, globalCollapse }) {

  const { player, addNotification } = useGameStore()
  const [collapsed, setCollapsed] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading,   setLoading]   = useState(false)

  // Respect global collapse toggle
  useEffect(() => { if (globalCollapse !== null) setCollapsed(globalCollapse) }, [globalCollapse])

  const myEntry      = myTechMap[tech.id]
  const currentLevel = myEntry?.level ?? 0
  const isMaxed      = tech.max_level && currentLevel >= tech.max_level
  const revealed     = currentLevel >= (tech.reveal_level ?? 5)
  const color        = cardColor(tech)

  const branchQueue  = queueByBranch[branch] ?? []
  const myQueue      = branchQueue.find(q=>q.tech_id===tech.id)
  const branchBusy   = branchQueue.length>=1 && !myQueue
  const countdown    = useCountdown(myQueue?.finish_at)

  // Children: visible (known or not hidden)
  const children = allTechs.filter(t=>
    t.parent_tech===tech.id &&
    (!t.hidden || myDiscoveries[t.id] || (myTechMap[t.id]?.level??0)>0)
  )
  // Hidden children that can potentially still be discovered
  const searchableHidden = allTechs.filter(t=>
    t.parent_tech===tech.id && t.hidden &&
    !myDiscoveries[t.id] && !(myTechMap[t.id]?.level??0)
  )

  const baseChance = Math.min(95,(tech.base_success_chance||80)+researcherBonus)

  const handleConfirm = async (cycles) => {
    setShowPopup(false); setLoading(true)
    try {
      const cost = calcCost(tech, currentLevel)
      const total = Object.fromEntries(Object.entries(cost).map(([k,v])=>[k,v*cycles]))
      const hasCost = Object.values(total).some(v=>v>0)
      if (hasCost) {
        const upd = {}
        for (const [r,a] of Object.entries(total)) if(a>0) upd[r]=(planet[r]||0)-a
        await supabase.from('planets').update(upd).eq('id',planet.id)
      }
      const finishAt = new Date(Date.now()+(tech.cycle_minutes??2)*cycles*60000).toISOString()
      await supabase.from('research_queue').insert({
        player_id:player.id, tech_id:tech.id,
        target_level:currentLevel+1, cycles_remaining:cycles, finish_at:finishAt
      })
      addNotification(`🔬 ${tech.name} Lv${currentLevel+1} gestartet (${cycles} Zyklen)`,'success')
      onRefresh()
    } catch(e){ addNotification('Fehler: '+e.message,'error') }
    finally{ setLoading(false) }
  }

  const handleSearch = async () => {
    if (searching) return
    setSearching(true)
    try {
      const chance = Math.min(60, 30+researcherBonus)
      if (Math.random()*100 <= chance && searchableHidden.length>0) {
        const pick = searchableHidden[Math.floor(Math.random()*searchableHidden.length)]
        await supabase.from('player_discoveries').upsert({player_id:player.id,tech_id:pick.id})
        addNotification(`🔭 Neue Technologie entdeckt: ${pick.name}!`,'success')
      } else {
        addNotification(`🔭 Suche abgeschlossen – diesmal nichts gefunden.`,'info')
      }
      onRefresh()
    } catch(e){ addNotification('Fehler: '+e.message,'error') }
    finally{ setSearching(false) }
  }

  // Summary line shown when collapsed
  const summaryParts = []
  if (revealed && tech.unlocks_part)    summaryParts.push(`🔧 ${tech.unlocks_part}`)
  if (revealed && tech.unlocks_chassis) summaryParts.push(`🚀 ${tech.unlocks_chassis}`)
  if (revealed && tech.effects && Object.keys(tech.effects).length>0 && currentLevel>0) {
    const [k,v] = Object.entries(tech.effects)[0]
    const total = (typeof v==='number'?v:0)*currentLevel
    summaryParts.push(`+${(total*100).toFixed(1)}% ${k}`)
  }

  const borderStyle = currentLevel>0
    ? `1px solid ${color}60`
    : `1px solid rgba(148,163,184,0.12)`
  const bgStyle = currentLevel>0
    ? `${color}08`
    : 'rgba(4,13,26,0.55)'

  return (
    <div className="flex gap-0">
      {/* Vertical connector line — drawn by parent */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg overflow-hidden mb-1" style={{border:borderStyle,background:bgStyle,minHeight:72}}>

          {/* Card top bar */}
          <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
            {/* Collapse toggle */}
            <button
              onClick={()=>setCollapsed(c=>!c)}
              className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-all hover:bg-white/10"
              style={{border:`1px solid rgba(148,163,184,${collapsed?'0.35':'0.2'})`, color:'#64748b'}}>
              {collapsed ? <Plus size={10}/> : <Minus size={10}/>}
            </button>

            {/* Name + level */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-display font-semibold text-sm leading-tight"
                  style={{color:currentLevel>0?color:'#94a3b8'}}>
                  {tech.name}
                </span>
                {currentLevel>0 && (
                  <span className="text-xs font-mono" style={{color:`${color}cc`}}>
                    Stufe {currentLevel}{tech.max_level?`/${tech.max_level}`:''}
                  </span>
                )}
                {!currentLevel && <span className="text-xs text-slate-700 font-mono">nicht erforscht</span>}
                {myQueue && (
                  <span className="text-xs font-mono text-amber-400 flex items-center gap-0.5">
                    <Clock size={9}/>{countdown}
                  </span>
                )}
              </div>
              {/* Parent reference */}
              {parentTech && tech.discover_at_level && (
                <p className="text-xs text-slate-700 font-mono mt-0.5">
                  Entdeckt in <span className="text-slate-600">{parentTech.name}</span> Stufe {tech.discover_at_level}
                </p>
              )}
              {/* Collapsed summary */}
              {collapsed && summaryParts.length>0 && (
                <p className="text-xs mt-1" style={{color:`${color}99`}}>{summaryParts.join(' · ')}</p>
              )}
            </div>

            {currentLevel>0 && <CheckCircle size={12} className="flex-shrink-0 mt-1" style={{color}}/>}
          </div>

          {/* Expanded content */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}
                className="overflow-hidden">
                <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-white/5">
                  {/* Flavor */}
                  <p className="text-sm text-slate-400 leading-relaxed pt-2">{tech.description}</p>

                  {/* Profession/race */}
                  {tech.required_profession && (
                    <p className="text-xs font-mono" style={{color:`${color}99`}}>
                      ⚔️ Nur für {PROF_LABEL[tech.required_profession]??tech.required_profession}
                    </p>
                  )}
                  {tech.required_race && (
                    <p className="text-xs font-mono text-yellow-500/70">🧬 Nur für Rasse: {tech.required_race}</p>
                  )}

                  {/* Unlocks */}
                  {revealed && (tech.unlocks_part||tech.unlocks_chassis) && (
                    <div className="space-y-0.5">
                      {tech.unlocks_part && (
                        <p className="text-sm" style={{color}}>
                          🔧 <span className="font-medium">{tech.unlocks_part}</span>
                          <span className="text-xs text-slate-600 font-mono ml-2">
                            {tech.name} Stufe {tech.reveal_level??5}
                          </span>
                        </p>
                      )}
                      {tech.unlocks_chassis && (
                        <p className="text-sm" style={{color}}>
                          🚀 <span className="font-medium">{tech.unlocks_chassis}</span>
                          <span className="text-xs text-slate-600 font-mono ml-2">
                            {tech.name} Stufe {tech.reveal_level??5}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  {!revealed && currentLevel>0 && (
                    <p className="text-xs text-slate-700 font-mono">🔒 Module / Effekte ab Stufe {tech.reveal_level??5}</p>
                  )}

                  {/* Effects */}
                  {revealed && tech.effects && Object.keys(tech.effects).length>0 && currentLevel>0 && (
                    <div className="px-2.5 py-2 rounded space-y-0.5"
                      style={{background:`${color}0a`,border:`1px solid ${color}18`}}>
                      {Object.entries(tech.effects).map(([k,v])=>{
                        const per = typeof v==='number'?v:0
                        const tot = per*currentLevel
                        const isPct = per<0.5
                        const f = n=>isPct?`${(n*100).toFixed(2)}%`:n.toFixed(1)
                        return (
                          <div key={k} className="flex justify-between text-xs font-mono">
                            <span className="text-slate-400">{k}</span>
                            <span style={{color}}>+{f(per)} / Stufe
                              <span className="text-slate-600 ml-1.5">(gesamt: +{f(tot)})</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex gap-2 pt-0.5">
                    {isMaxed ? (
                      <div className="flex-1 text-center py-1.5 rounded text-xs font-mono text-slate-700"
                        style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)'}}>
                        ✓ Maximalstufe {tech.max_level}
                      </div>
                    ) : myQueue ? (
                      <div className="flex-1 text-center py-1.5 rounded text-xs font-mono text-amber-400"
                        style={{background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)'}}>
                        <Clock size={10} className="inline mr-1"/>{countdown}
                      </div>
                    ) : (
                      <button onClick={()=>!branchBusy&&!loading&&setShowPopup(true)}
                        disabled={branchBusy||loading}
                        className={`flex-1 btn-primary py-1.5 text-xs flex items-center justify-center gap-1.5 ${branchBusy?'opacity-40':''}`}>
                        {loading?<><Loader2 size={11} className="animate-spin"/>Starte...</>
                          :branchBusy?'⏳ Zweig belegt'
                          :<><FlaskConical size={11}/>
                            {currentLevel===0?'Erforschen':`Stufe ${currentLevel+1} erforschen`}
                          </>}
                      </button>
                    )}
                    {/* Suchen — always visible if tech is researched */}
                    {currentLevel>0 && (
                      <button onClick={handleSearch} disabled={searching}
                        title="Nach versteckten Untertechnologien suchen"
                        className="px-2.5 py-1.5 rounded text-xs flex items-center gap-1 transition-all hover:bg-white/5"
                        style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',color:'#475569'}}>
                        {searching?<Loader2 size={11} className="animate-spin"/>:<Search size={11}/>}
                        Suchen
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Children */}
        {children.length>0 && (
          <div className="pl-5 border-l border-slate-800 ml-2.5 space-y-0">
            {children.map(child=>(
              <TechCard key={child.id} tech={child}
                myTechMap={myTechMap} myDiscoveries={myDiscoveries}
                planet={planet} researcherBonus={researcherBonus}
                onRefresh={onRefresh} queueByBranch={queueByBranch}
                allTechs={allTechs} branch={branch}
                parentTech={tech} globalCollapse={globalCollapse}/>
            ))}
          </div>
        )}
      </div>

      {/* Cycle popup */}
      <AnimatePresence>
        {showPopup && (
          <CyclePopup tech={tech} currentLevel={currentLevel} planet={planet}
            researcherBonus={researcherBonus} onConfirm={handleConfirm} onClose={()=>setShowPopup(false)}/>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────
// Branch Panel
// ─────────────────────────────────────────
function BranchPanel({ branch, allTechs, myTechMap, myDiscoveries, planet,
  researcherBonus, onRefresh, queueByBranch }) {
  const [globalCollapse, setGlobalCollapse] = useState(null)
  const cfg = BRANCH[branch] ?? { label:`Zweig ${branch}`, icon:'🔷', color:'#94a3b8' }

  const branchTechs = allTechs.filter(t=>t.branch===branch)
  const roots       = branchTechs.filter(t=>!t.parent_tech)
  const known       = branchTechs.filter(t=>!t.hidden||myDiscoveries[t.id]||(myTechMap[t.id]?.level??0)>0).length
  const done        = branchTechs.filter(t=>(myTechMap[t.id]?.level??0)>0).length
  const bq          = queueByBranch[branch]??[]
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl overflow-hidden" style={{border:'1px solid rgba(148,163,184,0.12)',background:'rgba(4,13,26,0.4)'}}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{background:'rgba(148,163,184,0.04)',borderBottom:open?'1px solid rgba(148,163,184,0.08)':'none'}}
        onClick={()=>setOpen(o=>!o)}>
        <span className="text-lg flex-shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-slate-300">{cfg.label}</p>
          <p className="text-xs text-slate-600 font-mono">{done}/{known} erforscht</p>
        </div>
        {bq.length>0 && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-600">
            <Loader2 size={10} className="animate-spin"/>
            {bq.map(q=>{
              const t=allTechs.find(x=>x.id===q.tech_id)
              return <span key={q.id} className="truncate max-w-20">{t?.name??q.tech_id}</span>
            })}
          </div>
        )}
        {/* Progress */}
        <div className="w-16 h-1 rounded-full flex-shrink-0" style={{background:'rgba(255,255,255,0.06)'}}>
          <div className="h-1 rounded-full transition-all"
            style={{width:`${known>0?done/known*100:0}%`,background:'#94a3b8'}}/>
        </div>
        {/* Collapse all button */}
        {open && (
          <button onClick={e=>{e.stopPropagation();setGlobalCollapse(g=>g===true?null:true)}}
            className="text-xs font-mono px-2 py-1 rounded transition-all hover:bg-white/5"
            style={{border:'1px solid rgba(255,255,255,0.08)',color:'#475569'}}
            title="Alle einklappen">
            ▲ Alle
          </button>
        )}
        {open && (
          <button onClick={e=>{e.stopPropagation();setGlobalCollapse(g=>g===false?null:false)}}
            className="text-xs font-mono px-2 py-1 rounded transition-all hover:bg-white/5"
            style={{border:'1px solid rgba(255,255,255,0.08)',color:'#475569'}}
            title="Alle aufklappen">
            ▼ Alle
          </button>
        )}
        {open?<ChevronUp size={14} className="text-slate-700 flex-shrink-0"/>
             :<ChevronDown size={14} className="text-slate-700 flex-shrink-0"/>}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden">
            <div className="p-3 space-y-1">
              {roots.map(t=>(
                <TechCard key={t.id} tech={t}
                  myTechMap={myTechMap} myDiscoveries={myDiscoveries}
                  planet={planet} researcherBonus={researcherBonus}
                  onRefresh={onRefresh} queueByBranch={queueByBranch}
                  allTechs={allTechs} branch={branch}
                  parentTech={null} globalCollapse={globalCollapse}/>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────
// Cheat Button
// ─────────────────────────────────────────
function CheatButton({ allTechs, player, onRefresh }) {
  const [loading,setLoading]=useState(false)
  const [done,setDone]=useState(false)
  const go = async () => {
    if(!player||loading) return; setLoading(true)
    try {
      const ups = allTechs.map(t=>({player_id:player.id,tech_id:t.id,level:t.max_level??99}))
      for(let i=0;i<ups.length;i+=50)
        await supabase.from('player_technologies').upsert(ups.slice(i,i+50),{onConflict:'player_id,tech_id'})
      const dis = allTechs.map(t=>({player_id:player.id,tech_id:t.id}))
      for(let i=0;i<dis.length;i+=50)
        await supabase.from('player_discoveries').upsert(dis.slice(i,i+50),{onConflict:'player_id,tech_id'})
      setDone(true); onRefresh()
    } catch(e){console.error(e)} finally{setLoading(false)}
  }
  const reset = async () => {
    if(!player||loading) return; setLoading(true)
    try {
      await supabase.from('player_technologies').delete().eq('player_id',player.id)
      await supabase.from('player_discoveries').delete().eq('player_id',player.id)
      setDone(false); onRefresh()
    } catch(e){console.error(e)} finally{setLoading(false)}
  }
  return (
    <div className="flex gap-2 items-center px-3 py-1.5 rounded"
      style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.18)'}}>
      <span className="text-xs font-mono text-red-500/60">🧪 DEV</span>
      <button onClick={go} disabled={loading||done}
        className="px-2 py-1 rounded text-xs font-mono transition-all"
        style={{background:'rgba(239,68,68,0.1)',color:done?'#475569':'#f87171',
          border:'1px solid rgba(239,68,68,0.2)',opacity:done?0.5:1}}>
        {loading?<Loader2 size={10} className="animate-spin inline"/>:done?'✓ Fertig':'Alles freischalten'}
      </button>
      <button onClick={reset} disabled={loading}
        className="px-2 py-1 rounded text-xs font-mono text-slate-600 transition-all hover:text-slate-400"
        style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>Reset</button>
    </div>
  )
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
export default function ResearchPage() {
  const { planet, player, buildings, researchers } = useGameStore()
  const [branchFilter, setBranchFilter] = useState(0)
  const processedRef = useRef(new Set())

  const labLevel        = buildings?.find(b=>b.building_id==='research_lab')?.level ?? 0
  const researcherBonus = (researchers?.length??0) * 5

  const { data: allTechs=[] } = useQuery({
    queryKey:['tech-defs'],
    queryFn:async()=>{
      const{data}=await supabase.from('tech_definitions').select('*').order('branch').order('tier').order('id')
      return data??[]
    },
    staleTime:60000
  })
  const { data: myTechRows=[], refetch:refetchTechs } = useQuery({
    queryKey:['my-techs',player?.id],
    queryFn:async()=>{
      const{data}=await supabase.from('player_technologies').select('*').eq('player_id',player.id)
      return data??[]
    },
    enabled:!!player
  })
  const { data: discoveryRows=[], refetch:refetchDisc } = useQuery({
    queryKey:['my-disc',player?.id],
    queryFn:async()=>{
      const{data}=await supabase.from('player_discoveries').select('tech_id').eq('player_id',player.id)
      return data??[]
    },
    enabled:!!player
  })
  const { data: queueRows=[], refetch:refetchQueue } = useQuery({
    queryKey:['research-queue',player?.id],
    queryFn:async()=>{
      const{data}=await supabase.from('research_queue').select('*').eq('player_id',player.id).order('started_at')
      return data??[]
    },
    enabled:!!player,
    refetchInterval:3000
  })

  const handleRefresh = useCallback(()=>{
    refetchTechs(); refetchDisc(); refetchQueue()
  },[refetchTechs,refetchDisc,refetchQueue])

  // Process finished queue
  useEffect(()=>{
    if(!queueRows.length||!allTechs.length) return
    queueRows.forEach(async entry=>{
      if(new Date(entry.finish_at)>new Date()) return
      if(processedRef.current.has(entry.id)) return
      processedRef.current.add(entry.id)
      try {
        const tech=allTechs.find(t=>t.id===entry.tech_id)
        const chance=Math.min(95,(tech?.base_success_chance??80)+researcherBonus)
        if(Math.random()*100<=chance) {
          const ex=myTechRows.find(r=>r.tech_id===entry.tech_id)
          if(ex) await supabase.from('player_technologies')
            .update({level:entry.target_level}).eq('player_id',player.id).eq('tech_id',entry.tech_id)
          else await supabase.from('player_technologies')
            .insert({player_id:player.id,tech_id:entry.tech_id,level:entry.target_level})
        }
        await supabase.from('research_queue').delete().eq('id',entry.id)
        handleRefresh()
      } catch(e){console.error(e)}
    })
  },[queueRows,allTechs])

  const myTechMap     = Object.fromEntries(myTechRows.map(r=>[r.tech_id,r]))
  const myDiscoveries = Object.fromEntries(discoveryRows.map(r=>[r.tech_id,true]))
  const queueByBranch = queueRows.reduce((acc,q)=>{
    const t=allTechs.find(x=>x.id===q.tech_id); if(!t) return acc
    if(!acc[t.branch]) acc[t.branch]=[]
    acc[t.branch].push(q); return acc
  },{})
  const branches      = [...new Set(allTechs.map(t=>t.branch))].sort()
  const shown         = branchFilter===0 ? branches : [branchFilter]

  if (labLevel<1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <FlaskConical size={48} className="mx-auto text-slate-700"/>
        <h2 className="text-xl font-display text-slate-400">Forschungszentrum nicht gebaut</h2>
        <p className="text-slate-600">Baue zuerst ein Forschungszentrum auf deinem Planeten.</p>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-none px-2 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-300 tracking-wide">Forschung</h2>
          <p className="text-sm text-slate-600 font-mono">
            {myTechRows.length} Technologien erforscht
            {researcherBonus>0 && ` · +${researcherBonus}% Basiswert`}
            {queueRows.length>0 && ` · ${queueRows.length}/2 Slots belegt`}
          </p>
        </div>
        <CheatButton allTechs={allTechs} player={player} onRefresh={handleRefresh}/>
      </div>

      {/* Branch filter */}
      <div className="flex gap-1.5 flex-wrap">
        {[0,...branches].map(b=>{
          const cfg = b===0 ? {label:'Alle',icon:'◉'} : BRANCH[b]??{label:`Zweig ${b}`,icon:'🔷'}
          return (
            <button key={b} onClick={()=>setBranchFilter(b)}
              className="px-3 py-1.5 rounded text-sm font-mono transition-all"
              style={{
                background:branchFilter===b?'rgba(148,163,184,0.15)':'rgba(255,255,255,0.04)',
                border:branchFilter===b?'1px solid rgba(148,163,184,0.4)':'1px solid rgba(255,255,255,0.08)',
                color:branchFilter===b?'#e2e8f0':'#64748b'
              }}>
              {cfg.icon} {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Branch panels — full width, no max-w constraint */}
      <div className="space-y-3">
        {shown.map(b=>(
          <BranchPanel key={b} branch={b}
            allTechs={allTechs} myTechMap={myTechMap} myDiscoveries={myDiscoveries}
            planet={planet} researcherBonus={researcherBonus}
            onRefresh={handleRefresh} queueByBranch={queueByBranch}/>
        ))}
      </div>
    </div>
  )
}
