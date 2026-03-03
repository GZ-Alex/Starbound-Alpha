// src/components/planet/TutorialOverlay.jsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { ChevronRight, X } from 'lucide-react'

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
    text: 'Bilde Forscher aus. Forscher erhöhen die Chance auf erfolgreiche Forschung. Mehr Forscher = mehr Fortschritt, aber auch höhere Kosten!',
  },
  {
    building: 'bunker',
    title: '🛡️ Bunker',
    text: 'Der Bunker schützt Ressourcen vor Plünderungen. Aber er hat begrenzte Kapazität — plane klug, was du schützt.',
  },
  {
    building: 'defense_base',
    title: '🔫 Planetenverteidigung',
    text: 'Hier baust du Verteidigungsanlagen. Die Verteidigung kann deaktiviert werden — dann ist dein Planet unantastbar, schießt aber auch nicht zurück.',
  },
  {
    building: 'gov_center',
    title: '⚖️ Regierungssitz',
    text: 'Erzeugt Credits durch Steuern. Credits brauchst du für Forscher, Reparaturen und Handel. Die internationalen Gesetze stehen hier.',
  },
  {
    building: 'comm_network',
    title: '📡 Kommunikationsnetzwerk',
    text: 'Dein Radar. Zeigt alle Objekte in Scanreichweite: Asteroiden, andere Schiffe, NPC-Flotten. Alle 2 Level +1 Parsec Reichweite.',
  },
  {
    building: null,
    title: '✅ Tutorial abgeschlossen!',
    text: 'Alle Gebäude gebaut! Jetzt kannst du deine ersten Schiffe bauen. Geh zur Schiffswerft und baue einen Scout und ein kleines Frachtschiff.',
    isLast: true,
  },
]

export default function TutorialOverlay() {
  const { tutorialStep, setTutorialStep, completeTutorial } = useGameStore()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const step = TUTORIAL_STEPS[Math.min(tutorialStep, TUTORIAL_STEPS.length - 1)]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-8 right-72 z-40 w-80">
        <div className="panel overflow-hidden"
          style={{ boxShadow: '0 0 30px rgba(34,211,238,0.2)' }}>
          <div className="panel-header justify-between">
            <span>Tutorial — Schritt {tutorialStep + 1}/{TUTORIAL_STEPS.length}</span>
            <button onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300">
              <X size={12} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <h3 className="font-display font-semibold text-slate-200">{step.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{step.text}</p>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {TUTORIAL_STEPS.map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i <= tutorialStep ? '#22d3ee' : 'rgba(34,211,238,0.2)' }} />
              ))}
            </div>

            <div className="flex gap-2">
              {step.isLast ? (
                <button onClick={() => { completeTutorial(); setDismissed(true) }}
                  className="btn-primary flex-1">
                  Zur Schiffswerft →
                </button>
              ) : (
                <button onClick={() => setTutorialStep(tutorialStep + 1)}
                  className="btn-primary flex items-center gap-1.5 text-xs">
                  Weiter <ChevronRight size={12} />
                </button>
              )}
              <button onClick={() => setDismissed(true)} className="btn-ghost text-xs">
                Schließen
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
