// src/components/BattleAnimation.jsx — v1.0
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react'

// ─── Konstanten ───────────────────────────────────────────────────────────────

const WEAPON_COLORS = {
  laser:   { beam: '#ef4444', glow: '#fca5a5' },  // rot
  ion:     { beam: '#60a5fa', glow: '#bfdbfe' },  // blau
  railgun: { beam: '#a78bfa', glow: '#ddd6fe' },  // lila — schnelles Projektil
  plasma:  { beam: '#f97316', glow: '#fed7aa' },  // orange — langsames Projektil
  torpedo: { beam: '#4ade80', glow: '#bbf7d0' },  // grün — Rakete
}

const WEAPON_STYLE = {
  laser:   'beam',      // Strahl: sofort
  ion:     'beam',      // Strahl: sofort
  railgun: 'projectile_fast',  // Projektil: sehr schnell
  plasma:  'projectile_slow',  // Projektil: langsam
  torpedo: 'missile',   // Rakete: kurvenflug
}

const CLASS_SHAPES = {
  Z: { shape: 'circle',   size: 10, color: '#94a3b8' },
  A: { shape: 'rect',     size: 18, color: '#34d399' },  // Frachter: breites Rechteck
  B: { shape: 'triangle', size: 12, color: '#38bdf8' },  // Scout/Jäger: spitzer Pfeil
  C: { shape: 'triangle', size: 15, color: '#a78bfa' },  // Mittlerer Jäger
  D: { shape: 'diamond',  size: 17, color: '#fb923c' },  // Kreuzer: Raute
  E: { shape: 'hexagon',  size: 20, color: '#f472b6' },  // Zerstörer/Schlachtschiff
}

// ─── Canvas-Zeichenfunktionen ──────────────────────────────────────────────────

function drawShip(ctx, x, y, cls, hp, maxHp, isPlayer, isDestroyed, label) {
  const cfg = CLASS_SHAPES[cls] ?? CLASS_SHAPES.B
  const alpha = isDestroyed ? 0.15 : 1.0
  ctx.globalAlpha = alpha

  const hpPct = maxHp > 0 ? hp / maxHp : 0
  const shipColor = isDestroyed ? '#334155'
    : hpPct > 0.6 ? cfg.color
    : hpPct > 0.25 ? '#fbbf24'
    : '#ef4444'

  ctx.save()
  ctx.translate(x, y)
  if (!isPlayer) ctx.rotate(Math.PI)  // Feinde zeigen nach unten

  // Schiff zeichnen
  ctx.fillStyle = shipColor
  ctx.strokeStyle = isDestroyed ? '#1e293b' : '#ffffff22'
  ctx.lineWidth = 1

  const s = cfg.size
  ctx.beginPath()
  if (cfg.shape === 'triangle') {
    ctx.moveTo(0, -s)
    ctx.lineTo(-s * 0.65, s * 0.6)
    ctx.lineTo(s * 0.65, s * 0.6)
    ctx.closePath()
  } else if (cfg.shape === 'diamond') {
    ctx.moveTo(0, -s)
    ctx.lineTo(s * 0.7, 0)
    ctx.lineTo(0, s)
    ctx.lineTo(-s * 0.7, 0)
    ctx.closePath()
  } else if (cfg.shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6
      if (i === 0) ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s)
      else ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s)
    }
    ctx.closePath()
  } else if (cfg.shape === 'rect') {
    ctx.rect(-s * 0.8, -s * 0.4, s * 1.6, s * 0.8)
  } else {
    ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2)
  }
  ctx.fill()
  ctx.stroke()

  // HP-Balken
  ctx.rotate(isPlayer ? 0 : Math.PI)  // Balken immer gleich ausrichten
  if (!isDestroyed) {
    const bw = s * 1.8, bh = 3
    const bx = -bw / 2, by = s + 4
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = hpPct > 0.6 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444'
    ctx.fillRect(bx, by, bw * Math.max(0, hpPct), bh)
  }

  ctx.restore()
  ctx.globalAlpha = 1.0

  // Label
  if (label && !isDestroyed) {
    ctx.fillStyle = '#64748b'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(label, x, y + cfg.size + 16)
  }
}

