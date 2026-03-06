// src/pages/MinesPage.jsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

const PROD_PER_MINE_PER_HOUR = 50

const MINEABLE = [
  { key: 'titan',       label: 'Titan',       color: '#94a3b8', icon: '/Starbound-Alpha/resources/titan.png' },
  { key: 'silizium',    label: 'Silizium',    color: '#a78bfa', icon: '/Starbound-Alpha/resources/silizium.png' },
  { key: 'helium',      label: 'Helium',      color: '#34d399', icon: '/Starbound-Alpha/resources/helium.png' },
  { key: 'nahrung',     label: 'Nahrung',     color: '#86efac', icon: '/Starbound-Alpha/resources/nahrung.png' },
  { key: 'wasser',      label: 'Wasser',      color: '#67e8f9', icon: '/Starbound-Alpha/resources/wasser.png' },
  { key: 'bauxit',      label: 'Bauxit',      color: '#fb923c', icon: '/Starbound-Alpha/resources/bauxit.png' },
  { key: 'aluminium',   label: 'Aluminium',   color: '#c0c0c0', icon: '/Starbound-Alpha/resources/aluminium.png' },
  { key: 'uran',        label: 'Uran',        color: '#4ade80', icon: '/Starbound-Alpha/resources/uran.png' },
  { key: 'plutonium',   label: 'Plutonium',   color: '#f472b6', icon: '/Starbound-Alpha/resources/plutonium.png' },
  { key: 'wasserstoff', label: 'Wasserstoff', color: '#38bdf8', icon: '/Starbound-Alpha/resources/wasserstoff.png' },
]

const MINE_COSTS = { titan: 200, silizium: 150, aluminium: 100, credits: 500 }

function fmt(n) {
  return Math.floor(n).toLocaleString('de-DE')
}

