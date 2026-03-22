// src/pages/AlliancePage.jsx — v1.0
import { useState, useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Crown, Shield, User, Search, Plus, X, Send, Scale,
  ChevronLeft, ChevronRight, Swords, Heart, Flag,
  Upload, CreditCard, FileText, Building2, LogOut, Check, AlertTriangle
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString('de-DE')
}

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  const h   = Math.floor(diff / 3600000)
  const d   = Math.floor(diff / 86400000)
  if (min < 1)  return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  if (h < 24)   return `vor ${h} Std.`
  return `vor ${d} Tag${d !== 1 ? 'en' : ''}`
}

const RANK_CONFIG = {
  founder:   { label: 'Gründer',   icon: Crown,  color: '#f59e0b' },
  admin:     { label: 'Admin',     icon: Shield, color: '#38bdf8' },
  konziliar: { label: 'Konziliar', icon: Scale,  color: '#a78bfa' },
  member:    { label: 'Mitglied',  icon: User,   color: '#64748b' },
}

const RELATION_CONFIG = {
  war:             { label: 'Krieg',            color: '#ef4444', icon: Swords    },
  allied:          { label: 'Verbündet',         color: '#4ade80', icon: Heart },
  nap:             { label: 'Nichtangriffspakt', color: '#22d3ee', icon: Flag      },
  pending_alliance:{ label: 'Bündnisanfrage',   color: '#fbbf24', icon: Heart },
  pending_nap:     { label: 'NAP-Anfrage',       color: '#fbbf24', icon: Flag      },
}

// Sortiert alliance_a/b so dass kleinere UUID immer zuerst kommt
function normalizeRelation(myId, otherId) {
  return myId < otherId
    ? { a: myId, b: otherId }
    : { a: otherId, b: myId }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useMyAlliance(player) {
  return useQuery({
    queryKey: ['my-alliance', player?.alliance_id],
    queryFn: async () => {
      if (!player?.alliance_id) return null
      const { data } = await supabase
        .from('alliances')
        .select('*')
        .eq('id', player.alliance_id)
        .single()
      return data
    },
    enabled: !!player?.alliance_id,
    staleTime: 30000,
  })
}

function useAllianceMembers(allianceId) {
  return useQuery({
    queryKey: ['alliance-members', allianceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_members')
        .select('*, players(id, username, total_points)')
        .eq('alliance_id', allianceId)
        .order('rank')
      return data ?? []
    },
    enabled: !!allianceId,
    staleTime: 30000,
  })
}

function useMyMembership(allianceId, playerId) {
  return useQuery({
    queryKey: ['my-membership', allianceId, playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_members')
        .select('*')
        .eq('alliance_id', allianceId)
        .eq('player_id', playerId)
        .single()
      return data
    },
    enabled: !!allianceId && !!playerId,
  })
}

// ─── Create Alliance ──────────────────────────────────────────────────────────

function CreateAllianceForm({ player, onCreated }) {
  const [name, setName]   = useState('')
  const [tag, setTag]     = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const queryClient = useQueryClient()

  const handleCreate = async () => {
    if (saving) return
    if (!name.trim()) return setError('Name ist erforderlich.')
    if (tag.trim().length < 2 || tag.trim().length > 4) return setError('Kürzel muss 2–4 Zeichen haben.')

    setSaving(true)
    setError('')

    const { data: alliance, error: err } = await supabase
      .from('alliances')
      .insert({ name: name.trim(), tag: tag.trim().toUpperCase(), leader_id: player.id })
      .select()
      .single()

    if (err) {
      setSaving(false)
      return setError(err.message.includes('unique') ? 'Name bereits vergeben.' : err.message)
    }

    // Gründer als Member eintragen
    await supabase.from('alliance_members').insert({
      alliance_id: alliance.id, player_id: player.id, rank: 'founder',
    })
    // players.alliance_id setzen
    await supabase.from('players').update({ alliance_id: alliance.id }).eq('id', player.id)

    // Player-State in localStorage aktualisieren damit reload korrekt lädt
    const { data: updatedPlayer } = await supabase
      .from('players').select('*').eq('id', player.id).single()
    if (updatedPlayer) {
      localStorage.setItem('sb_player', JSON.stringify(updatedPlayer))
    }

    setSaving(false)
    window.location.reload()
  }

  return (
    <div className="panel p-6 space-y-4 max-w-md mx-auto">
      <h3 className="font-display font-bold text-lg text-cyan-400">Allianz gründen</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-mono text-slate-500 mb-1 block">Allianzname</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Name der Allianz"
            className="w-full px-3 py-2 rounded text-sm font-mono"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
        </div>
        <div>
          <label className="text-xs font-mono text-slate-500 mb-1 block">Kürzel (2–4 Zeichen)</label>
          <input value={tag} onChange={e => setTag(e.target.value.toUpperCase().slice(0,4))}
            placeholder="TAG"
            maxLength={4}
            className="w-32 px-3 py-2 rounded text-sm font-mono"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none', textTransform: 'uppercase' }} />
          <span className="text-xs font-mono text-slate-600 ml-2">{tag.length}/4</span>
        </div>
      </div>
      {error && <p className="text-xs font-mono" style={{ color: '#f87171' }}>{error}</p>}
      <button onClick={handleCreate} disabled={saving}
        className="w-full px-4 py-2 rounded font-mono font-semibold text-sm transition-all"
        style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}>
        {saving ? 'Wird gegründet...' : 'Allianz gründen'}
      </button>
    </div>
  )
}