function drawBeam(ctx, x1, y1, x2, y2, color, glow, progress) {
  // Strahl von (x1,y1) zu (x2,y2), progress 0→1 steuert Sichtbarkeit
  const alpha = progress < 0.3 ? progress / 0.3 : progress > 0.7 ? (1 - progress) / 0.3 : 1.0
  ctx.globalAlpha = alpha * 0.9

  // Glow
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.strokeStyle = glow
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // Kern
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
}

function drawProjectile(ctx, x1, y1, x2, y2, color, glow, progress, size = 4) {
  const px = x1 + (x2 - x1) * progress
  const py = y1 + (y2 - y1) * progress

  // Trail
  const trailLen = 0.15
  const tx = x1 + (x2 - x1) * Math.max(0, progress - trailLen)
  const ty = y1 + (y2 - y1) * Math.max(0, progress - trailLen)

  ctx.globalAlpha = 0.5
  ctx.shadowColor = glow
  ctx.shadowBlur = 6
  const grad = ctx.createLinearGradient(tx, ty, px, py)
  grad.addColorStop(0, 'transparent')
  grad.addColorStop(1, color)
  ctx.strokeStyle = grad
  ctx.lineWidth = size * 0.6
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(px, py)
  ctx.stroke()

  // Kern
  ctx.globalAlpha = 1.0
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = glow
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.arc(px, py, size * 0.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
}

function drawMissile(ctx, x1, y1, x2, y2, color, glow, progress) {
  // Rakete: leicht kurvenförmig
  const px = x1 + (x2 - x1) * progress
  const py = y1 + (y2 - y1) * progress
  const wobble = Math.sin(progress * Math.PI * 3) * 8 * (1 - progress)
  const mx = px + wobble

  // Rauch-Trail
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#94a3b8'
  for (let i = 0; i < 3; i++) {
    const tp = Math.max(0, progress - i * 0.04)
    const tx = x1 + (x2 - x1) * tp + Math.sin(tp * Math.PI * 3) * 8 * (1 - tp)
    const ty = y1 + (y2 - y1) * tp
    ctx.beginPath()
    ctx.arc(tx, ty, 2 - i * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Rakete
  ctx.globalAlpha = 1.0
  ctx.fillStyle = color
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(mx, py, 3, 0, Math.PI * 2)
  ctx.fill()

  // Flamme
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(mx, py + 5, 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
}

function drawExplosion(ctx, x, y, progress) {
  // Progress 0→1: explodiert und verblasst
  const r = progress * 30
  const alpha = 1 - progress
  ctx.globalAlpha = alpha
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.3, '#fbbf24')
  grad.addColorStop(0.7, '#ef4444')
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  // Funken
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 / 6) * i + progress * 2
    const sr = r * 1.2
    ctx.fillStyle = '#fbbf24'
    ctx.globalAlpha = alpha * 0.8
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * sr, y + Math.sin(a) * sr, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1.0
}

// ─── Simulation-State aufbauen ────────────────────────────────────────────────

function buildSimState(report) {
  if (!report) return null

  const playerShips = (report.attacker_fleet?.ships ?? []).map(s => ({
    id: s.id ?? s.design_id ?? Math.random().toString(),
    name: s.name ?? 'Schiff',
    chassisClass: s.chassisClass ?? s.ship_designs?.chassis_id?.split('_')[0]?.toUpperCase() ?? 'B',
    hp: s.hp ?? s.maxHp ?? s.max_hp ?? 100,
    maxHp: s.maxHp ?? s.max_hp ?? 100,
  }))

  const npcShips = (report.defender_fleet?.ships ?? []).map(s => ({
    id: s.id ?? Math.random().toString(),
    name: s.name ?? 'NPC',
    chassisClass: s.chassisClass ?? 'B',
    hp: s.hp ?? s.maxHp ?? 100,
    maxHp: s.maxHp ?? 100,
  }))

  return { playerShips, npcShips, rounds: report.rounds ?? [] }
}

// ─── Schiff-Positionen berechnen ──────────────────────────────────────────────

function layoutShips(ships, side, canvasW, canvasH) {
  const maxPerRow = 6
  const rows = Math.ceil(ships.length / maxPerRow)
  const result = {}
  ships.forEach((s, i) => {
    const row = Math.floor(i / maxPerRow)
    const col = i % maxPerRow
    const inRow = Math.min(ships.length - row * maxPerRow, maxPerRow)
    const rowW = inRow * 60
    const startX = (canvasW - rowW) / 2 + col * 60 + 30
    const rowY = side === 'player'
      ? canvasH - 60 - row * 70
      : 60 + row * 70
    result[s.id] = { x: startX, y: rowY }
  })
  return result
}

// ─── Projektil-Dauer pro Typ ──────────────────────────────────────────────────

const PROJECTILE_DURATION = {
  beam: 400,
  projectile_fast: 300,
  projectile_slow: 800,
  missile: 1200,
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function BattleAnimation({ report, onClose }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef(null)
  const rafRef    = useRef(null)
  const [paused, setPaused] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [done, setDone] = useState(false)
  const pausedRef = useRef(false)

  const W = 700, H = 500

  // Initialisierung
  useEffect(() => {
    const sim = buildSimState(report)
    if (!sim) return

    // Kopie der HP-Werte für Live-Tracking
    const pHp = Object.fromEntries(sim.playerShips.map(s => [s.id, s.hp]))
    const nHp = Object.fromEntries(sim.npcShips.map(s => [s.id, s.hp]))
    const pDead = new Set()
    const nDead = new Set()
    const explosions = []  // [{x, y, startTime}]
    let activeProjectiles = []  // [{x1,y1,x2,y2,color,glow,style,startTime,duration,targetId,damage}]
    let roundIdx = 0
    let roundStartTime = null
    let actionIdx = 0
    let lastTime = null
    const ACTION_INTERVAL = 180  // ms zwischen Aktionen in einer Runde
    const ROUND_PAUSE = 800      // ms Pause zwischen Runden

    stateRef.current = { pHp, nHp, pDead, nDead, explosions, activeProjectiles, roundIdx, roundStartTime, actionIdx, lastTime }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const pPositions = layoutShips(sim.playerShips, 'player', W, H)
    const nPositions = layoutShips(sim.npcShips, 'npc', W, H)

    function getPos(id) {
      return pPositions[id] ?? nPositions[id] ?? { x: W/2, y: H/2 }
    }

    function frame(now) {
      if (pausedRef.current) { rafRef.current = requestAnimationFrame(frame); return }
      const st = stateRef.current
      if (!lastTime) lastTime = now
      const dt = now - lastTime
      lastTime = now

      // ── Canvas leeren ────────────────────────────────────────────────────────
      ctx.fillStyle = '#040d1a'
      ctx.fillRect(0, 0, W, H)

      // ── Trennlinie ────────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(34,211,238,0.08)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      ctx.moveTo(40, H/2)
      ctx.lineTo(W - 40, H/2)
      ctx.stroke()
      ctx.setLineDash([])

      // ── Seiten-Labels ─────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(34,211,238,0.3)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('SPIELER', 12, H - 20)
      ctx.fillStyle = 'rgba(239,68,68,0.3)'
      ctx.fillText('FEIND', 12, 20)

      // ── Schiffe zeichnen ──────────────────────────────────────────────────────
      for (const s of sim.playerShips) {
        const pos = pPositions[s.id]
        if (!pos) continue
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.pHp[s.id] ?? 0, s.maxHp, true, st.pDead.has(s.id), s.name?.split(' ')[0])
      }
      for (const s of sim.npcShips) {
        const pos = nPositions[s.id]
        if (!pos) continue
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.nHp[s.id] ?? 0, s.maxHp, false, st.nDead.has(s.id), s.name?.split(' ')[0])
      }

      // ── Projektile ────────────────────────────────────────────────────────────
      st.activeProjectiles = st.activeProjectiles.filter(p => {
        const elapsed = now - p.startTime
        const progress = Math.min(1, elapsed / p.duration)
        const c = WEAPON_COLORS[p.weaponType] ?? WEAPON_COLORS.laser

        if (p.style === 'beam') {
          drawBeam(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress)
        } else if (p.style === 'missile') {
          drawMissile(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress)
        } else {
          drawProjectile(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress, p.style === 'projectile_fast' ? 3 : 5)
        }

        // Treffer-Explosion wenn angekommen
        if (progress >= 0.95 && !p.exploded) {
          p.exploded = true
          if (p.hit) st.explosions.push({ x: p.x2, y: p.y2, startTime: now })
        }
        return progress < 1
      })

      // ── Explosionen ──────────────────────────────────────────────────────────
      st.explosions = st.explosions.filter(e => {
        const progress = Math.min(1, (now - e.startTime) / 600)
        drawExplosion(ctx, e.x, e.y, progress)
        return progress < 1
      })

      // ── Runden-Logik ─────────────────────────────────────────────────────────
      if (st.roundIdx < sim.rounds.length) {
        const round = sim.rounds[st.roundIdx]
        const actions = round?.actions ?? []

        if (!st.roundStartTime) st.roundStartTime = now

        const elapsed = now - st.roundStartTime
        const nextActionTime = st.actionIdx * ACTION_INTERVAL

        if (st.actionIdx < actions.length && elapsed >= nextActionTime) {
          const action = actions[st.actionIdx]
          const fromPos = getPos(action.attackerId)
          const toPos   = getPos(action.targetId)
          const style   = WEAPON_STYLE[action.weaponType] ?? 'beam'
          const dur     = PROJECTILE_DURATION[style] ?? 400

          st.activeProjectiles.push({
            x1: fromPos.x, y1: fromPos.y,
            x2: toPos.x,   y2: toPos.y,
            weaponType: action.weaponType ?? 'laser',
            style, duration: dur, startTime: now,
            hit: action.hit, exploded: false,
          })

          // HP nach Treffer sofort aktualisieren
          if (action.hit) {
            const isPlayerTarget = !!pPositions[action.targetId]
            if (isPlayerTarget) {
              st.pHp[action.targetId] = action.targetHpAfter
              if (action.destroyed) st.pDead.add(action.targetId)
            } else {
              st.nHp[action.targetId] = action.targetHpAfter
              if (action.destroyed) st.nDead.add(action.targetId)
            }
          }

          st.actionIdx++
        }

        // Runde beendet wenn alle Aktionen durch und Projektile weg
        const roundDone = st.actionIdx >= actions.length && st.activeProjectiles.length === 0 && st.explosions.length === 0
        if (roundDone) {
          const sinceLastAction = now - (st.roundStartTime + (actions.length) * ACTION_INTERVAL)
          if (sinceLastAction >= ROUND_PAUSE) {
            st.roundIdx++
            st.actionIdx = 0
            st.roundStartTime = null
            setCurrentRound(st.roundIdx)
          }
        }
      } else if (st.activeProjectiles.length === 0 && st.explosions.length === 0) {
        // Alle Runden fertig
        setDone(true)
      }

      // ── Runden-Anzeige ────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(34,211,238,0.5)'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        st.roundIdx < sim.rounds.length
          ? `Runde ${(sim.rounds[st.roundIdx]?.round ?? st.roundIdx + 1)}`
          : 'Kampf beendet',
        W / 2, H / 2 - 10
      )

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [report])

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current
    setPaused(p => !p)
  }, [])

  const totalRounds = report?.rounds?.length ?? 0

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(34,211,238,0.15)' }}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{ display: 'block', width: '100%', background: '#040d1a' }} />

        {done && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(4,13,26,0.7)', backdropFilter: 'blur(2px)' }}>
            <div className="text-center space-y-2">
              <p className="font-display font-bold text-2xl text-cyan-400">
                {report?.winner === 'attacker' ? '⚔ Sieg' : report?.winner === 'defender' ? '💀 Niederlage' : '— Unentschieden —'}
              </p>
              <p className="text-xs font-mono text-slate-500">{totalRounds} Runden</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button onClick={togglePause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
          {paused ? <><Play size={11} /> Weiter</> : <><Pause size={11} /> Pause</>}
        </button>
        <span className="text-xs font-mono text-slate-600">
          Runde {Math.min(currentRound + 1, totalRounds)} / {totalRounds}
        </span>
        {done && (
          <button onClick={() => { setDone(false); setCurrentRound(0) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono ml-auto transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            <RotateCcw size={11} /> Nochmal
          </button>
        )}
      </div>
    </div>
  )
}
