// src/components/chat/ChatPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { Send, MessageSquare } from 'lucide-react'

export default function ChatPanel() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [tab, setTab] = useState('global')
  const { player } = useGameStore()
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!player) return
    // Load recent messages
    supabase.from('chat_messages')
      .select('*, players(username)')
      .eq('channel', 'global')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setMessages((data ?? []).reverse())
      })

    // Subscribe to new messages
    const channel = supabase.channel('chat-global')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: 'channel=eq.global'
      }, async (payload) => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('*, players(username)')
          .eq('id', payload.new.id)
          .single()
        if (msg) setMessages(prev => [...prev.slice(-99), msg])
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [player?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || !player) return
    const content = input.trim()
    setInput('')
    await supabase.from('chat_messages').insert({
      channel: 'global',
      sender_id: player.id,
      content
    })
  }

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col border-l border-cyan-500/15"
      style={{ background: 'rgba(4,13,26,0.97)' }}>
      {/* Header */}
      <div className="panel-header border-b border-cyan-500/15">
        <MessageSquare size={13} />
        <span>Chat</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-cyan-500/10">
        {['global', 'allianz'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs font-display uppercase tracking-wider transition-colors
              ${tab === t ? 'text-cyan-400 bg-cyan-500/5' : 'text-slate-600 hover:text-slate-400'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {messages.map(msg => (
          <div key={msg.id} className="text-xs leading-relaxed">
            <span className="font-semibold"
              style={{ color: msg.sender_id === player?.id ? '#22d3ee' : '#94a3b8' }}>
              {msg.players?.username ?? 'Unbekannt'}
            </span>
            <span className="text-slate-500 mx-1">:</span>
            <span className="text-slate-300">{msg.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-cyan-500/10 flex gap-1.5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Nachricht..."
          maxLength={500}
          className="flex-1 text-xs px-2 py-1.5 rounded outline-none"
          style={{
            background: 'rgba(7,20,40,0.8)',
            border: '1px solid rgba(34,211,238,0.15)',
            color: '#e2e8f0'
          }}
        />
        <button onClick={sendMessage}
          className="p-1.5 rounded transition-colors hover:bg-cyan-500/10"
          style={{ border: '1px solid rgba(34,211,238,0.2)' }}>
          <Send size={12} className="text-cyan-500" />
        </button>
      </div>
    </aside>
  )
}
