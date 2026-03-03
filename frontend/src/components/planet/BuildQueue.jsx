// src/components/planet/BuildQueue.jsx
import { timeUntil } from '@/lib/utils'
import { Hammer, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function BuildQueue({ queue, defs }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])

  const getDef = (id) => defs.find(d => d.id === id)

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <Hammer size={13} />
        <span>Bau-Queue</span>
      </div>
      <div className="divide-y divide-cyan-500/10">
        {queue.map((item) => {
          const def = getDef(item.building_id)
          const isActive = item.queue_position === 1
          return (
            <div key={item.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${isActive ? 'bg-cyan-500/5' : ''}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-cyan-400 animate-pulse' : 'bg-slate-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200">
                  {def?.name ?? item.building_id} → Lvl {item.target_level}
                </div>
                {isActive && item.finish_at && (
                  <div className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {timeUntil(item.finish_at)}
                  </div>
                )}
              </div>
              <span className={`tag ${isActive ? 'tag-cyan' : 'tag-gray'} text-[10px]`}>
                {isActive ? 'Baut' : 'Wartet'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
