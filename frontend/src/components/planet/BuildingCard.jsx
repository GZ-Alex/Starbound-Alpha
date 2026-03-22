// src/components/planet/BuildingCard.jsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/gameStore'
import { formatTime } from '@/lib/utils'
import { Hammer, ChevronUp, Lock, Clock, ExternalLink } from 'lucide-react'

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

// Which route to open when clicking the building image
const BUILDING_ROUTES = {
  hq:           '/mines',
  power_plant:  null,
  shipyard:     '/shipyard',
  ship_dock:    '/dock',
  research_lab: '/research',
  university:   null,
  bunker:       '/bunker',
  defense_base: null,
  gov_center:   '/government',
  comm_network: '/scan',
}

const BUILDING_ICONS = {
  hq: '🏛️', power_plant: '⚡', shipyard: '🚀', ship_dock: '🔧',
  research_lab: '🔬', university: '🎓', bunker: '🛡️',
  defense_base: '🔫', gov_center: '⚖️', comm_network: '📡',
}

const BUILDING_EFFECTS = {
  hq:           (lvl) => `+${lvl * 50} Minenslots`,
  power_plant:  (lvl) => `${lvl * 100} Energie`,
  shipyard:     (lvl) => `${lvl * 500} Werftkapazität`,
  ship_dock:    (lvl) => `-${(lvl * 1.5).toFixed(1)}% Reparaturzeit`,
  research_lab: (lvl) => `-${(lvl * 1.5).toFixed(1)}% Forschungskosten`,
  university:   (lvl) => `${lvl * 2} Forscher-Kapazität`,
  bunker:       (lvl) => `${(lvl * 15000).toLocaleString('de-DE')} Einheiten Kapazität`,
  defense_base: (lvl) => `${lvl * 500} Turmkapazität`,
  gov_center:   (lvl) => `+${(lvl * 1000).toLocaleString('de-DE')} Credits/h`,
  comm_network: (lvl) => `${10 + Math.floor(lvl / 2)}pc Radar`,
}

const RESOURCE_LABELS = {
  titan: 'Titan', silizium: 'Silizium', helium: 'Helium',
  nahrung: 'Nahrung', wasser: 'Wasser', bauxit: 'Bauxit',
  aluminium: 'Aluminium', uran: 'Uran', plutonium: 'Plutonium',
  wasserstoff: 'H₂', credits: 'Credits'
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
  return Math.max(10, Math.floor(def.base_build_seconds * Math.pow(def.growth_factor, level - 1)))
}

function canAfford(planet, costs) {
  return Object.entries(costs).every(([res, amt]) => (planet[res] ?? 0) >= amt)
}

