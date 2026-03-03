// src/pages/Landing.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { Loader2, Star, Zap } from 'lucide-react'

// Animated star field
function Stars() {
  const stars = Array.from({ length: 120 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    delay: Math.random() * 3,
    dur: Math.random() * 3 + 2,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {stars.map(s => (
        <motion.div key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}
        />
      ))}
      {/* Nebula effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.4) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-8"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)' }} />
    </div>
  )
}

export default function Landing() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, player } = useGameStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (player) navigate('/dashboard')
  }, [player])

  const handleSubmit = async () => {
    if (!username.trim()) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        await register(username.trim())
      } else {
        await login(username.trim())
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #040d1a 0%, #020409 100%)' }}>
      <Stars />

      <motion.div className="relative z-10 w-full max-w-sm px-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}>

        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            animate={{ textShadow: ['0 0 20px rgba(34,211,238,0.5)', '0 0 40px rgba(34,211,238,0.8)', '0 0 20px rgba(34,211,238,0.5)'] }}
            transition={{ duration: 3, repeat: Infinity }}>
            <h1 className="text-5xl font-display font-bold tracking-[0.2em] text-cyan-400 mb-1">
              STARBOUND
            </h1>
          </motion.div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4))' }} />
            <span className="text-xs text-slate-500 font-mono tracking-widest uppercase">Alpha v0.1</span>
            <div className="h-px w-16" style={{ background: 'linear-gradient(270deg, transparent, rgba(34,211,238,0.4))' }} />
          </div>
        </div>

        {/* Card */}
        <div className="panel p-6">
          {/* Mode toggle */}
          <div className="flex rounded overflow-hidden mb-6"
            style={{ border: '1px solid rgba(34,211,238,0.15)' }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className="flex-1 py-2 text-sm font-semibold font-display tracking-wider uppercase transition-all duration-200"
                style={{
                  background: mode === m ? 'rgba(34,211,238,0.15)' : 'transparent',
                  color: mode === m ? '#22d3ee' : '#64748b',
                  borderRight: m === 'login' ? '1px solid rgba(34,211,238,0.15)' : 'none',
                }}>
                {m === 'login' ? 'Einloggen' : 'Registrieren'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 font-mono uppercase tracking-widest mb-1.5 block">
                Commander-Name
              </label>
              <input
                className="input-field"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Dein Name im Universum..."
                maxLength={20}
                autoFocus
              />
              {mode === 'register' && (
                <p className="text-xs text-slate-600 mt-1">3–20 Zeichen, nur Buchstaben/Zahlen/_-</p>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm text-red-400 px-3 py-2 rounded"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </motion.div>
            )}

            <button onClick={handleSubmit} disabled={loading || !username.trim()}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2">
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Verbinden...</>
              ) : (
                <><Zap size={16} /> {mode === 'register' ? 'Ins All aufbrechen' : 'Weiter zu meiner Basis'}</>
              )}
            </button>
          </div>
        </div>

        {mode === 'login' && (
          <p className="text-center text-xs text-slate-600 mt-4">
            Noch kein Konto?{' '}
            <button className="text-cyan-600 hover:text-cyan-400"
              onClick={() => setMode('register')}>
              Jetzt registrieren
            </button>
          </p>
        )}

        {/* Feature hints */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '🪐', label: 'Planeten bauen' },
            { icon: '🚀', label: 'Flotten führen' },
            { icon: '⚔️', label: 'Kämpfen & handeln' },
          ].map(f => (
            <div key={f.label} className="text-xs text-slate-600 space-y-1">
              <div className="text-lg">{f.icon}</div>
              <div>{f.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
