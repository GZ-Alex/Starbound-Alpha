// src/pages/GovernmentPage.jsx — v1.0
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useGameStore } from '@/store/gameStore'
import { supabase } from '@/lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale, BookOpen, Gavel, UserCheck, Send, ChevronDown, ChevronUp,
  CheckCircle, Clock, X, Plus, ArrowLeft, Crown, Shield, User, Star
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

// ─── Gesetze ──────────────────────────────────────────────────────────────────

const LAWS = [
  {
    id: 'par1',
    paragraph: '§1',
    title: 'Verfahrensordnung',
    content: `Alle Klageverfahren vor dem Galaktischen Gerichtshof unterliegen dieser Verfahrensordnung. 
Eine Anklage ist nur durch registrierte Spieler zulässig. Der Angeklagte ist unverzüglich über eine eingereichte Anklage zu benachrichtigen. 
Richter sind verpflichtet, sich innerhalb von 48 Stunden nach Eingang einer Anklage zu äußern. 
Das Gericht trifft seine Entscheidungen durch Mehrheitsvotum der zugelassenen Richter. 
Jede Partei hat das Recht auf Anhörung und Vorlage von Beweismitteln.`,
  },
  {
    id: 'par2',
    paragraph: '§2',
    title: 'Richterordnung',
    content: `Das Richteramt kann ausschließlich von Konzialiaren bekleidet werden — einem Vertreter je Allianz. 
Richter sind zur Unparteilichkeit verpflichtet und dürfen in Verfahren, an denen ihre eigene Allianz beteiligt ist, nicht abstimmen. 
Die Amtszeit eines Richters endet bei Verlust des Konzialiars-Status oder durch Abwahl durch das Plenum. 
Richter dürfen Beweismittel anfordern und Zeugen befragen. 
Verstöße gegen die Richterordnung können zum Ausschluss aus dem Richteramt führen.`,
  },
  {
    id: 'par3',
    paragraph: '§3',
    title: 'Beweisordnung',
    content: `Als Beweise sind zugelassen: Kampfberichte, Flugprotokolle, Chat-Mitschnitte sowie Zeugenaussagen anderer Spieler. 
Beweise sind im Gerichtssaal als Kommentar einzureichen und müssen öffentlich nachvollziehbar sein. 
Gefälschte oder verfälschte Beweise gelten als schwere Ordnungswidrigkeit und ziehen eine Strafe nach §4 nach sich. 
Die Beweislast liegt beim Kläger. Der Angeklagte kann Gegenbeweise vorlegen.`,
  },
  {
    id: 'par4',
    paragraph: '§4',
    title: 'Strafmaßordnung',
    content: `Das Gericht kann folgende Strafen verhängen: Geldstrafe (bis zu 500.000 Credits), 
Ressourcenkonfiszierung, temporäres Angriffsveto (7–30 Tage), Kopfgeld-Freigabe oder, 
im schwersten Fall, Ausschluss aus laufenden Allianzverträgen. 
Strafen sind innerhalb von 72 Stunden zu vollziehen. 
Wiederholungstäter können mit der doppelten Strafe belegt werden.`,
  },
  {
    id: 'par5',
    paragraph: '§5',
    title: 'Raubzugverbot',
    content: `Das Kapern und Plündern von Frachtschiffen anderer Spieler ist ohne vorherige Kriegserklärung verboten. 
Raubzüge gegen Allianzmitglieder von Verbündeten sind in jedem Fall untersagt. 
Verstöße können mit Geldstrafe oder Ressourcenkonfiszierung geahndet werden. 
Ausgenommen sind Aktionen im erklärten Kriegszustand (siehe §7).`,
  },
  {
    id: 'par6',
    paragraph: '§6',
    title: 'Angriffsverbot',
    content: `Direkte militärische Angriffe auf Planeteninfrastruktur oder stationierte Flotten sind ohne gültige Kriegserklärung verboten. 
Präventivschläge gelten nicht als Rechtfertigung. 
Verstöße können mit Kopfgeld-Freigabe und temporärem Angriffsveto bestraft werden.`,
  },
  {
    id: 'par7',
    paragraph: '§7',
    title: 'Kriegsrecht',
    content: `Im erklärten Kriegszustand zwischen zwei Allianzen gelten §5 und §6 für beteiligte Parteien als ausgesetzt. 
Eine Kriegserklärung muss öffentlich angekündigt werden und tritt 24 Stunden nach Bekanntgabe in Kraft. 
Dritte Allianzen genießen weiterhin den vollen Schutz dieser Gesetze. 
Kriegsende erfordert die Zustimmung beider Parteien oder ein Gerichtsurteil. 
Zivilisten (allianzlose Spieler) sind auch im Kriegsfall nach §6 geschützt.`,
  },
]

