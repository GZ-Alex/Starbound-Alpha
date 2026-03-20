// src/pages/DockPage.jsx — v1.0
import { useState, useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { ShipDesigner } from './ShipyardPage'
import {
  Wrench, Trash2, Settings, CheckSquare, Square, AlertTriangle
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

// ─── Ship Row ─────────────────────────────────────────────────────────────────

function DockShipRow({ ship, selected, onToggle, onRefit, dockLevel, repairQueue, refitQueue, queryClient }) {
  const design = ship.ship_designs
  const hpPct = ship.max_hp > 0 ? Math.round((ship.current_hp / ship.max_hp) * 100) : 0
  const hpColor = hpPct >= 100 ? '#4ade80' : hpPct > 60 ? '#fbbf24' : '#f87171'

  const inRepair = repairQueue.some(r => r.ship_id === ship.id)
  const inRefit  = refitQueue.some(r => r.ship_id === ship.id)
  const isLocked = ship.fleet_id || (ship.cargo_used > 0)

  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(ship.name ?? design?.name ?? '')

  const handleRename = async () => {
    if (!nameVal.trim()) return
    await supabase.from('ships').update({ name: nameVal.trim() }).eq('id', ship.id)
    queryClient?.invalidateQueries(['dock-ships'])
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all"
      style={{
        background: selected ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)'}`,
        cursor: isLocked ? 'default' : 'pointer',
        opacity: isLocked ? 0.5 : 1,
      }}
      onClick={() => !isLocked && !editing && onToggle(ship.id)}>

      {/* Checkbox */}
      <div className="flex-shrink-0" style={{ color: selected ? '#22d3ee' : '#334155' }}>
        {selected ? <CheckSquare size={15} /> : <Square size={15} />}
      </div>

      {/* Name + Chassis */}
      <div className="flex-1 min-w-0" onClick={e => editing && e.stopPropagation()}>
        {editing ? (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <input
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
              maxLength={30}
              autoFocus
              className="flex-1 px-2 py-0.5 rounded text-sm font-mono"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(34,211,238,0.4)', color: '#e2e8f0', outline: 'none' }}
            />
            <button onClick={handleRename} className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(34,211,238,0.1)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}>✓</button>
            <button onClick={() => setEditing(false)} className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}>✕</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <p className="text-sm font-mono font-semibold text-slate-200 truncate">{ship.name ?? design?.name ?? '—'}</p>
            <button onClick={e => { e.stopPropagation(); setEditing(true) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-400 flex-shrink-0"
              title="Umbenennen">
              ✎
            </button>
          </div>
        )}
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
        {refitShip && (() => {
          const design  = refitShip.ship_designs
          const chassis = chassisDefs.find(c => c.id === design?.chassis_id)
          if (!chassis) return null
          return (
            <ShipDesigner
              chassis={chassis}
              planet={planet}
              player={player}
              partDefs={partDefs}
              hasTech={() => true}
              onClose={() => setRefitShip(null)}
              refitMode={true}
              ship={refitShip}
              onRefit={() => {
                queryClient.invalidateQueries(['dock-ships'])
                queryClient.invalidateQueries(['planet', player?.id])
                setRefitShip(null)
              }}
              queryClient={queryClient}
              dockLevel={dockLevel}
            />
          )
        })()}
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
                queryClient={queryClient}
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
