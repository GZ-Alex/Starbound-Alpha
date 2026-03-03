// src/components/planet/MineDistribution.jsx
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useGameStore } from '@/store/gameStore'
import { RESOURCE_NAMES, RESOURCE_COLORS } from '@/lib/utils'

const MINEABLE = ['titan','silizium','helium','nahrung','wasser','bauxit','aluminium','uran','plutonium','wasserstoff']

export default function MineDistribution({ planet }) {
  const { addNotification, refreshPlanet } = useGameStore()
  const [dist, setDist] = useState(planet.mine_distribution ?? {})
  const [saving, setSaving] = useState(false)

  const totalSlots = planet.total_mine_slots ?? 0
  const usedSlots = Object.values(dist).reduce((a, b) => a + (b || 0), 0)
  const remaining = totalSlots - usedSlots

  const setSlots = (res, val) => {
    const v = Math.max(0, parseInt(val) || 0)
    const others = Object.entries(dist).filter(([k]) => k !== res).reduce((a, [,v]) => a + v, 0)
    if (others + v > totalSlots) return
    setDist(prev => ({ ...prev, [res]: v }))
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('planets')
      .update({ mine_distribution: dist })
      .eq('id', planet.id)
    setSaving(false)
    if (error) addNotification('Fehler beim Speichern', 'error')
    else { addNotification('Minenverteilung gespeichert', 'success'); refreshPlanet() }
  }

  if (totalSlots === 0) {
    return (
      <div className="panel p-6 text-center text-slate-500">
        <p>Baue zuerst das Hauptquartier um Minenslots freizuschalten.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Minenverteilung — {usedSlots} / {totalSlots} Slots belegt</span>
        <div className="ml-auto">
          <span className={`tag ${remaining > 0 ? 'tag-amber' : 'tag-cyan'}`}>
            {remaining} frei
          </span>
        </div>
      </div>

      {/* Slot bar */}
      <div className="px-4 pt-3">
        <div className="h-3 rounded-full overflow-hidden flex"
          style={{ background: 'rgba(34,211,238,0.08)' }}>
          {MINEABLE.map(res => {
            const slots = dist[res] || 0
            if (!slots) return null
            return (
              <div key={res} style={{
                width: `${(slots / totalSlots) * 100}%`,
                background: RESOURCE_COLORS[res],
                opacity: 0.7
              }} title={`${RESOURCE_NAMES[res]}: ${slots}`} />
            )
          })}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {MINEABLE.map(res => (
          <div key={res} className="space-y-1.5">
            <label className="text-xs font-mono" style={{ color: RESOURCE_COLORS[res] }}>
              {RESOURCE_NAMES[res]}
            </label>
            <input
              type="number"
              min={0}
              max={totalSlots}
              value={dist[res] || 0}
              onChange={e => setSlots(res, e.target.value)}
              className="input-field text-xs py-1 text-center"
              style={{ borderColor: (dist[res] || 0) > 0 ? RESOURCE_COLORS[res] + '44' : undefined }}
            />
            <div className="text-[10px] text-slate-600 font-mono text-center">
              +{((dist[res] || 0) * 2).toLocaleString()}/tick
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Speichert...' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}
