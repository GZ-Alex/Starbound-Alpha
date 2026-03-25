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
let bgImage = null
let bgLoaded = false

// Hintergrundbild vorladen
;(function() {
  const img = new Image()
  img.onload  = () => { bgImage = img; bgLoaded = true }
  img.onerror = () => { bgLoaded = true }  // Fallback auf Farbe
  img.src = '/Starbound-Alpha/battle_background.png'
})()

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

function drawShip(ctx, x, y, cls, hp, maxHp, isPlayer, isDestroyed, label, chassisId, aimAngle) {
  const cfg = CLASS_SHAPES[cls] ?? CLASS_SHAPES.B
  const alpha = isDestroyed ? 0.15 : 1.0
  ctx.globalAlpha = alpha

  const hpPct = maxHp > 0 ? hp / maxHp : 0
  const shipColor = isDestroyed ? '#334155'
    : hpPct > 0.6 ? cfg.color
    : hpPct > 0.25 ? '#fbbf24'
    : '#ef4444'

  // Rotationswinkel: Ruheposition + evtl. Ziel-Winkel beim Schießen
  // Sprite zeigt nach unten (Süd = π) — Spieler zeigen nach oben = rotate(0), Feinde nach unten = rotate(π)
  // aimAngle: null = Ruheposition, number = Winkel zum Ziel
  const baseAngle = isPlayer ? 0 : Math.PI
  const finalAngle = aimAngle !== null && aimAngle !== undefined ? aimAngle : baseAngle

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(finalAngle)

  // Sprite versuchen
  const sprite = chassisId ? loadSprite(chassisId) : false
  const s = cfg.size

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


// ─── Canvas-Zeichenfunktionen ─────────────────────────────────────────────────

function drawBeam(ctx, x1, y1, x2, y2, color, glow, progress) {
  const alpha = progress < 0.3 ? progress / 0.3 : progress > 0.7 ? (1 - progress) / 0.3 : 1.0
  ctx.globalAlpha = alpha * 0.9
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.strokeStyle = glow
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
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
  const px = x1 + (x2 - x1) * progress
  const py = y1 + (y2 - y1) * progress
  const wobble = Math.sin(progress * Math.PI * 3) * 8 * (1 - progress)
  const mx = px + wobble
  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#94a3b8'
  for (let i = 0; i < 3; i++) {
    const tp = Math.max(0, progress - i * 0.04)
    const tx2 = x1 + (x2 - x1) * tp + Math.sin(tp * Math.PI * 3) * 8 * (1 - tp)
    const ty2 = y1 + (y2 - y1) * tp
    ctx.beginPath()
    ctx.arc(tx2, ty2, 2 - i * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1.0
  ctx.fillStyle = color
  ctx.shadowColor = glow
  ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.arc(mx, py, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fbbf24'
  ctx.beginPath()
  ctx.arc(mx, py + 5, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1.0
}

function drawExplosion(ctx, x, y, progress) {
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

// ─── Waffentreffer-Effekte ────────────────────────────────────────────────────

function drawHitEffect(ctx, x, y, weaponType, progress) {
  // progress 0→1, Effekt erscheint bei progress~0, verblasst bis 1
  const alpha = Math.max(0, 1 - progress * 1.5)
  if (alpha <= 0) return

  if (weaponType === 'laser') {
    // Roter Blitz / Leuchten
    ctx.globalAlpha = alpha * 0.8
    ctx.shadowColor = '#ff2020'
    ctx.shadowBlur = 20
    const r = 12 * (1 - progress * 0.5)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.3, '#ff4444')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // Kreuzförmige Blitze
    ctx.strokeStyle = '#ff6666'
    ctx.lineWidth = 1.5
    const len = 10 * (1 - progress)
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
    ctx.shadowBlur = 0

  } else if (weaponType === 'ion') {
    // Blaues elektrisches Knistern
    ctx.globalAlpha = alpha * 0.9
    ctx.shadowColor = '#60a5fa'
    ctx.shadowBlur = 15
    ctx.strokeStyle = '#93c5fd'
    ctx.lineWidth = 1
    // Zufällige Blitzzacken (deterministisch über progress)
    const seed = Math.floor(progress * 10)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + seed * 0.3
      const len = 8 + (i * 3) % 7
      ctx.beginPath()
      ctx.moveTo(x, y)
      // Zackenlinie
      const mx2 = x + Math.cos(angle) * len * 0.5 + Math.sin(angle + 1) * 4
      const my2 = y + Math.sin(angle) * len * 0.5 + Math.cos(angle + 1) * 4
      ctx.lineTo(mx2, my2)
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
      ctx.stroke()
    }
    // Zentrales Leuchten
    ctx.fillStyle = '#bfdbfe'
    ctx.beginPath()
    ctx.arc(x, y, 4 * (1 - progress * 0.8), 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

  } else if (weaponType === 'railgun') {
    // Plasma-Einschlag: orangefarbener Krater-Splash
    ctx.globalAlpha = alpha * 0.85
    ctx.shadowColor = '#a855f7'
    ctx.shadowBlur = 18
    const r = 14 * (1 - progress * 0.4)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.2, '#e879f9')
    grad.addColorStop(0.6, '#7c3aed')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // Splash-Partikel
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 / 5) * i + progress
      const sr = r * 1.3
      ctx.fillStyle = '#c084fc'
      ctx.globalAlpha = alpha * 0.6
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * sr, y + Math.sin(a) * sr, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0

  } else if (weaponType === 'plasma') {
    // Plasma-Treffer: orange-grüner Energieausbruch
    ctx.globalAlpha = alpha * 0.85
    ctx.shadowColor = '#f97316'
    ctx.shadowBlur = 22
    const r = 16 * (1 - progress * 0.3)
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.25, '#fde68a')
    grad.addColorStop(0.6, '#f97316')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // Plasma-Wellen
    ctx.strokeStyle = '#fb923c'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = alpha * 0.5
    ctx.beginPath()
    ctx.arc(x, y, r * 1.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0

  } else if (weaponType === 'torpedo') {
    // Torpedo-Explosion (größer als normale Explosion)
    const r = progress * 40
    const alpha2 = 1 - progress
    ctx.globalAlpha = alpha2
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur = 25
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, '#ffffff')
    grad.addColorStop(0.2, '#fde68a')
    grad.addColorStop(0.5, '#f97316')
    grad.addColorStop(0.8, '#dc2626')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // Schockwelle
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    ctx.globalAlpha = alpha2 * 0.4
    ctx.beginPath()
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2)
    ctx.stroke()
    // Funken
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i + progress
      const sr = r * 1.2
      ctx.fillStyle = '#fde68a'
      ctx.globalAlpha = alpha2 * 0.7
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * sr, y + Math.sin(a) * sr, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0
  }

  ctx.globalAlpha = 1.0
  ctx.shadowBlur = 0
}

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
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentRound, setCurrentRound] = useState(0)
  const [done, setDone] = useState(false)
  const pausedRef = useRef(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1)
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

    stateRef.current = { pHp, nHp, pDead, nDead, explosions, activeProjectiles, aimAngles, roundIdx, roundStartTime, actionIdx, lastTime, isDone: false }

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
      const dt = (now - lastTime) * speedRef.current
      lastTime = now
      // Virtuelle Zeit: läuft mit Speed-Faktor
      st.virtualNow = (st.virtualNow ?? now) + dt

      // ── Canvas leeren ────────────────────────────────────────────────────────
      ctx.fillStyle = '#040d1a'
      ctx.fillRect(0, 0, W, H)
      if (bgImage) {
        ctx.globalAlpha = 0.55
        ctx.drawImage(bgImage, 0, 0, W, H)
        ctx.globalAlpha = 1.0
      }

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
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.pHp[s.id] ?? 0, s.maxHp, true, st.pDead.has(s.id), s.name?.split(' ')[0], s.chassisId, st.aimAngles[s.id])
      }
      for (const s of sim.npcShips) {
        const pos = nPositions[s.id]
        if (!pos) continue
        drawShip(ctx, pos.x, pos.y, s.chassisClass, st.nHp[s.id] ?? 0, s.maxHp, false, st.nDead.has(s.id), s.name?.split(' ')[0], s.chassisId, st.aimAngles[s.id])
      }

      // ── Projektile ────────────────────────────────────────────────────────────
      const vNow = st.virtualNow
      st.activeProjectiles = st.activeProjectiles.filter(p => {
        const elapsed = vNow - p.startTime
        const progress = Math.min(1, elapsed / p.duration)
        const c = WEAPON_COLORS[p.weaponType] ?? WEAPON_COLORS.laser

        if (p.style === 'beam') {
          drawBeam(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress)
        } else if (p.style === 'missile') {
          drawMissile(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress)
        } else {
          drawProjectile(ctx, p.x1, p.y1, p.x2, p.y2, c.beam, c.glow, progress, p.style === 'projectile_fast' ? 3 : 5)
        }

        // Treffer-Effekt + HP erst wenn Projektil ankommt (progress >= 0.95)
        if (progress >= 0.95 && !p.exploded) {
          p.exploded = true
          if (p.hit) {
            // HP-Update JETZT (bei Ankunft, nicht beim Abschuss)
            const isPlayerTarget = !!pPositions[p.targetId]
            if (isPlayerTarget) {
              st.pHp[p.targetId] = p.targetHpAfter
              if (p.destroyed) st.pDead.add(p.targetId)
            } else {
              st.nHp[p.targetId] = p.targetHpAfter
              if (p.destroyed) st.nDead.add(p.targetId)
            }
            // Waffentreffer-Effekt statt generischer Explosion
            st.hitEffects = st.hitEffects ?? []
            st.hitEffects.push({ x: p.x2, y: p.y2, startTime: vNow, weaponType: p.weaponType })
          }
        }
        // Winkel zurücksetzen wenn Projektil weg
        if (progress >= 1) {
          const stillAiming = st.activeProjectiles.some(other => other !== p && other.attackerId === p.attackerId && (vNow - other.startTime) / other.duration < 1)
          if (!stillAiming) delete st.aimAngles[p.attackerId]
          return false
        }
        return true
      })

      // ── Treffer-Effekte (waffentyp-spezifisch) ───────────────────────────────
      st.hitEffects = (st.hitEffects ?? []).filter(e => {
        const progress = Math.min(1, (vNow - e.startTime) / 500)
        drawHitEffect(ctx, e.x, e.y, e.weaponType, progress)
        return progress < 1
      })

      // ── Explosionen (nur noch für Schiff-Zerstörung) ─────────────────────────
      st.explosions = st.explosions.filter(e => {
        const progress = Math.min(1, (vNow - e.startTime) / 600)
        drawExplosion(ctx, e.x, e.y, progress)
        return progress < 1
      })

      // ── Runden-Logik ─────────────────────────────────────────────────────────
      if (st.roundIdx < sim.rounds.length) {
        const round = sim.rounds[st.roundIdx]
        const actions = round?.actions ?? []

        if (!st.roundStartTime) st.roundStartTime = vNow

        const elapsed = vNow - st.roundStartTime
        const nextActionTime = st.actionIdx * ACTION_INTERVAL

        if (st.actionIdx < actions.length && elapsed >= nextActionTime) {
          const action = actions[st.actionIdx]
          const fromPos = getPos(action.attackerId)
          const toPos   = getPos(action.targetId)
          const style   = WEAPON_STYLE[action.weaponType] ?? 'beam'
          const dur     = PROJECTILE_DURATION[style] ?? 400

          const dx = toPos.x - fromPos.x
          const dy = toPos.y - fromPos.y
          const aimAngle = Math.atan2(dy, dx) + Math.PI / 2
          st.aimAngles[action.attackerId] = aimAngle

          st.activeProjectiles.push({
            x1: fromPos.x, y1: fromPos.y,
            x2: toPos.x,   y2: toPos.y,
            weaponType: action.weaponType ?? 'laser',
            style, duration: dur, startTime: vNow,
            hit: action.hit, exploded: false,
            attackerId: action.attackerId,
            // HP wird erst bei Projektil-Ankunft angewendet
            targetId: action.targetId,
            targetHpAfter: action.targetHpAfter,
            destroyed: action.destroyed,
          })

          st.actionIdx++
        }

        // Runde beendet wenn alle Aktionen durch und Projektile weg
        const roundDone = st.actionIdx >= actions.length && st.activeProjectiles.length === 0 && st.explosions.length === 0
        if (roundDone) {
          const sinceLastAction = vNow - (st.roundStartTime + (actions.length) * ACTION_INTERVAL)
          if (sinceLastAction >= ROUND_PAUSE) {
            st.roundIdx++
            st.actionIdx = 0
            st.roundStartTime = null
            setCurrentRound(st.roundIdx)
          }
        }
      } else if (st.activeProjectiles.length === 0 && st.explosions.length === 0 && !st.isDone) {
        // Alle Runden fertig — nur einmal setDone aufrufen
        st.isDone = true
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
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={togglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}>
            {paused ? <><Play size={11} /> Weiter</> : <><Pause size={11} /> Pause</>}
          </button>
          <span className="text-xs font-mono text-slate-600">
            Runde {Math.min(currentRound + 1, totalRounds)} / {totalRounds}
          </span>
          {/* Geschwindigkeit */}
          <div className="flex items-center gap-1 ml-auto">
            {[0.5, 1, 2, 3, 4].map(s => (
              <button key={s} onClick={() => { setSpeed(s); speedRef.current = s }}
                className="px-2 py-1 rounded text-xs font-mono transition-all"
                style={{
                  background: speed === s ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${speed === s ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  color: speed === s ? '#22d3ee' : '#475569',
                }}>
                {s}×
              </button>
            ))}
          </div>
          <button onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
            <RotateCcw size={11} /> Nochmal
          </button>
        </div>
      )}
    </div>
  )
}
