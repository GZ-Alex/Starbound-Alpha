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
  A: { shape: 'rect',     size: 18, color: '#34d399' },
  B: { shape: 'triangle', size: 12, color: '#38bdf8' },
  C: { shape: 'triangle', size: 15, color: '#a78bfa' },
  D: { shape: 'diamond',  size: 17, color: '#fb923c' },
  E: { shape: 'hexagon',  size: 20, color: '#f472b6' },
}

// Sprite-Pfade — lädt aus public/Starbound-Alpha/ships/{chassisId}.png
// Fallback auf geometrische Form wenn nicht vorhanden
const spriteCache = {}

function loadSprite(chassisId) {
  if (spriteCache[chassisId] !== undefined) return spriteCache[chassisId]
  spriteCache[chassisId] = null  // loading sentinel
  const img = new Image()
  img.onload  = () => { spriteCache[chassisId] = img }
  img.onerror = () => { spriteCache[chassisId] = false }  // false = kein Sprite
  img.src = `/Starbound-Alpha/sprites/${chassisId}_sprite.png`
  return null
}

// Sprite-Orientierung: Sprites zeigen nach OBEN (nördlich = 0°)
// Spieler: 0° (zeigt nach oben zur gegnerischen Seite)
// Feinde: Math.PI (zeigt nach unten)
// Beim Schießen: Winkel zum Ziel

function drawShip(ctx, x, y, cls, hp, maxHp, isPlayer, isDestroyed, label, chassisId, aimAngle, sizeOverride) {
  const cfg = CLASS_SHAPES[cls] ?? CLASS_SHAPES.B
  const alpha = isDestroyed ? 0.15 : 1.0
  ctx.globalAlpha = alpha

  const hpPct = maxHp > 0 ? hp / maxHp : 0
  const shipColor = isDestroyed ? '#334155'
    : hpPct > 0.6 ? cfg.color
    : hpPct > 0.25 ? '#fbbf24'
    : '#ef4444'

  const baseAngle = isPlayer ? 0 : Math.PI
  const finalAngle = aimAngle !== null && aimAngle !== undefined ? aimAngle : baseAngle

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(finalAngle)

  const sprite = chassisId ? loadSprite(chassisId) : false
  const s = sizeOverride ?? cfg.size

  if (sprite && sprite !== false) {
    // Sprite zeichnen — zentriert, skaliert auf cfg.size * 3
    const sw = s * 3, sh = s * 3
    ctx.drawImage(sprite, -sw/2, -sh/2, sw, sh)
  } else {
    // Geometrische Fallback-Form
    ctx.fillStyle = shipColor
    ctx.strokeStyle = isDestroyed ? '#1e293b' : '#ffffff22'
    ctx.lineWidth = 1
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
  }

  ctx.restore()

  // HP-Balken (immer horizontal, unabhängig von Rotation)
  if (!isDestroyed) {
    const bw = s * 2, bh = 3
    const bx = x - bw/2
    const by = y + s * 1.6
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = hpPct > 0.6 ? '#4ade80' : hpPct > 0.25 ? '#fbbf24' : '#ef4444'
    ctx.fillRect(bx, by, bw * Math.max(0, hpPct), bh)
  }

  ctx.globalAlpha = 1.0

  // Label
  if (label && !isDestroyed) {
    ctx.fillStyle = '#475569'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    const cfg2 = CLASS_SHAPES[cls] ?? CLASS_SHAPES.B
    ctx.fillText(label, x, y + cfg2.size * 1.6 + 14)
  }
}

// ─── Simulation-State aufbauen ────────────────────────────────────────────────

// ─── Simulation-State aufbauen ────────────────────────────────────────────────

function buildSimState(report) {
  if (!report) return null

  const playerShips = (report.attacker_fleet?.ships ?? []).map(s => ({
    id: s.id ?? s.design_id ?? Math.random().toString(),
    name: s.name ?? 'Schiff',
    chassisClass: s.chassisClass ?? s.ship_designs?.chassis_id?.split('_')[0]?.toUpperCase() ?? 'B',
    chassisId: s.ship_designs?.chassis_id ?? s.chassisId ?? null,
    hp: s.hp ?? s.maxHp ?? s.max_hp ?? 100,
    maxHp: s.maxHp ?? s.max_hp ?? 100,
  }))

  const npcShips = (report.defender_fleet?.ships ?? []).map(s => ({
    id: s.id ?? Math.random().toString(),
    name: s.name ?? 'NPC',
    chassisClass: s.chassisClass ?? 'B',
    chassisId: s.chassisId ?? null,
    hp: s.hp ?? s.maxHp ?? 100,
    maxHp: s.maxHp ?? 100,
  }))

  return { playerShips, npcShips, rounds: report.rounds ?? [] }
}

// ─── Schiff-Positionen berechnen ──────────────────────────────────────────────

