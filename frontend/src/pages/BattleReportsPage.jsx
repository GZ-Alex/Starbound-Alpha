// src/pages/BattleReportsPage.jsx — v1.1
import { useState, useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, ChevronLeft, ChevronDown, ChevronUp, Shield, Crosshair, Package, Trophy, Skull, Minus } from 'lucide-react'
import BattleAnimation from '@/components/BattleAnimation'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const NPC_LABELS = {
  pirat_leicht:    'Piraten-Patrouille',
  pirat_mittel:    'Piratengruppe',
  piraten_verbund: 'Piraten-Verbund',
  haendler_konvoi: 'Händler-Konvoi',
  npc_streitmacht: 'NPC-Streitmacht',
}

const WINNER_CONFIG = {
  attacker: { label: 'Sieg',        color: '#4ade80', icon: Trophy },
  defender: { label: 'Niederlage',  color: '#f87171', icon: Skull  },
  draw:     { label: 'Unentschieden', color: '#fbbf24', icon: Minus  },
  escaped:  { label: 'Geflohen',    color: '#94a3b8', icon: Minus  },
}

// ─── Kampfstatistik ───────────────────────────────────────────────────────────

function CombatStats({ report }) {
  const [open, setOpen] = useState(false)
  const rounds = report.rounds ?? []
  if (!rounds.length) return null

  // Statistik pro Schiff-ID berechnen
  const shipStats = {}
  for (const round of rounds) {
    for (const a of round.actions ?? []) {
      if (!shipStats[a.attackerId]) {
        shipStats[a.attackerId] = {
          name: a.attackerName ?? a.attackerId,
          shots: 0, hits: 0, misses: 0, damage: 0,
        }
      }
      shipStats[a.attackerId].shots++
      if (a.hit) { shipStats[a.attackerId].hits++; shipStats[a.attackerId].damage += a.damage ?? 0 }
      else shipStats[a.attackerId].misses++
    }
  }

  // Aufteilen in Angreifer (pPositions) und Verteidiger
  const attackerIds = new Set((report.attacker_fleet?.ships ?? []).map(s => s.id))
  const attackerStats = Object.entries(shipStats).filter(([id]) => attackerIds.has(id))
  const defenderStats = Object.entries(shipStats).filter(([id]) => !attackerIds.has(id))

  const StatTable = ({ entries, color }) => (
    <div className="space-y-1">
      <div className="grid text-xs font-mono text-slate-600 px-2 py-1 rounded"
        style={{ gridTemplateColumns: '1fr 36px 36px 36px 60px', background: 'rgba(0,0,0,0.2)' }}>
        <span>Schiff</span>
        <span className="text-center">🎯</span>
        <span className="text-center">✗</span>
        <span className="text-center">/%</span>
        <span className="text-right">Schaden</span>
      </div>
      {entries.map(([id, s]) => {
        const acc = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0
        return (
          <div key={id} className="grid text-xs font-mono px-2 py-1 rounded"
            style={{ gridTemplateColumns: '1fr 36px 36px 36px 60px', background: 'rgba(255,255,255,0.02)' }}>
            <span className="text-slate-300 truncate">{s.name}</span>
            <span className="text-center" style={{ color: '#4ade80' }}>{s.hits}</span>
            <span className="text-center" style={{ color: '#f87171' }}>{s.misses}</span>
            <span className="text-center text-slate-500">{acc}%</span>
            <span className="text-right tabular-nums" style={{ color }}>{fmt(s.damage)}</span>
          </div>
        )
      })}
      {/* Summe */}
      {entries.length > 1 && (() => {
        const tot = entries.reduce((acc, [, s]) => ({
          hits: acc.hits + s.hits, misses: acc.misses + s.misses,
          shots: acc.shots + s.shots, damage: acc.damage + s.damage,
        }), { hits: 0, misses: 0, shots: 0, damage: 0 })
        const acc = tot.shots > 0 ? Math.round((tot.hits / tot.shots) * 100) : 0
        return (
          <div className="grid text-xs font-mono px-2 py-1 rounded border-t"
            style={{ gridTemplateColumns: '1fr 36px 36px 36px 60px', borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="text-slate-500 font-semibold">Gesamt</span>
            <span className="text-center font-semibold" style={{ color: '#4ade80' }}>{tot.hits}</span>
            <span className="text-center font-semibold" style={{ color: '#f87171' }}>{tot.misses}</span>
            <span className="text-center text-slate-400">{acc}%</span>
            <span className="text-right tabular-nums font-semibold" style={{ color }}>{fmt(tot.damage)}</span>
          </div>
        )
      })()}
    </div>
  )

  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-2">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Kampfstatistik
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-mono mb-1.5 flex items-center gap-1.5"
                  style={{ color: '#38bdf8' }}>
                  <span>⚔</span> Angreifer
                </p>
                <StatTable entries={attackerStats} color="#38bdf8" />
              </div>
              <div>
                <p className="text-xs font-mono mb-1.5 flex items-center gap-1.5"
                  style={{ color: '#f87171' }}>
                  <span>🛡</span> Verteidiger
                </p>
                <StatTable entries={defenderStats} color="#f87171" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}



function RoundLog({ rounds }) {
  const [expanded, setExpanded] = useState(null)

  if (!rounds?.length) return (
    <p className="text-xs font-mono text-slate-700">Keine Rundendaten verfügbar.</p>
  )

  return (
    <div className="space-y-1.5">
      {rounds.map(round => (
        <div key={round.round}>
          <button
            onClick={() => setExpanded(expanded === round.round ? null : round.round)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all"
            style={{
              background: expanded === round.round ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${expanded === round.round ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            <span className="text-xs font-mono text-slate-400">
              Runde {round.round}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono" style={{ color: '#4ade80' }}>
                Spieler: {fmt(round.playerHpTotal)} HP
              </span>
              <span className="text-xs font-mono" style={{ color: '#f87171' }}>
                NPC: {fmt(round.npcHpTotal)} HP
              </span>
              <span className="text-xs font-mono text-slate-600">
                {round.actions?.length ?? 0} Aktionen
              </span>
              {expanded === round.round
                ? <ChevronUp size={12} style={{ color: '#475569' }} />
                : <ChevronDown size={12} style={{ color: '#475569' }} />}
            </div>
          </button>

          <AnimatePresence>
            {expanded === round.round && round.actions?.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden">
                <div className="mt-1 space-y-0.5 pl-3">
                  {round.actions.map((action, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs font-mono"
                      style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <span className="text-slate-500 w-4 text-right flex-shrink-0">{i + 1}.</span>
                      <span className="text-slate-300 flex-shrink-0 truncate max-w-[120px]">{action.attackerName}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-slate-300 flex-shrink-0 truncate max-w-[120px]">{action.targetName}</span>
                      {action.hit ? (
                        <>
                          <span style={{ color: '#f87171' }} className="flex-shrink-0">
                            -{fmt(action.damage)} HP
                          </span>
                          {action.destroyed && (
                            <span style={{ color: '#ef4444' }} className="flex-shrink-0">💥 Zerstört</span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: '#475569' }} className="flex-shrink-0">Verfehlt</span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

// ─── Kampfbericht Karte ───────────────────────────────────────────────────────

function BattleCard({ report, isOpen, onToggle, playerName }) {
  const winCfg = WINNER_CONFIG[report.winner] ?? WINNER_CONFIG.draw
  const WinIcon = winCfg.icon
  const res = report.result ?? {}
  const loot = report.loot ?? {}
  const hasLoot = Object.keys(loot).length > 0

  // Angreifer-Namen: eigener Spieler + eventuelle Verbündete
  const attackerNames = (() => {
    const ships = report.attacker_fleet?.ships ?? []
    if (ships.length > 0 && ships[0]?.name) {
      return playerName ?? 'Du'
    }
    return playerName ?? 'Du'
  })()

  // Verteidiger-Namen: NPC-Flottenname oder Spielername
  const defenderNames = (() => {
    const npcType = report.defender_fleet?.npc_type
    if (npcType) return NPC_LABELS[npcType] ?? npcType
    const defName = report.defender_fleet?.player_name ?? report.defender_fleet?.name
    if (defName) return defName
    // Schiffsnamen aus der Flotte
    const ships = report.defender_fleet?.ships ?? []
    if (ships.length > 0) {
      const names = [...new Set(ships.map(s => s.name?.split(' ')[0]).filter(Boolean))]
      return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '')
    }
    return 'Unbekannt'
  })()

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
        style={{ borderBottom: isOpen ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>

        {/* Ergebnis-Icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${winCfg.color}15`, border: `1px solid ${winCfg.color}30` }}>
          <WinIcon size={15} style={{ color: winCfg.color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-semibold" style={{ color: '#22d3ee' }}>
              {attackerNames}
            </span>
            <span className="text-xs font-mono text-slate-600">vs.</span>
            <span className="text-sm font-mono font-semibold text-slate-300">
              {defenderNames}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: `${winCfg.color}15`, color: winCfg.color }}>
              {winCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs font-mono text-slate-600">
              📍 {report.x} / {report.y} / {report.z}
            </span>
            <span className="text-xs font-mono text-slate-600">
              {res.rounds_fought ?? '?'} Runden
            </span>
            <span className="text-xs font-mono text-slate-600">
              {formatDate(report.occurred_at)}
            </span>
          </div>
        </div>

        {/* Loot-Preview */}
        {hasLoot && (
          <div className="flex-shrink-0 flex items-center gap-1" style={{ color: '#34d399' }}>
            <Package size={11} />
            <span className="text-xs font-mono">Loot</span>
          </div>
        )}

        {isOpen
          ? <ChevronUp size={14} style={{ color: '#475569', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: '#475569', flexShrink: 0 }} />}
      </button>

      {/* Detail */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="p-4 space-y-4">

              {/* Zusammenfassung */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: 'Ergebnis',         value: winCfg.label,               color: winCfg.color },
                  { label: 'Gerunden',          value: `${res.rounds_fought ?? '?'} Runden`, color: '#94a3b8' },
                  { label: 'Eigene Überlebende', value: `${res.player_survivors ?? '?'} Schiffe`, color: '#4ade80' },
                  { label: 'NPC Überlebende',   value: `${res.npc_survivors ?? '?'} Schiffe`,  color: '#f87171' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-2.5 text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-mono text-slate-600 mb-1">{s.label}</p>
                    <p className="text-sm font-mono font-semibold" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Loot */}
              {hasLoot && (
                <div>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Beute</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(loot).map(([res, amt]) => (
                      <div key={res} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded"
                        style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                        <span className="text-xs font-mono text-slate-400 capitalize">{res}</span>
                        <span className="text-xs font-mono font-semibold" style={{ color: '#34d399' }}>{fmt(amt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Schiffe */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Spieler-Flotte */}
                <div>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Shield size={10} style={{ color: '#4ade80' }} />
                    Eigene Flotte ({report.attacker_fleet?.ships?.length ?? 0} Schiffe)
                  </p>
                  <div className="space-y-1">
                    {(report.attacker_fleet?.ships ?? []).map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="text-slate-300 truncate">{s.name ?? '—'}</span>
                        <span className="text-slate-600 flex-shrink-0 ml-2">ATK {fmt(s.attack)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* NPC-Flotte */}
                <div>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Crosshair size={10} style={{ color: '#f87171' }} />
                    {defenderNames} ({report.defender_fleet?.ships?.length ?? 0} Schiffe)
                  </p>
                  <div className="space-y-1">
                    {(report.defender_fleet?.ships ?? []).map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span className="text-slate-300 truncate">{s.name ?? '—'}</span>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-slate-600">Klasse {s.chassisClass}</span>
                          <span className="text-slate-600">ATK {fmt(s.attack)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Kampfstatistik */}
              <CombatStats report={report} />

              {/* Rundenlog */}
              {report.rounds?.length > 0 && (
                <div>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">
                    Rundenlog ({report.rounds.length} Runden)
                  </p>
                  <RoundLog rounds={report.rounds} />
                </div>
              )}

              {/* Kampfanimation */}
              <BattleAnimation report={report} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── BattleReportsPage ────────────────────────────────────────────────────────

export default function BattleReportsPage() {
  const { player } = useGameStore()
  const [openId, setOpenId] = useState(null)

  // URL-Parameter: ?id=xxx öffnet direkt einen Bericht
  useEffect(() => {
    const hash = window.location.hash
    const qIdx = hash.indexOf('?')
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx + 1))
      const id = params.get('id')
      if (id) setOpenId(id)
    }
  }, [])

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['battle-reports', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('battle_reports')
        .select('*')
        .or(`attacker_id.eq.${player.id},defender_id.eq.${player.id}`)
        .order('occurred_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Kampfberichte</h2>
        <p className="text-base text-slate-400 font-mono mt-1">
          {reports.length} Bericht{reports.length !== 1 ? 'e' : ''}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 font-mono text-sm">
          Lade Kampfberichte...
        </div>
      ) : reports.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <Swords size={32} className="mx-auto text-slate-700" />
          <p className="font-mono text-slate-600">Noch keine Kämpfe geführt.</p>
          <p className="text-xs font-mono text-slate-700">
            Setze den Flugmodus deiner Flotte auf "Feindlich" und begib dich zu NPC-Koordinaten.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <BattleCard
              key={report.id}
              report={report}
              isOpen={openId === report.id}
              onToggle={() => setOpenId(openId === report.id ? null : report.id)}
              playerName={player?.username}
            />
          ))}
        </div>
      )}
    </div>
  )
}
