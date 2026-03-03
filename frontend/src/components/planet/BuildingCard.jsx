// src/components/planet/BuildingCard.jsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { formatTime, formatNumber } from '@/lib/utils'
import { Hammer, ChevronUp, Lock, Clock } from 'lucide-react'

const BUILDING_IMAGES = {
  hq:           '/Starbound-Alpha/buildings/hq.png',
  power_plant:  '/Starbound-Alpha/buildings/kraftwerk.png',
  shipyard:     '/Starbound-Alpha/buildings/schiffswerft.png',
  ship_dock:    '/Starbound-Alpha/buildings/werft.png',
  research_lab: '/Starbound-Alpha/buildings/forschung.png',
  university:   '/Starbound-Alpha/buildings/universitaet.png',
  bunker:       '/Starbound-Alpha/buildings/bunker.png',
  defense_base: '/Starbound-Alpha/buildings/verteidigung.png',
  gov_center:   '/Starbound-Alpha/buildings/regierung.png',
  comm_network: '/Starbound-Alpha/buildings/kommnetz.png',
}

const BUILDING_ICONS = {
  hq:           '🏛️',
  power_plant:  '⚡',
  shipyard:     '🚀',
  ship_dock:    '🔧',
  research_lab: '🔬',
  university:   '🎓',
  bunker:       '🛡️',
  defense_base: '🔫',
  gov_center:   '⚖️',
  comm_network: '📡',
}

const BUILDING_EFFECTS = {
  hq:           (lvl) => `+${lvl * 50} Minenslots · ${Math.min(lvl * 0.5, 20).toFixed(1)}% günstigere Kosten`,
  power_plant:  (lvl) => `${lvl * 100} Energie verfügbar`,
  shipyard:     (lvl) => `${lvl * 500} Werftkapazität · -${lvl * 2} min Bauzeit`,
  ship_dock:    (lvl) => `-${(lvl * 1.5).toFixed(1)}% Reparaturzeit`,
  research_lab: (lvl) => `-${(lvl * 1.5).toFixed(1)}% Forschungskosten`,
  university:   (lvl) => `${lvl * 2} Forscher-Kapazität`,
  bunker:       (lvl) => `${(500 + lvl * 400).toLocaleString()} Schutz je Ressource`,
  defense_base: (lvl) => `${lvl * 500} Turmkapazität`,
  gov_center:   (lvl) => `+${lvl * 5} Credits/Tick`,
  comm_network: (lvl) => `${10 + Math.floor(lvl / 2)}pc Scanradius`,
}

function calcCost(def, targetLevel) {
  if (!def) return {}
  const scale = Math.pow(def.cost_scale_factor, targetLevel - 1)
  const costs = {}
  const keys = ['titan','silizium','helium','nahrung','wasser','bauxit','aluminium','uran','plutonium','wasserstoff','credits']
  for (const k of keys) {
    const base = def[`cost_${k}`]
    if (base > 0) costs[k] = Math.floor(base * scale)
  }
  return costs
}

function calcBuildSecs(def, level) {
  if (!def) return 0
  if (import.meta.env.VITE_ALPHA_MODE === 'true') return 10
  return Math.max(10, Math.floor(def.base_build_seconds * Math.pow(def.growth_factor, level - 1)))
}

function canAfford(planet, costs) {
  for (const [res, amt] of Object.entries(costs)) {
    if ((planet[res] ?? 0) < amt) return false
  }
  return true
}

const RESOURCE_LABELS = {
  titan: 'Titan', silizium: 'Silizium', helium: 'Helium',
  nahrung: 'Nahrung', wasser: 'Wasser', bauxit: 'Bauxit',
  aluminium: 'Alu', uran: 'Uran', plutonium: 'Pluto',
  wasserstoff: 'H₂', credits: 'Credits'
}

