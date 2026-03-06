// src/components/chat/ChatPanel.jsx — v1.0
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { MessageSquare, X, Send, ChevronDown, Mail } from 'lucide-react'

const MAX_LENGTH = 500

// ─── SQL benötigt: ────────────────────────────────────────────────────────────
// chat_messages: id, channel, sender_id, receiver_id, content, created_at
// + players: id, username (für Absender-Namen)

function fmt(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

// ─── DM Inbox ─────────────────────────────────────────────────────────────────
function DMList({ playerId, onOpen, onClose }) {
  const [partners, setPartners] = useState([])
  const [players, setPlayers] = useState([])
  const [search, setSearch] = useState('')
  const [unread, setUnread] = useState({})

  useEffect(() => {
    if (!playerId) return
    // Alle DM-Partner laden
    const load = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('sender_id, receiver_id, created_at')
        .eq('channel', 'dm')
        .or(`sender_id.eq.${playerId},receiver_id.eq.${playerId}`)
        .order('created_at', { ascending: false })

      if (!data) return
      const seen = new Set()
      const ps = []
      for (const m of data) {
        const other = m.sender_id === playerId ? m.receiver_id : m.sender_id
        if (!seen.has(other)) { seen.add(other); ps.push(other) }
      }
      setPartners(ps)

      // Spielernamen holen
      if (ps.length) {
        const { data: pData } = await supabase.from('players').select('id, username').in('id', ps)
        setPlayers(pData ?? [])
      }
    }
    load()
  }, [playerId])

  // Alle Spieler für Suche
  useEffect(() => {
    if (!search) return
    const t = setTimeout(async () => {
      const { data } = await supabase.from('players')
        .select('id, username')
        .ilike('username', `%${search}%`)
        .neq('id', playerId)
        .limit(8)
      setPlayers(prev => {
        const ids = new Set(prev.map(p => p.id))
        return [...prev, ...(data ?? []).filter(p => !ids.has(p.id))]
      })
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const getName = (id) => players.find(p => p.id === id)?.username ?? id.slice(0, 8)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-1">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Spieler suchen..."
          className="w-full text-xs font-mono rounded px-2 py-1.5"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#cbd5e1', outline: 'none'
          }}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {partners.length === 0 && !search && (
          <p className="text-xs text-slate-600 font-mono text-center py-4">
            Noch keine Direktnachrichten
          </p>
        )}
        {/* Suchergebnisse (nicht bereits vorhandene Partner) */}
        {search && players
          .filter(p => !partners.includes(p.id) && p.username.toLowerCase().includes(search.toLowerCase()))
          .map(p => (
            <button key={p.id} onClick={() => onOpen(p.id, p.username)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors"
              style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.1)' }}>
              <span className="text-xs font-mono text-cyan-400">+</span>
              <span className="text-xs font-mono text-slate-300">{p.username}</span>
            </button>
          ))
        }
        {/* Bestehende Partner */}
        {partners.map(id => (
          <button key={id} onClick={() => onOpen(id, getName(id))}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors hover:bg-white/5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22d3ee' }} />
            <span className="text-xs font-mono text-slate-300 flex-1 truncate">{getName(id)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Chat Window ───────────────────────────────────────────────────────────────
function ChatWindow({ channel, dmTarget, dmName, playerId, username }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [players, setPlayers] = useState({})
  const bottomRef = useRef(null)

  const isGlobal = channel === 'global'

  // Initiales Laden
  useEffect(() => {
    if (!playerId) return
    const load = async () => {
      let q = supabase.from('chat_messages')
        .select('id, sender_id, receiver_id, content, created_at')
        .eq('channel', channel)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!isGlobal) {
        q = q.or(
          `and(sender_id.eq.${playerId},receiver_id.eq.${dmTarget}),and(sender_id.eq.${dmTarget},receiver_id.eq.${playerId})`
        )
      }

      const { data } = await q
      const msgs = (data ?? []).reverse()
      setMessages(msgs)

      // Spielernamen laden
      const ids = [...new Set(msgs.map(m => m.sender_id))]
      if (ids.length) {
        const { data: pData } = await supabase.from('players').select('id, username').in('id', ids)
        const map = {}
        for (const p of pData ?? []) map[p.id] = p.username
        setPlayers(map)
      }
    }
    load()
  }, [channel, dmTarget, playerId])

  // Realtime subscription
  useEffect(() => {
    if (!playerId) return
    const ch = supabase.channel(`chat-${channel}-${dmTarget ?? 'global'}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: isGlobal ? `channel=eq.global` : `channel=eq.dm`,
      }, async (payload) => {
        const m = payload.new
        if (!isGlobal) {
          const relevant =
            (m.sender_id === playerId && m.receiver_id === dmTarget) ||
            (m.sender_id === dmTarget && m.receiver_id === playerId)
          if (!relevant) return
        }

        // Spielername nachladen falls unbekannt
        if (!players[m.sender_id]) {
          const { data } = await supabase.from('players').select('id, username').eq('id', m.sender_id).single()
          if (data) setPlayers(prev => ({ ...prev, [data.id]: data.username }))
        }

        setMessages(prev => [...prev, m])
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [channel, dmTarget, playerId, players])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')

    const msg = {
      channel,
      sender_id: playerId,
      content: text,
      ...(isGlobal ? {} : { receiver_id: dmTarget }),
    }

    const { error } = await supabase.from('chat_messages').insert(msg)
    if (error) setInput(text) // Zurücksetzen bei Fehler
    setSending(false)
  }

  const getName = (id) => {
    if (id === playerId) return username
    return players[id] ?? id.slice(0, 8)
  }

  const getColor = (id) => {
    // Konsistente Farbe pro Spieler
    const colors = ['#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#fbbf24', '#38bdf8']
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % colors.length
    return colors[hash]
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-slate-600 font-mono text-center py-6">
            {isGlobal ? 'Noch keine Nachrichten im globalen Chat.' : `Beginne eine Unterhaltung mit ${dmName}.`}
          </p>
        )}
        {messages.map((m, i) => {
          const isMine = m.sender_id === playerId
          const name = getName(m.sender_id)
          const color = getColor(m.sender_id)
          const showName = !isMine && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id)
          return (
            <div key={m.id ?? i} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
              {showName && (
                <span className="text-xs font-mono mb-0.5 px-1" style={{ color }}>{name}</span>
              )}
              <div className="flex items-end gap-1.5" style={{ flexDirection: isMine ? 'row-reverse' : 'row' }}>
                <div className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs font-mono leading-relaxed"
                  style={{
                    background: isMine ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.05)',
                    border: isMine ? '1px solid rgba(34,211,238,0.2)' : '1px solid rgba(255,255,255,0.07)',
                    color: isMine ? '#e2e8f0' : '#cbd5e1',
                    wordBreak: 'break-word',
                  }}>
                  {m.content}
                </div>
                <span className="text-xs font-mono flex-shrink-0 pb-0.5" style={{ color: '#334155', fontSize: 9 }}>
                  {fmt(m.created_at)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-2 pb-2 pt-1 flex items-center gap-1.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={isGlobal ? 'Nachricht...' : `An ${dmName}...`}
          className="flex-1 text-xs font-mono rounded px-2 py-1.5 min-w-0"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#e2e8f0', outline: 'none',
          }}
        />
        <button onClick={send} disabled={!input.trim() || sending}
          className="flex-shrink-0 p-1.5 rounded transition-all"
          style={{
            background: input.trim() ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${input.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: input.trim() ? '#22d3ee' : '#334155',
          }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────
export default function ChatPanel() {
  const { player } = useGameStore()
  const [open, setOpen] = useState(true)
  const [tab, setTab] = useState('global') // 'global' | 'dms' | 'dm:<id>'
  const [dmTarget, setDmTarget] = useState(null)
  const [dmName, setDmName] = useState('')
  const [unreadGlobal, setUnreadGlobal] = useState(0)
  const lastSeenRef = useRef(new Date().toISOString())

  // Unread-Counter für globalen Chat wenn geschlossen
  useEffect(() => {
    if (!player) return
    const ch = supabase.channel('chat-unread-global')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: 'channel=eq.global',
      }, (payload) => {
        if (payload.new.sender_id === player.id) return
        if (tab !== 'global' || !open) {
          setUnreadGlobal(n => n + 1)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [player, tab, open])

  const openDM = (id, name) => {
    setDmTarget(id)
    setDmName(name)
    setTab('dm')
  }

  if (!player) return null

  const TABS = [
    { id: 'global', label: 'Global', badge: unreadGlobal },
    { id: 'dms', label: 'DMs', badge: 0 },
  ]

  return (
    <div className="flex-shrink-0 flex flex-col border-l border-cyan-500/10 overflow-hidden"
      style={{
        width: open ? 260 : 36,
        background: 'linear-gradient(180deg, rgba(4,13,26,0.98) 0%, rgba(2,4,9,0.99) 100%)',
        transition: 'width 0.2s ease',
      }}>

      {/* Header */}
      <div className="flex items-center px-2 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(34,211,238,0.08)', minHeight: 38 }}>
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
          style={{ color: '#64748b' }}>
          <MessageSquare size={13} className={open ? 'text-cyan-500/60' : 'text-slate-600'} />
          {open && (
            <span className="text-xs font-mono text-slate-500 truncate">Chat</span>
          )}
        </button>
        {open && (
          <button onClick={() => setOpen(false)} className="flex-shrink-0 p-0.5 rounded hover:bg-white/5">
            <ChevronDown size={11} style={{ color: '#475569' }} />
          </button>
        )}
        {!open && unreadGlobal > 0 && (
          <div className="absolute right-1 top-1 w-2 h-2 rounded-full bg-cyan-400" />
        )}
      </div>

      {open && (
        <>
          {/* Tabs */}
          <div className="flex flex-shrink-0 px-2 pt-1.5 gap-1">
            {TABS.map(t => (
              <button key={t.id}
                onClick={() => { setTab(t.id); if (t.id === 'global') setUnreadGlobal(0) }}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-all"
                style={{
                  background: tab === t.id ? 'rgba(34,211,238,0.1)' : 'transparent',
                  border: `1px solid ${tab === t.id ? 'rgba(34,211,238,0.2)' : 'transparent'}`,
                  color: tab === t.id ? '#22d3ee' : '#475569',
                }}>
                {t.label}
                {t.badge > 0 && (
                  <span className="text-xs font-mono rounded-full px-1"
                    style={{ background: '#22d3ee', color: '#020814', fontSize: 9 }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
            {tab === 'dm' && (
              <button
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono"
                style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
                <Mail size={9} />
                {dmName}
                <span onClick={() => setTab('dms')} className="ml-0.5 cursor-pointer opacity-60 hover:opacity-100">✕</span>
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 mt-1">
            {tab === 'global' && (
              <ChatWindow
                channel="global"
                playerId={player.id}
                username={player.username}
              />
            )}
            {tab === 'dms' && (
              <DMList
                playerId={player.id}
                onOpen={openDM}
              />
            )}
            {tab === 'dm' && dmTarget && (
              <ChatWindow
                channel="dm"
                dmTarget={dmTarget}
                dmName={dmName}
                playerId={player.id}
                username={player.username}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
