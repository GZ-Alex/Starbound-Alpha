// src/pages/Dashboard.jsx
import { useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

const CHEAT_RESOURCES = [
  'titan','silizium','helium','nahrung','wasser',
  'bauxit','aluminium','uran','plutonium','wasserstoff','credits'
]

export default function Dashboard() {
  const { player, planet, refreshPlanet } = useGameStore()
  const [cheating, setCheating] = useState(false)
  const [cheatDone, setCheatDone] = useState(false)

  const handleCheat = async () => {
    if (!planet || cheating) return
    setCheating(true)
    try {
      const updates = {}
      for (const res of CHEAT_RESOURCES) {
        updates[res] = (planet[res] ?? 0) + 10000
      }
      await supabase.from('planets').update(updates).eq('id', planet.id)
      await refreshPlanet()
      setCheatDone(true)
      setTimeout(() => setCheatDone(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setCheating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">
        Willkommen, Commander {player?.username}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="panel-header -mx-4 -mt-4 mb-3 px-4">Status</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Planet</span>
              <span className="font-mono text-cyan-400">{planet?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Koordinaten</span>
              <span className="font-mono text-xs">{planet ? `${planet.x}/${planet.y}/${planet.z}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Rasse</span>
              <span className={player?.race_id ? 'text-cyan-400' : 'text-amber-500/70'}>
                {player?.race_id ?? 'Nicht gewählt'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Beruf</span>
              <span className={player?.profession ? 'text-cyan-400' : 'text-amber-500/70'}>
                {player?.profession ?? 'Nicht gewählt'}
              </span>
            </div>
          </div>
        </div>
        <div className="panel p-4 md:col-span-2">
          <div className="panel-header -mx-4 -mt-4 mb-3 px-4">Neuigkeiten</div>
          <p className="text-slate-500 text-sm">Noch keine Ereignisse.</p>
        </div>
      </div>

      {/* Cheat Button */}
      <div className="panel p-4 border-amber-500/20">
        <div className="panel-header -mx-4 -mt-4 mb-3 px-4 text-amber-400">⚠ Dev-Tools</div>
        <button
          onClick={handleCheat}
          disabled={cheating || !planet}
          className="flex items-center gap-2 px-4 py-2 rounded font-mono text-sm font-bold transition-all"
          style={{
            background: cheatDone ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.1)',
            border: `1px solid ${cheatDone ? 'rgba(34,197,94,0.4)' : 'rgba(251,191,36,0.3)'}`,
            color: cheatDone ? '#4ade80' : '#fbbf24',
            opacity: cheating ? 0.5 : 1,
          }}>
          <Zap size={14} />
          {cheatDone ? '✓ +10.000 erhalten!' : cheating ? 'Lädt...' : '+10.000 alle Ressourcen'}
        </button>
        <p className="text-xs text-slate-600 mt-2 font-mono">Gibt 10.000 von jeder Ressource (außer Energie)</p>
      </div>
    </div>
  )
}
