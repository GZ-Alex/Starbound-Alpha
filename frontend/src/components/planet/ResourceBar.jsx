// src/components/planet/ResourceBar.jsx
import { useGameStore } from '@/store/gameStore'
import { motion } from 'framer-motion'

const RESOURCES = [
  { key: 'titan',       label: 'Ti',  color: '#94a3b8', icon: '⬡' },
  { key: 'silizium',    label: 'Si',  color: '#a78bfa', icon: '◇' },
  { key: 'helium',      label: 'He',  color: '#34d399', icon: '◎' },
  { key: 'nahrung',     label: 'Nah', color: '#86efac', icon: '◈' },
  { key: 'wasser',      label: 'H₂O', color: '#67e8f9', icon: '〇' },
  { key: 'bauxit',      label: 'Bx',  color: '#fb923c', icon: '◆' },
  { key: 'aluminium',   label: 'Al',  color: '#c0c0c0', icon: '▽' },
  { key: 'uran',        label: 'U',   color: '#4ade80', icon: '☢' },
  { key: 'plutonium',   label: 'Pu',  color: '#f472b6', icon: '⚛' },
  { key: 'wasserstoff', label: 'H₂',  color: '#38bdf8', icon: '↑' },
  { key: 'energie',     label: 'NRG', color: '#fbbf24', icon: '⚡' },
  { key: 'credits',     label: 'CR',  color: '#fde68a', icon: '¢' },
]

function fmt(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return n.toLocaleString()
}

export default function ResourceBar() {
  const { planet } = useGameStore()
  if (!planet) return <div className="h-10 border-b border-cyan-500/10" />

  return (
    <div className="border-b border-cyan-500/15 px-3 py-1.5 overflow-x-auto flex items-center gap-1"
      style={{ background: 'rgba(4,13,26,0.9)', minHeight: 44 }}>
      {RESOURCES.map(({ key, label, color, icon }) => (
        <motion.div key={key}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap"
          style={{ 
            background: 'rgba(7,20,40,0.6)',
            border: '1px solid rgba(34,211,238,0.08)'
          }}
          title={key}>
          <span style={{ color, fontSize: 10 }}>{icon}</span>
          <span className="text-slate-500 text-[10px]">{label}</span>
          <span className="font-mono" style={{ color, fontSize: 11 }}>
            {fmt(planet[key])}
          </span>
          {planet[`prod_${key}`] > 0 && (
            <span className="text-green-500/60 text-[9px] font-mono">
              +{fmt(planet[`prod_${key}`])}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  )
}