function layoutShips(ships, side, canvasW, canvasH) {
  const MAX_ROWS = 3
  // Berechne Schiffe pro Reihe: max 3 Reihen, min 1 Schiff pro Reihe
  const perRow = Math.ceil(ships.length / MAX_ROWS)
  const rows = Math.ceil(ships.length / perRow)
  // Spacing dynamisch: Canvas-Breite / Schiffe pro Reihe, min 40px max 70px
  const spacing = Math.max(40, Math.min(70, Math.floor((canvasW - 40) / perRow)))
  const shipSize = Math.max(24, Math.min(44, spacing - 10))
  const rowSpacing = shipSize + 18

  const result = {}
  ships.forEach((s, i) => {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const inRow = Math.min(ships.length - row * perRow, perRow)
    const rowW = inRow * spacing
    const startX = (canvasW - rowW) / 2 + col * spacing + spacing / 2
    const rowY = side === 'player'
      ? canvasH - 50 - row * rowSpacing
      : 50 + row * rowSpacing
    result[s.id] = { x: startX, y: rowY, size: shipSize }
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
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [done, setDone] = useState(false)
  const pausedRef = useRef(false)
  const [key, setKey] = useState(0)  // key ändern = Animation neu starten

  const W = 700, H = 500

  const handleStart = useCallback(() => {
    setStarted(true)
    setPaused(false)
    pausedRef.current = false
  }, [])

  const handleRestart = useCallback(() => {
    // Animation neu initialisieren via key
    setDone(false)
    setCurrentRound(0)
    setPaused(false)
    pausedRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setKey(k => k + 1)
  }, [])

  // Initialisierung — läuft neu wenn key sich ändert
  useEffect(() => {
    if (!started) return
    const sim = buildSimState(report)
    if (!sim) return

    // Kopie der HP-Werte für Live-Tracking
    const pHp = Object.fromEntries(sim.playerShips.map(s => [s.id, s.hp]))
    const nHp = Object.fromEntries(sim.npcShips.map(s => [s.id, s.hp]))
    const pDead = new Set()
    const nDead = new Set()
    const explosions = []
    let activeProjectiles = []
    // Rotationswinkel pro Schiff: null = Ruheposition
    const aimAngles = {}
    let roundIdx = 0
    let roundStartTime = null
    let actionIdx = 0
    let lastTime = null
    const ACTION_INTERVAL = 180
    const ROUND_PAUSE = 800

    stateRef.current = { pHp, nHp, pDead, nDead, explosions, activeProjectiles, aimAngles, roundIdx, roundStartTime, actionIdx, lastTime }

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
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.pHp[s.id] ?? 0, s.maxHp, true, st.pDead.has(s.id), s.name?.split(' ')[0], s.chassisId, st.aimAngles[s.id], pos.size)
      }
      for (const s of sim.npcShips) {
        const pos = nPositions[s.id]
        if (!pos) continue
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.nHp[s.id] ?? 0, s.maxHp, false, st.nDead.has(s.id), s.name?.split(' ')[0], s.chassisId, st.aimAngles[s.id], pos.size)
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
        // Winkel zurücksetzen wenn Projektil weg
        if (progress >= 1) {
          // Nur zurücksetzen wenn kein anderes Projektil dieses Schiffs noch fliegt
          const stillAiming = st.activeProjectiles.some(other => other !== p && other.attackerId === p.attackerId && (now - other.startTime) / other.duration < 1)
          if (!stillAiming) delete st.aimAngles[p.attackerId]
          return false
        }
        return true
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

          // Winkel vom Angreifer zum Ziel berechnen
          // atan2 gibt Winkel von (fromPos) zu (toPos), +π/2 weil Sprites nach oben zeigen (Norden=0)
          const dx = toPos.x - fromPos.x
          const dy = toPos.y - fromPos.y
          const aimAngle = Math.atan2(dy, dx) + Math.PI / 2
          st.aimAngles[action.attackerId] = aimAngle

          st.activeProjectiles.push({
            x1: fromPos.x, y1: fromPos.y,
            x2: toPos.x,   y2: toPos.y,
            weaponType: action.weaponType ?? 'laser',
            style, duration: dur, startTime: now,
            hit: action.hit, exploded: false,
            attackerId: action.attackerId,
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
  }, [report, started, key])

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

        {/* Play-Screen (vor Start) */}
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(4,13,26,0.85)', backdropFilter: 'blur(2px)' }}>
            <button onClick={handleStart}
              className="flex flex-col items-center gap-3 group transition-transform hover:scale-105">
              <div className="w-20 h-20 rounded-full flex items-center justify-center transition-all"
                style={{ background: 'rgba(34,211,238,0.12)', border: '2px solid rgba(34,211,238,0.4)' }}>
                <Play size={32} style={{ color: '#22d3ee', marginLeft: 4 }} />
              </div>
              <span className="text-xs font-mono text-slate-500">Kampf abspielen</span>
            </button>
          </div>
        )}

        {/* Ergebnis-Screen (nach Ende) */}
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

      {/* Controls — nur sichtbar wenn gestartet */}
      {started && (
        <div className="flex items-center gap-2">
          <button onClick={togglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
            {paused ? <><Play size={11} /> Weiter</> : <><Pause size={11} /> Pause</>}
          </button>
          <span className="text-xs font-mono text-slate-600">
            Runde {Math.min(currentRound + 1, totalRounds)} / {totalRounds}
          </span>
          <button onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono ml-auto transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            <RotateCcw size={11} /> Nochmal
          </button>
        </div>
      )}
    </div>
  )
}
