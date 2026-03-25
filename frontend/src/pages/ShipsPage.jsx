// src/pages/ShipsPage.jsx — v1.2
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Info, X, Navigation, Package, Zap, Shield, Crosshair, Cpu, ChevronDown, Plus, CheckSquare } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function coords(fleet) {
  if (!fleet) return '—'
  return `${fleet.x ?? 0} / ${fleet.y ?? 0} / ${fleet.z ?? 0}`
}

function samePosition(a, b) {
  return (a?.x ?? 0) === (b?.x ?? 0) &&
         (a?.y ?? 0) === (b?.y ?? 0) &&
         (a?.z ?? 0) === (b?.z ?? 0)
}

const PART_CATEGORY_ICONS = {
  engine:           { icon: Zap,       label: 'Antrieb',     color: '#fbbf24' },
  booster:          { icon: Zap,       label: 'Booster',     color: '#fb923c' },
  primary_weapon:   { icon: Crosshair, label: 'Primärwaffe', color: '#f87171' },
  turret:           { icon: Crosshair, label: 'Turret',      color: '#fca5a5' },
  armor:            { icon: Shield,    label: 'Panzerung',   color: '#94a3b8' },
  shield_hp:        { icon: Shield,    label: 'HP-Schild',   color: '#38bdf8' },
  shield_def:       { icon: Shield,    label: 'Def-Schild',  color: '#a78bfa' },
  cargo:            { icon: Package,   label: 'Ladebucht',   color: '#34d399' },
  mining:           { icon: Cpu,       label: 'Bergbau',     color: '#86efac' },
  scanner_asteroid: { icon: Cpu,       label: 'Ast-Scanner', color: '#67e8f9' },
  scanner_npc:      { icon: Cpu,       label: 'NPC-Scanner', color: '#c084fc' },
  extension:        { icon: Cpu,       label: 'Erweiterung', color: '#cbd5e1' },
}

// ─── Bulk Assign Modal ─────────────────────────────────────────────────────────
// Für Einzelschiff und Mehrfachauswahl gleichermaßen nutzbar

