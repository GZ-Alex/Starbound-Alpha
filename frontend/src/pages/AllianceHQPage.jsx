// src/pages/AllianceHQPage.jsx — v1.1
import { useState, useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2, Package, Wrench, ChevronDown, ChevronUp,
  Clock, Shield, AlertTriangle, Send, Plus, ChevronRight,
  Hammer, Lock, Zap
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COST_KEYS = ['titan','silizium','helium','aluminium','uran','plutonium','wasserstoff','credits']
const COST_LABELS = {
  titan: 'Titan', silizium: 'Silizium', helium: 'Helium',
  aluminium: 'Aluminium', uran: 'Uran', plutonium: 'Plutonium',
  wasserstoff: 'Wasserstoff', credits: 'Credits'
}
const RESOURCES = ['titan','silizium','helium','nahrung','wasser','bauxit','aluminium','uran','plutonium','wasserstoff']

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`
  if (n >= 1000)    return `${(n/1000).toFixed(1)}k`
  return Math.round(n).toLocaleString('de-DE')
}

function fmtTime(minutes) {
  if (minutes < 60)  return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function etaString(dateStr) {
  if (!dateStr) return '—'
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Ankunft'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Modulkosten für Level n (skaliert mit ×1.8 pro Level)
function calcModuleCost(mod, level) {
  const scale = Math.pow(1.8, level)
  const costs = {}
  for (const k of COST_KEYS) {
    const base = mod[`cost_${k}`] ?? 0
    if (base > 0) costs[k] = Math.round(base * scale)
  }
  return costs
}

// Reparaturkosten: 0.05% aller Modul-Kosten pro 1% fehlender HP
function calcRepairCost(alliance, moduleLevels, moduleDefs, hpMissingPct) {
  const totals = {}
  for (const lvl of moduleLevels) {
    if (!lvl.level) continue
    const mod = moduleDefs.find((m) => m.id === lvl.module_id)
    if (!mod) continue
    for (let l = 1; l <= lvl.level; l++) {
      const cost = calcModuleCost(mod, l - 1)
      for (const [k, v] of Object.entries(cost)) {
        totals[k] = (totals[k] ?? 0) + (v ) * 0.0005 * hpMissingPct
      }
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.ceil(v )]))
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ alliance }) {
  const hp    = alliance.hq_hp ?? 100000
  const maxHp = alliance.hq_max_hp ?? 100000
  const pct   = Math.round((hp / maxHp) * 100)
  const hpColor = pct > 60 ? '#4ade80' : pct > 20 ? '#fbbf24' : '#f87171'

  const statusLabel = pct <= 1 ? 'Besiegt' : pct < 50 ? 'Beschädigt' : 'Unbeschadet'
  const statusColor = pct <= 1 ? '#ef4444' : pct < 50 ? '#fbbf24' : '#4ade80'

  const cargoMax  = alliance.hq_cargo_max ?? 200000
  const hqCargo   = alliance.hq_cargo ?? {}
  const cargoUsed = Object.values(hqCargo).reduce((a, b) => a + (b || 0), 0)
  const cargoPct  = cargoMax > 0 ? Math.min(100, Math.round((cargoUsed / cargoMax) * 100)) : 0
  const cargoColor = cargoPct > 90 ? '#f87171' : cargoPct > 70 ? '#fbbf24' : '#4ade80'

  return (
    <div className="space-y-3">
      {/* Hülle */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs font-mono text-slate-600 mb-1">Status</p>
          <span className="text-sm font-mono font-semibold" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-mono text-slate-600 mb-1">
            Hülle: <span style={{ color: hpColor }}>{fmt(hp)}</span> / {fmt(maxHp)} ({pct}%)
          </p>
          <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: hpColor }} />
          </div>
        </div>
        {alliance.hq_defeated_until && new Date(alliance.hq_defeated_until) > new Date() && (
          <div className="text-xs font-mono" style={{ color: '#f87171' }}>
            🛡 Schutz: {etaString(alliance.hq_defeated_until)}
          </div>
        )}
      </div>

      {/* Laderaum */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs font-mono text-slate-600 mb-1">Laderaum</p>
          <span className="text-sm font-mono font-semibold" style={{ color: cargoColor }}>
            {cargoPct}%
          </span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-mono text-slate-600 mb-1">
            <span style={{ color: cargoColor }}>{fmt(cargoUsed)}</span> / {fmt(cargoMax)} ({cargoPct}%)
          </p>
          <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-2 rounded-full transition-all" style={{ width: `${cargoPct}%`, background: cargoColor }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modul-Bilder & Bonus-Texte ───────────────────────────────────────────────

const MODULE_IMAGES = {
  herz:             '/Starbound-Alpha/hq-modules/herz.png',
  flottenkommando:  '/Starbound-Alpha/hq-modules/flottenkommando.png',
  planetenkommando: '/Starbound-Alpha/hq-modules/planetenkommando.png',
  logistikzentrum:  '/Starbound-Alpha/hq-modules/logistik.png',
  arbeitergilde:    '/Starbound-Alpha/hq-modules/arbeitergilde.png',
  haendlergilde:    '/Starbound-Alpha/hq-modules/händlergilde.png',
  kulturzentrum:    '/Starbound-Alpha/hq-modules/kultur.png',
  mechanik:         '/Starbound-Alpha/hq-modules/mechanik.png',
}

const BONUS_LABELS = {
  member_limit_bonus:      'Mitgliedslimit',
  shipyard_capacity_bonus: 'Werftkapazität',
  ship_stat_bonus:         'Schiffsstats',
  defense_capacity_bonus:  'Verteidigungskapazität',
  defense_stat_bonus:      'Verteidigungsstats',
  bunker_capacity_bonus:   'Bunkerkapazität',
  ship_cost_bonus:         'Schiffsbaukosten',
  production_bonus:        'Ressourcenproduktion',
  build_time_bonus:        'Bauzeit',
  tax_bonus:               'Credits/h',
  trade_price_bonus:       'Handelspreise',
  research_chance_bonus:   'Forschungschance',
  researcher_cost_bonus:   'Forscherkosten',
  hq_repair_bonus:         'HQ-Reparaturgeschwindigkeit',
}

function formatBonus(key, valuePerLevel, level) {
  if (!key) return null
  const label = BONUS_LABELS[key] ?? key
  if (key === 'member_limit_bonus') return `+${valuePerLevel * level} ${label}`
  const pct = (valuePerLevel * level * 100).toFixed(1)
  const sign = valuePerLevel >= 0 ? '+' : ''
  return `${sign}${pct}% ${label}`
}

// ─── Modul Karte ──────────────────────────────────────────────────────────────

function ModuleCard({ mod, currentLevel, buildQueue, alliance, planet, hqCargo, membership, onBuild, busy }) {
  const nextLevel = currentLevel + 1
  const costs = calcModuleCost(mod, currentLevel)
  const buildMinutes = Math.round(mod.build_minutes * Math.pow(1.6, currentLevel))

  const inQueue = buildQueue?.some((q) => q.module_id === mod.id)
  const isTransit = alliance.hq_in_transit
  const canBuild = !inQueue && !isTransit && membership?.rank !== 'member' && membership?.rank !== 'konziliar'

  const canAfford = COST_KEYS.every(k => {
    const needed = costs[k] ?? 0
    if (!needed) return true
    if (k === 'credits') return (alliance.credits_treasury ?? 0) >= needed
    return ((hqCargo?.[k] ?? 0) >= needed)
  })

  const hpPct = (alliance.hq_hp ?? 0) / (alliance.hq_max_hp ?? 100000)
  const isIllegalToBuild = hpPct < 0.5 && mod.id !== 'mechanik'
  const image = MODULE_IMAGES[mod.id]
  const currentBonus  = formatBonus(mod.bonus_key,   mod.bonus_per_level,   currentLevel)
  const currentBonus2 = formatBonus(mod.bonus_key_2, mod.bonus_per_level_2, currentLevel)
  const nextBonus     = formatBonus(mod.bonus_key,   mod.bonus_per_level,   nextLevel)
  const nextBonus2    = formatBonus(mod.bonus_key_2, mod.bonus_per_level_2, nextLevel)

  return (
    <motion.div layout className="panel overflow-hidden flex flex-col"
      whileHover={{ borderColor: 'rgba(34,211,238,0.3)' }}>

      {/* Bild */}
      {image && (
        <div className="relative overflow-hidden flex-shrink-0" style={{ height: 300 }}>
          <img src={image} alt={mod.name} className="w-full h-full object-cover"
            style={{ filter: currentLevel === 0 ? 'grayscale(60%) brightness(0.55)' : 'brightness(0.85)' }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 45%, rgba(4,13,26,0.97) 100%)' }} />

          {/* Level Badge */}
          {currentLevel > 0 ? (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-sm font-mono font-bold"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee' }}>
              Lvl {currentLevel}
            </div>
          ) : (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-sm font-mono"
              style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              Nicht gebaut
            </div>
          )}

          {/* Im Bau Badge */}
          {inQueue && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-sm font-mono text-amber-400"
              style={{ background: 'rgba(0,0,0,0.7)' }}>
              <Hammer size={12} className="animate-pulse" /> Im Bau
            </div>
          )}
        </div>
      )}

      {/* Name + Level — feste Höhe */}
      <div className="panel-header flex-shrink-0 flex items-center justify-between" style={{ minHeight: 44 }}>
        <span className="text-sm font-semibold">{mod.name}</span>
        <span className="text-xs font-mono text-slate-500 flex-shrink-0 ml-2">
          {currentLevel > 0 ? `Level ${currentLevel}` : ''}
        </span>
      </div>

      <div className="p-3 flex flex-col flex-1">
        {/* Flavor — feste Mindesthöhe */}
        <div style={{ minHeight: 38 }}>
          <p className="text-xs font-mono text-slate-600 italic leading-relaxed">„{mod.flavor}"</p>
        </div>

        {/* Aktiver Bonus — feste Mindesthöhe */}
        <div style={{ minHeight: 68 }} className="mt-2">
          {currentLevel > 0 && currentBonus && (
            <div className="px-2 py-2 rounded space-y-1"
              style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.12)' }}>
              <p className="text-slate-600 uppercase tracking-widest" style={{ fontSize: 9 }}>Aktiver Bonus</p>
              <p className="text-sm font-mono font-semibold" style={{ color: '#22d3ee' }}>{currentBonus}</p>
              {currentBonus2 && (
                <p className="text-sm font-mono font-semibold" style={{ color: '#22d3ee' }}>{currentBonus2}</p>
              )}
            </div>
          )}
        </div>

        {/* Nächstes Level — feste Mindesthöhe */}
        <div style={{ minHeight: 56 }} className="mt-2">
          {nextBonus && (
            <div className="space-y-0.5">
              <p className="text-xs font-mono text-slate-600">→ Lvl {nextLevel}</p>
              <p className="text-xs font-mono" style={{ color: '#06b6d4' }}>{nextBonus}</p>
              {nextBonus2 && (
                <p className="text-xs font-mono" style={{ color: '#06b6d4' }}>{nextBonus2}</p>
              )}
            </div>
          )}
        </div>

        {/* Bauzeit — feste Höhe */}
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 mt-2" style={{ height: 22 }}>
          <Clock size={11} />{fmtTime(buildMinutes)}
        </div>

        {/* Kosten — feste Spaltenbreiten mit tabular-nums */}
        <div className="rounded overflow-hidden text-xs mt-2" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid font-mono px-2 py-1 text-slate-600"
            style={{ gridTemplateColumns: '88px 52px 60px', background: 'rgba(0,0,0,0.3)' }}>
            <span>Ressource</span>
            <span className="text-right">Kost.</span>
            <span className="text-right">HQ</span>
          </div>
          {COST_KEYS.map(k => {
            const amt = costs[k] ?? 0
            if (!amt) return null
            const available = k === 'credits'
              ? (alliance.credits_treasury ?? 0)
              : (hqCargo?.[k] ?? 0)
            const ok = available >= amt
            return (
              <div key={k} className="grid font-mono px-2 py-0.5"
                style={{ gridTemplateColumns: '88px 52px 60px', background: 'rgba(4,13,26,0.5)', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <span className="text-slate-400">{COST_LABELS[k]}</span>
                <span className="text-right text-slate-300 tabular-nums">{fmt(amt)}</span>
                <span className={`text-right font-bold tabular-nums ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                  {ok ? fmt(available - amt) : `−${fmt(amt - available)}`}
                </span>
              </div>
            )
          })}
        </div>

        {/* Button */}
        <div className="mt-auto pt-1">
          {isIllegalToBuild ? (
            <div className="text-xs text-center py-2 rounded font-mono"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
              HQ unter 50% HP
            </div>
          ) : inQueue ? (
            <div className="text-xs text-center py-2 rounded text-amber-500/70 font-mono"
              style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
              🔨 Im Bau
            </div>
          ) : (
            <button onClick={() => onBuild(mod, nextLevel, costs, buildMinutes)}
              disabled={!canBuild || !canAfford || busy || isTransit}
              className="w-full py-2 rounded text-sm font-mono flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: canBuild && canAfford && !isTransit ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${canBuild && canAfford && !isTransit ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: canBuild && canAfford && !isTransit ? '#22d3ee' : '#334155',
              }}>
              {isTransit ? '🚀 HQ unterwegs'
                : !canBuild ? <><Lock size={12} /> Keine Berechtigung</>
                : !canAfford ? '✗ Ressourcen fehlen'
                : <><ChevronRight size={13} /> Lvl {nextLevel} ausbauen</>}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Cargo Panel ──────────────────────────────────────────────────────────────