function GesetzeTab() {
  const [open, setOpen] = useState(null)

  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">
        Galaktische Rechtsordnung — gültig für alle registrierten Systeme
      </p>
      {LAWS.map(law => (
        <motion.div
          key={law.id}
          layout
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(34,211,238,0.12)', background: 'rgba(7,20,40,0.6)' }}
        >
          <button
            className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
            style={{ background: open === law.id ? 'rgba(34,211,238,0.05)' : 'transparent' }}
            onClick={() => setOpen(open === law.id ? null : law.id)}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold"
                style={{ color: '#22d3ee', minWidth: 28 }}>{law.paragraph}</span>
              <span className="font-display text-sm text-slate-200">{law.title}</span>
            </div>
            {open === law.id
              ? <ChevronUp size={14} className="text-slate-500 flex-shrink-0" />
              : <ChevronDown size={14} className="text-slate-500 flex-shrink-0" />}
          </button>

          <AnimatePresence>
            {open === law.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="px-5 pb-5 pt-1 border-t border-cyan-500/10">
                  <p className="text-sm font-mono text-slate-400 leading-relaxed whitespace-pre-line">
                    {law.content}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Anklage-Popup ─────────────────────────────────────────────────────────────

export function AnklagenPopup({ targetPlayer, onClose }) {
  const { player } = useGameStore()
  const queryClient = useQueryClient()
  const [selectedLaws, setSelectedLaws] = useState([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const toggleLaw = (id) => {
    setSelectedLaws(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (!text.trim() || selectedLaws.length === 0) return
    setSubmitting(true)
    const paragraphs = selectedLaws.join(', ')
    await supabase.from('court_cases').insert({
      plaintiff_id: player.id,
      plaintiff_name: player.username,
      defendant_id: targetPlayer.id,
      defendant_name: targetPlayer.username,
      charges: paragraphs,
      charge_text: text.trim(),
      status: 'open',
    })
    queryClient.invalidateQueries(['court-cases'])
    setSubmitting(false)
    setDone(true)
    setTimeout(() => onClose(), 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="rounded-xl p-6 w-full max-w-lg mx-4 space-y-5"
        style={{ background: 'rgba(4,13,26,0.98)', border: '1px solid rgba(239,68,68,0.25)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={16} style={{ color: '#ef4444' }} />
            <h2 className="font-display text-sm text-slate-200">
              Anklage gegen <span style={{ color: '#ef4444' }}>{targetPlayer.username}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle size={32} className="mx-auto" style={{ color: '#4ade80' }} />
            <p className="text-sm font-mono text-slate-400">Anklage eingereicht.</p>
          </div>
        ) : (
          <>
            {/* Paragraphen-Auswahl */}
            <div>
              <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-widest">
                Verletzte Paragraphen (Mehrfachauswahl)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {LAWS.map(law => (
                  <button
                    key={law.id}
                    onClick={() => toggleLaw(law.paragraph)}
                    className="flex items-center gap-2 px-3 py-2 rounded text-left transition-all text-xs font-mono"
                    style={{
                      background: selectedLaws.includes(law.paragraph)
                        ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedLaws.includes(law.paragraph)
                        ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      color: selectedLaws.includes(law.paragraph) ? '#fca5a5' : '#64748b',
                    }}
                  >
                    <span style={{ color: selectedLaws.includes(law.paragraph) ? '#ef4444' : '#475569', fontWeight: 700 }}>
                      {law.paragraph}
                    </span>
                    {law.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Anklageschrift */}
            <div>
              <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-widest">Anklageschrift</p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value.slice(0, 1000))}
                rows={4}
                placeholder="Beschreibe den Sachverhalt und die Beweise..."
                className="w-full px-3 py-2 rounded text-sm font-mono resize-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#e2e8f0', outline: 'none'
                }}
              />
              <p className="text-xs font-mono text-slate-700 text-right mt-1">{text.length}/1000</p>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={onClose}
                className="px-4 py-2 rounded text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors">
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || selectedLaws.length === 0 || !text.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono transition-all"
                style={{
                  background: (selectedLaws.length > 0 && text.trim()) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${(selectedLaws.length > 0 && text.trim()) ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  color: (selectedLaws.length > 0 && text.trim()) ? '#fca5a5' : '#334155',
                }}
              >
                <Scale size={12} />
                Anklage einreichen
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

// ─── Gerichtssaal ─────────────────────────────────────────────────────────────

function CourtRoom({ caseData, onBack }) {
  const { player } = useGameStore()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [defense, setDefense] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [submittingDefense, setSubmittingDefense] = useState(false)

  // Load judges
  const { data: judges = [] } = useQuery({
    queryKey: ['judges'],
    queryFn: async () => {
      const { data } = await supabase.from('court_judges').select('*, players(username)').eq('active', true)
      return data ?? []
    },
    staleTime: 30000,
  })

  // Load comments
  const { data: comments = [] } = useQuery({
    queryKey: ['court-comments', caseData.id],
    queryFn: async () => {
      const { data } = await supabase.from('court_comments')
        .select('*, players(username)')
        .eq('case_id', caseData.id)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    refetchInterval: 15000,
  })

  const isJudge = judges.some(j => j.player_id === player?.id)
  const isPlaintiff = caseData.plaintiff_id === player?.id
  const isDefendant = caseData.defendant_id === player?.id
  const canComment = isJudge || isPlaintiff || isDefendant

  const handleComment = async () => {
    if (!comment.trim() || !canComment) return
    setSubmittingComment(true)
    const role = isJudge ? 'judge' : isPlaintiff ? 'plaintiff' : 'defendant'
    await supabase.from('court_comments').insert({
      case_id: caseData.id,
      player_id: player.id,
      role,
      content: comment.trim(),
    })
    setComment('')
    queryClient.invalidateQueries(['court-comments', caseData.id])
    setSubmittingComment(false)
  }

  const handleDefenseSubmit = async () => {
    if (!defense.trim() || !isDefendant) return
    setSubmittingDefense(true)
    await supabase.from('court_cases').update({ defense_text: defense.trim() })
      .eq('id', caseData.id)
    queryClient.invalidateQueries(['court-cases'])
    setSubmittingDefense(false)
  }

  const isOpen = caseData.status === 'open'

  const ROLE_COLORS = {
    judge: '#f59e0b',
    plaintiff: '#ef4444',
    defendant: '#38bdf8',
  }
  const ROLE_LABELS = {
    judge: 'Richter',
    plaintiff: 'Kläger',
    defendant: 'Beklagter',
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors">
        <ArrowLeft size={12} /> Zurück zur Übersicht
      </button>

      {/* Status + Richter */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: isOpen ? 'rgba(251,191,36,0.1)' : 'rgba(100,116,139,0.1)',
              border: `1px solid ${isOpen ? 'rgba(251,191,36,0.3)' : 'rgba(100,116,139,0.2)'}`,
            }}>
            {isOpen
              ? <Clock size={13} style={{ color: '#fbbf24' }} />
              : <CheckCircle size={13} style={{ color: '#64748b' }} />}
            <span className="text-xs font-mono font-semibold"
              style={{ color: isOpen ? '#fbbf24' : '#64748b' }}>
              {isOpen ? 'Verhandlung Offen' : 'Abgeschlossen'}
            </span>
          </div>
        </div>

        {judges.length > 0 && (
          <div>
            <p className="text-xs font-mono text-slate-600 text-center mb-2 uppercase tracking-widest">Richterbank</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {judges.map(j => (
                <span key={j.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                  <Gavel size={10} />
                  {j.players?.username ?? '—'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Kläger vs. Beklagter */}
      <div className="grid grid-cols-2 gap-4">
        {/* Kläger */}
        <div className="panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Kläger</span>
          </div>
          <p className="font-display text-sm text-slate-200">{caseData.plaintiff_name}</p>
          <div className="text-xs font-mono text-slate-500 mb-1">Verstöße: <span style={{ color: '#fca5a5' }}>{caseData.charges}</span></div>
          <p className="text-sm font-mono text-slate-400 leading-relaxed">{caseData.charge_text}</p>
        </div>

        {/* Beklagter */}
        <div className="panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#38bdf8' }} />
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">Beklagter</span>
          </div>
          <p className="font-display text-sm text-slate-200">{caseData.defendant_name}</p>
          {caseData.defense_text ? (
            <p className="text-sm font-mono text-slate-400 leading-relaxed">{caseData.defense_text}</p>
          ) : (
            <p className="text-xs font-mono text-slate-600 italic">Noch keine Verteidigungsschrift eingereicht.</p>
          )}
          {isDefendant && !caseData.defense_text && (
            <div className="space-y-2 pt-2 border-t border-white/5">
              <textarea
                value={defense}
                onChange={e => setDefense(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="Verteidigungsschrift einreichen..."
                className="w-full px-3 py-2 rounded text-xs font-mono resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(56,189,248,0.2)', color: '#e2e8f0', outline: 'none' }}
              />
              <button onClick={handleDefenseSubmit} disabled={submittingDefense || !defense.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                style={{
                  background: defense.trim() ? 'rgba(56,189,248,0.1)' : 'transparent',
                  border: `1px solid ${defense.trim() ? 'rgba(56,189,248,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: defense.trim() ? '#7dd3fc' : '#334155',
                }}>
                <Send size={10} /> Einreichen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Kommentarfeld */}
      <div className="panel p-5 space-y-4">
        <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Gerichtssaal-Protokoll</p>

        {/* Comments */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="px-3 py-3 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${ROLE_COLORS[c.role] ?? '#334155'}22` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold" style={{ color: ROLE_COLORS[c.role] ?? '#64748b' }}>
                    {c.players?.username ?? '—'}
                  </span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: `${ROLE_COLORS[c.role] ?? '#334155'}18`, color: ROLE_COLORS[c.role] ?? '#64748b', fontSize: 10 }}>
                    {ROLE_LABELS[c.role] ?? c.role}
                  </span>
                </div>
                <span className="text-xs font-mono text-slate-700">{timeAgo(c.created_at)}</span>
              </div>
              <p className="text-sm font-mono text-slate-300 leading-relaxed">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-sm font-mono text-slate-700 text-center py-6">Noch keine Einträge im Protokoll.</p>
          )}
        </div>

        {/* Input */}
        {canComment ? (
          <div className="flex gap-2 border-t border-white/5 pt-4">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 500))}
              rows={2}
              placeholder={isJudge ? 'Als Richter kommentieren...' : isPlaintiff ? 'Als Kläger kommentieren...' : 'Als Beklagter kommentieren...'}
              className="flex-1 px-3 py-2 rounded text-sm font-mono resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', outline: 'none' }}
            />
            <button onClick={handleComment} disabled={submittingComment || !comment.trim()}
              className="px-3 self-end py-2 rounded transition-all flex-shrink-0"
              style={{
                background: comment.trim() ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${comment.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: comment.trim() ? '#22d3ee' : '#334155',
              }}>
              <Send size={14} />
            </button>
          </div>
        ) : (
          <p className="text-xs font-mono text-slate-700 italic border-t border-white/5 pt-3">
            Nur Richter, Kläger und Beklagter dürfen Kommentare verfassen.
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Gericht Tab ──────────────────────────────────────────────────────────────

function GerichtTab() {
  const [openRoom, setOpenRoom] = useState(null)

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['court-cases'],
    queryFn: async () => {
      const { data } = await supabase.from('court_cases')
        .select('*')
        .order('created_at', { ascending: false })
      return data ?? []
    },
    refetchInterval: 30000,
  })

  if (openRoom) {
    return (
      <CourtRoom
        caseData={openRoom}
        onBack={() => setOpenRoom(null)}
      />
    )
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
        Aktive und abgeschlossene Verfahren
      </p>

      {isLoading && (
        <p className="text-sm font-mono text-slate-600 text-center py-8">Lade Verfahren...</p>
      )}

      {!isLoading && cases.length === 0 && (
        <div className="panel p-8 text-center">
          <Scale size={28} className="mx-auto mb-3" style={{ color: '#334155' }} />
          <p className="text-sm font-mono text-slate-600">Keine laufenden Verfahren.</p>
          <p className="text-xs font-mono text-slate-700 mt-1">
            Klage einreichen über das Spielerprofil eines anderen Spielers.
          </p>
        </div>
      )}

      {cases.map(c => {
        const isOpen = c.status === 'open'
        return (
          <div key={c.id} className="panel p-5 space-y-3">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {/* Kläger */}
              <div className="space-y-1">
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Kläger</p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#fca5a5' }}>{c.plaintiff_name}</p>
                <p className="text-xs font-mono text-slate-500 line-clamp-3">{c.charge_text}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.charges?.split(', ').map(p => (
                    <span key={p} className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* VS */}
              <div className="flex items-center justify-center pt-3">
                <Scale size={18} style={{ color: '#334155' }} />
              </div>

              {/* Beklagter */}
              <div className="space-y-1">
                <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Beklagter</p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#7dd3fc' }}>{c.defendant_name}</p>
                {c.defense_text
                  ? <p className="text-xs font-mono text-slate-500 line-clamp-3">{c.defense_text}</p>
                  : <p className="text-xs font-mono text-slate-700 italic">Keine Verteidigungsschrift</p>
                }
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/5 pt-3 flex-wrap gap-2">
              <div className="flex items-center gap-4">
                {/* Status */}
                <div className="flex items-center gap-1.5">
                  {isOpen
                    ? <Clock size={11} style={{ color: '#fbbf24' }} />
                    : <CheckCircle size={11} style={{ color: '#4ade80' }} />}
                  <span className="text-xs font-mono"
                    style={{ color: isOpen ? '#fbbf24' : '#4ade80' }}>
                    {isOpen ? 'Verhandlung Offen' : 'Abgeschlossen'}
                  </span>
                </div>
                {/* Dates */}
                <span className="text-xs font-mono text-slate-700">
                  Eingereicht: {fmtDate(c.created_at)}
                </span>
                {c.verdict_at && (
                  <span className="text-xs font-mono text-slate-700">
                    Urteil: {fmtDate(c.verdict_at)}
                  </span>
                )}
              </div>

              <button
                onClick={() => setOpenRoom(c)}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-all"
                style={{
                  background: 'rgba(34,211,238,0.08)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  color: '#22d3ee',
                }}>
                <Gavel size={11} />
                Gerichtssaal betreten
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Richter Tab ──────────────────────────────────────────────────────────────

function RichterTab() {
  const { player } = useGameStore()
  const queryClient = useQueryClient()
  const [applying, setApplying] = useState(false)
  const [appText, setAppText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load current judges
  const { data: judges = [] } = useQuery({
    queryKey: ['judges'],
    queryFn: async () => {
      const { data } = await supabase.from('court_judges')
        .select('*, players(username, alliance_id)')
        .eq('active', true)
        .order('created_at', { ascending: true })
      return data ?? []
    },
    staleTime: 30000,
  })

  // Load applications
  const { data: applications = [] } = useQuery({
    queryKey: ['judge-applications'],
    queryFn: async () => {
      const { data } = await supabase.from('judge_applications')
        .select('*, players(username, alliance_id)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      return data ?? []
    },
    staleTime: 30000,
  })

  // Check if player is konziliar
  const { data: myMembership } = useQuery({
    queryKey: ['my-alliance-membership', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('alliance_members')
        .select('rank, alliance_id')
        .eq('player_id', player.id)
        .single()
      return data
    },
    enabled: !!player?.id,
    staleTime: 30000,
  })

  const isKonziliar = myMembership?.rank === 'konziliar'
  const isAlreadyJudge = judges.some(j => j.player_id === player?.id)
  const hasApplied = applications.some(a => a.player_id === player?.id)

  const handleApply = async () => {
    if (!appText.trim() || !isKonziliar) return
    setSubmitting(true)
    await supabase.from('judge_applications').insert({
      player_id: player.id,
      motivation: appText.trim(),
      status: 'pending',
    })
    setAppText('')
    setApplying(false)
    queryClient.invalidateQueries(['judge-applications'])
    setSubmitting(false)
  }

  const handleVote = async (applicationId, applicantId, approved) => {
    if (!isKonziliar) return
    await supabase.from('judge_votes').insert({
      application_id: applicationId,
      voter_id: player.id,
      approved,
    })
    // Check if majority achieved (simplified: auto-approve after first konziliar vote for demo)
    if (approved) {
      await supabase.from('court_judges').insert({
        player_id: applicantId,
        active: true,
      })
      await supabase.from('judge_applications').update({ status: 'approved' }).eq('id', applicationId)
    } else {
      await supabase.from('judge_applications').update({ status: 'rejected' }).eq('id', applicationId)
    }
    queryClient.invalidateQueries(['judge-applications'])
    queryClient.invalidateQueries(['judges'])
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Info */}
      <div className="panel p-5 space-y-3"
        style={{ border: '1px solid rgba(245,158,11,0.15)' }}>
        <div className="flex items-center gap-2">
          <Gavel size={14} style={{ color: '#f59e0b' }} />
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Richteramt</p>
        </div>
        <p className="text-sm font-mono text-slate-400 leading-relaxed">
          Das Richteramt steht ausschließlich <span style={{ color: '#fcd34d' }}>Konzialiaren</span> offen —
          einem Vertreter je Allianz. Nur Konziliare dürfen abstimmen und Bewerbungen einreichen.
          Richter sind zur Unparteilichkeit verpflichtet.
        </p>
        {!isKonziliar && (
          <div className="flex items-center gap-2 px-3 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', color: '#64748b' }}>
            <Shield size={11} />
            Du bist kein Konziliar. Bewerbungen erfordern den Rang Konziliar in einer Allianz.
          </div>
        )}
      </div>

      {/* Aktive Richter */}
      <div className="space-y-3">
        <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Aktive Richter</p>
        {judges.length === 0 && (
          <p className="text-sm font-mono text-slate-700 text-center py-4">Noch keine Richter ernannt.</p>
        )}
        {judges.map(j => (
          <div key={j.id} className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <Gavel size={14} style={{ color: '#f59e0b' }} />
            <span className="text-sm font-mono text-slate-200">{j.players?.username ?? '—'}</span>
            <span className="ml-auto text-xs font-mono text-slate-600">
              seit {fmtDate(j.created_at)}
            </span>
          </div>
        ))}
      </div>

      {/* Bewerbungen */}
      {applications.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest">Offene Bewerbungen</p>
          {applications.map(app => (
            <div key={app.id} className="panel p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-slate-200">{app.players?.username ?? '—'}</span>
                <span className="text-xs font-mono text-slate-700">{timeAgo(app.created_at)}</span>
              </div>
              <p className="text-xs font-mono text-slate-500 leading-relaxed">{app.motivation}</p>
              {isKonziliar && app.player_id !== player?.id && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleVote(app.id, app.player_id, true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}>
                    <CheckCircle size={11} /> Bestätigen
                  </button>
                  <button onClick={() => handleVote(app.id, app.player_id, false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                    <X size={11} /> Ablehnen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bewerben */}
      {isKonziliar && !isAlreadyJudge && !hasApplied && (
        <div className="panel p-5 space-y-3">
          <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">Bewerbung einreichen</p>
          {applying ? (
            <>
              <textarea
                value={appText}
                onChange={e => setAppText(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Begründe deine Bewerbung als Richter..."
                className="w-full px-3 py-2 rounded text-sm font-mono resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,158,11,0.2)', color: '#e2e8f0', outline: 'none' }}
              />
              <div className="flex gap-2">
                <button onClick={() => setApplying(false)}
                  className="px-3 py-1.5 rounded text-xs font-mono text-slate-600 hover:text-slate-400 transition-colors">
                  Abbrechen
                </button>
                <button onClick={handleApply} disabled={submitting || !appText.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 rounded text-xs font-mono transition-all"
                  style={{
                    background: appText.trim() ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${appText.trim() ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    color: appText.trim() ? '#fcd34d' : '#334155',
                  }}>
                  <Star size={11} /> Bewerbung einreichen
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setApplying(true)}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono transition-all"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
              <Plus size={12} /> Als Richter bewerben
            </button>
          )}
        </div>
      )}

      {hasApplied && (
        <div className="panel p-4">
          <p className="text-xs font-mono text-slate-500 italic">Deine Bewerbung ist eingereicht und wartet auf Abstimmung.</p>
        </div>
      )}
      {isAlreadyJudge && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Gavel size={13} style={{ color: '#f59e0b' }} />
          <span className="text-xs font-mono" style={{ color: '#fcd34d' }}>Du bist aktiver Richter.</span>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'gesetze', label: 'Gesetze', icon: BookOpen },
  { id: 'gericht', label: 'Gericht', icon: Scale },
  { id: 'richter', label: 'Richter', icon: Gavel },
]

export default function GovernmentPage() {
  const { player, buildings } = useGameStore()
  const [tab, setTab] = useState('gesetze')

  // Get government building level
  const govLevel = buildings?.find(b => b.building_id === 'government')?.level ?? 0
  const creditsPerHour = govLevel * 1000

  if (govLevel === 0) {
    return (
      <div className="max-w-lg mx-auto mt-16">
        <div className="panel p-8 text-center space-y-3">
          <Scale size={32} className="mx-auto" style={{ color: '#334155' }} />
          <h2 className="font-display text-slate-400">Regierungssitz nicht errichtet</h2>
          <p className="text-sm font-mono text-slate-600">
            Baue den Regierungssitz auf deinem Planeten, um auf die galaktische Rechtsordnung zuzugreifen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="panel p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Scale size={18} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h1 className="font-display text-base text-slate-200">Regierungssitz</h1>
            <p className="text-xs font-mono text-slate-600">Level {govLevel}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono text-slate-600 uppercase tracking-widest mb-0.5">Steuereinnahmen</p>
          <p className="text-sm font-mono font-semibold" style={{ color: '#fbbf24' }}>
            +{creditsPerHour.toLocaleString('de-DE')} Credits/h
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-mono transition-all relative"
            style={{
              color: tab === id ? '#22d3ee' : '#475569',
              borderBottom: tab === id ? '2px solid #22d3ee' : '2px solid transparent',
              background: 'transparent',
              marginBottom: -1,
            }}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'gesetze' && <GesetzeTab />}
          {tab === 'gericht' && <GerichtTab />}
          {tab === 'richter' && <RichterTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
