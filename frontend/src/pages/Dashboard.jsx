// src/pages/Dashboard.jsx
import { useGameStore } from '@/store/gameStore'
import { motion } from 'framer-motion'

export default function Dashboard() {
  const { player, planet } = useGameStore()
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
    </div>
  )
}
