// src/pages/OverviewPage.jsx — v1.0
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Bell, BellOff, Check, CheckCheck, Navigation, Building2,
  FlaskConical, Rocket, Swords, X, ChevronRight, Package
} from 'lucide-react'

// ─── Notification Typ-Konfiguration ──────────────────────────────────────────

const NOTIF_CONFIG = {
  fleet_arrived:   { icon: Navigation,   color: '#22d3ee',  label: 'Flotte' },
  building_done:   { icon: Building2,    color: '#34d399',  label: 'Gebäude' },
  research_done:   { icon: FlaskConical, color: '#a78bfa',  label: 'Forschung' },
  research_failed: { icon: FlaskConical, color: '#f87171',  label: 'Forschung' },
  ship_built:      { icon: Rocket,       color: '#fbbf24',  label: 'Werft' },
  battle:          { icon: Swords,       color: '#fb923c',  label: 'Kampf' },
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min  = Math.floor(diff / 60000)
  const h    = Math.floor(diff / 3600000)
  const d    = Math.floor(diff / 86400000)
  if (min < 1)  return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  if (h < 24)   return `vor ${h} Std.`
  return `vor ${d} Tag${d !== 1 ? 'en' : ''}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Einzelne Notification ────────────────────────────────────────────────────

function NotifCard({ notif, onRead, onNavigate }) {
  const cfg = NOTIF_CONFIG[notif.type] ?? { icon: Bell, color: '#94a3b8', label: 'Info' }
  const Icon = cfg.icon
  const isBattle = notif.type === 'battle'
  const reportId = notif.data?.battle_report_id

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="flex items-start gap-3 px-4 py-3 rounded-lg transition-all"
      style={{
        background: notif.is_read ? 'rgba(4,13,26,0.4)' : 'rgba(4,13,26,0.8)',
        border: `1px solid ${notif.is_read ? 'rgba(255,255,255,0.04)' : `${cfg.color}25`}`,
      }}>

      {/* Icon */}
      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
        style={{
          background: `${cfg.color}${notif.is_read ? '08' : '15'}`,
          border: `1px solid ${cfg.color}${notif.is_read ? '15' : '30'}`,
        }}>
        <Icon size={15} style={{ color: notif.is_read ? '#334155' : cfg.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono uppercase tracking-widest"
            style={{ color: notif.is_read ? '#334155' : cfg.color }}>
            {cfg.label}
          </span>
          {!notif.is_read && (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: cfg.color }} />
          )}
        </div>
        <p className="text-sm font-mono font-semibold"
          style={{ color: notif.is_read ? '#475569' : '#e2e8f0' }}>
          {notif.title}
        </p>
        <p className="text-xs font-mono mt-0.5"
          style={{ color: notif.is_read ? '#334155' : '#64748b' }}>
          {notif.message}
        </p>

        {/* Koordinaten-Info */}
        {notif.data?.x != null && (
          <p className="text-xs font-mono mt-1" style={{ color: '#334155' }}>
            📍 {notif.data.x} / {notif.data.y} / {notif.data.z}
          </p>
        )}

        {/* Loot-Info bei Kampf */}
        {isBattle && notif.data?.loot && Object.keys(notif.data.loot).length > 0 && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Package size={9} style={{ color: '#34d399' }} />
            {Object.entries(notif.data.loot).map(([res, amt]) => (
              <span key={res} className="text-xs font-mono" style={{ color: '#34d399' }}>
                {res}: {amt}
              </span>
            ))}
          </div>
        )}

        {/* Kampfbericht Link */}
        {isBattle && reportId && (
          <button
            onClick={() => onNavigate(`/battle-reports?id=${reportId}`)}
            className="flex items-center gap-1 mt-1.5 text-xs font-mono transition-all hover:underline"
            style={{ color: '#fb923c' }}>
            Kampfbericht anzeigen <ChevronRight size={10} />
          </button>
        )}
      </div>

      {/* Zeit + Aktionen */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-xs font-mono" style={{ color: '#334155' }}>
          {timeAgo(notif.created_at)}
        </span>
        {!notif.is_read && (
          <button
            onClick={() => onRead(notif.id)}
            className="p-1 rounded transition-all hover:bg-white/5"
            style={{ color: '#334155' }}
            title="Als gelesen markieren">
            <Check size={12} />
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── OverviewPage ─────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { player } = useGameStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all') // 'all' | 'unread' | type

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_notifications')
        .select('*')
        .eq('player_id', player.id)
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const unreadCount = notifications.filter(n => !n.is_read).length

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read
    if (filter === 'all') return true
    return n.type === filter
  })

  const markRead = async (id) => {
    await supabase.from('player_notifications').update({ is_read: true }).eq('id', id)
    queryClient.invalidateQueries(['notifications', player?.id])
  }

  const markAllRead = async () => {
    await supabase.from('player_notifications')
      .update({ is_read: true })
      .eq('player_id', player.id)
      .eq('is_read', false)
    queryClient.invalidateQueries(['notifications', player?.id])
  }

  const FILTERS = [
    { id: 'all',             label: 'Alle' },
    { id: 'unread',          label: 'Ungelesen' },
    { id: 'fleet_arrived',   label: 'Flotten' },
    { id: 'building_done',   label: 'Gebäude' },
    { id: 'research_done',   label: 'Forschung' },
    { id: 'ship_built',      label: 'Werft' },
    { id: 'battle',          label: 'Kämpfe' },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">
            Übersicht
          </h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {unreadCount > 0
              ? `${unreadCount} ungelesene Benachrichtigung${unreadCount !== 1 ? 'en' : ''}`
              : 'Keine neuen Benachrichtigungen'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono transition-all"
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
              color: '#22d3ee',
            }}>
            <CheckCheck size={13} />
            Alle gelesen
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => {
          const count = f.id === 'all' ? notifications.length
            : f.id === 'unread' ? unreadCount
            : notifications.filter(n => n.type === f.id).length
          if (f.id !== 'all' && f.id !== 'unread' && count === 0) return null
          const isActive = filter === f.id
          const cfg = NOTIF_CONFIG[f.id]
          const color = cfg?.color ?? '#22d3ee'
          return (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
              style={{
                background: isActive ? `${color}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? color + '40' : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? color : '#475569',
              }}>
              {f.label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs"
                  style={{
                    background: isActive ? `${color}25` : 'rgba(255,255,255,0.06)',
                    color: isActive ? color : '#334155',
                  }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-500 font-mono text-sm">
          Lade Benachrichtigungen...
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <BellOff size={32} className="mx-auto text-slate-700" />
          <p className="font-mono text-slate-600">
            {filter === 'unread' ? 'Keine ungelesenen Benachrichtigungen.' : 'Keine Benachrichtigungen.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map(notif => (
              <NotifCard
                key={notif.id}
                notif={notif}
                onRead={markRead}
                onNavigate={navigate}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