function MineCard({ res, mines, prodPerHour, freeSlots, onBuild, saving }) {
  const [amount, setAmount] = useState('')
  const parsedAmount = parseInt(amount) || 0
  const prod = prodPerHour
  const canBuild = freeSlots >= parsedAmount && parsedAmount > 0

  return (
    <motion.div layout className="rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${mines > 0 ? res.color + '30' : 'rgba(148,163,184,0.1)'}`,
        background: mines > 0 ? `${res.color}0a` : 'rgba(4,13,26,0.6)',
      }}>

      <div className="flex gap-4 p-4">
        {/* Icon */}
        <div className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
          style={{ width: 54, height: 54, background: `${res.color}18`, border: `1px solid ${res.color}28` }}>
          <img src={res.icon} alt={res.label} className="w-full h-full object-contain" />
        </div>

        {/* Mitte: Name + Stats */}
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-base mb-2" style={{ color: res.color }}>
            {res.label}
          </p>
          <div className="space-y-0.5">
            <p className="text-sm font-mono text-slate-300">
              <span className="text-slate-500">Minen</span>
              {'  '}
              <span className="font-bold">{mines}</span>
            </p>
            <p className="text-sm font-mono">
              <span className="text-slate-500">Produktion</span>
              {'  '}
              <span style={{ color: prod > 0 ? '#4ade80' : '#475569' }}>
                {prod > 0 ? `+${fmt(prod)}/h` : '—'}
              </span>
            </p>
          </div>
        </div>

        {/* Rechts: Kosten + Bauen */}
        <div className="flex-shrink-0 flex flex-col items-end justify-between gap-2">
          {/* Kosten — Name links, Zahl rechts, untereinander */}
          <div>
            <p className="text-xs text-slate-600 font-mono uppercase tracking-wide mb-1">Kosten/Mine</p>
            <table className="text-xs font-mono">
              <tbody>
                {Object.entries(MINE_COSTS).map(([k, v]) => (
                  <tr key={k}>
                    <td className="text-slate-400 pr-3 capitalize">{k}</td>
                    <td className="text-slate-200 text-right tabular-nums">{fmt(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Anzahl + Bauen */}
          {freeSlots > 0 ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={freeSlots}
                value={amount}
                placeholder="Anz."
                onChange={e => {
                  const v = e.target.value
                  if (v === '') { setAmount(''); return }
                  setAmount(String(Math.max(1, Math.min(freeSlots, parseInt(v) || 1))))
                }}
                className="w-16 text-center rounded px-2 py-1 text-sm font-mono font-bold"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${res.color}40`,
                  color: '#e2e8f0',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => { onBuild(parsedAmount); setAmount('') }}
                disabled={!canBuild || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-mono font-semibold transition-all"
                style={{
                  background: canBuild && !saving ? `${res.color}20` : 'rgba(255,255,255,0.03)',
                  border: canBuild && !saving ? `1px solid ${res.color}50` : '1px solid rgba(255,255,255,0.07)',
                  color: canBuild && !saving ? res.color : '#334155',
                  cursor: !canBuild || saving ? 'not-allowed' : 'pointer',
                }}>
                <Plus size={13} />
                {saving ? 'Baut...' : 'Bauen'}
              </button>
            </div>
          ) : (
            <span className="text-xs font-mono text-slate-700">Keine Slots frei</span>
          )}
        </div>
      </div>

      {/* Balken unten */}
      {mines > 0 && (
        <div className="px-4 pb-3">
          <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-1 rounded-full"
              style={{ width: `${Math.min((mines / 50) * 100, 100)}%`, background: res.color, opacity: 0.5 }} />
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function MinesPage() {
  const { planet, buildings, addNotification, refreshPlanet, mineProductionBonus } = useGameStore()
  const [dist, setDist] = useState({})
  const [saving, setSaving] = useState(false)

  const hqLevel = buildings.find(b => b.building_id === 'hq')?.level ?? 0
  const totalSlots = hqLevel * 50
  const usedSlots = Object.values(dist).reduce((a, b) => a + (b || 0), 0)
  const freeSlots = totalSlots - usedSlots

  useEffect(() => {
    if (planet?.mine_distribution) setDist(planet.mine_distribution)
  }, [planet?.mine_distribution])

  const handleBuild = async (resKey, amount) => {
    if (freeSlots < amount || saving) return
    setSaving(true)
    const newDist = { ...dist, [resKey]: (dist[resKey] ?? 0) + amount }
    const { error } = await supabase.from('planets')
      .update({ mine_distribution: newDist })
      .eq('id', planet.id)
    if (error) {
      addNotification('Fehler: ' + error.message, 'error')
    } else {
      setDist(newDist)
      addNotification(`${amount} ${MINEABLE.find(r => r.key === resKey)?.label}-Mine(n) gebaut`, 'success')
      refreshPlanet()
    }
    setSaving(false)
  }

  if (!planet) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-base">
      Kein Planet gefunden...
    </div>
  )

  if (hqLevel < 1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <h2 className="text-xl font-display text-slate-400">Hauptquartier erforderlich</h2>
        <p className="text-slate-500 text-sm">Baue zuerst das Hauptquartier um Minenslots freizuschalten.</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Minen</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            HQ Lvl {hqLevel} · {usedSlots} / {totalSlots} Slots belegt
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-bold"
            style={{ color: freeSlots === 0 ? '#ef4444' : '#22d3ee' }}>
            {freeSlots}
          </p>
          <p className="text-xs font-mono text-slate-500">Slots frei</p>
          <div className="w-40 mt-2">
            <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-2 rounded-full transition-all"
                style={{
                  width: totalSlots > 0 ? `${(usedSlots / totalSlots) * 100}%` : '0%',
                  background: freeSlots === 0 ? '#ef4444' : '#22d3ee',
                }} />
            </div>
          </div>
        </div>
      </div>

      {/* 2-spaltiges Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          {MINEABLE.slice(0, 5).map(res => (
            <MineCard key={res.key} res={res}
              mines={dist[res.key] ?? 0}
              prodPerHour={Math.round((dist[res.key] ?? 0) * PROD_PER_MINE_PER_HOUR * mineProductionBonus)}
              freeSlots={freeSlots}
              onBuild={(n) => handleBuild(res.key, n)}
              saving={saving}
            />
          ))}
        </div>
        <div className="space-y-4">
          {MINEABLE.slice(5, 10).map(res => (
            <MineCard key={res.key} res={res}
              mines={dist[res.key] ?? 0}
              prodPerHour={Math.round((dist[res.key] ?? 0) * PROD_PER_MINE_PER_HOUR * mineProductionBonus)}
              freeSlots={freeSlots}
              onBuild={(n) => handleBuild(res.key, n)}
              saving={saving}
            />
          ))}
        </div>
      </div>

      <div className="panel p-4 text-sm text-slate-500 font-mono">
        ⚙ Produktion wird alle 60 Sekunden gutgeschrieben. Angezeigter Wert berücksichtigt Rassen-, Skill- und Tech-Boni.
        Einmal gebaute Minen können nicht abgerissen werden.
      </div>
    </div>
  )
}
