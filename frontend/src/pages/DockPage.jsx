// src/pages/DockPage.jsx — v1.0
import { useState, useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wrench, Trash2, Settings, ChevronDown, ChevronUp,
  CheckSquare, Square, AlertTriangle, Plus, Minus, Lock
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COST_KEYS = ['titan', 'silizium', 'aluminium', 'uran', 'plutonium']
const COST_LABELS = { titan: 'Titan', silizium: 'Silizium', aluminium: 'Aluminium', uran: 'Uran', plutonium: 'Plutonium' }

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString('de-DE')
}

function fmtTime(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Berechne Kosten/Zeit mit Dock-Bonus
function applyDockBonus(base, dockLevel, type) {
  // -1.5% Zeit pro Level, -1% Kosten pro Level
  if (type === 'time') return base * Math.max(0.1, 1 - dockLevel * 0.015)
  if (type === 'cost') return base * Math.max(0.1, 1 - dockLevel * 0.01)
  return base
}

function getInstalledPartIds(installedParts) {
  if (!Array.isArray(installedParts)) return []
  return installedParts.map(p => typeof p === 'string' ? p : p?.part_id).filter(Boolean)
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} style={{ color: '#f87171', flexShrink: 0 }} />
          <h3 className="font-display font-bold text-lg text-slate-100">{title}</h3>
        </div>
        <p className="text-sm font-mono text-slate-400">{message}</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-mono transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
            Abbrechen
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-mono font-semibold transition-all"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}>
            Ja, verschrotten
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function RefitPanel({ ship, partDefs, chassisDefs, dockLevel, planet, onClose, queryClient, player }) {
  const design  = ship.ship_designs
  const chassis = chassisDefs.find(c => c.id === design?.chassis_id)
  const originalIds = getInstalledPartIds(design?.installed_parts ?? [])

  // Neue Konfiguration — startet mit aktuell installierten Parts
  const [newParts, setNewParts] = useState([...originalIds])
  const [busy, setBusy] = useState(false)

  const { data: refitQueue = [] } = useQuery({
    queryKey: ['refit-queue', ship.id],
    queryFn: async () => {
      const { data } = await supabase.from('refit_queue').select('*').eq('ship_id', ship.id)
      return data ?? []
    },
  })
  const isInRefit = refitQueue.length > 0

  const maxCells  = chassis?.total_cells ?? 0
  const maxPrimary = chassis?.max_primary_weapons ?? 1

  const totalCells = newParts.reduce((s, pid) => {
    const p = partDefs.find(d => d.id === pid)
    return s + (p?.cells_required ?? 0)
  }, 0)

  const engineCount  = newParts.filter(pid => partDefs.find(d => d.id === pid)?.category === 'engine').length
  const primaryCount = newParts.filter(pid => partDefs.find(d => d.id === pid)?.category === 'primary_weapon').length

  // Diff berechnen
  const toRemove = originalIds.filter(id => !newParts.includes(id))
  const toInstall = newParts.filter(id => !originalIds.includes(id))
  const hasChanges = toRemove.length > 0 || toInstall.length > 0

  // Gesamtkosten und -erstattung
  const netCosts = {}
  for (const pid of toInstall) {
    const p = partDefs.find(d => d.id === pid)
    if (!p) continue
    for (const k of COST_KEYS) {
      const v = p[`cost_${k}`] ?? 0
      if (v > 0) netCosts[k] = (netCosts[k] ?? 0) + v
    }
  }
  for (const pid of toRemove) {
    const p = partDefs.find(d => d.id === pid)
    if (!p) continue
    for (const k of COST_KEYS) {
      const refund = Math.floor((p[`cost_${k}`] ?? 0) * 0.75)
      if (refund > 0) netCosts[k] = (netCosts[k] ?? 0) - refund
    }
  }

  // Gesamtumbauzeit: Summe aller Einzelzeiten
  const totalMinutes = [
    ...toInstall.map(pid => {
      const p = partDefs.find(d => d.id === pid)
      const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
      return applyDockBonus(base, dockLevel, 'time')
    }),
    ...toRemove.map(pid => {
      const p = partDefs.find(d => d.id === pid)
      const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
      return applyDockBonus(base * 0.2, dockLevel, 'time')
    }),
  ].reduce((a, b) => a + b, 0)

  const canAfford = COST_KEYS.every(k => (netCosts[k] ?? 0) <= (planet?.[k] ?? 0))
  const isValid = engineCount === 1 && primaryCount <= maxPrimary && totalCells <= maxCells

  const togglePart = (pid) => {
    const part = partDefs.find(d => d.id === pid)
    if (!part) return
    setNewParts(prev => {
      const isSelected = prev.includes(pid)
      if (isSelected) return prev.filter(p => p !== pid)
      // Antrieb: ersetze bestehenden
      if (part.category === 'engine') {
        return [...prev.filter(p => partDefs.find(d => d.id === p)?.category !== 'engine'), pid]
      }
      // Primärwaffe: max-Check
      if (part.category === 'primary_weapon') {
        const current = prev.filter(p => partDefs.find(d => d.id === p)?.category === 'primary_weapon').length
        if (current >= maxPrimary) return prev
      }
      return [...prev, pid]
    })
  }

  const handleConfirm = async () => {
    if (busy || !hasChanges || !isValid || !canAfford) return
    setBusy(true)

    // Ressourcen abziehen (Installationen) und erstatten (Ausbauten) sofort
    const updates = {}
    for (const [k, net] of Object.entries(netCosts)) {
      if (net !== 0) updates[k] = (planet[k] ?? 0) - net
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('planets').update(updates).eq('id', planet.id)
    }

    // Queue-Einträge erstellen
    let offset = 0
    for (const pid of toRemove) {
      const p = partDefs.find(d => d.id === pid)
      const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
      const min = applyDockBonus(base * 0.2, dockLevel, 'time')
      const finishAt = new Date(Date.now() + (offset + min) * 60 * 1000).toISOString()
      await supabase.from('refit_queue').insert({
        ship_id: ship.id, planet_id: planet.id, player_id: player.id,
        action: 'remove', part_id: pid, finish_at: finishAt,
      })
      offset += min
    }
    for (const pid of toInstall) {
      const p = partDefs.find(d => d.id === pid)
      const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
      const min = applyDockBonus(base, dockLevel, 'time')
      const finishAt = new Date(Date.now() + (offset + min) * 60 * 1000).toISOString()
      await supabase.from('refit_queue').insert({
        ship_id: ship.id, planet_id: planet.id, player_id: player.id,
        action: 'install', part_id: pid, finish_at: finishAt,
      })
      offset += min
    }

    queryClient.invalidateQueries(['dock-ships'])
    queryClient.invalidateQueries(['refit-queue', ship.id])
    queryClient.invalidateQueries(['planet', player.id])
    setBusy(false)
    onClose()
  }

  // Alle verfügbaren Parts nach Kategorie
  const CATEGORIES = [
    { id: 'engine',         label: 'Antrieb' },
    { id: 'primary_weapon', label: 'Primärwaffe' },
    { id: 'turret',         label: 'Turret' },
    { id: 'armor',          label: 'Panzerung' },
    { id: 'shield',         label: 'Schild' },
    { id: 'booster',        label: 'Booster' },
    { id: 'cargo',          label: 'Ladebucht' },
    { id: 'scanner',        label: 'Scanner' },
    { id: 'mining',         label: 'Bergbau' },
    { id: 'extension',      label: 'Erweiterung' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-5xl rounded-xl overflow-hidden flex flex-col"
        style={{
          background: '#040d1a',
          border: '1px solid rgba(34,211,238,0.2)',
          maxHeight: '90vh',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.1)' }}>
          <div>
            <h3 className="font-display font-bold text-lg text-cyan-400">
              Umbau: {ship.name ?? design?.name}
            </h3>
            <p className="text-xs font-mono text-slate-500">{chassis?.name} · Klasse {chassis?.class}</p>
          </div>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>

        {isInRefit && (
          <div className="mx-5 mt-4 px-3 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
            ⚙ Umbau läuft — warte bis der aktuelle Umbau abgeschlossen ist
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Linke Spalte: Status */}
          <div className="w-52 flex-shrink-0 p-4 space-y-3 overflow-y-auto"
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Zellen */}
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-500 mb-1">
                <span>Zellen</span>
                <span style={{ color: totalCells > maxCells ? '#f87171' : '#22d3ee' }}>
                  {totalCells} / {maxCells}
                </span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(totalCells/maxCells*100,100)}%`, background: totalCells > maxCells ? '#ef4444' : '#22d3ee' }} />
              </div>
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-500">
              <span>Antrieb</span>
              <span style={{ color: engineCount === 1 ? '#4ade80' : '#f87171' }}>
                {engineCount === 0 ? 'Fehlt' : engineCount === 1 ? '✓' : `${engineCount}x`}
              </span>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-500">
              <span>Primärwaffen</span>
              <span style={{ color: primaryCount > maxPrimary ? '#f87171' : '#94a3b8' }}>
                {primaryCount} / {maxPrimary}
              </span>
            </div>

            {/* Änderungen */}
            {hasChanges && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Änderungen</p>
                {toRemove.map(pid => {
                  const p = partDefs.find(d => d.id === pid)
                  return <p key={pid} className="text-xs font-mono" style={{ color: '#f87171' }}>− {p?.name}</p>
                })}
                {toInstall.map(pid => {
                  const p = partDefs.find(d => d.id === pid)
                  return <p key={pid} className="text-xs font-mono" style={{ color: '#4ade80' }}>+ {p?.name}</p>
                })}
              </div>
            )}

            {/* Kosten */}
            {hasChanges && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Kosten (netto)</p>
                {COST_KEYS.map(k => {
                  const net = netCosts[k] ?? 0
                  if (!net) return null
                  const ok = net <= (planet?.[k] ?? 0)
                  return (
                    <div key={k} className="flex justify-between text-xs font-mono">
                      <span className="text-slate-500 capitalize">{k}</span>
                      <span style={{ color: net > 0 ? (ok ? '#94a3b8' : '#f87171') : '#34d399' }}>
                        {net > 0 ? `-${fmt(net)}` : `+${fmt(Math.abs(net))}`}
                      </span>
                    </div>
                  )
                })}
                <div className="flex justify-between text-xs font-mono mt-1" style={{ color: '#64748b' }}>
                  <span>Zeit</span>
                  <span>{fmtTime(totalMinutes)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Rechte Spalte: Bauteile */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {CATEGORIES.map(({ id: catId, label }) => {
              const available = partDefs.filter(p => {
                if (p.category !== catId) return false
                if (catId === 'primary_weapon' && p.weapon_class && p.weapon_class !== chassis?.class) return false
                return true
              }).sort((a, b) => {
                const mk = id => { const m = id.match(/_(\d+)(_pvt|_adm)?$/); return m ? parseInt(m[1]) : 99 }
                return mk(a.id) - mk(b.id)
              })
              if (!available.length) return null
              return (
                <div key={catId}>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">{label}</p>
                  <div className="space-y-1">
                    {available.map(part => {
                      const isSelected = newParts.includes(part.id)
                      const wasInstalled = originalIds.includes(part.id)
                      const wouldExceed = !isSelected && totalCells + (part.cells_required ?? 0) > maxCells
                      const isAdded = isSelected && !wasInstalled
                      const isRemoved = !isSelected && wasInstalled

                      let borderColor = 'rgba(255,255,255,0.06)'
                      let bgColor = 'rgba(255,255,255,0.02)'
                      let textColor = '#64748b'
                      if (isSelected && wasInstalled) { borderColor = 'rgba(34,211,238,0.3)'; bgColor = 'rgba(34,211,238,0.08)'; textColor = '#22d3ee' }
                      else if (isAdded) { borderColor = 'rgba(74,222,128,0.4)'; bgColor = 'rgba(74,222,128,0.1)'; textColor = '#4ade80' }
                      else if (isRemoved) { borderColor = 'rgba(239,68,68,0.25)'; bgColor = 'rgba(239,68,68,0.06)'; textColor = '#475569' }
                      else if (wouldExceed) { textColor = '#2d3f52' }
                      else if (!isSelected) { textColor = '#94a3b8' }

                      return (
                        <button key={part.id}
                          onClick={() => !isInRefit && !wouldExceed && togglePart(part.id)}
                          disabled={isInRefit || (wouldExceed && !isSelected)}
                          className="w-full text-left px-3 py-2 rounded transition-all"
                          style={{ background: bgColor, border: `1px solid ${borderColor}`, opacity: wouldExceed && !isSelected ? 0.4 : 1 }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isAdded && <Plus size={10} style={{ color: '#4ade80', flexShrink: 0 }} />}
                              {isRemoved && <Minus size={10} style={{ color: '#f87171', flexShrink: 0 }} />}
                              <span className="text-sm font-mono" style={{ color: textColor }}>{part.name}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
                              {wouldExceed && !isSelected && <Lock size={9} />}
                              <span>{part.cells_required}Z</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setNewParts([...originalIds])}
            className="text-xs font-mono px-3 py-1.5 rounded transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569' }}>
            Zurücksetzen
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="text-xs font-mono px-3 py-1.5 rounded transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#475569' }}>
              Abbrechen
            </button>
            <button onClick={handleConfirm}
              disabled={busy || !hasChanges || !isValid || !canAfford || isInRefit}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
              style={{
                background: hasChanges && isValid && canAfford && !isInRefit ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${hasChanges && isValid && canAfford && !isInRefit ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: hasChanges && isValid && canAfford && !isInRefit ? '#22d3ee' : '#334155',
              }}>
              {busy ? '...' : `Umbau bestätigen${hasChanges ? ` (${fmtTime(totalMinutes)})` : ''}`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Ship Row ─────────────────────────────────────────────────────────────────

function DockShipRow({ ship, selected, onToggle, onRefit, dockLevel, repairQueue, refitQueue }) {
  const design = ship.ship_designs
  const hpPct = ship.max_hp > 0 ? Math.round((ship.current_hp / ship.max_hp) * 100) : 0
  const hpColor = hpPct >= 100 ? '#4ade80' : hpPct > 60 ? '#fbbf24' : '#f87171'
  const needsRepair = hpPct < 100

  const inRepair = repairQueue.some(r => r.ship_id === ship.id)
  const inRefit  = refitQueue.some(r => r.ship_id === ship.id)
  const isLocked = ship.fleet_id || (ship.cargo_used > 0)

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
      style={{
        background: selected ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)'}`,
        cursor: isLocked ? 'default' : 'pointer',
        opacity: isLocked ? 0.5 : 1,
      }}
      onClick={() => !isLocked && onToggle(ship.id)}>

      {/* Checkbox */}
      <div className="flex-shrink-0" style={{ color: selected ? '#22d3ee' : '#334155' }}>
        {selected ? <CheckSquare size={15} /> : <Square size={15} />}
      </div>

      {/* Name + Chassis */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-semibold text-slate-200 truncate">{ship.name ?? design?.name ?? '—'}</p>
        <p className="text-xs font-mono text-slate-600">{design?.chassis_id ?? '—'}</p>
      </div>

      {/* HP */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs font-mono font-semibold" style={{ color: hpColor }}>{hpPct}%</span>
        <div className="w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {inRepair && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.2)' }}>
            Reparatur
          </span>
        )}
        {inRefit && (
          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            Umbau
          </span>
        )}
      </div>

      {/* Umbau Button */}
      <button
        onClick={e => { e.stopPropagation(); onRefit(ship) }}
        disabled={hpPct < 100 || inRefit || inRepair}
        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all"
        style={{
          background: hpPct < 100 || inRefit || inRepair ? 'transparent' : 'rgba(251,191,36,0.08)',
          border: `1px solid ${hpPct < 100 || inRefit || inRepair ? 'rgba(255,255,255,0.05)' : 'rgba(251,191,36,0.2)'}`,
          color: hpPct < 100 || inRefit || inRepair ? '#334155' : '#fbbf24',
        }}
        title={hpPct < 100 ? 'Schiff muss 100% HP haben' : 'Umbau'}>
        <Settings size={11} />
        Umbau
      </button>
    </div>
  )
}

