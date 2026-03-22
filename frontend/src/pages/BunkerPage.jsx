// src/pages/BunkerPage.jsx — v1.0
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Shield, Zap, Save, Calculator, AlertTriangle } from 'lucide-react'

// ─── Konstanten ───────────────────────────────────────────────────────────────

const RESOURCES = [
  { key: 'titan',       label: 'Titan',       icon: '/Starbound-Alpha/resources/titan.png' },
  { key: 'silizium',    label: 'Silizium',     icon: '/Starbound-Alpha/resources/silizium.png' },
  { key: 'helium',      label: 'Helium',       icon: '/Starbound-Alpha/resources/helium.png' },
  { key: 'nahrung',     label: 'Nahrung',      icon: '/Starbound-Alpha/resources/nahrung.png' },
  { key: 'wasser',      label: 'Wasser',       icon: '/Starbound-Alpha/resources/wasser.png' },
  { key: 'bauxit',      label: 'Bauxit',       icon: '/Starbound-Alpha/resources/bauxit.png' },
  { key: 'aluminium',   label: 'Aluminium',    icon: '/Starbound-Alpha/resources/aluminium.png' },
  { key: 'uran',        label: 'Uran',         icon: '/Starbound-Alpha/resources/uran.png' },
  { key: 'plutonium',   label: 'Plutonium',    icon: '/Starbound-Alpha/resources/plutonium.png' },
  { key: 'wasserstoff', label: 'Wasserstoff',  icon: '/Starbound-Alpha/resources/wasserstoff.png' },
]

const CAPACITY_PER_LEVEL = 15000

function fmt(n) {
  if (!n && n !== 0) return '0'
  return Math.floor(n).toLocaleString('de-DE')
}