export default function BuildingCard({ def, level, planet, queueFull, inQueue, isBuilding, tutorialAllowed }) {
  const [loading, setLoading] = useState(false)
  const { queueBuild, addNotification } = useGameStore()
  const navigate = useNavigate()

  const targetLevel = level + 1
  const costs = calcCost(def, targetLevel)
  const affordable = canAfford(planet, costs)
  const buildSecs = calcBuildSecs(def, targetLevel)
  const image = BUILDING_IMAGES[def.id]
  const route = BUILDING_ROUTES[def.id]
  const blocked = tutorialAllowed === false

  const handleBuild = async (e) => {
    e.stopPropagation()
    if (loading || queueFull || inQueue || blocked) return
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

  const handleImageClick = () => {
    if (route && level > 0) navigate(route)
  }

  return (
    <motion.div
      layout
      className="panel overflow-hidden flex flex-col"
      style={{ opacity: blocked ? 0.45 : 1 }}
      whileHover={!blocked ? { borderColor: 'rgba(34,211,238,0.3)' } : {}}>

      {/* Gebäudebild — klickbar wenn Gebäude gebaut und Route vorhanden */}
      {image && (
        <div
          className="relative overflow-hidden flex-shrink-0"
          style={{ height: 300, cursor: route && level > 0 ? 'pointer' : 'default' }}
          onClick={handleImageClick}>
          <img
            src={image}
            alt={def.name}
            className="w-full h-full object-cover transition-transform duration-300"
            style={{
              filter: level === 0 ? 'grayscale(60%) brightness(0.6)' : 'brightness(0.85)',
              transform: route && level > 0 ? undefined : undefined
            }}
          />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(4,13,26,0.97) 100%)' }} />

          {/* Level badge */}
          {level > 0 && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-sm font-mono font-bold"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee' }}>
              Lvl {level}
            </div>
          )}
          {level === 0 && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-sm font-mono"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              Nicht gebaut
            </div>
          )}

          {/* In Bau badge */}
          {isBuilding && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-mono text-amber-400"
              style={{ background: 'rgba(0,0,0,0.7)' }}>
              <Hammer size={12} className="animate-pulse" /> In Bau
            </div>
          )}

          {/* Navigate hint */}
          {route && level > 0 && (
            <div className="absolute bottom-10 right-2 flex items-center gap-1 text-xs text-cyan-400/60 font-mono">
              <ExternalLink size={11} /> öffnen
            </div>
          )}

          {/* Tutorial lock */}
          {blocked && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.45)' }}>
              <span className="text-slate-300 text-sm font-mono bg-black/60 px-3 py-1.5 rounded">🔒 Gesperrt</span>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="panel-header flex-shrink-0">
        <span className="text-base">{BUILDING_ICONS[def.id]}</span>
        <span className="text-sm font-semibold truncate">{def.name}</span>
      </div>

      <div className="p-3 flex flex-col flex-1 gap-2">
        {/* Effect */}
        <p className="text-sm text-slate-400 font-mono min-h-[1.25rem]">
          {level > 0 ? BUILDING_EFFECTS[def.id]?.(level) : ''}
        </p>
        <p className="text-sm text-cyan-600">
          → Lvl {targetLevel}: {BUILDING_EFFECTS[def.id]?.(targetLevel)}
        </p>

        {/* Bauzeit */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
          <Clock size={11} />
          {formatTime(buildSecs)}
        </div>

        {/* Kosten — feste Höhe durch scroll */}
        <div className="rounded overflow-hidden text-xs" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid font-mono px-2 py-1 text-slate-600"
            style={{ gridTemplateColumns: '1fr 60px 70px', background: 'rgba(0,0,0,0.3)' }}>
            <span>Res.</span>
            <span className="text-right">Kost.</span>
            <span className="text-right">Rest</span>
          </div>
          {Object.entries(costs).map(([res, amt]) => {
            const have = planet[res] ?? 0
            const rest = have - amt
            const ok = rest >= 0
            return (
              <div key={res} className="grid font-mono px-2 py-0.5"
                style={{ gridTemplateColumns: '1fr 60px 70px', background: 'rgba(4,13,26,0.5)', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="text-slate-400 truncate">{RESOURCE_LABELS[res]}</span>
                <span className="text-right text-slate-300">{amt.toLocaleString()}</span>
                <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                  {ok ? rest.toLocaleString() : `−${Math.abs(rest).toLocaleString()}`}
                </span>
              </div>
            )
          })}
        </div>

        {/* Button — immer am Ende dank flex-1 + mt-auto */}
        <div className="mt-auto pt-1">
          {inQueue ? (
            <div className="text-xs text-center py-2 rounded text-amber-500/70 font-mono"
              style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
              {isBuilding ? '🔨 In Bau' : '⏳ In Queue'}
            </div>
          ) : (
            <button
              onClick={handleBuild}
              disabled={loading || queueFull || !affordable || blocked}
              className={`w-full btn-primary py-2 text-sm flex items-center justify-center gap-1.5 ${(!affordable || blocked) ? 'opacity-40' : ''}`}>
              {blocked ? '🔒 Gesperrt'
                : queueFull ? <><Lock size={12} /> Queue voll</>
                : !affordable ? '✗ Ressourcen fehlen'
                : <><ChevronUp size={13} /> Lvl {targetLevel} bauen</>}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