// ─── DockPage ─────────────────────────────────────────────────────────────────

export default function DockPage() {
  const { player, planet, buildings } = useGameStore()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [refitShip, setRefitShip] = useState(null)
  const [confirmScrap, setConfirmScrap] = useState(false)
  const [busy, setBusy] = useState(false)

  const dockLevel = buildings?.find(b => b.building_id === 'dock')?.level ?? 0

  // Schiffe am Heimatplaneten, keine Flotte, leerer Frachtraum
  const { data: ships = [], isLoading } = useQuery({
    queryKey: ['dock-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, ship_designs(*)')
        .eq('player_id', player.id)
        .is('fleet_id', null)
        .eq('x', planet.x).eq('y', planet.y).eq('z', planet.z)
      return (data ?? []).filter(s => {
        // Leerer Frachtraum: cargo auf Flotte liegt, Schiff selbst hat keinen cargo State
        // Wir prüfen nur fleet_id=null und Position
        return true
      })
    },
    enabled: !!player && !!planet,
    refetchInterval: 10000,
  })

  const { data: partDefs = [] } = useQuery({
    queryKey: ['part-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('ship_part_definitions').select('*')
      return data ?? []
    },
    staleTime: 300000,
  })

  const { data: chassisDefs = [] } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*')
      return data ?? []
    },
    staleTime: 300000,
  })

  const { data: repairQueue = [] } = useQuery({
    queryKey: ['repair-queue', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('repair_queue').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 10000,
  })

  const { data: refitQueue = [] } = useQuery({
    queryKey: ['refit-queue-all', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('refit_queue').select('*').eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 10000,
  })

  const selectedShips = ships.filter(s => selectedIds.has(s.id))
  const repairableSelected = selectedShips.filter(s => {
    const hpPct = s.max_hp > 0 ? (s.current_hp / s.max_hp) : 1
    const inQ = repairQueue.some(r => r.ship_id === s.id)
    return hpPct < 1 && !inQ
  })

  // Reparaturkosten berechnen
  const repairCosts = useMemo(() => {
    const totals = {}
    for (const ship of repairableSelected) {
      const d = ship.ship_designs
      if (!d) continue
      const hpMissing = 1 - (ship.max_hp > 0 ? ship.current_hp / ship.max_hp : 1)
      for (const k of COST_KEYS) {
        const baseCost = (d[`cost_${k}`] ?? 0) * 0.75 * hpMissing
        const withBonus = applyDockBonus(baseCost, dockLevel, 'cost')
        if (withBonus > 0) totals[k] = (totals[k] ?? 0) + withBonus
      }
    }
    return totals
  }, [repairableSelected, dockLevel])

  // Reparaturzeit (längste einzelne Reparatur, da Queue sequenziell)
  const repairTimeLabel = useMemo(() => {
    if (!repairableSelected.length) return null
    const times = repairableSelected.map(ship => {
      const d = ship.ship_designs
      const hpMissing = 1 - (ship.max_hp > 0 ? ship.current_hp / ship.max_hp : 1)
      const baseMin = (d?.build_minutes ?? 2) * 0.5 * hpMissing
      return applyDockBonus(baseMin, dockLevel, 'time')
    })
    const total = times.reduce((a, b) => a + b, 0)
    return fmtTime(total)
  }, [repairableSelected, dockLevel])

  // Verschrottungs-Erstattung
  const scrapRefund = useMemo(() => {
    const totals = {}
    for (const ship of selectedShips) {
      const d = ship.ship_designs
      if (!d) continue
      const hpPct = ship.max_hp > 0 ? ship.current_hp / ship.max_hp : 1
      for (const k of COST_KEYS) {
        const refund = (d[`cost_${k}`] ?? 0) * 0.70 * hpPct
        if (refund > 0) totals[k] = (totals[k] ?? 0) + refund
      }
    }
    return totals
  }, [selectedShips])

  const canAffordRepair = COST_KEYS.every(k => Math.ceil(repairCosts[k] ?? 0) <= (planet?.[k] ?? 0))

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const selectAll = () => {
    setSelectedIds(new Set(ships.map(s => s.id)))
  }

  const handleRepair = async () => {
    if (busy || !repairableSelected.length || !canAffordRepair) return
    setBusy(true)

    // Kosten abziehen
    const updates = {}
    for (const k of COST_KEYS) {
      const cost = Math.ceil(repairCosts[k] ?? 0)
      if (cost > 0) updates[k] = (planet[k] ?? 0) - cost
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('planets').update(updates).eq('id', planet.id)
    }

    // Reparatur-Queue Einträge erstellen
    for (const ship of repairableSelected) {
      const d = ship.ship_designs
      const hpMissing = 1 - (ship.max_hp > 0 ? ship.current_hp / ship.max_hp : 1)
      const baseMin = (d?.build_minutes ?? 2) * 0.5 * hpMissing
      const repairMin = applyDockBonus(baseMin, dockLevel, 'time')
      const finishAt = new Date(Date.now() + repairMin * 60 * 1000).toISOString()

      await supabase.from('repair_queue').insert({
        ship_id: ship.id, planet_id: planet.id, player_id: player.id,
        hp_missing: ship.max_hp - ship.current_hp,
        max_hp: ship.max_hp, finish_at: finishAt,
      })
    }

    queryClient.invalidateQueries(['dock-ships'])
    queryClient.invalidateQueries(['repair-queue', player?.id])
    queryClient.invalidateQueries(['planet', player?.id])
    setSelectedIds(new Set())
    setBusy(false)
  }

  const handleScrap = async () => {
    if (busy || !selectedShips.length) return
    setBusy(true)
    setConfirmScrap(false)

    // Erstattung gutschreiben
    const updates = {}
    for (const k of COST_KEYS) {
      const refund = Math.floor(scrapRefund[k] ?? 0)
      if (refund > 0) updates[k] = (planet[k] ?? 0) + refund
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('planets').update(updates).eq('id', planet.id)
    }

    // Schiffe + Designs löschen
    for (const ship of selectedShips) {
      await supabase.from('ships').delete().eq('id', ship.id)
      await supabase.from('ship_designs').delete().eq('id', ship.design_id)
    }

    queryClient.invalidateQueries(['dock-ships'])
    queryClient.invalidateQueries(['planet', player?.id])
    setSelectedIds(new Set())
    setBusy(false)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 font-mono text-sm">
      Lade Dock...
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      <div>
        <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Dock</h2>
        <p className="text-sm font-mono text-slate-500 mt-1">
          Level {dockLevel} · {ships.length} Schiff{ships.length !== 1 ? 'e' : ''} verfügbar
        </p>
      </div>

      {/* Umbau Modal */}
      <AnimatePresence>
        {refitShip && (
          <RefitPanel
            ship={refitShip}
            partDefs={partDefs}
            chassisDefs={chassisDefs}
            dockLevel={dockLevel}
            planet={planet}
            player={player}
            queryClient={queryClient}
            onClose={() => setRefitShip(null)}
          />
        )}
      </AnimatePresence>

      {/* Schiffsliste */}
      <div className="panel p-5">
        {/* Header + Bulk-Aktionen */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
            Schiffe im Dock
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={selectAll}
              className="px-3 py-1.5 rounded text-xs font-mono transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              Alle
            </button>

            {repairableSelected.length > 0 && (
              <button onClick={handleRepair} disabled={busy || !canAffordRepair}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all"
                style={{
                  background: canAffordRepair ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${canAffordRepair ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: canAffordRepair ? '#22d3ee' : '#334155',
                }}>
                <Wrench size={11} />
                Reparieren ({repairableSelected.length})
                {repairTimeLabel && <span className="text-slate-500">· {repairTimeLabel}</span>}
              </button>
            )}

            {selectedShips.length > 0 && (
              <button onClick={() => setConfirmScrap(true)} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#f87171',
                }}>
                <Trash2 size={11} />
                Verschrotten ({selectedShips.length})
              </button>
            )}
          </div>
        </div>

        {/* Kosten-Preview Reparatur */}
        {repairableSelected.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-3 flex-wrap"
            style={{
              background: canAffordRepair ? 'rgba(34,211,238,0.04)' : 'rgba(239,68,68,0.04)',
              border: `1px solid ${canAffordRepair ? 'rgba(34,211,238,0.1)' : 'rgba(239,68,68,0.15)'}`,
            }}>
            <span className="text-xs font-mono text-slate-500">Reparaturkosten:</span>
            {COST_KEYS.map(k => {
              const cost = Math.ceil(repairCosts[k] ?? 0)
              if (!cost) return null
              const hasEnough = (planet?.[k] ?? 0) >= cost
              return (
                <span key={k} className="text-xs font-mono" style={{ color: hasEnough ? '#94a3b8' : '#f87171' }}>
                  {fmt(cost)} {COST_LABELS[k]}
                </span>
              )
            })}
          </div>
        )}

        {/* Erstattungs-Preview Verschrottung */}
        {selectedShips.length > 0 && Object.keys(scrapRefund).length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg flex items-center gap-3 flex-wrap"
            style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
            <span className="text-xs font-mono text-slate-500">Erstattung:</span>
            {COST_KEYS.map(k => {
              const refund = Math.floor(scrapRefund[k] ?? 0)
              if (!refund) return null
              return (
                <span key={k} className="text-xs font-mono" style={{ color: '#34d399' }}>
                  +{fmt(refund)} {COST_LABELS[k]}
                </span>
              )
            })}
          </div>
        )}

        {/* Schiffe */}
        {ships.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <p className="font-mono text-slate-600">Keine Schiffe im Dock.</p>
            <p className="text-xs font-mono text-slate-700">
              Schiffe müssen ohne Flottenzuordnung an deinem Planeten sein.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {ships.map(ship => (
              <DockShipRow
                key={ship.id}
                ship={ship}
                selected={selectedIds.has(ship.id)}
                onToggle={toggleSelect}
                onRefit={setRefitShip}
                dockLevel={dockLevel}
                repairQueue={repairQueue}
                refitQueue={refitQueue}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm Scrap Dialog */}
      <AnimatePresence>
        {confirmScrap && (
          <ConfirmDialog
            title="Schiffe verschrotten?"
            message={`${selectedShips.length} Schiff${selectedShips.length !== 1 ? 'e' : ''} werden unwiderruflich verschrottet. Du erhältst 70% der Ressourcen zurück, abzüglich Schaden.`}
            onConfirm={handleScrap}
            onCancel={() => setConfirmScrap(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
