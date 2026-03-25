// src/pages/FleetPage.jsx — v1.1
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Navigation, ChevronLeft, Package, Shield, Zap,
  Clock, Crosshair, AlertTriangle, Plus, X, Gem, Store,
  Bookmark, BookmarkPlus, Trash2, Send, Users, Globe, Info
} from 'lucide-react'

// ─── NPC Meta Helper ──────────────────────────────────────────────────────────
const DIFF_COLORS_FLEET = {
  rookie:    '#4ade80',
  seasoned:  '#86efac',
  veteran:   '#fb923c',
  elite:     '#f87171',
  commander: '#e879f9',
}
const SIZE_LABELS_FLEET = { staffel: 'Staffel', geschwader: 'Geschwader', flotte: 'Flotte', armada: 'Armada' }
const DIFF_LABELS_FLEET = { rookie: 'Rookie', seasoned: 'Seasoned', veteran: 'Veteran', elite: 'Elite', commander: 'Commander' }

function getNpcMetaFleet(npcType, difficulty, size) {
  if (npcType === 'haendler_konvoi') return { label: 'Händler-Konvoi', color: '#34d399', threat: 'Passiv' }
  const diff = difficulty ?? npcType?.split('_')[0]
  const sz   = size ?? npcType?.split('_')[1]
  return {
    label: 'Piraten-' + (SIZE_LABELS_FLEET[sz] ?? sz ?? '?'),
    color: DIFF_COLORS_FLEET[diff] ?? '#f87171',
    threat: DIFF_LABELS_FLEET[diff] ?? diff ?? '?',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function coords(x, y, z) {
  if (x == null) return '—'
  return `${x} / ${y} / ${z}`
}

function etaString(arriveAt) {
  if (!arriveAt) return null
  const ms = new Date(arriveAt).getTime() - Date.now()
  if (ms <= 0) return 'Ankunft...'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `~${h}h ${m}m`
  if (h > 0) return `~${h}h`
  if (totalMin < 1) return '< 1 Min'
  return `~${m}m`
}

const MISSION_LABELS = {
  idle:   { label: 'Stationär', color: '#64748b' },
  move:   { label: 'Im Flug',   color: '#22d3ee' },
  mine:   { label: 'Abbau',     color: '#34d399' },
  return: { label: 'Rückkehr',  color: '#a78bfa' },
}

const FLIGHT_MODE_LABELS = {
  neutral:      { label: 'Neutral',      color: '#64748b' },
  enemy:        { label: 'Feindlich',    color: '#f87171' },
  bounty:       { label: 'Kopfgeld',     color: '#fb923c' },
  annihilation: { label: 'Vernichtung',  color: '#ef4444' },
}

// Bookmark-Typen
const BOOKMARK_TYPES = [
  { id: 'friend',   label: 'Freund',         color: '#4ade80' },
  { id: 'alliance', label: 'Allianz',         color: '#166534' },
  { id: 'trade',    label: 'Handelsstation',  color: '#fbbf24' },
  { id: 'enemy',    label: 'Feind',           color: '#f87171' },
  { id: 'neutral',  label: 'Neutral',         color: '#94a3b8' },
  { id: 'other',    label: 'Sonstige',        color: '#ffffff' },
]

function getBookmarkMeta(type) {
  return BOOKMARK_TYPES.find(b => b.id === type) ?? BOOKMARK_TYPES[5]
}

function fleetCargo(fleet, ships) {
  const maxCargo = ships.reduce((s, sh) => s + (sh.ship_designs?.total_cargo ?? 0), 0)
  const currentCargo = Object.values(fleet.cargo ?? {}).reduce((s, v) => s + v, 0)
  return { current: currentCargo, max: maxCargo }
}

function fleetHpPct(ships) {
  if (!ships.length) return 0
  const total = ships.reduce((s, sh) => s + sh.max_hp, 0)
  const current = ships.reduce((s, sh) => s + sh.current_hp, 0)
  return total > 0 ? Math.round((current / total) * 100) : 0
}

function fleetSpeed(ships) {
  if (!ships.length) return 0
  return Math.min(...ships.map(sh => sh.ship_designs?.total_speed ?? 0).filter(s => s > 0))
}

// ─── Neue Flotte erstellen Modal ───────────────────────────────────────────────

function CreateFleetModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const { player, planet } = useGameStore()

  const handleCreate = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('fleets').insert({
      player_id: player.id,
      name: name.trim(),
      x: planet?.x ?? 0,
      y: planet?.y ?? 0,
      z: planet?.z ?? 0,
      target_x: planet?.x ?? 0,
      target_y: planet?.y ?? 0,
      target_z: planet?.z ?? 0,
      mission: 'idle',
      flight_mode: 'neutral',
    }).select().single()
    setSaving(false)
    if (!error && data) onCreate(data)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-slate-200">Neue Flotte</h3>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Flottenname..."
          autoFocus
          className="w-full rounded px-3 py-2 text-sm font-mono"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(34,211,238,0.2)',
            color: '#e2e8f0', outline: 'none',
          }}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded text-sm font-mono"
            style={{ color: '#475569' }}>
            Abbrechen
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || saving}
            className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: name.trim() ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${name.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: name.trim() ? '#22d3ee' : '#334155',
            }}>
            {saving ? 'Erstellt...' : 'Erstellen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Bookmark Manager Modal ────────────────────────────────────────────────────

function BookmarkModal({ playerId, onClose, onSelect }) {
  const [tab, setTab] = useState('list') // 'list' | 'add'
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('neutral')
  const [newX, setNewX] = useState('')
  const [newY, setNewY] = useState('')
  const [newZ, setNewZ] = useState('')
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  const { data: bookmarks = [], refetch } = useQuery({
    queryKey: ['fleet-bookmarks', playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleet_bookmarks')
        .select('*')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const handleAdd = async () => {
    if (!newName.trim() || saving) return
    const x = parseInt(newX)
    const y = parseInt(newY)
    const z = parseInt(newZ)
    if (isNaN(x) || isNaN(y) || isNaN(z)) return
    setSaving(true)
    await supabase.from('fleet_bookmarks').insert({
      player_id: playerId,
      name: newName.trim(),
      type: newType,
      x, y, z,
    })
    setSaving(false)
    setNewName(''); setNewX(''); setNewY(''); setNewZ('')
    setTab('list')
    refetch()
  }

  const handleDelete = async (id) => {
    await supabase.from('fleet_bookmarks').delete().eq('id', id)
    refetch()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          <div className="flex items-center gap-2">
            <Bookmark size={15} style={{ color: '#22d3ee' }} />
            <h3 className="font-display font-bold text-lg text-slate-200">Koordinaten-Bookmarks</h3>
          </div>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[{ id: 'list', label: 'Gespeichert' }, { id: 'add', label: 'Neu anlegen' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-2.5 text-xs font-mono transition-all"
              style={{
                color: tab === t.id ? '#22d3ee' : '#475569',
                borderBottom: tab === t.id ? '2px solid #22d3ee' : '2px solid transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'list' && (
            <div className="p-4 space-y-2">
              {bookmarks.length === 0 ? (
                <p className="text-sm font-mono text-slate-600 text-center py-6">
                  Noch keine Bookmarks angelegt.
                </p>
              ) : bookmarks.map(bm => {
                const meta = getBookmarkMeta(bm.type)
                return (
                  <div key={bm.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg group"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-slate-200 truncate">{bm.name}</p>
                      <p className="text-xs font-mono" style={{ color: meta.color }}>
                        {meta.label} · {bm.x} / {bm.y} / {bm.z}
                      </p>
                    </div>
                    {onSelect && (
                      <button onClick={() => onSelect(bm)}
                        className="px-2 py-1 rounded text-xs font-mono opacity-0 group-hover:opacity-100 transition-all"
                        style={{
                          background: 'rgba(34,211,238,0.1)',
                          border: '1px solid rgba(34,211,238,0.25)',
                          color: '#22d3ee',
                        }}>
                        Wählen
                      </button>
                    )}
                    <button onClick={() => handleDelete(bm.id)}
                      className="p-1 rounded transition-all opacity-0 group-hover:opacity-100 hover:bg-red-900/20"
                      style={{ color: '#f87171' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'add' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5">Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="z.B. Heimatplanet Alpha..."
                  className="w-full rounded px-3 py-2 text-sm font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(34,211,238,0.2)',
                    color: '#e2e8f0', outline: 'none',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5">Typ</label>
                <div className="grid grid-cols-3 gap-2">
                  {BOOKMARK_TYPES.map(bt => (
                    <button key={bt.id} onClick={() => setNewType(bt.id)}
                      className="px-2 py-2 rounded text-xs font-mono transition-all"
                      style={{
                        background: newType === bt.id ? `${bt.color}18` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${newType === bt.id ? bt.color + '50' : 'rgba(255,255,255,0.06)'}`,
                        color: newType === bt.id ? bt.color : '#64748b',
                      }}>
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 mb-1.5">Koordinaten</label>
                <div className="grid grid-cols-3 gap-2">
                  {[['X', newX, setNewX], ['Y', newY, setNewY], ['Z', newZ, setNewZ]].map(([label, val, setter]) => (
                    <div key={label}>
                      <p className="text-xs font-mono text-slate-600 mb-1">{label}</p>
                      <input
                        type="number"
                        value={val}
                        onChange={e => setter(e.target.value)}
                        placeholder="0"
                        className="w-full rounded px-2 py-1.5 text-sm font-mono"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#e2e8f0', outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={handleAdd}
                disabled={!newName.trim() || !newX || !newY || !newZ || saving}
                className="w-full py-2 rounded text-sm font-mono font-semibold transition-all"
                style={{
                  background: 'rgba(34,211,238,0.12)',
                  border: '1px solid rgba(34,211,238,0.25)',
                  color: '#22d3ee',
                  opacity: (!newName.trim() || !newX || !newY || !newZ) ? 0.4 : 1,
                }}>
                {saving ? 'Speichert...' : 'Bookmark speichern'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Zielkoordinaten Modal ─────────────────────────────────────────────────────

// ─── Distanz & ETA Helpers ────────────────────────────────────────────────────

function calcDistance(x1, y1, z1, x2, y2, z2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
}

// speed in pc/h, distance in pc → arrive_at als Date
function calcArriveAt(distancePc, speedPcPerH, speedPercent) {
  if (speedPcPerH <= 0) return null
  const effectiveSpeed = speedPcPerH * (speedPercent / 100)
  const hoursNeeded = distancePc / effectiveSpeed
  const msNeeded = hoursNeeded * 3600 * 1000
  return new Date(Date.now() + msNeeded)
}

function formatEtaDuration(distancePc, speedPcPerH, speedPercent) {
  if (!speedPcPerH || speedPcPerH <= 0 || !distancePc) return null
  const effectiveSpeed = speedPcPerH * (speedPercent / 100)
  if (effectiveSpeed <= 0) return null
  const hours = distancePc / effectiveSpeed
  const totalMin = Math.round(hours * 60)
  if (totalMin < 1) return '< 1 Min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0 && m > 0) return `~${h}h ${m}m`
  if (h > 0) return `~${h}h`
  return `~${m}m`
}

function SetTargetModal({ fleet, fleetShips, playerId, initialTarget, onClose, onSaved }) {
  const [tx, setTx] = useState(String(initialTarget?.x ?? fleet.target_x ?? fleet.x ?? 0))
  const [ty, setTy] = useState(String(initialTarget?.y ?? fleet.target_y ?? fleet.y ?? 0))
  const [tz, setTz] = useState(String(initialTarget?.z ?? fleet.target_z ?? fleet.z ?? 0))
  const [saving, setSaving] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)

  // Langsamste Geschwindigkeit in der Flotte (pc/h) × speed_percent
  const baseSpeed = fleetSpeed(fleetShips)  // langsamstes Schiff, pc/h
  const speedPercent = fleet.speed_percent ?? 100

  const txN = parseInt(tx), tyN = parseInt(ty), tzN = parseInt(tz)
  const coordsValid = !isNaN(txN) && !isNaN(tyN) && !isNaN(tzN)

  const distance = coordsValid
    ? calcDistance(fleet.x ?? 0, fleet.y ?? 0, fleet.z ?? 0, txN, tyN, tzN)
    : 0

  const etaLabel = coordsValid && baseSpeed > 0
    ? formatEtaDuration(distance, baseSpeed, speedPercent)
    : null

  const isSamePos = coordsValid && distance < 0.001

  const handleSave = async () => {
    if (saving || !coordsValid || isSamePos) return
    setSaving(true)

    const arriveAt = calcArriveAt(distance, baseSpeed, speedPercent)

    const { error } = await supabase.from('fleets').update({
      target_x: txN,
      target_y: tyN,
      target_z: tzN,
      mission: 'move',
      is_in_transit: true,
      arrive_at: arriveAt?.toISOString() ?? null,
    }).eq('id', fleet.id)

    setSaving(false)
    if (!error) onSaved()
  }

  const handleBookmarkSelect = (bm) => {
    setTx(String(bm.x))
    setTy(String(bm.y))
    setTz(String(bm.z))
    setShowBookmarks(false)
  }

  if (showBookmarks) {
    return (
      <BookmarkModal
        playerId={playerId}
        onClose={() => setShowBookmarks(false)}
        onSelect={handleBookmarkSelect}
      />
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-slate-200">Kurs setzen</h3>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 rounded-lg p-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-0.5">Position</p>
            <p className="text-xs font-mono text-slate-400">{coords(fleet.x, fleet.y, fleet.z)}</p>
          </div>
          <div className="flex-1 rounded-lg p-2.5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-0.5">Geschw.</p>
            <p className="text-xs font-mono" style={{ color: '#fbbf24' }}>
              {baseSpeed > 0 ? `${Math.round(baseSpeed * speedPercent / 100)} pc/h` : '— (kein Schiff)'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[['X', tx, setTx], ['Y', ty, setTy], ['Z', tz, setTz]].map(([label, val, setter]) => (
            <div key={label}>
              <p className="text-xs font-mono text-slate-500 mb-1">{label}</p>
              <input
                type="number"
                value={val}
                onChange={e => setter(e.target.value)}
                className="w-full rounded px-2 py-1.5 text-sm font-mono"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: '#e2e8f0', outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* ETA Preview */}
        {coordsValid && !isSamePos && (
          <div className="rounded-lg px-3 py-2.5 flex items-center justify-between"
            style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}>
            <div>
              <p className="text-xs font-mono text-slate-500">Distanz</p>
              <p className="text-sm font-mono text-slate-300">{distance.toFixed(1)} pc</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-slate-500">ETA</p>
              <p className="text-sm font-mono font-semibold" style={{ color: etaLabel ? '#22d3ee' : '#475569' }}>
                {etaLabel ?? (baseSpeed === 0 ? 'Keine Triebwerke' : '—')}
              </p>
            </div>
          </div>
        )}

        {isSamePos && (
          <p className="text-xs font-mono text-center" style={{ color: '#f87171' }}>
            Ziel ist identisch mit aktueller Position.
          </p>
        )}

        {/* Bookmark-Schnellzugriff */}
        <button onClick={() => setShowBookmarks(true)}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded text-xs font-mono transition-all"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#64748b',
          }}>
          <Bookmark size={11} />
          Aus Bookmarks wählen
        </button>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded text-sm font-mono"
            style={{ color: '#475569' }}>
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !coordsValid || isSamePos || baseSpeed === 0}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: (!coordsValid || isSamePos || baseSpeed === 0) ? 'rgba(255,255,255,0.04)' : 'rgba(34,211,238,0.15)',
              border: `1px solid ${(!coordsValid || isSamePos || baseSpeed === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(34,211,238,0.3)'}`,
              color: (!coordsValid || isSamePos || baseSpeed === 0) ? '#334155' : '#22d3ee',
              cursor: (!coordsValid || isSamePos || baseSpeed === 0) ? 'not-allowed' : 'pointer',
            }}>
            <Send size={12} />
            {saving ? 'Startet...' : 'Kurs setzen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Fleet Dissolve Confirm ────────────────────────────────────────────────────

function DissolveConfirmModal({ fleet, onClose, onDissolved }) {
  const [dissolving, setDissolving] = useState(false)

  const handleDissolve = async () => {
    setDissolving(true)
    // Schiffe behalten die Position der aufgelösten Flotte
    await supabase.from('ships')
      .update({ fleet_id: null, x: fleet.x, y: fleet.y, z: fleet.z })
      .eq('fleet_id', fleet.id)
    // Flotte löschen
    await supabase.from('fleets').delete().eq('id', fleet.id)
    setDissolving(false)
    onDissolved()
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Trash2 size={16} style={{ color: '#f87171' }} />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg text-slate-200">Flotte auflösen?</h3>
            <p className="text-xs font-mono text-slate-500">{fleet.name ?? 'Unbenannte Flotte'}</p>
          </div>
        </div>

        <p className="text-sm font-mono text-slate-400">
          Alle Schiffe dieser Flotte werden aufgelöst und verbleiben ohne Flottenzuordnung an ihrer aktuellen Position. Du kannst sie danach neu zuweisen.
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded text-sm font-mono"
            style={{ color: '#475569' }}>
            Abbrechen
          </button>
          <button onClick={handleDissolve} disabled={dissolving}
            className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171',
            }}>
            {dissolving ? 'Auflösung...' : 'Flotte auflösen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Fleet Scan Area ──────────────────────────────────────────────────────────

const ASTEROID_TYPE_LABELS = {
  metall:      { label: 'Metallasteroid',  color: '#94a3b8' },
  silikat:     { label: 'Silikatasteroid', color: '#a78bfa' },
  eis:         { label: 'Eisasteroid',     color: '#67e8f9' },
  gas:         { label: 'Gasblase',        color: '#34d399' },
  erz:         { label: 'Erzasteroid',     color: '#f472b6' },
  reichhaltig: { label: 'Reichhaltiger Asteroid', color: '#fbbf24' },
}

const NPC_TYPE_LABELS = {
  pirat_leicht:    { label: 'Piraten-Patrouille', color: '#f87171', threat: 'Leicht' },
  pirat_mittel:    { label: 'Piratengruppe',       color: '#fb923c', threat: 'Mittel' },
  piraten_verbund: { label: 'Piraten-Verbund',     color: '#ef4444', threat: 'Schwer' },
  haendler_konvoi: { label: 'Händler-Konvoi',      color: '#34d399', threat: 'Passiv' },
  npc_streitmacht: { label: 'NPC-Streitmacht',     color: '#8b5cf6', threat: 'Extrem' },
}

function dist3d(ax, ay, az, bx, by, bz) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

// ─── Scan Filter Button ────────────────────────────────────────────────────────

function ScanFilterBtn({ active, onToggle, label, color }) {
  return (
    <button onClick={onToggle}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all"
      style={{
        background: active ? `${color}15` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? color + '40' : 'rgba(255,255,255,0.08)'}`,
        color: active ? color : '#334155',
      }}>
      {label}
    </button>
  )
}

function FleetScanArea({ fleet, ships, onSetTarget }) {
  const [showAsteroids, setShowAsteroids] = useState(true)
  const [showPlanets,   setShowPlanets]   = useState(true)
  const [showFleets,    setShowFleets]    = useState(true)

  const { astRange, npcRange } = useMemo(() => {
    if (!ships.length) return { astRange: 0, npcRange: 0 }
    let ast = 0, npc = 0
    for (const ship of ships) {
      ast = Math.max(ast, ship.ship_designs?.ast_scan_range ?? 0)
      npc = Math.max(npc, ship.ship_designs?.npc_scan_range ?? 0)
    }
    return { astRange: ast, npcRange: npc }
  }, [ships])

  // Ast-Scanner sieht ALLES (Asteroiden, Planeten, Stationen, NPCs)
  // Zielscanner sieht NUR NPCs/Kopfgeld, aber mit eigener (oft größerer) Reichweite
  // NPC-Reichweite = Maximum aus beiden
  const effectiveNpcRange = Math.max(astRange, npcRange)
  const maxRange = effectiveNpcRange

  const fx = fleet.x ?? 0, fy = fleet.y ?? 0, fz = fleet.z ?? 0

  // Ast-Scanner: alles innerhalb astRange
  const { data: allObjects = [] } = useQuery({
    queryKey: ['fleet-scan-all', fleet.id, fx, fy, fz, astRange, effectiveNpcRange],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_scan_objects', {
        cx: fx, cy: fy, cz: fz,
        asteroid_range: astRange,
        fleet_range: effectiveNpcRange,
        p_player_id: null,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: maxRange > 0,
    refetchInterval: 30000,
  })

  if (maxRange === 0) return (
    <div className="panel p-4">
      <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Scanbereich</p>
      <p className="text-sm font-mono text-slate-700">Kein Scanner in dieser Flotte.</p>
    </div>
  )

  // Ast-Scanner sieht alles bis astRange
  // Zielscanner erweitert NPC-Sicht bis npcRange (falls größer als astRange)
  const asteroids = allObjects.filter(o => o.obj_type === 'asteroid')
  const planets   = allObjects.filter(o => o.obj_type === 'planet' || o.obj_type === 'station')
  const npcs      = allObjects.filter(o => {
    if (o.obj_type !== 'npc') return false
    if (astRange > 0 && o.distance <= astRange) return true
    if (npcRange > 0 && o.distance <= npcRange) return true
    return false
  })

  // Alles zusammen sortiert nach Distanz
  const allVisible = [
    ...(showFleets    ? npcs      : []),
    ...(showPlanets   ? planets   : []),
    ...(showAsteroids ? asteroids : []),
  ].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))

  const total = asteroids.length + planets.length + npcs.length

  const NPC_COLORS = {
    pirat_leicht:    { label: 'Piraten-Patrouille', color: '#f87171', threat: 'Leicht' },
    pirat_mittel:    { label: 'Piratengruppe',       color: '#fb923c', threat: 'Mittel' },
    piraten_verbund: { label: 'Piraten-Verbund',     color: '#ef4444', threat: 'Schwer' },
    haendler_konvoi: { label: 'Händler-Konvoi',      color: '#34d399', threat: 'Passiv' },
    npc_streitmacht: { label: 'NPC-Streitmacht',     color: '#8b5cf6', threat: 'Extrem' },
  }

  const AST_LABELS = {
    metall: 'Metallasteroid', silikat: 'Silikatasteroid', eis: 'Eisasteroid',
    gas: 'Gasblase', erz: 'Erzasteroid', reichhaltig: 'Reichhaltiger Asteroid',
  }
  const AST_COLORS = {
    metall: '#94a3b8', silikat: '#a78bfa', eis: '#67e8f9',
    gas: '#34d399', erz: '#f472b6', reichhaltig: '#fbbf24',
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-1">Scanbereich</p>
          <div className="flex items-center gap-3 flex-wrap">
            {astRange > 0 && <span className="text-xs font-mono" style={{ color: '#67e8f9' }}>Allscanner · {astRange} pc</span>}
            {npcRange > 0 && <span className="text-xs font-mono" style={{ color: '#f87171' }}>Zielscanner · {npcRange} pc</span>}
          </div>
        </div>
        <span className="text-xs font-mono text-slate-600">{total} Objekte</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {astRange > 0 && <ScanFilterBtn active={showAsteroids} onToggle={() => setShowAsteroids(v => !v)} label="Asteroiden" color="#67e8f9" />}
        {astRange > 0 && <ScanFilterBtn active={showPlanets}   onToggle={() => setShowPlanets(v => !v)}   label="Planeten"   color="#4ade80" />}
        {maxRange > 0 && <ScanFilterBtn active={showFleets}    onToggle={() => setShowFleets(v => !v)}    label="Flotten"    color="#f87171" />}
      </div>

      {total === 0 ? (
        <p className="text-sm font-mono text-slate-700">Keine Objekte in Scanreichweite.</p>
      ) : allVisible.length === 0 ? (
        <p className="text-xs font-mono text-slate-700">Alle Objekte ausgeblendet.</p>
      ) : (
        <div className="space-y-1.5">
          {allVisible.map(o => {
            const isNpc     = o.obj_type === 'npc'
            const isStation = o.obj_type === 'station'
            const isPlanet  = o.obj_type === 'planet'
            const isAst     = o.obj_type === 'asteroid'

            let icon, label, subLabel, color
            if (isNpc) {
              const meta = getNpcMetaFleet(o.data?.npc_type, o.data?.difficulty, o.data?.size)
              icon     = <AlertTriangle size={11} style={{ color: meta.color, flexShrink: 0 }} />
              label    = meta.label
              subLabel = `${o.data?.ship_count ?? '?'} Schiffe · ${meta.threat}`
              color    = meta.color
            } else if (isStation) {
              icon     = <Store size={11} style={{ color: '#34d399', flexShrink: 0 }} />
              label    = o.data?.name ?? 'Handelsstation'
              subLabel = 'Station'
              color    = '#34d399'
            } else if (isPlanet) {
              icon     = <Globe size={11} style={{ color: '#4ade80', flexShrink: 0 }} />
              label    = o.data?.name ?? 'Planet'
              subLabel = o.data?.username ? `Spieler: ${o.data.username}` : 'Planet'
              color    = '#4ade80'
            } else {
              const type = o.data?.type
              color    = AST_COLORS[type] ?? '#94a3b8'
              icon     = <Gem size={11} style={{ color, flexShrink: 0 }} />
              label    = AST_LABELS[type] ?? 'Asteroid'
              subLabel = null
            }

            return (
              <div key={o.obj_id} className="flex items-center gap-2 px-3 py-2 rounded"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {icon}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-300 truncate">{label}</p>
                  <p className="text-xs font-mono text-slate-600">{o.obj_x} / {o.obj_y} / {o.obj_z}{subLabel ? ` · ${subLabel}` : ''}</p>
                </div>
                <span className="text-xs font-mono text-slate-600 flex-shrink-0">{o.distance?.toFixed(1)} pc</span>
                {onSetTarget && (
                  <button
                    onClick={() => onSetTarget(o.obj_x, o.obj_y, o.obj_z)}
                    className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-mono transition-all"
                    style={{
                      background: 'rgba(34,211,238,0.08)',
                      border: '1px solid rgba(34,211,238,0.2)',
                      color: '#22d3ee',
                    }}
                    title="Kurs setzen">
                    →
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Ship Detail Popup (für FleetPage) ───────────────────────────────────────

function FleetShipDetailPopup({ ship, chassisDefs, onClose }) {
  const chassis = chassisDefs.find(c => c.id === ship.ship_designs?.chassis_id)
  const imgSrc = chassis?.image_key ? `/Starbound-Alpha/ships/${chassis.image_key}.png` : null
  const d = ship.ship_designs

  const stats = [
    { label: 'Hülle',        value: `${ship.current_hp} / ${ship.max_hp}`, color: '#4ade80' },
    { label: 'Angriff',      value: d?.total_attack ?? '—',                 color: '#f87171' },
    { label: 'Verteidigung', value: d?.total_defense ?? '—',                color: '#38bdf8' },
    { label: 'Geschw.',      value: d?.total_speed ?? '—',                  color: '#fbbf24' },
    { label: 'Manöver',      value: d?.total_maneuver ?? '—',               color: '#a78bfa' },
    { label: 'Laderaum',     value: d?.total_cargo ?? '—',                  color: '#34d399' },
    { label: 'Scanweite',    value: d?.total_scan_range ?? '—',             color: '#67e8f9' },
    { label: 'Zellen',       value: d?.total_cells_used ?? '—',             color: '#94a3b8' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
          maxHeight: '80vh', overflowY: 'auto',
        }}>
        <div className="flex items-center gap-4 p-5"
          style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}>
          {imgSrc && (
            <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-1" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-lg text-slate-100 truncate">
              {ship.name ?? d?.name ?? 'Unbenannt'}
            </h3>
            <p className="text-xs font-mono text-slate-500">{chassis?.name} · Klasse {chassis?.class}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: '#475569' }}>
              XP: {ship.experience ?? 0} · Level {ship.ship_level ?? 1}
              {ship.auto_retreat_at > 0 ? ` · Flucht bei ${ship.auto_retreat_at}%` : ''}
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-1.5 rounded hover:bg-white/5"
            style={{ color: '#475569' }}><X size={16} /></button>
        </div>
        <div className="p-5">
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
      </motion.div>
    </motion.div>
  )
}

// ─── Inline Target Input ──────────────────────────────────────────────────────

function InlineTargetInput({ fleet, ships, initialTarget, onSaved }) {
  const [tx, setTx] = useState(String(initialTarget?.x ?? fleet.target_x ?? ''))
  const [ty, setTy] = useState(String(initialTarget?.y ?? fleet.target_y ?? ''))
  const [tz, setTz] = useState(String(initialTarget?.z ?? fleet.target_z ?? ''))
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  // Wenn quickTarget sich ändert (Scan → Klick), Felder aktualisieren
  useEffect(() => {
    if (initialTarget) {
      setTx(String(initialTarget.x))
      setTy(String(initialTarget.y))
      setTz(String(initialTarget.z))
    }
  }, [initialTarget?.x, initialTarget?.y, initialTarget?.z])

  const txN = parseInt(tx), tyN = parseInt(ty), tzN = parseInt(tz)
  const coordsValid = !isNaN(txN) && !isNaN(tyN) && !isNaN(tzN)
  const baseSpeed = fleetSpeed(ships)
  const speedPercent = fleet.speed_percent ?? 100
  const distance = coordsValid
    ? calcDistance(fleet.x ?? 0, fleet.y ?? 0, fleet.z ?? 0, txN, tyN, tzN)
    : 0
  const isSamePos = coordsValid && distance < 0.001
  const etaLabel = coordsValid && baseSpeed > 0 && !isSamePos
    ? formatEtaDuration(distance, baseSpeed, speedPercent)
    : null

  // Paste: "405 / 150 / 104" oder "405/150/104" oder "405 150 104" → x y z
  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[\s/,]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length >= 3 && parts.every(p => !isNaN(parseInt(p)))) {
      e.preventDefault()
      setTx(parts[0])
      setTy(parts[1])
      setTz(parts[2])
    }
  }

  const handleSave = async () => {
    if (saving || !coordsValid || isSamePos) return
    setSaving(true)
    const arriveAt = calcArriveAt(distance, baseSpeed, speedPercent)
    const { error } = await supabase.from('fleets').update({
      target_x: txN, target_y: tyN, target_z: tzN,
      mission: 'move', is_in_transit: true,
      arrive_at: arriveAt?.toISOString() ?? null,
    }).eq('id', fleet.id)
    setSaving(false)
    if (!error) {
      queryClient.invalidateQueries(['fleets'])
      if (onSaved) onSaved()
    }
  }

  const inputStyle = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#e2e8f0',
    outline: 'none',
    width: '52px',
    borderRadius: '4px',
    padding: '2px 4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    textAlign: 'center',
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1" onPaste={handlePaste}>
        <input value={tx} onChange={e => setTx(e.target.value)} style={inputStyle} placeholder="X" />
        <span className="text-slate-700 text-xs">/</span>
        <input value={ty} onChange={e => setTy(e.target.value)} style={inputStyle} placeholder="Y" />
        <span className="text-slate-700 text-xs">/</span>
        <input value={tz} onChange={e => setTz(e.target.value)} style={inputStyle} placeholder="Z" />
        <button
          onClick={handleSave}
          disabled={saving || !coordsValid || isSamePos}
          className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all ml-1"
          style={{
            background: coordsValid && !isSamePos ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${coordsValid && !isSamePos ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.06)'}`,
            color: coordsValid && !isSamePos ? '#22d3ee' : '#334155',
            cursor: coordsValid && !isSamePos ? 'pointer' : 'default',
          }}>
          {saving ? '…' : '→'}
        </button>
      </div>
      {etaLabel && (
        <p className="text-xs font-mono" style={{ color: '#475569' }}>
          {distance.toFixed(1)} pc · {etaLabel}
        </p>
      )}
      {isSamePos && (
        <p className="text-xs font-mono" style={{ color: '#f87171' }}>Gleiche Position</p>
      )}
    </div>
  )
}

// ─── Flight Mode Modal ────────────────────────────────────────────────────────

const FLIGHT_MODE_OPTIONS = [
  {
    id: 'neutral',
    label: 'Neutral',
    color: '#64748b',
    desc: 'Löst keine Kämpfe aus. Andere Flotten mit aggressiven Parametern können trotzdem angreifen.',
  },
  {
    id: 'enemy',
    label: 'Feindlich',
    color: '#f87171',
    desc: 'Greift Allianz-Feinde an. Löst Kämpfe aus sobald feindliche Flotten auf gleicher Koordinate sind.',
  },
  {
    id: 'bounty',
    label: 'Kopfgeldjagd',
    color: '#fb923c',
    desc: 'Greift Spieler mit Kopfgeld und NPC-Piratenflotten an.',
  },
  {
    id: 'annihilation',
    label: 'Vernichtung',
    color: '#ef4444',
    desc: 'Kämpft gegen alle außer Verbündeten. Zieht verbündete Flotten auf gleicher Koordinate in den Kampf.',
  },
]

function FlightModeModal({ currentMode, onClose, onSelect }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-3"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-bold text-lg text-slate-200">Flugparameter</h3>
          <button onClick={onClose} style={{ color: '#475569' }}><X size={16} /></button>
        </div>
        <p className="text-xs font-mono text-slate-600 pb-1">
          Bestimmt ob und gegen wen deine Flotte Kämpfe auslöst.
        </p>
        {FLIGHT_MODE_OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => onSelect(opt.id)}
            className="w-full text-left px-3 py-3 rounded-lg transition-all"
            style={{
              background: currentMode === opt.id ? `${opt.color}12` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${currentMode === opt.id ? opt.color + '50' : 'rgba(255,255,255,0.07)'}`,
            }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: currentMode === opt.id ? opt.color : '#334155' }} />
              <span className="text-sm font-mono font-semibold" style={{ color: currentMode === opt.id ? opt.color : '#94a3b8' }}>
                {opt.label}
              </span>
              {currentMode === opt.id && (
                <span className="ml-auto text-xs font-mono" style={{ color: opt.color }}>Aktiv</span>
              )}
            </div>
            <p className="text-xs font-mono pl-4" style={{ color: '#475569' }}>{opt.desc}</p>
          </button>
        ))}
      </motion.div>
    </motion.div>
  )
}

// ─── Fleet Detail View ────────────────────────────────────────────────────────

function FleetDetail({ fleet, ships, allShips, chassisDefs, playerId, planet, onBack, onDissolved }) {
  const hpPct = fleetHpPct(ships)
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
  const { current: cargoUsed, max: cargoMax } = fleetCargo(fleet, ships)
  const flightMode = FLIGHT_MODE_LABELS[fleet.flight_mode] ?? FLIGHT_MODE_LABELS.neutral
  const speed = fleetSpeed(ships)
  const cargoEntries = Object.entries(fleet.cargo ?? {}).filter(([, v]) => v > 0)

  // Flotte gilt als "im Flug" nur wenn arrive_at in der Zukunft liegt
  const isTransit = fleet.is_in_transit &&
    fleet.arrive_at && new Date(fleet.arrive_at) > new Date()

  const mission = isTransit
    ? MISSION_LABELS.move
    : MISSION_LABELS[fleet.mission] ?? MISSION_LABELS.idle

  const [showSetTarget, setShowSetTarget] = useState(false)
  const [showDissolve, setShowDissolve] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showFlightMode, setShowFlightMode] = useState(false)
  const [quickTarget, setQuickTarget] = useState(null)
  const [selectedShip, setSelectedShip] = useState(null)
  const queryClient = useQueryClient()

  const handleTargetSaved = () => {
    setShowSetTarget(false)
    setQuickTarget(null)
    queryClient.invalidateQueries(['fleets'])
  }

  const handleQuickTarget = (x, y, z) => {
    setQuickTarget({ x, y, z })
    setShowSetTarget(true)
  }

  const handleFlightModeChange = async (mode) => {
    await supabase.from('fleets').update({ flight_mode: mode }).eq('id', fleet.id)
    queryClient.invalidateQueries(['fleets'])
    setShowFlightMode(false)
  }

  const handleRetreatChange = async (shipId, value) => {
    await supabase.from('ships').update({ auto_retreat_at: value }).eq('id', shipId)
    queryClient.invalidateQueries(['all-ships'])
  }

  const handleBulkRetreat = async (value) => {
    const ids = ships.map(s => s.id)
    await supabase.from('ships').update({ auto_retreat_at: value }).in('id', ids)
    queryClient.invalidateQueries(['all-ships'])
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm font-mono transition-colors"
        style={{ color: '#475569' }}>
        <ChevronLeft size={14} />
        Zurück zur Übersicht
      </button>

      {/* Fleet Header */}
      <div className="panel p-5">
        {/* Name + Status-Badges */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide truncate">
              {fleet.name ?? 'Unbenannte Flotte'}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: `${mission.color}15`, border: `1px solid ${mission.color}30`, color: mission.color }}>
                {mission.label}
              </span>
              <button
                onClick={() => !isTransit && setShowFlightMode(true)}
                className="text-xs font-mono px-2 py-0.5 rounded transition-all"
                style={{
                  background: `${flightMode.color}15`,
                  border: `1px solid ${flightMode.color}${isTransit ? '30' : '50'}`,
                  color: flightMode.color,
                  cursor: isTransit ? 'default' : 'pointer',
                }}
                title={isTransit ? 'Im Flug — nicht änderbar' : 'Flugparameter ändern'}>
                {flightMode.label} {!isTransit && '▾'}
              </button>
              {isTransit && fleet.arrive_at && (
                <span className="text-xs font-mono flex items-center gap-1" style={{ color: '#22d3ee' }}>
                  <Clock size={10} />
                  ETA: {etaString(fleet.arrive_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          {/* Position */}
          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Position</p>
            <p className="text-sm font-mono text-slate-300">{coords(fleet.x, fleet.y, fleet.z)}</p>
          </div>

          {/* Ziel — inline Eingabe */}
          <div className="rounded-lg p-3 col-span-1"
            style={{
              background: isTransit ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isTransit ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Ziel</p>
            {isTransit ? (
              <p className="text-sm font-mono" style={{ color: '#22d3ee' }}>
                {coords(fleet.target_x, fleet.target_y, fleet.target_z)}
              </p>
            ) : (
              <InlineTargetInput
                fleet={fleet}
                ships={ships}
                initialTarget={quickTarget}
                onSaved={handleTargetSaved}
              />
            )}
          </div>

          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Geschwindigkeit</p>
            <p className="text-sm font-mono font-semibold" style={{ color: '#fbbf24' }}>
              {fmt(speed)} <span className="text-xs text-slate-600">({fleet.speed_percent}%)</span>
            </p>
          </div>

          <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-mono text-slate-600 mb-1">Hüllenstatus</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-mono font-semibold" style={{ color: hpColor }}>{hpPct}%</p>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${hpPct}%`, background: hpColor }} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons — unter den Statskästen */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button onClick={() => setShowBookmarks(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)',
              color: '#fbbf24',
            }}>
            <Bookmark size={11} />
            Bookmarks
          </button>

          {!isTransit && (
            <button onClick={() => setShowDissolve(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171',
              }}>
              <Trash2 size={11} />
              Auflösen
            </button>
          )}

          {isTransit && (
            <div className="px-3 py-1.5 rounded"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <p className="text-xs font-mono" style={{ color: '#fbbf24' }}>Im Flug · keine Befehle möglich</p>
            </div>
          )}
        </div>
      </div>

      {/* Schiffe in der Flotte */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
            Schiffe ({ships.length})
          </p>
          {ships.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-600">Alle fliehen bei:</span>
              <select
                onChange={e => handleBulkRetreat(parseInt(e.target.value))}
                defaultValue=""
                className="text-xs font-mono rounded px-1.5 py-1"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#64748b', outline: 'none',
                }}>
                <option value="" disabled>Setzen…</option>
                <option value={0}>Nie</option>
                {[10,20,30,40,50,60,70,80,90,100].map(v => (
                  <option key={v} value={v}>{v}%</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {ships.length === 0 ? (
          <p className="text-sm font-mono text-slate-700">Keine Schiffe in dieser Flotte. Weise Schiffe auf der Schiffe-Seite zu.</p>
        ) : (
          <>{/* Spalten-Header */}
          <div className="flex items-center gap-3 px-3 pb-1 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-8 flex-shrink-0" />
            <div className="w-36 flex-shrink-0">
              <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Name / Chassis</span>
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
          <div className="space-y-2">
            {ships.map(ship => {
              const chassis = chassisDefs.find(ch => ch.id === ship.ship_designs?.chassis_id)
              const hpPct = ship.max_hp > 0 ? Math.round((ship.current_hp / ship.max_hp) * 100) : 0
              const hpCol = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
              const imgSrc = chassis?.image_key ? `/Starbound-Alpha/ships/${chassis.image_key}.png` : null
              const pos = fleet.x != null ? `${fleet.x}/${fleet.y}/${fleet.z}` : '—'
              return (
                <div key={ship.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* Icon */}
                  <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded"
                    style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.1)' }}>
                    {imgSrc
                      ? <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-0.5" />
                      : <span className="text-slate-600 text-sm">🚀</span>}
                  </div>
                  {/* Name / Chassis */}
                  <div className="w-36 flex-shrink-0">
                    <p className="font-mono text-sm font-semibold text-slate-200 truncate">
                      {ship.name ?? ship.ship_designs?.name ?? '—'}
                    </p>
                    <p className="text-xs font-mono text-slate-600 truncate">{chassis?.name ?? '—'}</p>
                  </div>
                  {/* Position */}
                  <div className="w-32 flex-shrink-0 text-center">
                    <p className="text-xs font-mono text-slate-400">{pos}</p>
                  </div>
                  {/* HP */}
                  <div className="w-28 flex-shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-slate-600">HP</span>
                      <span className="text-xs font-mono font-semibold" style={{ color: hpCol }}>
                        {fmt(ship.current_hp)} / {fmt(ship.max_hp)}
                      </span>
                    </div>
                    <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-1 rounded-full" style={{ width: `${hpPct}%`, background: hpCol }} />
                    </div>
                  </div>
                  {/* Angriff */}
                  <div className="w-20 flex-shrink-0 text-center">
                    <p className="text-xs font-mono font-semibold" style={{ color: '#f87171' }}>
                      {fmt(ship.ship_designs?.total_attack ?? 0)}
                    </p>
                  </div>
                  {/* Geschw. */}
                  <div className="w-20 flex-shrink-0 text-center">
                    <p className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>
                      {fmt(ship.ship_designs?.total_speed ?? 0)}
                    </p>
                  </div>
                  {/* Laderaum */}
                  <div className="w-20 flex-shrink-0 text-center">
                    <p className="text-xs font-mono text-slate-300">
                      {fmt(ship.ship_designs?.total_cargo ?? 0)}
                    </p>
                  </div>
                  {/* Flucht + Detail */}
                  <div className="ml-auto flex-shrink-0 flex items-center gap-1.5">
                    <select
                      value={ship.auto_retreat_at ?? 0}
                      onChange={e => handleRetreatChange(ship.id, parseInt(e.target.value))}
                      className="text-xs font-mono rounded px-1.5 py-1"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: (ship.auto_retreat_at ?? 0) > 0 ? '#fbbf24' : '#334155',
                        outline: 'none',
                      }}>
                      <option value={0}>Nie</option>
                      {[10,20,30,40,50,60,70,80,90,100].map(v => (
                        <option key={v} value={v}>{v}%</option>
                      ))}
                    </select>
                    <button onClick={() => setSelectedShip(ship)}
                      className="p-1.5 rounded-full transition-all hover:bg-white/5"
                      style={{ border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}
                      title="Details">
                      <Info size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      {/* Schiffe ohne Flotte auf gleicher Position */}
      {(() => {
        const nearby = allShips.filter(s =>
          !s.fleet_id &&
          s.x === fleet.x && s.y === fleet.y && s.z === fleet.z
        )
        if (!nearby.length) return null
        return (
          <div className="panel p-5">
            <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">
              Auf dieser Position — ohne Flotte ({nearby.length})
            </p>
            <div className="space-y-2">
              {nearby.map(ship => {
                const chassis = chassisDefs.find(c => c.id === ship.ship_designs?.chassis_id)
                const imgSrc = chassis?.image_key ? `/Starbound-Alpha/ships/${chassis.image_key}.png` : null
                const hpPct = ship.max_hp > 0 ? Math.round((ship.current_hp / ship.max_hp) * 100) : 0
                const hpCol = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
                return (
                  <div key={ship.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded"
                      style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.08)' }}>
                      {imgSrc
                        ? <img src={imgSrc} alt={chassis?.name} className="w-full h-full object-contain p-0.5" />
                        : <span className="text-slate-600 text-sm">🚀</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-slate-400 truncate">{ship.name ?? ship.ship_designs?.name ?? '—'}</p>
                      <p className="text-xs font-mono text-slate-700">{chassis?.name ?? '—'}</p>
                    </div>
                    <span className="text-xs font-mono" style={{ color: hpCol }}>{hpPct}% HP</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Ladung */}
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Ladung</p>
          <span className="text-xs font-mono" style={{ color: cargoUsed > cargoMax ? '#f87171' : '#64748b' }}>
            {fmt(cargoUsed)} / {fmt(cargoMax)}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1.5 rounded-full transition-all"
            style={{
              width: cargoMax > 0 ? `${Math.min((cargoUsed / cargoMax) * 100, 100)}%` : '0%',
              background: cargoUsed > cargoMax ? '#f87171' : '#34d399',
            }} />
        </div>
        {cargoEntries.length === 0 ? (
          <p className="text-sm font-mono text-slate-700">Laderaum leer.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {cargoEntries.map(([res, amount]) => (
              <div key={res} className="flex items-center justify-between px-2 py-1.5 rounded"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-xs font-mono text-slate-400 capitalize">{res}</span>
                <span className="text-xs font-mono text-slate-200">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs font-mono text-slate-700 mt-3">⚙ Ladung aufnehmen / abwerfen — WIP</p>
      </div>

      {/* Scan-Bereich */}
      <FleetScanArea fleet={fleet} ships={ships} onSetTarget={!isTransit ? handleQuickTarget : null} />

      {/* Modals */}
      <AnimatePresence>
        {showFlightMode && (
          <FlightModeModal
            currentMode={fleet.flight_mode}
            onClose={() => setShowFlightMode(false)}
            onSelect={handleFlightModeChange}
          />
        )}
        {showSetTarget && (
          <SetTargetModal
            fleet={fleet}
            fleetShips={ships}
            playerId={playerId}
            initialTarget={quickTarget}
            onClose={() => { setShowSetTarget(false); setQuickTarget(null) }}
            onSaved={handleTargetSaved}
          />
        )}
        {showDissolve && (
          <DissolveConfirmModal
            fleet={fleet}
            onClose={() => setShowDissolve(false)}
            onDissolved={onDissolved}
          />
        )}
        {showBookmarks && (
          <BookmarkModal
            playerId={playerId}
            onClose={() => setShowBookmarks(false)}
            onSelect={(bm) => {
              setQuickTarget({ x: bm.x, y: bm.y, z: bm.z })
              setShowBookmarks(false)
            }}
          />
        )}
        {selectedShip && (
          <FleetShipDetailPopup
            ship={selectedShip}
            chassisDefs={chassisDefs}
            onClose={() => setSelectedShip(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Fleet Row (Übersicht) ────────────────────────────────────────────────────

function FleetRow({ fleet, ships, onClick }) {
  const hpPct = fleetHpPct(ships)
  const hpColor = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#fbbf24' : '#f87171'
  const { current: cargoUsed, max: cargoMax } = fleetCargo(fleet, ships)
  const speed = fleetSpeed(ships)
  const eta = etaString(fleet.arrive_at)

  // Flotte gilt als "im Flug" nur wenn arrive_at in der Zukunft liegt
  const isTransit = fleet.is_in_transit &&
    fleet.arrive_at && new Date(fleet.arrive_at) > new Date()
  const mission = isTransit ? MISSION_LABELS.move : (MISSION_LABELS[fleet.mission] ?? MISSION_LABELS.idle)

  return (
    <motion.div layout
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all"
      style={{
        background: 'rgba(4,13,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      whileHover={{ borderColor: 'rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.03)' }}>

      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
        <Navigation size={15} style={{ color: isTransit ? '#22d3ee' : '#475569' }} />
      </div>

      <div className="w-40 flex-shrink-0">
        <p className="font-mono text-sm font-semibold text-slate-200 truncate">
          {fleet.name ?? 'Unbenannt'}
        </p>
        <span className="text-xs font-mono" style={{ color: mission.color }}>{mission.label}</span>
      </div>

      <div className="w-16 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Schiffe</p>
        <p className="text-sm font-mono font-semibold text-slate-300">{ships.length}</p>
      </div>

      <div className="w-32 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Position</p>
        <p className="text-xs font-mono text-slate-400">{coords(fleet.x, fleet.y, fleet.z)}</p>
      </div>

      <div className="w-32 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Ziel / Status</p>
        <p className="text-xs font-mono" style={{ color: isTransit ? '#22d3ee' : '#475569' }}>
          {isTransit ? coords(fleet.target_x, fleet.target_y, fleet.target_z) : mission.label}
        </p>
      </div>

      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Angriff</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#f87171' }}>
          {fmt(ships.reduce((s, sh) => s + (sh.ship_designs?.total_attack ?? 0), 0))}
        </p>
      </div>

      <div className="w-20 flex-shrink-0 text-center">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Geschw.</p>
        <p className="text-xs font-mono font-semibold" style={{ color: '#fbbf24' }}>{fmt(speed)}</p>
      </div>

      <div className="w-24 flex-shrink-0">
        <p className="text-xs font-mono text-slate-600 mb-0.5">Laderaum</p>
        <p className="text-xs font-mono text-slate-300">{fmt(cargoUsed)} / {fmt(cargoMax)}</p>
      </div>

      <div className="w-24 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-mono text-slate-600">Status</p>
          <p className="text-xs font-mono font-semibold" style={{ color: hpColor }}>{hpPct}%</p>
        </div>
        <div className="w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-1 rounded-full" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      <div className="flex-shrink-0 ml-auto text-right min-w-[60px]">
        {eta ? (
          <span className="text-xs font-mono flex items-center gap-1 justify-end" style={{ color: '#22d3ee' }}>
            <Clock size={10} />{eta}
          </span>
        ) : (
          <span className="text-xs font-mono text-slate-700">—</span>
        )}
      </div>
    </motion.div>
  )
}

// ─── FleetPage ────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const { player, planet } = useGameStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedFleet, setSelectedFleet] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  // ?highlight=<id> von ShipsPage (HashRouter: window.location.hash)
  useEffect(() => {
    // HashRouter nutzt den Hash-Teil der URL
    const hash = window.location.hash // z.B. "#/fleet?highlight=uuid"
    const qIndex = hash.indexOf('?')
    if (qIndex !== -1) {
      const params = new URLSearchParams(hash.slice(qIndex + 1))
      const highlight = params.get('highlight')
      if (highlight) {
        setSelectedFleet(highlight)
        // URL bereinigen ohne Reload
        window.history.replaceState({}, '', window.location.pathname + '#/fleet')
      }
    }
  }, [])

  const { data: fleets = [], isLoading } = useQuery({
    queryKey: ['fleets', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('player_id', player.id)
        .order('created_at')
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: ships = [] } = useQuery({
    queryKey: ['all-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ships')
        .select('*, ship_designs(*)')
        .eq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: chassisDefs = [] } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const getShipsForFleet = (fleetId) => ships.filter(s => s.fleet_id === fleetId)

  const detailFleet = useMemo(() => {
    if (!selectedFleet) return null
    return fleets.find(f => f.id === selectedFleet) ?? null
  }, [selectedFleet, fleets])

  const handleCreated = (newFleet) => {
    queryClient.invalidateQueries(['fleets', player?.id])
    setShowCreate(false)
    setSelectedFleet(newFleet.id)
  }

  const handleDissolved = () => {
    queryClient.invalidateQueries(['fleets', player?.id])
    queryClient.invalidateQueries(['all-ships', player?.id])
    setSelectedFleet(null)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Lade Flotten...
    </div>
  )

  // Detail-Ansicht
  if (detailFleet) {
    return (
      <FleetDetail
        fleet={detailFleet}
        ships={getShipsForFleet(detailFleet.id)}
        allShips={ships}
        chassisDefs={chassisDefs}
        playerId={player?.id}
        planet={planet}
        onBack={() => setSelectedFleet(null)}
        onDissolved={handleDissolved}
      />
    )
  }

  // Übersicht
  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Flotten</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {fleets.length} Flotte{fleets.length !== 1 ? 'n' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-semibold transition-all"
          style={{
            background: 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.25)',
            color: '#22d3ee',
          }}>
          <Plus size={14} />
          Neue Flotte
        </button>
      </div>

      {/* Spalten-Header */}
      {fleets.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-1">
          <div className="w-9 flex-shrink-0" />
          <div className="w-40 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Name</span>
          </div>
          <div className="w-16 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Schiffe</span>
          </div>
          <div className="w-32 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Position</span>
          </div>
          <div className="w-32 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Ziel</span>
          </div>
          <div className="w-20 flex-shrink-0 text-center">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Geschw.</span>
          </div>
          <div className="w-24 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Ladung</span>
          </div>
          <div className="w-24 flex-shrink-0">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">Status</span>
          </div>
          <div className="ml-auto">
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">ETA</span>
          </div>
        </div>
      )}

      {/* Flottenliste */}
      {fleets.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">🚀</p>
          <p className="font-display text-slate-400 text-lg">Keine Flotten vorhanden</p>
          <p className="text-slate-600 font-mono text-sm">
            Erstelle deine erste Flotte und weise ihr Schiffe zu.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="mt-2 px-5 py-2 rounded-lg text-sm font-mono font-semibold transition-all inline-flex items-center gap-2"
            style={{
              background: 'rgba(34,211,238,0.1)',
              border: '1px solid rgba(34,211,238,0.25)',
              color: '#22d3ee',
            }}>
            <Plus size={13} />
            Neue Flotte erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {fleets.map(fleet => (
            <FleetRow
              key={fleet.id}
              fleet={fleet}
              ships={getShipsForFleet(fleet.id)}
              onClick={() => setSelectedFleet(fleet.id)}
            />
          ))}
        </div>
      )}

      {/* Schiffe ohne Flotte */}
      {(() => {
        const unassigned = ships.filter(s => !s.fleet_id)
        if (!unassigned.length) return null
        return (
          <div className="panel p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={12} style={{ color: '#475569' }} />
              <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
                Im Dock — ohne Flotte ({unassigned.length})
              </p>
            </div>
            <p className="text-xs font-mono text-slate-700">
              {unassigned.map(s => s.name ?? s.ship_designs?.name ?? 'Unbenannt').join(', ')}
            </p>
            <p className="text-xs font-mono mt-1.5" style={{ color: '#334155' }}>
              Schiffe auf der Schiffe-Seite einer Flotte zuweisen.
            </p>
          </div>
        )
      })()}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateFleetModal
            onClose={() => setShowCreate(false)}
            onCreate={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
