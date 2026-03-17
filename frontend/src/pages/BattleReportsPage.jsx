// src/pages/BattleReportsPage.jsx — v1.0
import { useState, useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, ChevronLeft, ChevronDown, ChevronUp, Shield, Crosshair, Package, Trophy, Skull, Minus } from 'lucide-react'

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

// ─── Rundenlog ────────────────────────────────────────────────────────────────

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

function BattleCard({ report, isOpen, onToggle }) {
  const winCfg = WINNER_CONFIG[report.winner] ?? WINNER_CONFIG.draw
  const WinIcon = winCfg.icon
  const npcType = report.defender_fleet?.npc_type ?? 'unbekannt'
  const npcLabel = NPC_LABELS[npcType] ?? npcType
  const res = report.result ?? {}
  const loot = report.loot ?? {}
  const hasLoot = Object.keys(loot).length > 0

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
            <span className="text-sm font-mono font-semibold text-slate-200">
              vs. {npcLabel}
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
                    {npcLabel} ({report.defender_fleet?.ships?.length ?? 0} Schiffe)
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

              {/* Rundenlog */}
              {report.rounds?.length > 0 && (
                <div>
                  <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">
                    Rundenlog ({report.rounds.length} Runden)
                  </p>
                  <RoundLog rounds={report.rounds} />
                </div>
              )}

              {/* Video-Kampf Platzhalter */}
              <div className="flex items-center justify-center px-4 py-3 rounded-lg"
                style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }}>
                <span className="text-xs font-mono" style={{ color: '#475569' }}>
                  ⚙ Animierter Kampf — In Entwicklung
                </span>
              </div>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
