// src/pages/PlanetPage.jsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import BuildingCard from '@/components/planet/BuildingCard'
import BuildQueue from '@/components/planet/BuildQueue'
import MineDistribution from '@/components/planet/MineDistribution'
import BunkerPanel from '@/components/planet/BunkerPanel'
import TutorialOverlay, { TUTORIAL_BUILDINGS } from '@/components/planet/TutorialOverlay'
import { Building2, Hammer, Shield } from 'lucide-react'

const TABS = [
  { id: 'buildings', label: 'Gebäude',  icon: Building2 },
  { id: 'mines',     label: 'Minen',    icon: Hammer },
  { id: 'bunker',    label: 'Bunker',   icon: Shield },
]

export default function PlanetPage() {
  const { planet, player, buildings, buildQueue, loadPlanetData, tutorialStep } = useGameStore()
  const [tab, setTab] = useState('buildings')

  const { data: buildingDefs } = useQuery({
    queryKey: ['building-defs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('building_definitions')
        .select('*')
        .order('sort_order')
      return data ?? []
    },
    staleTime: Infinity
  })

  useEffect(() => {
    if (planet) loadPlanetData(planet.id)
    const interval = setInterval(() => {
      if (planet) loadPlanetData(planet.id)
    }, 5000)
    return () => clearInterval(interval)
  }, [planet?.id])

  if (!planet) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-base">
      Kein Planet gefunden...
    </div>
  )

  const getBuildingLevel = (id) => buildings.find(b => b.building_id === id)?.level ?? 0

  // Tutorial: welches Gebäude ist gerade dran?
  const tutorialActive = player && !player.tutorial_done
  const currentTutorialBuilding = tutorialActive
    ? TUTORIAL_BUILDINGS[Math.min(tutorialStep, TUTORIAL_BUILDINGS.length - 1)]
    : null

  // Ob ein Gebäude im Tutorial gebaut werden darf
  const isTutorialAllowed = (defId) => {
    if (!tutorialActive) return true
    if (!currentTutorialBuilding) return true
    // Das aktuelle Tutorial-Gebäude ist immer erlaubt
    if (defId === currentTutorialBuilding) return true
    // Bereits gebaute Gebäude können weiter ausgebaut werden
    if (getBuildingLevel(defId) >= 1) return true
    return false
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">{planet.name}</h2>
          <p className="text-sm text-slate-500 font-mono mt-0.5">
            Koordinaten: {planet.x} / {planet.y} / {planet.z}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="tag tag-cyan">HQ Lvl {getBuildingLevel('hq')}</span>
          {planet.is_homeworld && <span className="tag tag-amber">Heimatwelt</span>}
        </div>
      </div>

      {/* Build Queue */}
      {buildQueue.length > 0 && <BuildQueue queue={buildQueue} defs={buildingDefs ?? []} />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cyan-500/15">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-display font-medium tracking-wide transition-all
              ${tab === id
                ? 'text-cyan-400 border-b-2 border-cyan-400 -mb-px'
                : 'text-slate-500 hover:text-slate-300'}`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}>

        {tab === 'buildings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(buildingDefs ?? []).map(def => (
              <BuildingCard
                key={def.id}
                def={def}
                level={getBuildingLevel(def.id)}
                planet={planet}
                queueFull={buildQueue.length >= 2}
                inQueue={buildQueue.some(q => q.building_id === def.id)}
                isBuilding={buildQueue.find(q => q.building_id === def.id && q.queue_position === 1)}
                tutorialAllowed={isTutorialAllowed(def.id)}
              />
            ))}
          </div>
        )}

        {tab === 'mines' && <MineDistribution planet={planet} />}
        {tab === 'bunker' && <BunkerPanel planet={planet} />}
      </motion.div>

      {/* Tutorial */}
      {tutorialActive && <TutorialOverlay />}
    </div>
  )
}
