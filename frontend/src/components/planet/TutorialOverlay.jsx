// src/components/planet/TutorialOverlay.jsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ChevronRight, X, CheckCircle, Circle } from 'lucide-react'

// Reihenfolge der Gebäude im Tutorial
export const TUTORIAL_BUILDINGS = [
  'hq', 'power_plant', 'shipyard', 'ship_dock',
  'research_lab', 'university', 'bunker', 'defense_base',
  'gov_center', 'comm_network'
]

const TUTORIAL_STEPS = [
  {
    building: 'hq',
    title: '🏛️ Hauptquartier',
    text: 'Das Herz deiner Kolonie. Jedes Level schaltet 50 neue Minenslots frei und gibt alle 2 Level einen Skillpunkt. Baue es zuerst!',
  },
  {
    building: 'power_plant',
    title: '⚡ Kraftwerk',
    text: 'Ohne Energie laufen keine Minen. Das Kraftwerk erzeugt Energie für alle Gebäude. Halte die Energiebilanz immer im Plus!',
  },
  {
    building: 'shipyard',
    title: '🚀 Schiffswerft',
    text: 'Hier baust du deine Flotte. Jedes Level erhöht die Werftkapazität und beschleunigt den Schiffsbau.',
  },
  {
    building: 'ship_dock',
    title: '🔧 Schiffsdock',
    text: 'Im Schiffsdock werden beschädigte Schiffe repariert und umgebaut. Höhere Level senken Kosten und Zeit.',
  },
  {
    building: 'research_lab',
    title: '🔬 Forschungszentrum',
    text: 'Hier erforschst du neue Technologien. Bessere Antriebe, stärkere Waffen, effizientere Bauteile — alles beginnt hier.',
  },
  {
    building: 'university',
    title: '🎓 Universität',
    text: 'Bilde Forscher aus. Forscher erhöhen die Chance auf erfolgreiche Forschung. Mehr Forscher = mehr Fortschritt!',
  },
  {
    building: 'bunker',
    title: '🛡️ Bunker',
    text: 'Der Bunker schützt Ressourcen vor Plünderungen. Begrenzter Platz — plane klug, was du schützt.',
  },
  {
    building: 'defense_base',
    title: '🔫 Planetenverteidigung',
    text: 'Hier baust du Verteidigungsanlagen. Kann deaktiviert werden — dann ist dein Planet unantastbar, schießt aber nicht zurück.',
  },
  {
    building: 'gov_center',
    title: '⚖️ Regierungssitz',
    text: 'Erzeugt Credits durch Steuern. Credits brauchst du für Forscher, Reparaturen und Handel.',
  },
  {
    building: 'comm_network',
    title: '📡 Kommunikationsnetzwerk',
    text: 'Dein Radar. Zeigt alle Objekte in Scanreichweite: Asteroiden, Schiffe, NPC-Flotten. Alle 2 Level +1 Parsec Reichweite.',
  },
  {
    building: null,
    title: '✅ Tutorial abgeschlossen!',
    text: 'Alle Gebäude gebaut! Jetzt kannst du deine ersten Schiffe bauen. Geh zur Schiffswerft und baue einen Scout.',
    isLast: true,
  },
]

export default function TutorialOverlay() {
  const { tutorialStep, setTutorialStep, completeTutorial, buildings, buildQueue } = useGameStore()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const step = TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)]
  const currentBuilding = step.building

  // Prüfen ob das aktuelle Tutorial-Gebäude bereits gebaut wurde (level >= 1) oder in Queue ist
  const isBuildingDone = currentBuilding
    ? (buildings.find(b => b.building_id === currentBuilding)?.level ?? 0) >= 1
    : true
  const isBuildingInQueue = currentBuilding
    ? buildQueue.some(q => q.building_id === currentBuilding)
    : false
  const canAdvance = isBuildingDone || step.isLast

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-8 right-72 z-40 w-88"
        style={{ width: 360 }}>
        <div className="panel overflow-hidden"
          style={{ boxShadow: '0 0 30px rgba(34,211,238,0.2)' }}>
          <div className="panel-header justify-between">
            <span className="text-sm">Tutorial — Schritt {tutorialStep + 1}/{TUTORIAL_STEPS.length}</span>
            <button onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-base text-slate-200">{step.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{step.text}</p>

            {/* Status des aktuellen Gebäudes */}
            {currentBuilding && (
              <div className="flex items-center gap-2 text-sm px-3 py-2 rounded"
                style={{
                  background: isBuildingDone
                    ? 'rgba(34,211,238,0.08)'
                    : isBuildingInQueue
                    ? 'rgba(251,191,36,0.08)'
                    : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${isBuildingDone ? 'rgba(34,211,238,0.2)' : isBuildingInQueue ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.2)'}`
                }}>
                {isBuildingDone ? (
                  <><CheckCircle size={14} className="text-cyan-400" /><span className="text-cyan-400">Gebäude gebaut ✓</span></>
                ) : isBuildingInQueue ? (
                  <><Circle size={14} className="text-amber-400" /><span className="text-amber-400">In Bau-Queue — warte auf Fertigstellung</span></>
                ) : (
                  <><Circle size={14} className="text-red-400" /><span className="text-red-400">Noch nicht gebaut — baue es zuerst!</span></>
                )}
              </div>
            )}

            {/* Progress dots */}
            <div className="flex gap-1.5 flex-wrap">
              {TUTORIAL_STEPS.map((s, i) => {
                const done = i < tutorialStep || (buildings.find(b => b.building_id === s.building)?.level ?? 0) >= 1
                return (
                  <div key={i} className="w-2 h-2 rounded-full"
                    style={{ background: done ? '#22d3ee' : i === tutorialStep ? 'rgba(34,211,238,0.5)' : 'rgba(34,211,238,0.15)' }} />
                )
              })}
            </div>

            <div className="flex gap-2">
              {step.isLast ? (
                <button onClick={() => { completeTutorial(); setDismissed(true) }}
                  className="btn-primary flex-1 text-sm">
                  Zur Schiffswerft →
                </button>
              ) : (
                <button
                  onClick={() => canAdvance && setTutorialStep(tutorialStep + 1)}
                  disabled={!canAdvance}
                  className={`btn-primary flex items-center gap-1.5 text-sm ${!canAdvance ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  Weiter <ChevronRight size={13} />
                </button>
              )}
              <button onClick={() => setDismissed(true)} className="btn-ghost text-sm">
                Schließen
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
