// src/pages/Landing.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { Loader2, Zap, ChevronRight } from 'lucide-react'

const RACES = [
  { id: 'human',      name: 'Menschen',    desc: 'Allrounder. Stark in Forschung und Diplomatie.' },
  { id: 'torrani',    name: 'Torrani',     desc: 'Bergbau-Spezialisten. Beste Minenproduktion.' },
  { id: 'velhari',    name: 'Velhari',     desc: 'Meister des Transports. Groesster Laderaum.' },
  { id: 'krath',      name: 'Krath',       desc: 'Krieger. Staerkste Schiffe und Verteidigung.' },
  { id: 'veldyn',     name: 'Veldyn',      desc: 'Praezisionsschuetzen. Hohe Treffergenauigkeit.' },
  { id: 'skaari',     name: 'Skaari',      desc: 'Schnell und wendig. Perfekt fuer Freibeuter.' },
  { id: 'nyhari',     name: 'Nyhari',      desc: 'Kopfgeldjager. Stark im Scan und Aufspueren.' },
  { id: 'duraan',     name: 'Duraan',      desc: 'Ausgewogene Verteidiger. Guter Allrounder.' },
  { id: 'synthetica', name: 'Synthetica',  desc: 'Maschinen. Hybrid aus Admiral und Freibeuter.' },
]

const PROFESSIONS = [
  { id: 'admiral',   name: 'Admiral',    desc: 'Spezialist fuer Kriegsschiffe und Schlachten. Schwere Kreuzer und Schlachtschiffe exklusiv.' },
  { id: 'trader',    name: 'Haendler',   desc: 'Meister des Handels. Groesste Frachter und beste Handelspreise exklusiv.' },
  { id: 'privateer', name: 'Freibeuter', desc: 'Pirat und Rauber. Schnelle Spezialschiffe und Raubzuege exklusiv.' },
]

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
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.4) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full opacity-8"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)' }} />
    </div>
  )
}