function CargoPanel({ alliance, planet, membership, queryClient, player }) {
  const [transferAmts, setTransferAmts] = useState({})
  const [busy, setBusy] = useState(false)

  const hqCargo = alliance.hq_cargo ?? {}
  const cargoUsed = Object.values(hqCargo).reduce((a, b) => a + (b ), 0)
  const cargoMax = alliance.hq_cargo_max ?? 100000
  const canUnload = membership?.rank === 'founder' || membership?.can_unload_hq

  // Prüfe ob Spielerflotte auf gleicher Position
  const { data: fleets = [] } = useQuery({
    queryKey: ['hq-pos-fleets', player?.id, alliance.hq_x],
    queryFn: async () => {
      if (!alliance.hq_x) return []
      const { data } = await supabase
        .from('fleets')
        .select('id, name, cargo')
        .eq('player_id', player.id)
        .eq('x', alliance.hq_x).eq('y', alliance.hq_y).eq('z', alliance.hq_z)
        .eq('is_in_transit', false)
      return data ?? []
    },
    enabled: !!player && !!alliance.hq_x,
  })

  const handleUpload = async (fleetId, fleetCargo) => {
    if (busy) return
    const amounts = {}
    for (const [k, v] of Object.entries(transferAmts)) {
      const amt = parseInt(v)
      if (amt > 0 && (fleetCargo[k] ?? 0) >= amt) amounts[k] = amt
    }
    if (!Object.keys(amounts).length) return
    setBusy(true)

    // Prüfe ob Laderaum reicht
    const totalTransfer = Object.values(amounts).reduce((a, b) => a + b, 0)
    if (cargoUsed + totalTransfer > cargoMax) {
      setBusy(false)
      return
    }

    // Von Flotte auf HQ
    const newFleetCargo = { ...fleetCargo }
    const newHqCargo = { ...hqCargo }
    for (const [k, v] of Object.entries(amounts)) {
      newFleetCargo[k] = (newFleetCargo[k] ?? 0) - v
      newHqCargo[k] = (newHqCargo[k] ?? 0) + v
    }

    await supabase.from('fleets').update({ cargo: newFleetCargo }).eq('id', fleetId)
    await supabase.from('alliances').update({ hq_cargo: newHqCargo }).eq('id', alliance.id)
    queryClient.invalidateQueries(['my-alliance'])
    queryClient.invalidateQueries(['fleets'])
    setTransferAmts({})
    setBusy(false)
  }

  const handleDownload = async (fleetId, fleetCargo) => {
    if (busy || !canUnload) return
    const amounts = {}
    for (const [k, v] of Object.entries(transferAmts)) {
      const amt = parseInt(v)
      if (amt > 0 && (hqCargo[k] ?? 0) >= amt) amounts[k] = amt
    }
    if (!Object.keys(amounts).length) return
    setBusy(true)

    const newFleetCargo = { ...fleetCargo }
    const newHqCargo = { ...hqCargo }
    for (const [k, v] of Object.entries(amounts)) {
      newFleetCargo[k] = (newFleetCargo[k] ?? 0) + v
      newHqCargo[k] = Math.max(0, (newHqCargo[k] ?? 0) - v)
    }

    await supabase.from('fleets').update({ cargo: newFleetCargo }).eq('id', fleetId)
    await supabase.from('alliances').update({ hq_cargo: newHqCargo }).eq('id', alliance.id)
    queryClient.invalidateQueries(['my-alliance'])
    queryClient.invalidateQueries(['fleets'])
    setTransferAmts({})
    setBusy(false)
  }

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Laderaum HQ</p>
        <p className="text-sm font-mono text-slate-400">
          <span className="text-cyan-400 font-semibold">{fmt(cargoUsed)}</span> / {fmt(cargoMax)}
        </p>
      </div>

      {/* Bestand */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {RESOURCES.map(res => {
          const amt = hqCargo[res] ?? 0
          if (!amt && !alliance.hq_founded) return null
          return (
            <div key={res} className="flex items-center justify-between px-2 py-1.5 rounded"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-xs font-mono text-slate-400 capitalize">{res}</span>
              <span className="text-xs font-mono font-semibold text-slate-200">{fmt(amt)}</span>
            </div>
          )
        })}
      </div>

      {/* Transfer — nur wenn Flotte auf gleicher Position */}
      {fleets.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
          <p className="text-xs font-mono text-slate-500 mb-3">Transfer mit Flotte</p>
          {fleets.map((fleet) => (
            <div key={fleet.id} className="space-y-2">
              <p className="text-xs font-mono text-slate-400">{fleet.name}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {RESOURCES.map(res => {
                  const fleetAmt = fleet.cargo?.[res] ?? 0
                  const hqAmt   = hqCargo[res] ?? 0
                  if (!fleetAmt && !hqAmt) return null
                  return (
                    <div key={res} className="space-y-1">
                      <p className="text-xs font-mono text-slate-600 capitalize">{res}</p>
                      <p className="text-xs font-mono text-slate-500">
                        Flotte: {fmt(fleetAmt)} · HQ: {fmt(hqAmt)}
                      </p>
                      <input
                        type="number" placeholder="Menge"
                        value={transferAmts[res] ?? ''}
                        onChange={e => setTransferAmts(p => ({ ...p, [res]: e.target.value }))}
                        className="w-full px-2 py-1 rounded text-xs font-mono"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleUpload(fleet.id, fleet.cargo ?? {})} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
                  <Send size={10} /> → HQ einlagern
                </button>
                {canUnload && (
                  <button onClick={() => handleDownload(fleet.id, fleet.cargo ?? {})} disabled={busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                    <Send size={10} style={{ transform: 'scaleX(-1)' }} /> ← HQ ausladen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!alliance.hq_x && (
        <p className="text-xs font-mono text-slate-700 text-center py-2">
          HQ noch nicht gegründet — kein Laderaum verfügbar.
        </p>
      )}
    </div>
  )
}

// ─── Move HQ Modal ────────────────────────────────────────────────────────────

function MoveHQModal({ alliance, player, onClose, queryClient }) {
  const [tx, setTx] = useState('')
  const [ty, setTy] = useState('')
  const [tz, setTz] = useState('')
  const [busy, setBusy] = useState(false)

  const canMove = !alliance.hq_in_transit && (
    !alliance.hq_last_moved ||
    Date.now() - new Date(alliance.hq_last_moved).getTime() > 7 * 24 * 3600 * 1000
  )

  const handleMove = async () => {
    if (!canMove || busy || !tx || !ty || !tz) return
    setBusy(true)
    const arrivesAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString()
    await supabase.from('alliances').update({
      hq_in_transit: true,
      hq_arrives_at: arrivesAt,
      hq_target_x: parseInt(tx), hq_target_y: parseInt(ty), hq_target_z: parseInt(tz),
    }).eq('id', alliance.id)
    queryClient.invalidateQueries(['my-alliance'])
    setBusy(false)
    onClose()
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text')
    const parts = text.split(/[\s/,]+/).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 3 && parts.every((p) => !isNaN(parseInt(p)))) {
      e.preventDefault()
      setTx(parts[0]); setTy(parts[1]); setTz(parts[2])
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl p-6 space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(4,13,26,0.99) 0%, rgba(2,8,20,0.99) 100%)',
          border: '1px solid rgba(34,211,238,0.15)',
        }}>
        <h3 className="font-display font-bold text-lg text-slate-100">HQ verschieben</h3>
        <p className="text-xs font-mono text-slate-500">
          Reisezeit: 12 Stunden. Während der Reise sind alle Boni deaktiviert.<br />
          Einmal wöchentlich möglich.
        </p>

        {!canMove && (
          <div className="px-3 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
            {alliance.hq_in_transit ? 'HQ ist bereits unterwegs.' : 'Erst wieder in einer Woche möglich.'}
          </div>
        )}

        <div className="flex items-center gap-1" onPaste={handlePaste}>
          {[
            { v: tx, s: setTx, p: 'X' },
            { v: ty, s: setTy, p: 'Y' },
            { v: tz, s: setTz, p: 'Z' },
          ].map(({ v, s, p }) => (
            <input key={p} value={v} onChange={e => s(e.target.value)} placeholder={p}
              className="flex-1 px-2 py-1.5 rounded text-sm font-mono text-center"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
          ))}
        </div>
        <p className="text-xs font-mono text-slate-600">Koordinaten einfügen: "X / Y / Z" funktioniert direkt</p>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded text-sm font-mono transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            Abbrechen
          </button>
          <button onClick={handleMove} disabled={busy || !canMove || !tx || !ty || !tz}
            className="flex-1 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
            style={{
              background: canMove ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${canMove ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: canMove ? '#22d3ee' : '#334155',
            }}>
            {busy ? '...' : 'Verschieben'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AllianceHQPage() {
  const { player, planet } = useGameStore()
  const queryClient = useQueryClient()
  const [tab, setTab]         = useState('modules')
  const [showMove, setShowMove] = useState(false)
  const [busy, setBusy]       = useState(false)

  // Alliance laden
  const { data: alliance } = useQuery({
    queryKey: ['my-alliance', player?.alliance_id],
    queryFn: async () => {
      const { data } = await supabase.from('alliances').select('*').eq('id', player.alliance_id).single()
      return data
    },
    enabled: !!player?.alliance_id,
    refetchInterval: 15000,
  })

  const { data: membership } = useQuery({
    queryKey: ['my-membership', player?.alliance_id, player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('alliance_members').select('*')
        .eq('alliance_id', player.alliance_id).eq('player_id', player.id).single()
      return data
    },
    enabled: !!player?.alliance_id,
  })

  const { data: moduleDefs = [] } = useQuery({
    queryKey: ['hq-module-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('hq_modules').select('*').order('sort_order')
      return data ?? []
    },
    staleTime: 300000,
  })

  const { data: moduleLevels = [] } = useQuery({
    queryKey: ['hq-module-levels', player?.alliance_id],
    queryFn: async () => {
      const { data } = await supabase.from('hq_module_levels').select('*')
        .eq('alliance_id', player.alliance_id)
      return data ?? []
    },
    enabled: !!player?.alliance_id,
    refetchInterval: 15000,
  })

  const { data: buildQueue = [] } = useQuery({
    queryKey: ['hq-build-queue', player?.alliance_id],
    queryFn: async () => {
      const { data } = await supabase.from('hq_build_queue').select('*')
        .eq('alliance_id', player.alliance_id)
      return data ?? []
    },
    enabled: !!player?.alliance_id,
    refetchInterval: 10000,
  })

  const levelMap = useMemo(() =>
    Object.fromEntries(moduleLevels.map((l) => [l.module_id, l.level])),
    [moduleLevels]
  )

  const isFounder  = membership?.rank === 'founder'
  const isAdmin    = membership?.rank === 'admin' || isFounder
  const isTransit  = alliance?.hq_in_transit

  // HQ gründen
  const handleFound = async () => {
    if (busy || !planet || !alliance) return
    if ((alliance.credits_treasury ?? 0) < 1000000) return
    setBusy(true)

    await supabase.from('alliances').update({
      hq_founded: true,
      hq_x: planet.x, hq_y: planet.y, hq_z: planet.z,
      credits_treasury: (alliance.credits_treasury ?? 0) - 1000000,
      hq_hp: 100000, hq_max_hp: 100000,
      hq_cargo: {}, hq_cargo_max: 200000,
    }).eq('id', alliance.id)

    queryClient.invalidateQueries(['my-alliance'])
    setBusy(false)
  }

  // Modul bauen
  const handleBuild = async (mod, nextLevel, costs, buildMinutes) => {
    if (busy || !alliance) return
    setBusy(true)

    // Kosten abziehen (credits aus Kasse, Rest aus HQ-Laderaum)
    const newHqCargo = { ...(alliance.hq_cargo ?? {}) }
    const allianceUpdates = {}

    for (const [k, amt] of Object.entries(costs)) {
      if (!amt) continue
      if (k === 'credits') {
        allianceUpdates.credits_treasury = (alliance.credits_treasury ?? 0) - amt
      } else {
        newHqCargo[k] = Math.max(0, (newHqCargo[k] ?? 0) - amt)
      }
    }
    allianceUpdates.hq_cargo = newHqCargo

    await supabase.from('alliances').update(allianceUpdates).eq('id', alliance.id)

    const finishAt = new Date(Date.now() + buildMinutes * 60 * 1000).toISOString()
    await supabase.from('hq_build_queue').insert({
      alliance_id: alliance.id, module_id: mod.id,
      target_level: nextLevel, finish_at: finishAt, started_by: player.id,
    })

    queryClient.invalidateQueries(['my-alliance'])
    queryClient.invalidateQueries(['hq-build-queue'])
    setBusy(false)
  }

  if (!player?.alliance_id) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 space-y-3">
        <Building2 size={40} className="mx-auto text-slate-700" />
        <p className="font-mono text-slate-500">Du bist in keiner Allianz.</p>
      </div>
    )
  }

  if (!alliance) return (
    <div className="flex items-center justify-center h-48 text-slate-500 font-mono text-sm">Lade HQ...</div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="panel p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-display font-bold text-cyan-400">Allianz-HQ</h2>
            <p className="text-sm font-mono text-slate-500 mt-1">[{alliance.tag}] {alliance.name}</p>
          </div>
          {isFounder && alliance.hq_founded && (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMove(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
                <Send size={11} /> Verschieben
              </button>
              {/* Cheat: HQ-Laderaum auf 1Mio füllen */}
              <button onClick={async () => {
                const cheatCargo = {}
                const resources = ['titan','silizium','helium','nahrung','wasser','bauxit','aluminium','uran','plutonium','wasserstoff']
                resources.forEach(r => { cheatCargo[r] = 1000000 })
                await supabase.from('alliances').update({ hq_cargo: cheatCargo }).eq('id', alliance.id)
                queryClient.invalidateQueries(['my-alliance'])
              }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                <Zap size={11} /> Laderaum füllen (Test)
              </button>
            </div>
          )}
        </div>

        {/* Position + Transit */}
        <div className="mt-4 space-y-3">
          {alliance.hq_founded ? (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-mono text-slate-600">Position</p>
                  <p className="text-sm font-mono text-slate-300">
                    {isTransit
                      ? `${alliance.hq_x} / ${alliance.hq_y} / ${alliance.hq_z} → ${alliance.hq_target_x} / ${alliance.hq_target_y} / ${alliance.hq_target_z}`
                      : `${alliance.hq_x} / ${alliance.hq_y} / ${alliance.hq_z}`}
                  </p>
                </div>
                {isTransit && (
                  <span className="flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                    <Clock size={10} /> Unterwegs · ETA {etaString(alliance.hq_arrives_at)}
                  </span>
                )}
              </div>
              <StatusBadge alliance={alliance} />
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-mono text-slate-500">
                Das Allianz-HQ wurde noch nicht gegründet.
              </p>
              {isFounder && (
                <div className="space-y-2">
                  <p className="text-xs font-mono text-slate-600">
                    Gründungskosten: <span className="text-cyan-400 font-semibold">1.000.000 Credits</span> aus der Allianzkasse
                    (Kasse: {fmt(alliance.credits_treasury ?? 0)} Cr)
                  </p>
                  <button onClick={handleFound}
                    disabled={busy || (alliance.credits_treasury ?? 0) < 1000000}
                    className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
                    style={{
                      background: (alliance.credits_treasury ?? 0) >= 1000000 ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${(alliance.credits_treasury ?? 0) >= 1000000 ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      color: (alliance.credits_treasury ?? 0) >= 1000000 ? '#22d3ee' : '#334155',
                    }}>
                    <Building2 size={14} /> HQ gründen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transit-Warning */}
      {isTransit && (
        <div className="px-4 py-3 rounded-lg flex items-center gap-3"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <p className="text-sm font-mono" style={{ color: '#fbbf24' }}>
            HQ ist unterwegs — Boni deaktiviert, kein Ausbau möglich.
          </p>
        </div>
      )}

      {/* Tabs — nur wenn gegründet */}
      {alliance.hq_founded && (
        <>
          <div className="flex gap-1">
            {[
              { id: 'modules', label: 'Module',     icon: Building2 },
              { id: 'cargo',   label: 'Laderaum',   icon: Package   },
              { id: 'repair',  label: 'Mechanik',   icon: Wrench    },
            ].map(t => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{
                    background: tab === t.id ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${tab === t.id ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    color: tab === t.id ? '#22d3ee' : '#475569',
                  }}>
                  <Icon size={11} />{t.label}
                </button>
              )
            })}
          </div>

          {/* Module Tab */}
          {tab === 'modules' && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {moduleDefs.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    mod={mod}
                    currentLevel={levelMap[mod.id] ?? 0}
                    buildQueue={buildQueue}
                    alliance={alliance}
                    planet={planet}
                    hqCargo={alliance.hq_cargo ?? {}}
                    membership={membership}
                    onBuild={handleBuild}
                    busy={busy}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Cargo Tab */}
          {tab === 'cargo' && (
            <CargoPanel
              alliance={alliance}
              planet={planet}
              membership={membership}
              queryClient={queryClient}
              player={player}
            />
          )}

          {/* Repair Tab (Mechanik) */}
          {tab === 'repair' && (
            <RepairPanel
              alliance={alliance}
              moduleLevels={moduleLevels}
              moduleDefs={moduleDefs}
              membership={membership}
              queryClient={queryClient}
              busy={busy}
              setBusy={setBusy}
            />
          )}
        </>
      )}

      {/* Move Modal */}
      <AnimatePresence>
        {showMove && (
          <MoveHQModal
            alliance={alliance}
            player={player}
            onClose={() => setShowMove(false)}
            queryClient={queryClient}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Repair Panel ─────────────────────────────────────────────────────────────

function RepairPanel({ alliance, moduleLevels, moduleDefs, membership, queryClient, busy, setBusy }) {
  const hp    = alliance.hq_hp ?? 100000
  const maxHp = alliance.hq_max_hp ?? 100000
  const hpMissingPct = Math.max(0, ((maxHp - hp) / maxHp) * 100)
  const isFullHp = hp >= maxHp
  const isAdmin = membership?.rank === 'founder' || membership?.rank === 'admin'

  const repairCosts = useMemo(() =>
    calcRepairCost(alliance, moduleLevels, moduleDefs, hpMissingPct),
    [alliance, moduleLevels, moduleDefs, hpMissingPct]
  )

  const repairMinutes = useMemo(() => {
    const totalModuleMinutes = moduleDefs.reduce((sum, mod) => {
      const lvl = moduleLevels.find((l) => l.module_id === mod.id)?.level ?? 0
      return sum + mod.build_minutes * lvl
    }, 0)
    return Math.round(totalModuleMinutes * 0.0005 * hpMissingPct)
  }, [moduleDefs, moduleLevels, hpMissingPct])

  const handleRepair = async () => {
    if (busy || !isAdmin || isFullHp) return
    setBusy(true)

    const newHqCargo = { ...(alliance.hq_cargo ?? {}) }
    for (const [k, amt] of Object.entries(repairCosts)) {
      if (k === 'credits') continue
      newHqCargo[k] = Math.max(0, (newHqCargo[k] ?? 0) - (amt ))
    }
    const creditsDeduction = repairCosts['credits'] ?? 0

    const finishAt = new Date(Date.now() + repairMinutes * 60 * 1000).toISOString()
    await supabase.from('alliances').update({
      hq_cargo: newHqCargo,
      credits_treasury: (alliance.credits_treasury ?? 0) - creditsDeduction,
      hq_status: 'repairing',
      hq_repair_finish_at: finishAt,
    }).eq('id', alliance.id)

    queryClient.invalidateQueries(['my-alliance'])
    setBusy(false)
  }

  return (
    <div className="panel p-5 space-y-4">
      <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Mechanik — HQ Reparatur</p>

      {isFullHp ? (
        <p className="text-sm font-mono text-slate-500 text-center py-4">HQ ist unbeschadet.</p>
      ) : (
        <>
          <p className="text-sm font-mono text-slate-400">
            Fehlende HP: <span style={{ color: '#f87171' }}>{hpMissingPct.toFixed(1)}%</span>
          </p>

          <div>
            <p className="text-xs font-mono text-slate-500 mb-2">Reparaturkosten (aus HQ-Laderaum):</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(repairCosts).map(([k, v]) => (
                <span key={k} className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                  {fmt(v )} {COST_LABELS[k] ?? k}
                </span>
              ))}
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#64748b' }}>
                <Clock size={9} className="inline mr-1" />{fmtTime(repairMinutes)}
              </span>
            </div>
          </div>

          {isAdmin && (
            <button onClick={handleRepair} disabled={busy}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
              style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}>
              <Wrench size={13} /> Reparatur starten
            </button>
          )}
        </>
      )}
    </div>
  )
}