export default function BuildingCard({ def, level, planet, queueFull, inQueue, isBuilding }) {
  const [showCosts, setShowCosts] = useState(false)
  const [loading, setLoading] = useState(false)
  const { queueBuild, addNotification } = useGameStore()

  const targetLevel = level + 1
  const costs = calcCost(def, targetLevel)
  const affordable = canAfford(planet, costs)
  const buildSecs = calcBuildSecs(def, targetLevel)
  const effect = BUILDING_EFFECTS[def.id]?.(targetLevel)
  const image = BUILDING_IMAGES[def.id]

  const handleBuild = async () => {
    if (loading || queueFull || inQueue) return
    setLoading(true)
    try {
      await queueBuild(def.id)
      addNotification(`${def.name} Lvl ${targetLevel} in Bau-Queue`, 'success')
    } catch (err) {
      addNotification(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      layout
      className="panel overflow-hidden"
      whileHover={{ borderColor: 'rgba(34,211,238,0.3)' }}>

      {/* Gebäudebild */}
      {image && (
        <div className="relative w-full h-36 overflow-hidden">
          <img
            src={image}
            alt={def.name}
            className="w-full h-full object-cover"
            style={{ filter: level === 0 ? 'grayscale(60%) brightness(0.6)' : 'brightness(0.85)' }}
          />
          {/* Overlay Gradient */}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(4,13,26,0.95) 100%)' }} />
          {/* Level Badge */}
          {level > 0 && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono font-bold"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee' }}>
              Lvl {level}
            </div>
          )}
          {level === 0 && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              Nicht gebaut
            </div>
          )}
          {isBuilding && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono text-amber-400"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              <Hammer size={10} className="animate-pulse" /> In Bau
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="panel-header">
        <span className="text-base">{BUILDING_ICONS[def.id]}</span>
        <span>{def.name}</span>
      </div>

      <div className="p-3 space-y-3">
        {/* Level progress dots */}
        <div className="flex gap-1 flex-wrap">
          {Array.from({ length: Math.min(level + 3, 10) }).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i < level ? '#22d3ee' :
                  i === level ? 'rgba(34,211,238,0.4)' : 'rgba(34,211,238,0.1)'
              }} />
          ))}
          {level > 7 && <span className="text-xs text-slate-500 font-mono">+{level - 7}</span>}
        </div>

        {/* Effect */}
        {effect && level > 0 && (
          <p className="text-xs text-slate-400 font-mono">{effect}</p>
        )}

        {/* Next level effect */}
        <p className="text-xs text-cyan-600">
          → Lvl {targetLevel}: {BUILDING_EFFECTS[def.id]?.(targetLevel) ?? ''}
        </p>

        {/* Costs toggle */}
        <div>
          <button
            onClick={() => setShowCosts(!showCosts)}
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
            {showCosts ? '▾' : '▸'} Kosten für Lvl {targetLevel}
          </button>

          {showCosts && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 grid grid-cols-2 gap-1">
              {Object.entries(costs).map(([res, amt]) => (
                <div key={res} className={`flex justify-between text-xs px-2 py-1 rounded
                  ${(planet[res] ?? 0) >= amt ? 'text-slate-400' : 'text-red-400'}`}
                  style={{ background: 'rgba(4,13,26,0.5)' }}>
                  <span>{RESOURCE_LABELS[res] ?? res}</span>
                  <span className="font-mono">{amt.toLocaleString()}</span>
                </div>
              ))}
              <div className="col-span-2 flex justify-between text-xs px-2 py-1 rounded text-slate-500"
                style={{ background: 'rgba(4,13,26,0.5)' }}>
                <span className="flex items-center gap-1"><Clock size={10} /> Bauzeit</span>
                <span className="font-mono">{formatTime(buildSecs)}</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Action button */}
        {inQueue ? (
          <div className="text-xs text-center py-1.5 rounded text-amber-500/70 font-mono"
            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
            {isBuilding ? '🔨 In Bau' : '⏳ In Queue'}
          </div>
        ) : (
          <button
            onClick={handleBuild}
            disabled={loading || queueFull || !affordable}
            className={`w-full btn-primary py-1.5 text-xs ${!affordable ? 'opacity-40' : ''}`}>
            {queueFull ? (
              <span className="flex items-center justify-center gap-1.5"><Lock size={11} /> Queue voll</span>
            ) : !affordable ? (
              '✗ Ressourcen fehlen'
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <ChevronUp size={12} /> Auf Lvl {targetLevel} ausbauen
              </span>
            )}
          </button>
        )}
      </div>
    </motion.div>
  )
}
