// src/pages/MinesPage.jsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { Plus } from 'lucide-react'

const MINEABLE = [
  { key: 'titan',       label: 'Titan',       color: '#94a3b8', icon: '⬡' },
  { key: 'silizium',    label: 'Silizium',    color: '#a78bfa', icon: '◇' },
  { key: 'helium',      label: 'Helium',      color: '#34d399', icon: '◎' },
  { key: 'nahrung',     label: 'Nahrung',     color: '#86efac', icon: '◈' },
  { key: 'wasser',      label: 'Wasser',      color: '#67e8f9', icon: '〇' },
  { key: 'bauxit',      label: 'Bauxit',      color: '#fb923c', icon: '◆' },
  { key: 'aluminium',   label: 'Aluminium',   color: '#c0c0c0', icon: '▽' },
  { key: 'uran',        label: 'Uran',        color: '#4ade80', icon: '☢' },
  { key: 'plutonium',   label: 'Plutonium',   color: '#f472b6', icon: '⚛' },
  { key: 'wasserstoff', label: 'Wasserstoff', color: '#38bdf8', icon: '↑' },
]

const PROD_PER_MINE_PER_HOUR = 120

const MINE_COSTS = { titan: 200, silizium: 150, aluminium: 100, credits: 500 }

function fmt(n) {
  return Math.floor(n).toLocaleString('de-DE')
}

function MineCard({ res, mines, freeSlots, onBuild, planet, saving }) {
  const [amount, setAmount] = useState(1)
  const prod = mines * PROD_PER_MINE_PER_HOUR
  const canBuild = freeSlots >= amount && amount > 0

  // Menge auf verfügbare Slots begrenzen wenn sich freeSlots ändert
  useEffect(() => {
    if (amount > freeSlots) setAmount(Math.max(1, freeSlots))
  }, [freeSlots])

  return (
    <motion.div layout className="rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${mines > 0 ? res.color + '30' : 'rgba(148,163,184,0.1)'}`,
        background: mines > 0 ? `${res.color}0a` : 'rgba(4,13,26,0.6)',
      }}>

      <div className="flex gap-4 p-4">
        {/* Links: Icon 50x50 */}
        <div className="flex-shrink-0 flex items-center justify-center rounded-lg text-3xl"
          style={{
            width: 54, height: 54,
            background: `${res.color}18`,
            border: `1px solid ${res.color}28`,
          }}>
          <span style={{ color: res.color }}>{res.icon}</span>
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
          {/* Kosten */}
          <div className="text-right space-y-0.5">
            <p className="text-xs text-slate-600 font-mono uppercase tracking-wide">Kosten/Mine</p>
            {Object.entries(MINE_COSTS).map(([k, v]) => (
              <p key={k} className="text-xs font-mono text-slate-400">
                <span className="text-slate-200">{fmt(v)}</span> {k}
              </p>
            ))}
          </div>

          {/* Anzahl + Bauen */}
          {freeSlots > 0 ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={freeSlots}
                value={amount}
                onChange={e => {
                  const v = Math.max(1, Math.min(freeSlots, parseInt(e.target.value) || 1))
                  setAmount(v)
                }}
                className="w-14 text-center rounded px-2 py-1 text-sm font-mono font-bold"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${res.color}40`,
                  color: '#e2e8f0',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => { onBuild(amount); setAmount(1) }}
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
  const { planet, buildings, addNotification, refreshPlanet } = useGameStore()
  const [dist, setDist] = useState({})
  const [saving, setSaving] = useState(false)

  const hqLevel = buildings.find(b => b.building_id === 'hq')?.level ?? 0
  const totalSlots = hqLevel * 50
  const usedSlots = Object.values(dist).reduce((a, b) => a + (b || 0), 0)
  const freeSlots = totalSlots - usedSlots

  useEffect(() => {
    if (planet?.mine_distribution) setDist(planet.mine_distribution)
  }, [planet?.id])

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
          {/* Gesamtbalken */}
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

      {/* 2-spaltiges Grid, 5 links + 5 rechts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          {MINEABLE.slice(0, 5).map(res => (
            <MineCard key={res.key} res={res}
              mines={dist[res.key] ?? 0}
              freeSlots={freeSlots}
              onBuild={(n) => handleBuild(res.key, n)}
              planet={planet} saving={saving}
            />
          ))}
        </div>
        <div className="space-y-4">
          {MINEABLE.slice(5, 10).map(res => (
            <MineCard key={res.key} res={res}
              mines={dist[res.key] ?? 0}
              freeSlots={freeSlots}
              onBuild={(n) => handleBuild(res.key, n)}
              planet={planet} saving={saving}
            />
          ))}
        </div>
      </div>

      {/* Hinweis Tick-System */}
      <div className="panel p-4 text-sm text-slate-500 font-mono">
        ⚙ Produktion wird durch das Tick-System alle 30 Sekunden gutgeschrieben.
        Einmal gebaute Minen können nicht abgerissen werden.
      </div>
    </div>
  )
}
