// src/components/ui/NotificationStack.jsx
import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { CheckCircle, XCircle, Info } from 'lucide-react'

const ICONS = {
  success: <CheckCircle size={14} className="text-green-400" />,
  error:   <XCircle size={14} className="text-red-400" />,
  info:    <Info size={14} className="text-cyan-400" />,
}
const COLORS = {
  success: 'rgba(74,222,128,0.1)',
  error:   'rgba(239,68,68,0.1)',
  info:    'rgba(34,211,238,0.1)',
}
const BORDERS = {
  success: 'rgba(74,222,128,0.3)',
  error:   'rgba(239,68,68,0.3)',
  info:    'rgba(34,211,238,0.3)',
}

export default function NotificationStack() {
  const { notifications } = useGameStore()
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded text-sm"
            style={{ background: COLORS[n.type], border: `1px solid ${BORDERS[n.type]}` }}>
            {ICONS[n.type]}
            <span className="text-slate-200">{n.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