export default function Landing() {
  const [mode, setMode] = useState('login')
  const [step, setStep] = useState(1) // 1=name, 2=profession, 3=race
  const [username, setUsername] = useState('')
  const [profession, setProfession] = useState('')
  const [raceId, setRaceId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, player } = useGameStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (player) navigate('/dashboard')
  }, [player])

  const resetForm = () => {
    setStep(1)
    setUsername('')
    setProfession('')
    setRaceId('')
    setError('')
  }

  const handleLogin = async () => {
    if (!username.trim()) return
    setError('')
    setLoading(true)
    try {
      await login(username.trim())
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setError('')
    setLoading(true)
    try {
      await register(username.trim(), profession, raceId)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = (selected) => ({
    background: selected ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
    border: selected ? '1px solid rgba(34,211,238,0.5)' : '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #040d1a 0%, #020409 100%)' }}>
      <Stars />

      <motion.div className="relative z-10 w-full max-w-md px-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}>

        {/* Logo */}
        <div className="text-center mb-8">
          <motion.h1
            className="text-5xl font-bold tracking-[0.2em] text-cyan-400 mb-1"
            animate={{ textShadow: ['0 0 20px rgba(34,211,238,0.5)', '0 0 40px rgba(34,211,238,0.8)', '0 0 20px rgba(34,211,238,0.5)'] }}
            transition={{ duration: 3, repeat: Infinity }}>
            STARBOUND
          </motion.h1>
          <div className="flex items-center justify-center gap-3 mt-2">
            <div className="h-px w-16" style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4))' }} />
            <span className="text-xs text-slate-500 font-mono tracking-widest uppercase">Alpha v0.1</span>
            <div className="h-px w-16" style={{ background: 'linear-gradient(270deg, transparent, rgba(34,211,238,0.4))' }} />
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded overflow-hidden mb-6"
          style={{ border: '1px solid rgba(34,211,238,0.15)' }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); resetForm() }}
              className="flex-1 py-2 text-sm font-semibold tracking-wider uppercase transition-all duration-200"
              style={{
                background: mode === m ? 'rgba(34,211,238,0.15)' : 'transparent',
                color: mode === m ? '#22d3ee' : '#64748b',
                borderRight: m === 'login' ? '1px solid rgba(34,211,238,0.15)' : 'none',
              }}>
              {m === 'login' ? 'Einloggen' : 'Registrieren'}
            </button>
          ))}
        </div>

        {/* LOGIN */}
        {mode === 'login' && (
          <div className="space-y-4 p-6 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,211,238,0.1)' }}>
            <div>
              <label className="text-xs text-slate-400 font-mono uppercase tracking-widest mb-1.5 block">
                Commander-Name
              </label>
              <input
                className="w-full px-3 py-2 rounded text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Dein Commander-Name..."
                autoFocus
              />
            </div>
            {error && (
              <div className="text-sm text-red-400 px-3 py-2 rounded"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            <button onClick={handleLogin} disabled={loading || !username.trim()}
              className="w-full py-3 rounded font-semibold tracking-wider flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee' }}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Verbinden...</> : <><Zap size={16} /> Weiter zu meiner Basis</>}
            </button>
          </div>
        )}

        {/* REGISTER — Step 1: Name */}
        {mode === 'register' && step === 1 && (
          <div className="space-y-4 p-6 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,211,238,0.1)' }}>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest">Schritt 1 / 3 — Commander-Name</p>
            <div>
              <label className="text-xs text-slate-400 font-mono uppercase tracking-widest mb-1.5 block">
                Dein Name im Universum
              </label>
              <input
                className="w-full px-3 py-2 rounded text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && username.trim().length >= 3 && setStep(2)}
                placeholder="3–20 Zeichen..."
                maxLength={20}
                autoFocus
              />
              <p className="text-xs text-slate-600 mt-1">3–20 Zeichen</p>
            </div>
            {error && (
              <div className="text-sm text-red-400 px-3 py-2 rounded"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            <button onClick={() => { setError(''); setStep(2) }}
              disabled={username.trim().length < 3}
              className="w-full py-3 rounded font-semibold tracking-wider flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee',
                opacity: username.trim().length < 3 ? 0.4 : 1 }}>
              Weiter <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* REGISTER — Step 2: Beruf */}
        {mode === 'register' && step === 2 && (
          <div className="space-y-3 p-6 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,211,238,0.1)' }}>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-3">Schritt 2 / 3 — Beruf wählen</p>
            {PROFESSIONS.map(p => (
              <div key={p.id} onClick={() => setProfession(p.id)}
                className="p-3 rounded-lg"
                style={cardStyle(profession === p.id)}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: profession === p.id ? '#22d3ee' : '#cbd5e1' }}>
                    {p.name}
                  </span>
                  {profession === p.id && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                </div>
                <p className="text-xs text-slate-500 mt-1">{p.desc}</p>
              </div>
            ))}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep(1)}
                className="flex-1 py-2 rounded text-sm text-slate-400 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Zurück
              </button>
              <button onClick={() => setStep(3)} disabled={!profession}
                className="flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-1 transition-all"
                style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee',
                  opacity: !profession ? 0.4 : 1 }}>
                Weiter <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* REGISTER — Step 3: Rasse */}
        {mode === 'register' && step === 3 && (
          <div className="p-6 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,211,238,0.1)' }}>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-3">Schritt 3 / 3 — Rasse wählen</p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {RACES.map(r => (
                <div key={r.id} onClick={() => setRaceId(r.id)}
                  className="p-3 rounded-lg"
                  style={cardStyle(raceId === r.id)}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: raceId === r.id ? '#22d3ee' : '#cbd5e1' }}>
                      {r.name}
                    </span>
                    {raceId === r.id && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{r.desc}</p>
                </div>
              ))}
            </div>
            {error && (
              <div className="text-sm text-red-400 px-3 py-2 rounded mt-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep(2)}
                className="flex-1 py-2 rounded text-sm text-slate-400 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Zurück
              </button>
              <button onClick={handleRegister} disabled={loading || !raceId}
                className="flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-1 transition-all"
                style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee',
                  opacity: (!raceId || loading) ? 0.4 : 1 }}>
                {loading ? <><Loader2 size={14} className="animate-spin" /> Erstelle...</> : <><Zap size={14} /> Ins All aufbrechen</>}
              </button>
            </div>
          </div>
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
