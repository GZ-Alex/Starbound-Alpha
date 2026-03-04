// src/pages/MinesPage.jsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { Plus, Minus } from 'lucide-react'

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

// Produktion pro Mine pro Stunde (Beispielwert — anpassen wenn DB-Formel bekannt)
const PROD_PER_MINE_PER_HOUR = 120

// Kosten für eine neue Mine (Beispielwerte — anpassen)
const MINE_COSTS = {
  titan: 200, silizium: 150, aluminium: 100, credits: 500
}

function fmtFull(n) {
  return Math.floor(n).toLocaleString('de-DE')
}

function MineCard({ res, mines, maxMines, onAdd, onRemove, planet, saving }) {
  const prod = mines * PROD_PER_MINE_PER_HOUR
  const canAdd = mines < maxMines
  const canRemove = mines > 0

  return (
    <motion.div
      layout
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${mines > 0 ? res.color + '33' : 'rgba(148,163,184,0.1)'}`,
        background: mines > 0 ? `${res.color}08` : 'rgba(4,13,26,0.5)',
      }}>

      {/* Ressourcen-Icon + Name */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        {/* Platzhalter-Bild 50x50 */}
        <div className="flex-shrink-0 rounded overflow-hidden flex items-center justify-center text-2xl"
          style={{
            width: 50, height: 50,
            background: `${res.color}15`,
            border: `1px solid ${res.color}30`,
          }}>
          <span style={{ color: res.color }}>{res.icon}</span>
        </div>
        <div>
          <p className="font-display font-semibold text-sm" style={{ color: res.color }}>
            {res.label}
          </p>
          <p className="text-xs font-mono text-slate-500">
            {fmtFull(planet[res.key] ?? 0)} vorhanden
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 pb-2 space-y-1">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-600">Minen</span>
          <span className="text-slate-300">{mines}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-600">Produktion</span>
          <span style={{ color: prod > 0 ? '#4ade80' : '#475569' }}>
            {prod > 0 ? `+${fmtFull(prod)}/h` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-600">Kosten/Mine</span>
          <span className="text-slate-500">
            {Object.entries(MINE_COSTS).map(([k, v]) => `${fmtFull(v)} ${k}`).join(', ')}
          </span>
        </div>
      </div>

      {/* Mine-Balken */}
      {maxMines > 0 && (
        <div className="px-3 pb-2">
          <div className="w-full rounded-full h-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-1 rounded-full transition-all"
              style={{ width: `${(mines / maxMines) * 100}%`, background: res.color, opacity: 0.6 }} />
          </div>
        </div>
      )}

      {/* Aktionen */}
      <div className="flex gap-1.5 px-3 pb-3">
        <button
          onClick={onRemove}
          disabled={!canRemove || saving}
          className="flex items-center justify-center w-8 h-8 rounded transition-all"
          style={{
            background: canRemove ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.03)',
            border: canRemove ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(255,255,255,0.06)',
            color: canRemove ? '#f87171' : '#1e293b',
            cursor: !canRemove || saving ? 'not-allowed' : 'pointer',
          }}>
          <Minus size={12} />
        </button>

        <button
          onClick={onAdd}
          disabled={!canAdd || saving}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded text-xs font-mono transition-all"
          style={{
            background: canAdd ? `${res.color}15` : 'rgba(255,255,255,0.03)',
            border: canAdd ? `1px solid ${res.color}40` : '1px solid rgba(255,255,255,0.06)',
            color: canAdd ? res.color : '#1e293b',
            cursor: !canAdd || saving ? 'not-allowed' : 'pointer',
          }}>
          {saving ? (
            <span>...</span>
          ) : canAdd ? (
            <><Plus size={11} /> Mine bauen</>
          ) : (
            'Keine Slots'
          )}
        </button>
      </div>
    </motion.div>
  )
}

export default function MinesPage() {
  const { planet, buildings, addNotification, refreshPlanet } = useGameStore()
  const [dist, setDist] = useState({})
  const [saving, setSaving] = useState(false)

  // HQ-Level bestimmt Slots: 50 * hqLevel
  const hqLevel = buildings.find(b => b.building_id === 'hq')?.level ?? 0
  const totalSlots = hqLevel * 50
  const usedSlots = Object.values(dist).reduce((a, b) => a + (b || 0), 0)
  const freeSlots = totalSlots - usedSlots

  // dist aus planet.mine_distribution initialisieren
  useEffect(() => {
    if (planet?.mine_distribution) {
      setDist(planet.mine_distribution)
    }
  }, [planet?.id])

  const handleAdd = async (resKey) => {
    if (freeSlots <= 0 || saving) return
    setSaving(true)
    const newDist = { ...dist, [resKey]: (dist[resKey] ?? 0) + 1 }
    const { error } = await supabase.from('planets')
      .update({ mine_distribution: newDist })
      .eq('id', planet.id)
    if (error) {
      addNotification('Fehler: ' + error.message, 'error')
    } else {
      setDist(newDist)
      refreshPlanet()
    }
    setSaving(false)
  }

  const handleRemove = async (resKey) => {
    if ((dist[resKey] ?? 0) <= 0 || saving) return
    setSaving(true)
    const newDist = { ...dist, [resKey]: (dist[resKey] ?? 0) - 1 }
    const { error } = await supabase.from('planets')
      .update({ mine_distribution: newDist })
      .eq('id', planet.id)
    if (error) {
      addNotification('Fehler: ' + error.message, 'error')
    } else {
      setDist(newDist)
      refreshPlanet()
    }
    setSaving(false)
  }

  if (!planet) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      Kein Planet gefunden...
    </div>
  )

  if (hqLevel < 1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <h2 className="text-xl font-display text-slate-400">Hauptquartier erforderlich</h2>
        <p className="text-slate-600 text-sm">Baue zuerst das Hauptquartier um Minenslots freizuschalten.</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Minen</h2>
          <p className="text-sm text-slate-500 font-mono mt-0.5">
            HQ Lvl {hqLevel} · {usedSlots} / {totalSlots} Slots belegt · {freeSlots} frei
          </p>
        </div>
        {/* Slot-Balken */}
        <div className="w-48">
          <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-2 rounded-full transition-all"
              style={{
                width: totalSlots > 0 ? `${(usedSlots / totalSlots) * 100}%` : '0%',
                background: freeSlots === 0 ? '#ef4444' : '#22d3ee',
              }} />
          </div>
          <p className="text-xs font-mono text-slate-600 mt-1 text-right">
            {freeSlots === 0 ? '⚠ Voll' : `${freeSlots} Slots frei`}
          </p>
        </div>
      </div>

      {/* 5 + 5 Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Linke Spalte: erste 5 */}
        <div className="space-y-3">
          {MINEABLE.slice(0, 5).map(res => (
            <MineCard
              key={res.key}
              res={res}
              mines={dist[res.key] ?? 0}
              maxMines={totalSlots}
              onAdd={() => handleAdd(res.key)}
              onRemove={() => handleRemove(res.key)}
              planet={planet}
              saving={saving}
            />
          ))}
        </div>
        {/* Rechte Spalte: letzte 5 */}
        <div className="space-y-3">
          {MINEABLE.slice(5, 10).map(res => (
            <MineCard
              key={res.key}
              res={res}
              mines={dist[res.key] ?? 0}
              maxMines={totalSlots}
              onAdd={() => handleAdd(res.key)}
              onRemove={() => handleRemove(res.key)}
              planet={planet}
              saving={saving}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