// ─── Search Alliance ──────────────────────────────────────────────────────────

function SearchAlliance({ player, onJoined }) {
  const [query, setQuery]     = useState('')
  const [showTop, setShowTop] = useState(false)
  const [selected, setSelected] = useState(null)
  const [appMsg, setAppMsg]   = useState('')
  const [applying, setApplying] = useState(false)
  const [myApp, setMyApp]     = useState(null)
  const queryClient = useQueryClient()

  const { data: searchResults = [] } = useQuery({
    queryKey: ['alliance-search', query],
    queryFn: async () => {
      if (!query.trim()) return []
      const { data } = await supabase
        .from('alliances')
        .select('id, name, tag, logo_url, member_limit')
        .ilike('name', `%${query.trim()}%`)
        .limit(10)
      // Mitgliederzahl
      const results = []
      for (const a of data ?? []) {
        const { count } = await supabase
          .from('alliance_members')
          .select('*', { count: 'exact', head: true })
          .eq('alliance_id', a.id)
        results.push({ ...a, member_count: count ?? 0 })
      }
      return results
    },
    enabled: query.trim().length > 1,
  })

  const { data: top100 = [] } = useQuery({
    queryKey: ['alliance-top100'],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliances')
        .select('id, name, tag, logo_url, member_limit')
        .order('credits_treasury', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: showTop,
  })

  const displayList = query.trim().length > 1 ? searchResults : (showTop ? top100 : [])

  const checkMyApp = async (allianceId) => {
    const { data } = await supabase
      .from('alliance_applications')
      .select('*')
      .eq('alliance_id', allianceId)
      .eq('player_id', player.id)
      .maybeSingle()
    setMyApp(data)
  }

  const handleSelect = (a) => {
    setSelected(a)
    checkMyApp(a.id)
  }

  const handleApply = async () => {
    if (applying || !appMsg.trim() || !selected) return
    setApplying(true)
    await supabase.from('alliance_applications').insert({
      alliance_id: selected.id, player_id: player.id, message: appMsg.trim(),
    })
    checkMyApp(selected.id)
    setApplying(false)
    setAppMsg('')
  }

  const handleWithdraw = async () => {
    if (!myApp) return
    await supabase.from('alliance_applications').delete().eq('id', myApp.id)
    setMyApp(null)
  }

  if (selected) {
    return (
      <div className="panel p-5 space-y-4 max-w-lg mx-auto">
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-2">
          <ChevronLeft size={12} /> Zurück
        </button>
        <div className="flex items-center gap-4">
          {selected.logo_url
            ? <img src={selected.logo_url} className="w-16 h-16 rounded-lg object-cover" alt="Logo" />
            : <div className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-mono font-bold"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', color: '#22d3ee' }}>
                [{selected.tag}]
              </div>}
          <div>
            <h3 className="font-display font-bold text-xl text-slate-100">[{selected.tag}] {selected.name}</h3>
            <p className="text-xs font-mono text-slate-500">{selected.member_count} / {selected.member_limit} Mitglieder</p>
          </div>
        </div>

        {myApp?.status === 'pending' ? (
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-lg text-sm font-mono"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>
              Bewerbung ausstehend — wartet auf Antwort der Allianz.
            </div>
            <button onClick={handleWithdraw}
              className="px-4 py-2 rounded text-xs font-mono transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              Bewerbung zurückziehen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="text-xs font-mono text-slate-500">Bewerbung schreiben (max. 500 Zeichen)</label>
            <textarea value={appMsg} onChange={e => setAppMsg(e.target.value.slice(0, 500))}
              rows={4} placeholder="Warum möchtest du dieser Allianz beitreten?"
              className="w-full px-3 py-2 rounded text-sm font-mono resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-600">{appMsg.length}/500</span>
              <button onClick={handleApply} disabled={applying || !appMsg.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
                style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}>
                <Send size={12} /> Bewerbung senden
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel p-5 space-y-4 max-w-lg mx-auto">
      <h3 className="font-display font-bold text-lg text-cyan-400">Allianz suchen</h3>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Allianzname eingeben..."
          className="flex-1 px-3 py-2 rounded text-sm font-mono"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
        <button onClick={() => setShowTop(v => !v)}
          className="px-3 py-2 rounded text-xs font-mono transition-all"
          style={{
            background: showTop ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${showTop ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: showTop ? '#22d3ee' : '#64748b',
          }}>
          Top 100
        </button>
      </div>

      <div className="space-y-1.5">
        {displayList.map(a => (
          <button key={a.id} onClick={() => handleSelect(a)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:bg-white/5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {a.logo_url
              ? <img src={a.logo_url} className="w-8 h-8 rounded object-cover flex-shrink-0" alt="" />
              : <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                  style={{ background: 'rgba(34,211,238,0.08)', color: '#22d3ee' }}>[{a.tag}]</div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-slate-200 truncate">{a.name}</p>
            </div>
            <span className="text-xs font-mono text-slate-600 flex-shrink-0">
              <Users size={10} className="inline mr-1" />{a.member_count ?? '?'}
            </span>
            <ChevronRight size={12} style={{ color: '#334155' }} />
          </button>
        ))}
        {query.trim().length > 1 && searchResults.length === 0 && (
          <p className="text-sm font-mono text-slate-600 text-center py-4">Keine Allianz gefunden.</p>
        )}
      </div>
    </div>
  )
}

// ─── Alliance Page (Member View) ──────────────────────────────────────────────

function AllianceView({ alliance, player, membership, onLeft }) {
  const [tab, setTab] = useState('members')
  const queryClient = useQueryClient()
  const { data: members = [] } = useAllianceMembers(alliance.id)

  const isFounder  = membership?.rank === 'founder'
  const isAdmin    = membership?.rank === 'admin' || isFounder
  const canTreasury = isFounder || (isAdmin && membership?.can_manage_treasury)

  const tabs = [
    { id: 'members',   label: 'Mitglieder',  icon: Users        },
    { id: 'bulletin',  label: 'Schwarzes Brett', icon: FileText },
    { id: 'treasury',  label: 'Allianzkasse', icon: CreditCard  },
    { id: 'diplomacy', label: 'Diplomatie',   icon: Swords      },
    { id: 'hq',        label: 'Allianz-HQ',  icon: Building2   },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <AllianceHeader alliance={alliance} player={player} membership={membership}
        members={members} queryClient={queryClient} onLeft={onLeft} />

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => {
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

      {/* Tab Content */}
      {tab === 'members'   && <MembersTab alliance={alliance} members={members} membership={membership} player={player} queryClient={queryClient} />}
      {tab === 'bulletin'  && <BulletinTab alliance={alliance} player={player} />}
      {tab === 'treasury'  && <TreasuryTab alliance={alliance} player={player} membership={membership} canManage={canTreasury} members={members} queryClient={queryClient} />}
      {tab === 'diplomacy' && <DiplomacyTab alliance={alliance} player={player} membership={membership} />}
      {tab === 'hq'        && <HQTab alliance={alliance} />}
    </div>
  )
}

// ─── Alliance Header ──────────────────────────────────────────────────────────

function AllianceHeader({ alliance, player, membership, members, queryClient, onLeft }) {
  const [uploading, setUploading] = useState(false)
  const isFounder = membership?.rank === 'founder'

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !isFounder) return
    setUploading(true)

    // Altes Logo löschen
    if (alliance.logo_url) {
      const oldPath = alliance.logo_url.split('/alliance-logos/')[1]
      if (oldPath) await supabase.storage.from('alliance-logos').remove([oldPath])
    }

    const ext  = file.name.split('.').pop()
    const path = `${alliance.id}/logo.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('alliance-logos').upload(path, file, { upsert: true })

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('alliance-logos').getPublicUrl(path)
      await supabase.from('alliances').update({ logo_url: urlData.publicUrl }).eq('id', alliance.id)
      queryClient.invalidateQueries(['my-alliance'])
    }
    setUploading(false)
  }

  const handleLeave = async () => {
    if (isFounder) return
    await supabase.from('alliance_members').delete()
      .eq('alliance_id', alliance.id).eq('player_id', player.id)
    await supabase.from('players').update({ alliance_id: null }).eq('id', player.id)
    const { data: updatedPlayer } = await supabase.from('players').select('*').eq('id', player.id).single()
    if (updatedPlayer) localStorage.setItem('sb_player', JSON.stringify(updatedPlayer))
    window.location.reload()
  }

  return (
    <div className="panel p-6">
      {/* Verlassen Button oben rechts */}
      {!isFounder && (
        <div className="flex justify-end mb-2">
          <button onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
            <LogOut size={11} /> Verlassen
          </button>
        </div>
      )}

      {/* Name — zentriert, groß */}
      <h2 className="text-center font-display font-bold text-slate-100" style={{ fontSize: '2rem', lineHeight: 1.2 }}>
        <span style={{ color: '#22d3ee' }}>[{alliance.tag}]</span> {alliance.name}
      </h2>

      {/* Logo — zentriert, groß */}
      <div className="flex justify-center mt-5">
        <div className="relative">
          {alliance.logo_url
            ? <img src={alliance.logo_url} className="rounded-2xl object-cover"
                style={{ width: '120px', height: '120px', border: '2px solid rgba(34,211,238,0.25)' }} alt="Logo" />
            : <div className="rounded-2xl flex items-center justify-center font-mono font-bold"
                style={{ width: '120px', height: '120px', fontSize: '1.5rem', background: 'rgba(34,211,238,0.06)', border: '2px solid rgba(34,211,238,0.15)', color: '#22d3ee' }}>
                [{alliance.tag}]
              </div>}
          {isFounder && (
            <label className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.4)' }}
              title="Logo hochladen">
              <Upload size={13} style={{ color: '#22d3ee' }} />
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
            </label>
          )}
        </div>
      </div>

      {/* Mitgliederanzahl + eigener Rang — zentriert */}
      <div className="flex flex-col items-center gap-2 mt-4">
        <p className="text-sm font-mono text-slate-400">
          <span className="font-semibold" style={{ color: '#22d3ee' }}>{members.length}</span>
          <span className="text-slate-600"> / {alliance.member_limit} Mitglieder</span>
        </p>
        {membership && (
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              background: `${RANK_CONFIG[membership.rank]?.color}15`,
              border: `1px solid ${RANK_CONFIG[membership.rank]?.color}30`,
              color: RANK_CONFIG[membership.rank]?.color,
            }}>
            {RANK_CONFIG[membership.rank]?.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ alliance, members, membership, player, queryClient }) {
  const [applications, setApplications] = useState([])
  const isAdmin = membership?.rank === 'founder' || membership?.rank === 'admin'

  const loadApplications = async () => {
    if (!isAdmin) return
    const { data } = await supabase
      .from('alliance_applications')
      .select('*, players(username)')
      .eq('alliance_id', alliance.id)
      .eq('status', 'pending')
    setApplications(data ?? [])
  }

  // Bewerbung annehmen
  const acceptApp = async (app) => {
    await supabase.from('alliance_members').insert({
      alliance_id: alliance.id, player_id: app.player_id, rank: 'member',
    })
    await supabase.from('players').update({ alliance_id: alliance.id }).eq('id', app.player_id)
    await supabase.from('alliance_applications').update({
      status: 'accepted', reviewed_by: player.id, reviewed_at: new Date().toISOString()
    }).eq('id', app.id)
    loadApplications()
    queryClient.invalidateQueries(['alliance-members', alliance.id])
  }

  const rejectApp = async (app) => {
    await supabase.from('alliance_applications').update({ status: 'rejected', reviewed_by: player.id, reviewed_at: new Date().toISOString() }).eq('id', app.id)
    loadApplications()
  }

  const kickMember = async (memberId) => {
    if (memberId === player.id) return
    await supabase.from('alliance_members').delete()
      .eq('alliance_id', alliance.id).eq('player_id', memberId)
    await supabase.from('players').update({ alliance_id: null }).eq('id', memberId)
    queryClient.invalidateQueries(['alliance-members', alliance.id])
  }

  const promoteToAdmin = async (memberId) => {
    await supabase.from('alliance_members').update({ rank: 'admin' })
      .eq('alliance_id', alliance.id).eq('player_id', memberId)
    queryClient.invalidateQueries(['alliance-members', alliance.id])
  }

  // Load applications on mount if admin
  useMemo(() => { if (isAdmin) loadApplications() }, [isAdmin, alliance.id])

  return (
    <div className="space-y-4">
      {/* Bewerbungen */}
      {isAdmin && applications.length > 0 && (
        <div className="panel p-4 space-y-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">
            Bewerbungen ({applications.length})
          </p>
          {applications.map(app => (
            <div key={app.id} className="px-3 py-3 rounded-lg space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-mono font-semibold text-slate-200">{app.players?.username}</p>
                <span className="text-xs font-mono text-slate-600">{timeAgo(app.created_at)}</span>
              </div>
              <p className="text-xs font-mono text-slate-400">{app.message}</p>
              <div className="flex gap-2">
                <button onClick={() => acceptApp(app)}
                  className="flex items-center gap-1 px-3 py-1 rounded text-xs font-mono transition-all"
                  style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
                  <Check size={10} /> Annehmen
                </button>
                <button onClick={() => rejectApp(app)}
                  className="flex items-center gap-1 px-3 py-1 rounded text-xs font-mono transition-all"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                  <X size={10} /> Ablehnen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mitgliederliste */}
      <div className="panel p-4 space-y-1.5">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">
          Mitglieder ({members.length})
        </p>
        {members.map(m => {
          const cfg = RANK_CONFIG[m.rank] ?? RANK_CONFIG.member
          const Icon = cfg.icon
          const isSelf = m.player_id === player.id
          const canKick = isAdmin && !isSelf && m.rank !== 'founder'
          const canPromote = membership?.rank === 'founder' && m.rank === 'member'

          return (
            <div key={m.player_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <Icon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
              <span className="flex-1 text-sm font-mono text-slate-200">{m.players?.username ?? '—'}</span>
              <span className="text-xs font-mono" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="text-xs font-mono text-slate-600">{fmt(m.players?.total_points ?? 0)} Pkt</span>
              {canPromote && (
                <button onClick={() => promoteToAdmin(m.player_id)}
                  className="text-xs font-mono px-2 py-0.5 rounded transition-all"
                  style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}>
                  → Admin
                </button>
              )}
              {canKick && (
                <button onClick={() => kickMember(m.player_id)}
                  className="p-1 rounded transition-all hover:bg-red-500/10"
                  style={{ color: '#475569' }} title="Rauswerfen">
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Bulletin Tab (Schwarzes Brett) ──────────────────────────────────────────

function BulletinTab({ alliance, player }) {
  const [page, setPage]     = useState(1)
  const [newMsg, setNewMsg] = useState('')
  const [posting, setPosting] = useState(false)
  const PER_PAGE = 10
  const queryClient = useQueryClient()

  const { data: posts = [] } = useQuery({
    queryKey: ['alliance-bulletin', alliance.id, page],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_bulletin')
        .select('*, players(username)')
        .eq('alliance_id', alliance.id)
        .order('created_at', { ascending: false })
        .range((page-1)*PER_PAGE, page*PER_PAGE - 1)
      return data ?? []
    },
    enabled: !!alliance.id,
  })

  const { data: totalCount } = useQuery({
    queryKey: ['alliance-bulletin-count', alliance.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('alliance_bulletin')
        .select('*', { count: 'exact', head: true })
        .eq('alliance_id', alliance.id)
      return count ?? 0
    },
  })

  const totalPages = Math.ceil((totalCount ?? 0) / PER_PAGE)

  const handlePost = async () => {
    if (posting || !newMsg.trim()) return
    setPosting(true)
    await supabase.from('alliance_bulletin').insert({
      alliance_id: alliance.id,
      author_id: player.id,
      author_name: player.username,
      title: '',
      content: newMsg.trim(),
    })
    setNewMsg('')
    setPage(1)
    queryClient.invalidateQueries(['alliance-bulletin', alliance.id])
    queryClient.invalidateQueries(['alliance-bulletin-count', alliance.id])
    setPosting(false)
  }

  return (
    <div className="panel p-5 space-y-4">
      <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Schwarzes Brett</p>

      {/* Neuer Eintrag */}
      <div className="flex gap-2">
        <textarea value={newMsg} onChange={e => setNewMsg(e.target.value.slice(0, 500))}
          rows={2} placeholder="Nachricht an die Allianz..."
          className="flex-1 px-3 py-2 rounded text-sm font-mono resize-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
        <button onClick={handlePost} disabled={posting || !newMsg.trim()}
          className="px-3 py-2 rounded transition-all self-end"
          style={{
            background: newMsg.trim() ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${newMsg.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: newMsg.trim() ? '#22d3ee' : '#334155',
          }}>
          <Send size={14} />
        </button>
      </div>

      {/* Einträge */}
      <div className="space-y-2">
        {posts.map(post => (
          <div key={post.id} className="px-3 py-3 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-semibold text-cyan-400">
                {post.players?.username ?? post.author_name ?? '—'}
              </span>
              <span className="text-xs font-mono text-slate-600">{timeAgo(post.created_at)}</span>
            </div>
            <p className="text-sm font-mono text-slate-300">{post.content}</p>
          </div>
        ))}
        {posts.length === 0 && (
          <p className="text-sm font-mono text-slate-600 text-center py-4">Noch keine Einträge.</p>
        )}
      </div>

      {/* Paginierung */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className="w-7 h-7 rounded text-xs font-mono transition-all"
              style={{
                background: page === p ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${page === p ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: page === p ? '#22d3ee' : '#475569',
              }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Treasury Tab ─────────────────────────────────────────────────────────────

function TreasuryTab({ alliance, player, membership, canManage, members, queryClient }) {
  const [depositAmt, setDepositAmt] = useState('')
  const [payoutAmt, setPayoutAmt]   = useState('')
  const [payoutTo, setPayoutTo]     = useState('')
  const [busy, setBusy] = useState(false)

  const { data: planet } = useQuery({
    queryKey: ['planet', player.id],
    queryFn: async () => {
      const { data } = await supabase.from('planets').select('credits').eq('owner_id', player.id).single()
      return data
    },
  })

  const { data: transactions = [] } = useQuery({
    queryKey: ['treasury-log', alliance.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_treasury_log')
        .select('*')
        .eq('alliance_id', alliance.id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    refetchInterval: 15000,
  })

  const logTransaction = async (type, amount, fromUsername, toUsername) => {
    await supabase.from('alliance_treasury_log').insert({
      alliance_id: alliance.id,
      type,
      amount,
      from_username: fromUsername,
      to_username: toUsername,
      balance_after: type === 'deposit'
        ? (alliance.credits_treasury ?? 0) + amount
        : (alliance.credits_treasury ?? 0) - amount,
    })
    queryClient.invalidateQueries(['treasury-log', alliance.id])
  }

  const handleDeposit = async () => {
    const amt = parseInt(depositAmt)
    if (!amt || amt <= 0 || busy) return
    if ((planet?.credits ?? 0) < amt) return
    setBusy(true)
    await supabase.from('planets').update({ credits: (planet.credits ?? 0) - amt }).eq('owner_id', player.id)
    await supabase.from('alliances').update({ credits_treasury: (alliance.credits_treasury ?? 0) + amt }).eq('id', alliance.id)
    await logTransaction('deposit', amt, player.username, null)
    queryClient.invalidateQueries(['my-alliance', alliance.id])
    queryClient.invalidateQueries(['planet', player.id])
    setDepositAmt('')
    setBusy(false)
  }

  const handlePayout = async () => {
    const amt = parseInt(payoutAmt)
    if (!amt || amt <= 0 || !payoutTo || busy) return
    if ((alliance.credits_treasury ?? 0) < amt) return
    setBusy(true)
    const target = members.find(m => m.players?.username === payoutTo)
    if (!target) { setBusy(false); return }
    const { data: targetPlanet } = await supabase.from('planets').select('credits').eq('owner_id', target.player_id).single()
    await supabase.from('planets').update({ credits: (targetPlanet?.credits ?? 0) + amt }).eq('owner_id', target.player_id)
    await supabase.from('alliances').update({ credits_treasury: (alliance.credits_treasury ?? 0) - amt }).eq('id', alliance.id)
    await logTransaction('payout', amt, player.username, payoutTo)
    queryClient.invalidateQueries(['my-alliance', alliance.id])
    setPayoutAmt('')
    setPayoutTo('')
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Allianzkasse</p>
          <p className="font-display font-bold text-xl text-cyan-400">{fmt(alliance.credits_treasury ?? 0)} Credits</p>
        </div>

        {/* Einzahlen */}
        <div className="space-y-2">
          <p className="text-xs font-mono text-slate-500">Einzahlen (Kontostand: {fmt(planet?.credits ?? 0)} Cr)</p>
          <div className="flex gap-2">
            <input value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              type="number" placeholder="Betrag"
              className="flex-1 px-3 py-2 rounded text-sm font-mono"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
            <button onClick={handleDeposit} disabled={busy}
              className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
              style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee' }}>
              Einzahlen
            </button>
          </div>
        </div>

        {/* Auszahlen (nur Admin/Gründer) */}
        {canManage && (
          <div className="space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
            <p className="text-xs font-mono text-slate-500">Auszahlen an Mitglied</p>
            <div className="flex gap-2">
              <select value={payoutTo} onChange={e => setPayoutTo(e.target.value)}
                className="flex-1 px-3 py-2 rounded text-sm font-mono"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}>
                <option value="">Mitglied wählen</option>
                {members.map(m => (
                  <option key={m.player_id} value={m.players?.username}>{m.players?.username}</option>
                ))}
              </select>
              <input value={payoutAmt} onChange={e => setPayoutAmt(e.target.value)}
                type="number" placeholder="Betrag"
                className="px-3 py-2 rounded text-sm font-mono"
                style={{ width: '100px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }} />
              <button onClick={handlePayout} disabled={busy}
                className="px-4 py-2 rounded text-sm font-mono font-semibold transition-all"
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
                Auszahlen
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaktions-Historie */}
      <div className="panel p-4 space-y-2">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">Transaktions-Historie</p>
        {transactions.length === 0 ? (
          <p className="text-sm font-mono text-slate-600 text-center py-4">Noch keine Transaktionen.</p>
        ) : transactions.map(tx => {
          const isDeposit = tx.type === 'deposit'
          return (
            <div key={tx.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-base flex-shrink-0">{isDeposit ? '↑' : '↓'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-slate-300">
                  {isDeposit
                    ? <><span className="text-cyan-400">{tx.from_username}</span> hat eingezahlt</>
                    : <><span className="text-slate-400">{tx.from_username}</span> → <span className="text-green-400">{tx.to_username}</span></>
                  }
                </p>
                <p className="text-xs font-mono text-slate-600">{timeAgo(tx.created_at)}</p>
              </div>
              <span className="text-sm font-mono font-semibold flex-shrink-0"
                style={{ color: isDeposit ? '#22d3ee' : '#4ade80' }}>
                {isDeposit ? '+' : '-'}{fmt(tx.amount)} Cr
              </span>
              <span className="text-xs font-mono text-slate-700 flex-shrink-0">
                ={fmt(tx.balance_after)} Cr
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Diplomacy Tab ────────────────────────────────────────────────────────────

function DiplomacyTab({ alliance, player, membership }) {
  const [targetName, setTargetName]   = useState('')
  const [targetAlliance, setTargetAlliance] = useState(null)
  const [searching, setSearching]     = useState(false)
  const [busy, setBusy]               = useState(false)
  const queryClient = useQueryClient()
  const isAdmin = membership?.rank === 'founder' || membership?.rank === 'admin'

  const { data: relations = [] } = useQuery({
    queryKey: ['alliance-relations', alliance.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_relations')
        .select('*, a:alliance_a_id(id,name,tag), b:alliance_b_id(id,name,tag)')
        .or(`alliance_a_id.eq.${alliance.id},alliance_b_id.eq.${alliance.id}`)
      return (data ?? []).map(r => {
        const other = r.alliance_a_id === alliance.id ? r.b : r.a
        return { ...r, other }
      })
    },
  })

  const { data: dipLog = [] } = useQuery({
    queryKey: ['diplomacy-log', alliance.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('alliance_diplomacy_log')
        .select('*')
        .eq('alliance_id', alliance.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const searchTarget = async () => {
    if (!targetName.trim()) return
    setSearching(true)
    const { data } = await supabase.from('alliances').select('id,name,tag')
      .ilike('name', `%${targetName.trim()}%`).neq('id', alliance.id).limit(5)
    setTargetAlliance(data?.[0] ?? null)
    setSearching(false)
  }

  const sendDiplomacy = async (action) => {
    if (!targetAlliance || busy) return
    setBusy(true)
    const { a, b } = normalizeRelation(alliance.id, targetAlliance.id)

    if (action === 'war') {
      await supabase.from('alliance_relations').upsert(
        { alliance_a_id: a, alliance_b_id: b, relation: 'war', proposed_by: player.id },
        { onConflict: 'alliance_a_id,alliance_b_id' }
      )
      // Log für beide Seiten
      const msg = `[${alliance.tag}] ${alliance.name} hat [${targetAlliance.tag}] ${targetAlliance.name} den Krieg erklärt.`
      await supabase.from('alliance_diplomacy_log').insert([
        { alliance_id: alliance.id, event_type: 'war_declared', other_alliance_id: targetAlliance.id, other_alliance_name: targetAlliance.name, initiated_by: player.id, message: msg },
        { alliance_id: targetAlliance.id, event_type: 'war_declared', other_alliance_id: alliance.id, other_alliance_name: alliance.name, initiated_by: player.id, message: `[${targetAlliance.tag}] ${targetAlliance.name} wurde von [${alliance.tag}] ${alliance.name} der Krieg erklärt.` },
      ])
    } else {
      // Anfrage senden
      const rel = action === 'allied' ? 'pending_alliance' : 'pending_nap'
      await supabase.from('alliance_relations').upsert(
        { alliance_a_id: a, alliance_b_id: b, relation: rel, proposed_by: player.id },
        { onConflict: 'alliance_a_id,alliance_b_id' }
      )
    }

    queryClient.invalidateQueries(['alliance-relations', alliance.id])
    queryClient.invalidateQueries(['diplomacy-log', alliance.id])
    setBusy(false)
    setTargetAlliance(null)
    setTargetName('')
  }

  const respondToPending = async (rel, accept) => {
    if (busy) return
    setBusy(true)
    const { a, b } = normalizeRelation(alliance.id, rel.other.id)

    if (accept) {
      const finalRel = rel.relation === 'pending_alliance' ? 'allied' : 'nap'
      await supabase.from('alliance_relations').update({ relation: finalRel, updated_at: new Date().toISOString() })
        .eq('alliance_a_id', a).eq('alliance_b_id', b)
      const logType = finalRel === 'allied' ? 'allied' : 'nap_signed'
      await supabase.from('alliance_diplomacy_log').insert([
        { alliance_id: alliance.id, event_type: logType, other_alliance_id: rel.other.id, other_alliance_name: rel.other.name, initiated_by: player.id },
        { alliance_id: rel.other.id, event_type: logType, other_alliance_id: alliance.id, other_alliance_name: alliance.name, initiated_by: player.id },
      ])
    } else {
      await supabase.from('alliance_relations').delete().eq('alliance_a_id', a).eq('alliance_b_id', b)
    }

    queryClient.invalidateQueries(['alliance-relations', alliance.id])
    queryClient.invalidateQueries(['diplomacy-log', alliance.id])
    setBusy(false)
  }

  const endRelation = async (rel) => {
    if (busy) return
    setBusy(true)
    const { a, b } = normalizeRelation(alliance.id, rel.other.id)
    await supabase.from('alliance_relations').delete().eq('alliance_a_id', a).eq('alliance_b_id', b)
    queryClient.invalidateQueries(['alliance-relations', alliance.id])
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      {/* Aktuelle Beziehungen */}
      <div className="panel p-4 space-y-2">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-3">Diplomatische Beziehungen</p>
        {relations.length === 0 ? (
          <p className="text-sm font-mono text-slate-600">Keine aktiven Beziehungen.</p>
        ) : relations.map(rel => {
          const cfg = RELATION_CONFIG[rel.relation] ?? { label: rel.relation, color: '#94a3b8', icon: Flag }
          const Icon = cfg.icon
          const isPending = rel.relation.startsWith('pending_')
          const isIncoming = isPending && rel.proposed_by !== player.id
          return (
            <div key={rel.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${cfg.color}20` }}>
              <Icon size={13} style={{ color: cfg.color, flexShrink: 0 }} />
              <span className="flex-1 text-sm font-mono text-slate-200">
                [{rel.other?.tag}] {rel.other?.name}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                {cfg.label}
              </span>
              {isAdmin && isPending && isIncoming && (
                <div className="flex gap-1">
                  <button onClick={() => respondToPending(rel, true)}
                    className="px-2 py-0.5 rounded text-xs font-mono transition-all"
                    style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
                    Annehmen
                  </button>
                  <button onClick={() => respondToPending(rel, false)}
                    className="px-2 py-0.5 rounded text-xs font-mono transition-all"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                    Ablehnen
                  </button>
                </div>
              )}
              {isAdmin && !isPending && (
                <button onClick={() => endRelation(rel)}
                  className="p-1 rounded transition-all hover:bg-white/5"
                  style={{ color: '#475569' }} title="Beziehung beenden">
                  <X size={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Neue Diplomatie (nur Admins) */}
      {isAdmin && (
        <div className="panel p-4 space-y-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Diplomatie initiieren</p>
          <div className="flex gap-2">
            <input value={targetName} onChange={e => setTargetName(e.target.value)}
              placeholder="Allianzname suchen..."
              className="flex-1 px-3 py-2 rounded text-sm font-mono"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && searchTarget()} />
            <button onClick={searchTarget} disabled={searching}
              className="px-3 py-2 rounded text-sm font-mono transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b' }}>
              <Search size={14} />
            </button>
          </div>
          {targetAlliance && (
            <div className="px-3 py-3 rounded-lg space-y-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm font-mono text-slate-200">
                [{targetAlliance.tag}] {targetAlliance.name}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => sendDiplomacy('war')} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                  <Swords size={11} /> Krieg erklären
                </button>
                <button onClick={() => sendDiplomacy('allied')} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80' }}>
                  <Heart size={11} /> Bündnisanfrage
                </button>
                <button onClick={() => sendDiplomacy('nap')} disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
                  <Flag size={11} /> NAP anbieten
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diplomatie-Log */}
      {dipLog.length > 0 && (
        <div className="panel p-4 space-y-2">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-2">Verlauf</p>
          {dipLog.map(entry => (
            <div key={entry.id} className="flex items-start gap-3 text-xs font-mono py-1.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <span className="text-slate-600 flex-shrink-0">{timeAgo(entry.created_at)}</span>
              <span className="text-slate-400">{entry.message ?? `${entry.event_type} mit ${entry.other_alliance_name}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── HQ Tab ───────────────────────────────────────────────────────────────────

function HQTab({ alliance }) {
  return (
    <div className="panel p-8 text-center space-y-4">
      <Building2 size={40} className="mx-auto" style={{ color: alliance.hq_founded ? '#22d3ee' : '#334155' }} />
      <div>
        <p className="font-mono font-semibold text-slate-200">Allianz-Hauptquartier</p>
        <p className="text-xs font-mono text-slate-600 mt-1">
          {alliance.hq_founded
            ? `Stationiert bei ${alliance.hq_x} / ${alliance.hq_y} / ${alliance.hq_z}`
            : 'Noch nicht gegründet.'}
        </p>
      </div>
      <a href="#/alliance/hq"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-mono font-semibold transition-all"
        style={{
          background: 'rgba(34,211,238,0.1)',
          border: '1px solid rgba(34,211,238,0.3)',
          color: '#22d3ee',
        }}>
        <Building2 size={14} />
        {alliance.hq_founded ? 'Zum Allianz-HQ' : 'HQ gründen'}
      </a>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AlliancePage() {
  const { player, refreshPlayer } = useGameStore()
  const queryClient = useQueryClient()
  const [mode, setMode]   = useState(null) // null | 'create' | 'search'
  const [leftAlliance, setLeftAlliance] = useState(false)

  const { data: alliance, isLoading } = useMyAlliance(player)
  const { data: membership } = useMyMembership(alliance?.id, player?.id)

  // Wenn Spieler schon in einer Allianz ist → direkt anzeigen
  const inAlliance = !!player?.alliance_id && !leftAlliance

  if (isLoading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 font-mono text-sm">Lade...</div>
  )

  if (inAlliance && alliance) {
    return (
      <div className="max-w-4xl mx-auto">
        <AllianceView
          alliance={alliance}
          player={player}
          membership={membership}
          onLeft={() => {
            setLeftAlliance(true)
            queryClient.invalidateQueries(['my-alliance'])
            refreshPlayer?.()
          }}
        />
      </div>
    )
  }

  // Kein Mitglied — Auswahl anzeigen
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Allianz</h2>
        <p className="text-sm font-mono text-slate-500 mt-1">Du bist derzeit in keiner Allianz.</p>
      </div>

      <AnimatePresence mode="wait">
        {!mode && (
          <motion.div key="choice"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => setMode('create')}
              className="panel p-8 text-left space-y-3 transition-all hover:border-cyan-500/30 group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
                <Plus size={22} style={{ color: '#22d3ee' }} />
              </div>
              <div>
                <p className="font-display font-bold text-lg text-slate-100 group-hover:text-cyan-400 transition-colors">
                  Allianz gründen
                </p>
                <p className="text-xs font-mono text-slate-600 mt-1">
                  Erstelle eine neue Allianz und werde ihr Gründer.
                </p>
              </div>
            </button>

            <button onClick={() => setMode('search')}
              className="panel p-8 text-left space-y-3 transition-all hover:border-cyan-500/30 group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
                <Search size={22} style={{ color: '#22d3ee' }} />
              </div>
              <div>
                <p className="font-display font-bold text-lg text-slate-100 group-hover:text-cyan-400 transition-colors">
                  Allianz suchen
                </p>
                <p className="text-xs font-mono text-slate-600 mt-1">
                  Suche nach bestehenden Allianzen und bewirb dich.
                </p>
              </div>
            </button>
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div key="create"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <button onClick={() => setMode(null)}
              className="flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-4">
              <ChevronLeft size={12} /> Zurück
            </button>
            <CreateAllianceForm player={player} onCreated={(a) => {
              setLeftAlliance(false)
              queryClient.invalidateQueries(['my-alliance'])
              queryClient.invalidateQueries(['player'])
            }} />
          </motion.div>
        )}

        {mode === 'search' && (
          <motion.div key="search"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <button onClick={() => setMode(null)}
              className="flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors mb-4">
              <ChevronLeft size={12} /> Zurück
            </button>
            <SearchAlliance player={player} onJoined={() => {
              queryClient.invalidateQueries(['my-alliance'])
              queryClient.invalidateQueries(['player'])
            }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