function parseInput(val) {
  const n = parseInt(val.replace(/\./g, '').replace(',', ''), 10)
  return isNaN(n) || n < 0 ? 0 : n
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BunkerPage() {
  const { planet, buildings } = useGameStore()
  const queryClient = useQueryClient()

  const bunkerLevel = buildings?.find(b => b.building_id === 'bunker')?.level ?? 0
  const totalCapacity = bunkerLevel * CAPACITY_PER_LEVEL

  // Bunker-Einstellungen aus DB laden
  const { data: settings, isLoading } = useQuery({
    queryKey: ['bunker-settings', planet?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bunker_settings')
        .select('*')
        .eq('planet_id', planet.id)
        .maybeSingle()
      return data
    },
    enabled: !!planet?.id,
    staleTime: 30000,
  })

  // Lokaler State für die Eingabefelder: { titan: { secure: '', leave: '' }, ... }
  const [fields, setFields] = useState(() =>
    Object.fromEntries(RESOURCES.map(r => [r.key, { secure: '0', leave: '0' }]))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Felder mit DB-Werten befüllen wenn geladen
  useEffect(() => {
    if (!settings) return
    setFields(Object.fromEntries(
      RESOURCES.map(r => ({
        [r.key]: {
          secure: String(settings[`protect_${r.key}`] ?? 0),
          leave:  String(settings[`leave_${r.key}`]   ?? 0),
        }
      })).reduce((acc, o) => ({ ...acc, ...o }), {})
    ))
  }, [settings])

  // Belegter Platz = Summe aller secure-Felder
  const usedCapacity = useMemo(() => {
    return RESOURCES.reduce((sum, r) => sum + parseInput(fields[r.key].secure), 0)
  }, [fields])

  const fillPercent = totalCapacity > 0 ? Math.min(100, (usedCapacity / totalCapacity) * 100) : 0
  const overLimit = usedCapacity > totalCapacity
  const remaining = totalCapacity - usedCapacity

  // Einzelnes Feld ändern
  const setField = (res, type, val) => {
    // Nur Zahlen erlauben
    if (!/^\d*$/.test(val)) return
    setFields(prev => ({ ...prev, [res]: { ...prev[res], [type]: val } }))
  }

  // Automatisch berechnen: proportional zu Bestand + Produktion
  const handleAutoCalc = () => {
    if (!planet || totalCapacity <= 0) return

    // Gewicht: aktueller Bestand + (produktion pro h als proxy für wichtigkeit)
    const weights = RESOURCES.map(r => {
      const stock = planet[r.key] ?? 0
      const mines = planet?.mine_distribution?.[r.key] ?? 0
      const prod  = mines * 50   // vereinfachte Schätzung
      return { key: r.key, weight: stock + prod * 2 }
    })

    const totalWeight = weights.reduce((s, w) => s + w.weight, 0)

    setFields(prev => {
      const next = { ...prev }
      if (totalWeight === 0) {
        // Gleichmäßig verteilen wenn gar nichts vorhanden
        const each = Math.floor(totalCapacity / RESOURCES.length)
        RESOURCES.forEach(r => {
          next[r.key] = { ...next[r.key], secure: String(each) }
        })
      } else {
        let distributed = 0
        weights.forEach((w, i) => {
          const isLast = i === weights.length - 1
          const share = isLast
            ? totalCapacity - distributed
            : Math.floor((w.weight / totalWeight) * totalCapacity)
          distributed += share
          next[w.key] = { ...next[w.key], secure: String(share) }
        })
      }
      return next
    })
  }

  // Speichern
  const handleSave = async () => {
    if (!planet) return
    setSaving(true)

    const upsertData = {
      planet_id: planet.id,
      auto_mode: false,
      ...Object.fromEntries(
        RESOURCES.flatMap(r => [
          [`protect_${r.key}`, parseInput(fields[r.key].secure)],
          [`leave_${r.key}`,   parseInput(fields[r.key].leave)],
        ])
      )
    }

    await supabase.from('bunker_settings').upsert(upsertData, { onConflict: 'planet_id' })
    queryClient.invalidateQueries(['bunker-settings', planet.id])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (bunkerLevel === 0) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <div className="panel p-8 text-center space-y-3">
          <Shield size={32} className="mx-auto" style={{ color: '#334155' }} />
          <h2 className="font-display text-slate-400">Bunker nicht errichtet</h2>
          <p className="text-sm font-mono text-slate-600">
            Baue den Bunker auf deinem Planeten, um Ressourcen zu schützen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="panel p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Shield size={18} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <h1 className="font-display text-base text-slate-200">Bunker</h1>
              <p className="text-xs font-mono text-slate-600">
                Level {bunkerLevel} — {fmt(totalCapacity)} Einheiten Kapazität
              </p>
            </div>
          </div>

          {/* Füllstand */}
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span style={{ color: overLimit ? '#f87171' : '#818cf8' }}>
                  {fmt(usedCapacity)} / {fmt(totalCapacity)}
                </span>
                <span style={{ color: overLimit ? '#f87171' : '#64748b' }}>
                  {fillPercent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${Math.min(fillPercent, 100)}%` }}
                  transition={{ duration: 0.4 }}
                  style={{
                    background: overLimit
                      ? 'linear-gradient(90deg, #f87171, #ef4444)'
                      : fillPercent > 80
                        ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                        : 'linear-gradient(90deg, #818cf8, #6366f1)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Überlimit-Warnung */}
      {overLimit && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-mono"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          Eingestellte Schutzmengen überschreiten die Kapazität um {fmt(usedCapacity - totalCapacity)} Einheiten.
          Bitte reduzieren oder Bunker ausbauen.
        </div>
      )}

      {/* Tabelle */}
      <div className="panel overflow-hidden">
        {/* Header-Zeile */}
        <div className="grid px-4 py-2 text-xs font-mono text-slate-600 uppercase tracking-widest"
          style={{
            gridTemplateColumns: '180px 100px 1fr 1fr',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.2)',
          }}>
          <span>Ressource</span>
          <span className="text-right">Bestand</span>
          <span className="text-center">Schützen (Einheiten)</span>
          <span className="text-center">Verbleib auf Planet</span>
        </div>

        {/* Ressourcen-Zeilen */}
        {RESOURCES.map((r, i) => {
          const stock   = planet?.[r.key] ?? 0
          const secured = parseInput(fields[r.key].secure)
          const leave   = parseInput(fields[r.key].leave)
          const actualSecured = Math.min(secured, stock)

          return (
            <div key={r.key}
              className="grid items-center px-4 py-2.5"
              style={{
                gridTemplateColumns: '180px 100px 1fr 1fr',
                borderBottom: i < RESOURCES.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>

              {/* Ressource */}
              <div className="flex items-center gap-2">
                <img src={r.icon} alt={r.label}
                  style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0 }} />
                <span className="text-sm font-mono text-slate-300">{r.label}</span>
              </div>

              {/* Bestand */}
              <span className="text-sm font-mono tabular-nums text-right text-slate-400">
                {fmt(stock)}
              </span>

              {/* Schützen-Feld */}
              <div className="flex justify-center px-2">
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fields[r.key].secure}
                    onChange={e => setField(r.key, 'secure', e.target.value)}
                    className="w-28 px-2 py-1.5 rounded text-sm font-mono text-right tabular-nums"
                    style={{
                      background: 'rgba(99,102,241,0.08)',
                      border: `1px solid ${secured > stock ? 'rgba(251,191,36,0.4)' : 'rgba(99,102,241,0.25)'}`,
                      color: secured > stock ? '#fcd34d' : '#a5b4fc',
                      outline: 'none',
                      width: '9rem',
                    }}
                  />
                  {secured > stock && (
                    <span className="absolute -top-4 right-0 text-xs font-mono text-amber-400/70">
                      max {fmt(stock)}
                    </span>
                  )}
                </div>
              </div>

              {/* Verbleib-Feld */}
              <div className="flex justify-center px-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={fields[r.key].leave}
                  onChange={e => setField(r.key, 'leave', e.target.value)}
                  className="w-28 px-2 py-1.5 rounded text-sm font-mono text-right tabular-nums"
                  style={{
                    background: 'rgba(34,211,238,0.05)',
                    border: '1px solid rgba(34,211,238,0.15)',
                    color: '#67e8f9',
                    outline: 'none',
                    width: '9rem',
                  }}
                />
              </div>
            </div>
          )
        })}

        {/* Footer: Verbleibende Kapazität */}
        <div className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
          <span className="text-xs font-mono text-slate-600">Freie Bunkerkapazität</span>
          <span className="text-sm font-mono tabular-nums font-semibold"
            style={{ color: overLimit ? '#f87171' : '#818cf8' }}>
            {overLimit ? `−${fmt(Math.abs(remaining))}` : fmt(remaining)}
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={handleAutoCalc}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono transition-all"
          style={{
            background: 'rgba(34,211,238,0.07)',
            border: '1px solid rgba(34,211,238,0.2)',
            color: '#22d3ee',
          }}>
          <Calculator size={14} />
          Automatisch Berechnen
        </button>

        <button
          onClick={handleSave}
          disabled={saving || overLimit}
          className="flex items-center gap-2 px-5 py-2 rounded text-sm font-mono transition-all"
          style={{
            background: saved
              ? 'rgba(74,222,128,0.12)'
              : overLimit
                ? 'rgba(255,255,255,0.03)'
                : 'rgba(99,102,241,0.12)',
            border: `1px solid ${saved
              ? 'rgba(74,222,128,0.3)'
              : overLimit
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(99,102,241,0.3)'}`,
            color: saved ? '#4ade80' : overLimit ? '#334155' : '#a5b4fc',
          }}>
          <Save size={14} />
          {saved ? 'Gespeichert ✓' : saving ? 'Speichert...' : 'Einstellungen Übernehmen'}
        </button>
      </div>

      {/* Hinweis WIP */}
      <p className="text-xs font-mono text-slate-700 text-right">
        * „Verbleib auf Planet" wird aktiv sobald Mitspieler-Einladen implementiert ist.
      </p>
    </div>
  )
}