function BulkAssignModal({ ships, fleets, planet, onClose, onAssigned }) {
  const [selected, setSelected] = useState('__none__')
  const [newFleetName, setNewFleetName] = useState('')
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  // Position des Schiffs: eigene Koordinaten wenn vorhanden, sonst Flotte, sonst Planet
  const shipPosition = ships[0]?.fleet_id
    ? fleets.find(f => f.id === ships[0].fleet_id)
    : (ships[0]?.x != null ? { x: ships[0].x, y: ships[0].y, z: ships[0].z } : planet)

  // Nur Flotten an gleicher Position die nicht unterwegs sind
  const eligibleFleets = fleets.filter(f =>
    !f.is_in_transit &&
    samePosition(f, shipPosition)
  )

  const handleSave = async () => {
    if (saving) return
    setSaving(true)

    let fleetId = selected === '__none__' ? null : selected

    if (mode === 'new') {
      if (!newFleetName.trim()) { setSaving(false); return }
      const { data: newFleet, error } = await supabase.from('fleets').insert({
        player_id: ships[0].player_id,
        name: newFleetName.trim(),
        x: shipPosition?.x ?? 0,
        y: shipPosition?.y ?? 0,
        z: shipPosition?.z ?? 0,
        target_x: shipPosition?.x ?? 0,
        target_y: shipPosition?.y ?? 0,
        target_z: shipPosition?.z ?? 0,
        mission: 'idle',
        flight_mode: 'neutral',
      }).select().single()
      if (error || !newFleet) { setSaving(false); return }
      fleetId = newFleet.id
    }

    const ids = ships.map(s => s.id)
    await supabase.from('ships').update({ fleet_id: fleetId }).in('id', ids)

    setSaving(false)
    onAssigned()
  }

  const isSingle = ships.length === 1

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-slate-200">
            {isSingle ? 'Flotte zuweisen' : `${ships.length} Schiffe zuweisen`}
          </h3>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>

        {!isSingle && (
          <div className="px-3 py-2 rounded-lg text-xs font-mono text-slate-400"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {ships.map(s => s.name ?? s.ship_designs?.name ?? 'Unbenannt').join(', ')}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {[['existing', 'Bestehende Flotte'], ['new', 'Neue Flotte']].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className="px-3 py-2 text-xs font-mono transition-all"
              style={{
                color: mode === m ? '#22d3ee' : '#475569',
                borderBottom: mode === m ? '2px solid #22d3ee' : '2px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' && (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {/* Im Dock Option */}
            <button
              onClick={() => setSelected('__none__')}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
              style={{
                background: selected === '__none__' ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected === '__none__' ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: selected === '__none__' ? '#475569' : '#1e293b' }} />
              <span className="text-sm font-mono" style={{ color: selected === '__none__' ? '#94a3b8' : '#475569' }}>
                Im Dock (keine Flotte)
              </span>
            </button>

            {eligibleFleets.length === 0 && (
              <p className="text-xs font-mono text-slate-700 px-1 py-2">
                Keine Flotten an dieser Position. Erstelle eine neue Flotte oder bewege eine bestehende hierher.
              </p>
            )}

            {eligibleFleets.map(f => (
              <button key={f.id} onClick={() => setSelected(f.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                style={{
                  background: selected === f.id ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected === f.id ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: selected === f.id ? '#22d3ee' : '#334155' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono block truncate"
                    style={{ color: selected === f.id ? '#22d3ee' : '#94a3b8' }}>
                    {f.name ?? 'Unbenannt'}
                  </span>
                  <span className="text-xs font-mono" style={{ color: '#334155' }}>
                    {f.x} / {f.y} / {f.z}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {mode === 'new' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-slate-500 mb-1.5">Flottenname</label>
              <input
                value={newFleetName}
                onChange={e => setNewFleetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="z.B. Aufklärungsflotte Alpha..."
                autoFocus
                className="w-full rounded px-3 py-2 text-sm font-mono"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: '#e2e8f0', outline: 'none',
                }}
              />
            </div>
            <p className="text-xs font-mono" style={{ color: '#334155' }}>
              Position: {shipPosition?.x ?? 0} / {shipPosition?.y ?? 0} / {shipPosition?.z ?? 0}
            </p>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 rounded text-sm font-mono"
            style={{ color: '#475569' }}>
            Abbrechen
          </button>
          <button onClick={handleSave}
            disabled={saving || (mode === 'new' && !newFleetName.trim())}
            className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: 'rgba(34,211,238,0.15)',
              border: '1px solid rgba(34,211,238,0.3)',
              color: '#22d3ee',
              opacity: (mode === 'new' && !newFleetName.trim()) ? 0.4 : 1,
            }}>
            {saving ? 'Speichert...' : 'Zuweisen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Detail Popup ──────────────────────────────────────────────────────────────

function ShipDetailPopup({ ship, design, chassis, partDefs, fleet, planet, onClose }) {
  const imgSrc = chassis?.image_key
    ? `/Starbound-Alpha/ships/${chassis.image_key}.png`
    : null

  // installed_parts kann ein flaches ID-Array ["engine_ion_s", ...] sein
  // oder ein Objekt-Array [{part_id, slot_index}, ...] — beide unterstützen
  const installedParts = (design?.installed_parts ?? []).map(p => {
    const partId = typeof p === 'string' ? p : p.part_id
    const def = partDefs.find(d => d.id === partId)
    return def ? { ...def, slot_index: typeof p === 'object' ? p.slot_index : null } : null
  }).filter(Boolean)

  const stats = [
    { label: 'Hülle',       value: `${ship.current_hp} / ${ship.max_hp}`, color: '#4ade80' },
    { label: 'Angriff',     value: fmt(design?.total_attack),              color: '#f87171' },
    { label: 'Verteidigung',value: fmt(design?.total_defense),             color: '#38bdf8' },
    { label: 'Geschw.',     value: fmt(design?.total_speed),               color: '#fbbf24' },
    { label: 'Manöver',     value: fmt(design?.total_maneuver),            color: '#a78bfa' },
    { label: 'Laderaum',    value: fmt(design?.total_cargo),               color: '#34d399' },
    { label: 'Scanweite',   value: fmt(design?.total_scan_range),          color: '#67e8f9' },
    { label: 'Zellen',      value: `${design?.total_cells_used ?? 0}`,     color: '#94a3b8' },
  ]

  const byCategory = {}
  for (const p of installedParts) {
    if (!byCategory[p.category]) byCategory[p.category] = []
    byCategory[p.category].push(p)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
          maxHeight: '85vh', overflowY: 'auto',
        }}>
        <div className="flex items-center gap-4 p-5"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          {imgSrc && (
            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-1" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-xl text-slate-100 truncate">{ship.name ?? design?.name ?? 'Unbenannt'}</h2>
            <p className="text-sm font-mono text-slate-500">{chassis?.name} · Klasse {chassis?.class}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#475569' }}>
              {fleet ? `Flotte: ${fleet.name ?? 'Unbenannt'} · ${coords(fleet)}` : `Heimatplanet · ${planet?.name ?? '—'}`}
            </p>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded hover:bg-white/5 transition-colors"
            style={{ color: '#475569' }}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Schiffswerte</p>
            <div className="grid grid-cols-4 gap-2">
              {stats.map(s => (
                <div key={s.label} className="rounded-lg p-2.5 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-mono text-slate-600 mb-1">{s.label}</p>
                  <p className="font-mono font-bold text-sm" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Eingebaute Bauteile</p>
            {installedParts.length === 0 ? (
              <p className="text-xs font-mono text-slate-700">Keine Bauteile eingebaut.</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(byCategory).map(([cat, parts]) => {
                  const meta = PART_CATEGORY_ICONS[cat] ?? { label: cat, color: '#94a3b8', icon: Cpu }
                  const Icon = meta.icon
                  return (
                    <div key={cat}>
                      <p className="text-xs font-mono mb-0.5 flex items-center gap-1.5" style={{ color: meta.color }}>
                        <Icon size={10} />{meta.label}
                      </p>
                      {parts.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 rounded ml-4"
                          style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="text-xs font-mono text-slate-300 flex-1">{p.name}</span>
                          {p.effects && Object.entries(p.effects).slice(0, 3).map(([k, v]) => (
                            <span key={k} className="text-xs font-mono" style={{ color: '#475569' }}>
                              {k}: <span style={{ color: meta.color }}>{v > 0 ? `+${v}` : v}</span>
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-lg p-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-mono text-slate-600 mb-1">Erfahrung</p>
              <p className="font-mono font-bold text-sm text-slate-300">{fmt(ship.experience)} XP · Lvl {ship.ship_level}</p>
            </div>
            <div className="flex-1 rounded-lg p-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-mono text-slate-600 mb-1">Rückzug bei</p>
              <p className="font-mono font-bold text-sm text-slate-300">
                {ship.auto_retreat_at > 0 ? `${ship.auto_retreat_at}% HP` : 'Deaktiviert'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Ship Row ─────────────────────────────────────────────────────────────────

function ShipRow({ ship, design, chassis, fleet, planet, partDefs, selected, onToggleSelect, onDetail, onAssign, onGoToFleet, onRetreatChange }) {
  const imgSrc = chassis?.image_key
    ? `/Starbound-Alpha/ships/${chassis.image_key}.png`
    : null

  const hpPct = ship.max_hp > 0 ? (ship.current_hp / ship.max_hp) * 100 : 0
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'

  // Flotte angekommen aber noch als "im Flug" markiert?
  const isActuallyTransit = fleet?.is_in_transit &&
    fleet?.arrive_at && new Date(fleet.arrive_at) > new Date()

  return (
    <motion.div layout
      onClick={() => onToggleSelect(ship.id)}
      className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
      style={{
        background: selected ? 'rgba(34,211,238,0.06)' : 'rgba(4,13,26,0.7)',
        border: `1px solid ${selected ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.06)'}`,
      }}>

      {/* Checkbox */}
      <div className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all"
        style={{
          background: selected ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${selected ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
        }}>
        {selected && <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#22d3ee' }} />}
      </div>

      {/* Icon */}
      <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center"
        style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)' }}>
        {imgSrc
          ? <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-1" />
          : <span className="text-slate-600 text-lg">🚀</span>
        }
      </div>

      {/* Name */}
      <div className="w-36 flex-shrink-0">
        <p className="font-mono text-sm font-semibold text-slate-200 truncate">
          {ship.name ?? design?.name ?? 'Unbenannt'}
        </p>
        <p className="text-xs font-mono text-slate-600 truncate">{chassis?.name ?? '—'}</p>
      </div>

      {/* Flotten-Zuweisung */}
      <div className="w-36 flex-shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {fleet ? (
          <>
            <button onClick={() => onGoToFleet(fleet.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all truncate max-w-[100px]"
              style={{
                background: isActuallyTransit ? 'rgba(34,211,238,0.1)' : 'rgba(168,85,247,0.1)',
                border: `1px solid ${isActuallyTransit ? 'rgba(34,211,238,0.25)' : 'rgba(168,85,247,0.25)'}`,
                color: isActuallyTransit ? '#22d3ee' : '#a78bfa',
              }}>
              <Navigation size={10} className="flex-shrink-0" />
              <span className="truncate">{fleet.name ?? 'Flotte'}</span>
            </button>
            <button onClick={() => onAssign([ship])}
              className="flex-shrink-0 p-1 rounded transition-all hover:bg-white/5"
              style={{ color: '#475569' }}
              title="Flotte ändern">
              <ChevronDown size={12} />
            </button>
          </>
        ) : (
          <button onClick={() => onAssign([ship])}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#475569',
            }}>
            <Navigation size={10} />
            Zuweisen
          </button>
        )}
      </div>

      {/* Position */}
      <div className="w-32 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Position</p>
        <p className="text-xs font-mono text-slate-400">
          {fleet ? coords(fleet) : (ship.x != null ? `${ship.x}/${ship.y}/${ship.z}` : (planet ? `${planet.x ?? 0}/${planet.y ?? 0}/${planet.z ?? 0}` : '—'))}
        </p>
      </div>

      {/* HP */}
      <div className="w-28 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-slate-600">HP</span>
          <span className="text-xs font-mono font-semibold" style={{ color: hpColor }}>
            {fmt(ship.current_hp)} / {fmt(ship.max_hp)}
          </span>
        </div>
        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full transition-all"
            style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* Angriff */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Angriff</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#f87171' }}>
          {fmt(design?.total_attack ?? 0)}
        </p>
      </div>

      {/* Geschwindigkeit */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Geschw.</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>
          {fmt(design?.total_speed)}
        </p>
      </div>

      {/* Laderaum */}
      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Laderaum</p>
        <p className="text-xs font-mono font-semibold text-slate-300">{fmt(design?.total_cargo)}</p>
      </div>

      {/* Flucht bei % + Detail Button */}
      <div className="flex-shrink-0 ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {/* Auto-Retreat Dropdown */}
        <select
          value={ship.auto_retreat_at ?? 0}
          onChange={e => onRetreatChange(ship.id, parseInt(e.target.value))}
          className="text-xs font-mono rounded px-1.5 py-1 transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: ship.auto_retreat_at > 0 ? '#fbbf24' : '#334155',
            outline: 'none',
          }}
          title="Automatisch fliehen wenn HP unter diesem Wert">
          <option value={0}>Nie fliehen</option>
          {[10,20,30,40,50,60,70,80,90].map(v => (
            <option key={v} value={v}>Flucht bei {v}%</option>
          ))}
        </select>
        <button onClick={() => onDetail(ship)}
          className="p-1.5 rounded-full transition-all hover:bg-white/5"
          style={{ border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}
          title="Details">
          <Info size={13} />
        </button>
      </div>
    </motion.div>
  )
}

// ─── ShipsPage ────────────────────────────────────────────────────────────────

export default function ShipsPage() {
  const { player, planet } = useGameStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedShip, setSelectedShip] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkAssigning, setBulkAssigning] = useState(null) // array of ships

  const { data: ships = [], isLoading } = useQuery({
    queryKey: ['ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, ship_designs(*)')
        .eq('player_id', player.id)
        .order('created_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  const { data: fleets = [] } = useQuery({
    queryKey: ['fleets-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  const { data: chassisDefs = [] } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const { data: partDefs = [] } = useQuery({
    queryKey: ['part-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('ship_part_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const getFleet = (fleetId) => fleets.find(f => f.id === fleetId)
  const getChassis = (chassisId) => chassisDefs.find(c => c.id === chassisId)

  const handleToggleSelect = (shipId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(shipId) ? next.delete(shipId) : next.add(shipId)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === ships.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ships.map(s => s.id)))
    }
  }

  const handleBulkAssign = (shipList) => {
    setBulkAssigning(shipList)
  }

  const handleAssignSelected = () => {
    const selected = ships.filter(s => selectedIds.has(s.id))
    if (selected.length > 0) setBulkAssigning(selected)
  }

  const handleAssigned = () => {
    queryClient.invalidateQueries(['ships', player?.id])
    queryClient.invalidateQueries(['fleets-ships', player?.id])
    setBulkAssigning(null)
    setSelectedIds(new Set())
  }

  const handleGoToFleet = (fleetId) => {
    navigate(`/fleet?highlight=${fleetId}`)
  }

  const handleRetreatChange = async (shipId, value) => {
    await supabase.from('ships').update({ auto_retreat_at: value }).eq('id', shipId)
    queryClient.invalidateQueries(['ships', player?.id])
  }

  const selectedDesign = selectedShip?.ship_designs
  const selectedChassis = selectedDesign ? getChassis(selectedDesign.chassis_id) : null
  const selectedFleet = selectedShip?.fleet_id ? getFleet(selectedShip.fleet_id) : null

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Lade Schiffe...
    </div>
  )

  const anySelected = selectedIds.size > 0

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Schiffe</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {ships.length} Schiff{ships.length !== 1 ? 'e' : ''} · {ships.filter(s => !s.fleet_id).length} im Dock
          </p>
        </div>

        {/* Bulk-Aktionen */}
        {anySelected && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2">
            <span className="text-xs font-mono" style={{ color: '#22d3ee' }}>
              {selectedIds.size} ausgewählt
            </span>
            <button onClick={handleAssignSelected}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-mono font-semibold transition-all"
              style={{
                background: 'rgba(34,211,238,0.1)',
                border: '1px solid rgba(34,211,238,0.25)',
                color: '#22d3ee',
              }}>
              <Navigation size={13} />
              Flotte zuweisen
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              className="p-2 rounded-lg transition-all hover:bg-white/5"
              style={{ color: '#475569', border: '1px solid rgba(255,255,255,0.08)' }}>
              <X size={13} />
            </button>
          </motion.div>
        )}
      </div>

      {/* Spalten-Header */}
      {ships.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1">
          {/* Alle auswählen */}
          <button onClick={handleSelectAll}
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: selectedIds.size === ships.length && ships.length > 0 ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${selectedIds.size === ships.length && ships.length > 0 ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.1)'}`,
            }}
            title="Alle auswählen">
            {selectedIds.size === ships.length && ships.length > 0 &&
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#22d3ee' }} />}
          </button>
          <div className="w-9 flex-shrink-0" />
          <div className="w-36 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Name / Chassis</span>
          </div>
          <div className="w-36 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Flotte</span>
          </div>
          <div className="w-32 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Position</span>
          </div>
          <div className="w-28 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Hülle</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Angriff</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Geschw.</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Laderaum</span>
          </div>
          <div className="ml-auto flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Flucht</span>
          </div>
        </div>
      )}

      {/* Schiffsliste */}
      {ships.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">🚀</p>
          <p className="font-display text-slate-400 text-lg">Keine Schiffe vorhanden</p>
          <p className="text-slate-600 font-mono text-sm">Baue dein erstes Schiff in der Werft.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ships.map(ship => (
            <ShipRow
              key={ship.id}
              ship={ship}
              design={ship.ship_designs}
              chassis={getChassis(ship.ship_designs?.chassis_id)}
              fleet={ship.fleet_id ? getFleet(ship.fleet_id) : null}
              planet={planet}
              partDefs={partDefs}
              selected={selectedIds.has(ship.id)}
              onToggleSelect={handleToggleSelect}
              onDetail={setSelectedShip}
              onAssign={handleBulkAssign}
              onGoToFleet={handleGoToFleet}
              onRetreatChange={handleRetreatChange}
            />
          ))}
        </div>
      )}

      {/* Detail Popup */}
      <AnimatePresence>
        {selectedShip && (
          <ShipDetailPopup
            ship={selectedShip}
            design={selectedDesign}
            chassis={selectedChassis}
            partDefs={partDefs}
            fleet={selectedFleet}
            planet={planet}
            onClose={() => setSelectedShip(null)}
          />
        )}
      </AnimatePresence>

      {/* Bulk/Single Assign Modal */}
      <AnimatePresence>
        {bulkAssigning && (
          <BulkAssignModal
            ships={bulkAssigning}
            fleets={fleets}
            planet={planet}
            onClose={() => setBulkAssigning(null)}
            onAssigned={handleAssigned}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
