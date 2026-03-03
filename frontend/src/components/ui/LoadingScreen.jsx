// src/components/ui/LoadingScreen.jsx
import { motion } from 'framer-motion'

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ background: '#020409' }}>
      <motion.div className="text-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="text-3xl font-display font-bold text-cyan-400 tracking-[0.2em] mb-4">
          STARBOUND
        </div>
        <div className="flex gap-1.5 justify-center">
          {[0,1,2].map(i => (
            <motion.div key={i} className="w-2 h-2 rounded-full bg-cyan-500"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }} />
          ))}
        </div>
      </motion.div>
    </div>
  )
}
