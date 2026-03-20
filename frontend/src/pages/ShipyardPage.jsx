// src/pages/ShipyardPage.jsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Rocket, X, ChevronRight, Hammer, AlertTriangle, Settings } from 'lucide-react'

const CLASS_LABELS  = { Z: 'Klasse Z', A: 'Klasse A', B: 'Klasse B', C: 'Klasse C', D: 'Klasse D', E: 'Klasse E' }
const CLASS_COLORS  = { Z: '#94a3b8', A: '#34d399', B: '#38bdf8', C: '#a78bfa', D: '#fb923c', E: '#f472b6' }
const CLASS_DESC    = {
  Z: 'Leichte Sonden und Frachter. Günstig, keine Bewaffnung.',
  A: 'Mittlere Frachter. Gute Kapazität, geringe Kampfkraft.',
  B: 'Leichte Kampfschiffe. Schnell und wendig.',
  C: 'Mittelschwere Kampfschiffe. Solide Allrounder.',
  D: 'Schwere Kreuzer. Hoher Schaden, träge.',
  E: 'Schlachtschiffe. Nur für Admirale. Vernichtende Kraft.',
}
const PROFESSION_LABELS = { admiral: 'Admiral', trader: 'Händler', privateer: 'Freibeuter' }

const PART_CATEGORIES = [
  { id: 'engine',           label: 'Antrieb',           required: true  },
  { id: 'engine_aux',       label: 'Sekundärantrieb',   required: false },
  { id: 'booster',          label: 'Booster',           required: false },
  { id: 'primary_weapon',   label: 'Primärwaffe',       required: false },
  { id: 'turret',           label: 'Turret',            required: false },
  { id: 'armor',            label: 'Panzerung',         required: false },
  { id: 'shield_hp',        label: 'HP-Schild',         required: false },
  { id: 'shield_def',       label: 'Def-Schild',        required: false },
  { id: 'cargo',            label: 'Ladebucht',         required: false },
  { id: 'mining',           label: 'Bergbau',           required: false },
  { id: 'scanner_asteroid', label: 'Ast-Scanner',       required: false },
  { id: 'scanner_npc',      label: 'NPC-Scanner',       required: false },
  { id: 'extension',        label: 'Erweiterung',       required: false },
]

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

// ─── Ship Designer Modal ───────────────────────────────────────────────────────

export function ShipDesigner({ chassis, planet, player, partDefs, hasTech, onClose, onBuilt,
  // Refit-Modus: ship + onRefit statt onBuilt
  refitMode = false, ship = null, onRefit = null, queryClient = null, dockLevel = 0
}) {
  const [selectedParts, setSelectedParts] = useState(() =>
    refitMode && ship?.ship_designs?.installed_parts
      ? (Array.isArray(ship.ship_designs.installed_parts)
          ? ship.ship_designs.installed_parts.map(p => typeof p === 'string' ? p : p?.part_id).filter(Boolean)
          : [])
      : []
  )
  const [busy, setBuilding] = useState(false)
  const { addNotification } = useGameStore()

  const getAvailableParts = (category) => {
    const sortOrder = (id) => {
      if (/_s$/.test(id)) return 1
      if (/_m$/.test(id)) return 2
      if (/_l$/.test(id)) return 3
      if (/_xl$/.test(id)) return 4
      if (/_xxl$/.test(id)) return 5
      // Berufswaffen (_pvt/_adm) = Mk V (nach Mk IV)
      if (/_\d+_(pvt|adm)$/.test(id)) return 5
      const m = id.match(/_(\d+)$/)
      return m ? parseInt(m[1]) : 99
    }

    const engineTypeOrder = (id) => {
      if (id.startsWith('engine_chem')) return 100
      if (id.startsWith('engine_aux'))  return 200
      if (id.startsWith('engine_ion'))  return 300
      if (id.startsWith('engine_fusion')) return 400
      return 500
    }

    return (partDefs ?? []).filter(p => {
      if (p.category !== category) return false
      // Alle Waffen dürfen in alle Chassis (weapon_class ist nur Kampfeffektivität)
      if (p.required_profession && p.required_profession !== player?.profession) return false
      if (p.required_tech && !hasTech(p.required_tech)) return false
      return true
    }).sort((a, b) => {
      const classOrd = { A: 1, B: 2, C: 3, D: 4, E: 5 }
      if (category === 'turret' || category === 'primary_weapon') {
        const ta = (classOrd[a.weapon_class] ?? 9) * 100 + sortOrder(a.id)
        const tb = (classOrd[b.weapon_class] ?? 9) * 100 + sortOrder(b.id)
        return ta - tb
      }
      if (category === 'engine' || category === 'engine_aux') {
        return (engineTypeOrder(a.id) + sortOrder(a.id)) - (engineTypeOrder(b.id) + sortOrder(b.id))
      }
      return sortOrder(a.id) - sortOrder(b.id)
    })
  }

  const baseStats = {
    hp: chassis.base_hp, attack: chassis.base_attack, defense: chassis.base_defense,
    speed: chassis.base_speed, maneuver: chassis.base_maneuver, cargo: chassis.base_cargo,
  }

  // Angriff: Basisangriff des Chassis wird zu jeder Waffe addiert
  // Primärwaffe: +100% Basisangriff, Turret: +50% Basisangriff
  const baseAtk = chassis.base_attack ?? 0
  const weaponAttackBonus = (part) => {
    if (!part) return 0
    if (part.category === 'primary_weapon') return (part.attack_bonus || 0) + baseAtk
    if (part.category === 'turret') return (part.attack_bonus || 0) + Math.floor(baseAtk / 2)
    return 0
  }

  // Stats: Angriff kommt NUR aus Waffen (Chassis-Basisangriff steckt im Waffen-Bonus)
  // Ohne Waffe: attack = 0 (Basis wird nicht direkt angezeigt)
  const stats = selectedParts.reduce((acc, pid) => {
    const p = (partDefs ?? []).find(d => d.id === pid)
    if (!p) return acc
    const atkContrib = (p.category === 'primary_weapon' || p.category === 'turret')
      ? weaponAttackBonus(p)
      : (p.attack_bonus || 0) - (p.attack_malus || 0)
    return {
      hp:       acc.hp       + (p.hp_bonus       || 0),
      attack:   acc.attack   + atkContrib,
      defense:  acc.defense  + (p.defense_bonus   || 0),
      speed:    acc.speed    + (p.speed_bonus     || 0) - (p.speed_malus    || 0),
      maneuver: acc.maneuver + (p.maneuver_bonus  || 0) - (p.maneuver_malus || 0),
      cargo:    acc.cargo    + (p.cargo_bonus     || 0),
    }
  }, { ...baseStats, attack: 0 })  // attack startet bei 0, wird nur durch Waffen gefüllt

  const totalCells = selectedParts.reduce((sum, pid) => {
    const p = (partDefs ?? []).find(d => d.id === pid)
    return sum + (p?.cells_required || 0)
  }, 0)

  const COST_KEYS = ['titan', 'silizium', 'aluminium', 'uran', 'plutonium']
  const costs = COST_KEYS.reduce((acc, k) => {
    let total = chassis[`cost_${k}`] || 0
    selectedParts.forEach(pid => {
      const p = (partDefs ?? []).find(d => d.id === pid)
      total += p?.[`cost_${k}`] || 0
    })
    if (total > 0) acc[k] = total
    return acc
  }, {})

  const canAfford = Object.entries(costs).every(([res, amt]) => (planet?.[res] ?? 0) >= amt)

  const engineCount = selectedParts.filter(pid =>
    (partDefs ?? []).find(d => d.id === pid)?.category === 'engine'
  ).length
  const hasEngine  = engineCount === 1

  const primaryCount = selectedParts.filter(pid =>
    (partDefs ?? []).find(d => d.id === pid)?.category === 'primary_weapon'
  ).length
  const maxPrimary = chassis.max_primary_weapons ?? 1
  const primaryOk  = primaryCount <= maxPrimary

  const cellsOk  = totalCells <= chassis.total_cells
  const canBuild = hasEngine && cellsOk && canAfford && primaryOk

  // Waffen/Turrets können mehrfach eingebaut werden → Array mit Duplikaten
  // Antriebe: immer nur 1 (tauscht aus)
  // Alles andere: erstes Klick = hinzufügen, zweites Klick = entfernen (letztes Vorkommen)
  // Stackbare Kategorien: können mehrfach eingebaut werden
  const isStackable = (cat) => cat === 'primary_weapon' || cat === 'turret'

  const addPart = (pid) => {
    const part = (partDefs ?? []).find(d => d.id === pid)
    if (!part) return
    setSelectedParts(prev => {
      // Antrieb: ersetze bestehenden
      if (part.category === 'engine') {
        return [...prev.filter(p => (partDefs ?? []).find(d => d.id === p)?.category !== 'engine'), pid]
      }
      // Primärwaffe: max-Check
      if (part.category === 'primary_weapon') {
        const totalPrimary = prev.filter(p => (partDefs ?? []).find(d => d.id === p)?.category === 'primary_weapon').length
        if (totalPrimary >= maxPrimary) return prev
        return [...prev, pid]
      }
      // Turret + alles andere: einfach hinzufügen (Zellen-Check läuft über canBuild)
      return [...prev, pid]
    })
  }

  const removePart = (pid) => {
    setSelectedParts(prev => {
      // Letztes Vorkommen entfernen
      const lastIdx = prev.lastIndexOf(pid)
      if (lastIdx === -1) return prev
      const result = [...prev]
      result.splice(lastIdx, 1)
      return result
    })
  }

  const togglePart = (pid) => {
    const part = (partDefs ?? []).find(d => d.id === pid)
    if (!part) return
    if (isStackable(part.category)) return  // stackbare Parts nur via +/-
    setSelectedParts(prev => {
      if (part.category === 'engine') {
        return [...prev.filter(p => (partDefs ?? []).find(d => d.id === p)?.category !== 'engine'), pid]
      }
      const isSelected = prev.includes(pid)
      if (isSelected) return prev.filter(p => p !== pid)
      return [...prev, pid]
    })
  }

  // Waffenliste für Anzeige (installierte Waffen mit Angriffswert)
  const installedWeapons = selectedParts
    .map(pid => (partDefs ?? []).find(d => d.id === pid))
    .filter(p => p?.category === 'primary_weapon' || p?.category === 'turret')
    .map(p => ({
      name: p.name,
      type: p.category === 'primary_weapon' ? 'Primär' : 'Sekundär',
      weaponClass: p.weapon_class ?? '—',
      attack: weaponAttackBonus(p),
    }))

  // Original-Parts für Refit-Modus (zum Delta-Vergleich)
  const originalParts = refitMode && ship?.ship_designs?.installed_parts
    ? (Array.isArray(ship.ship_designs.installed_parts)
        ? ship.ship_designs.installed_parts.map(p => typeof p === 'string' ? p : p?.part_id).filter(Boolean)
        : [])
    : []

  // Stats der Original-Konfiguration (für Delta-Anzeige)
  const originalStats = originalParts.reduce((acc, pid) => {
    const p = (partDefs ?? []).find(d => d.id === pid)
    if (!p) return acc
    const atkContrib = (p.category === 'primary_weapon' || p.category === 'turret')
      ? weaponAttackBonus(p)
      : (p.attack_bonus || 0) - (p.attack_malus || 0)
    return {
      hp:       acc.hp       + (p.hp_bonus       || 0),
      attack:   acc.attack   + atkContrib,
      defense:  acc.defense  + (p.defense_bonus   || 0),
      speed:    acc.speed    + (p.speed_bonus     || 0) - (p.speed_malus    || 0),
      maneuver: acc.maneuver + (p.maneuver_bonus  || 0) - (p.maneuver_malus || 0),
      cargo:    acc.cargo    + (p.cargo_bonus     || 0),
    }
  }, { ...baseStats, attack: 0 })

  const handleBuild = async () => {
    if (!canBuild || busy) return
    setBuilding(true)

    if (refitMode) {
      // ── Umbau-Modus ──────────────────────────────────────────────────────
      try {
        const COST_KEYS_R = ['titan','silizium','aluminium','uran','plutonium']
        const toRemove  = originalParts.filter(id => !selectedParts.includes(id))
        const toInstall = selectedParts.filter(id => !originalParts.includes(id))

        // Netto-Kosten berechnen
        const netCosts = {}
        for (const pid of toInstall) {
          const p = (partDefs ?? []).find(d => d.id === pid)
          if (!p) continue
          for (const k of COST_KEYS_R) {
            netCosts[k] = (netCosts[k] ?? 0) + (p[`cost_${k}`] ?? 0)
          }
        }
        for (const pid of toRemove) {
          const p = (partDefs ?? []).find(d => d.id === pid)
          if (!p) continue
          for (const k of COST_KEYS_R) {
            netCosts[k] = (netCosts[k] ?? 0) - Math.floor((p[`cost_${k}`] ?? 0) * 0.75)
          }
        }

        // Ressourcen abbuchen/erstatten
        const updates = {}
        for (const [k, net] of Object.entries(netCosts)) {
          if (net !== 0) updates[k] = (planet[k] ?? 0) - net
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('planets').update(updates).eq('id', planet.id)
        }

        // Queue-Einträge sequenziell
        const applyDockBonus = (base, type) => {
          if (type === 'time') return base * Math.max(0.1, 1 - dockLevel * 0.015)
          return base
        }
        let offset = 0
        for (const pid of toRemove) {
          const p = (partDefs ?? []).find(d => d.id === pid)
          const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
          const min = applyDockBonus(base * 0.2, 'time')
          const finishAt = new Date(Date.now() + (offset + min) * 60 * 1000).toISOString()
          await supabase.from('refit_queue').insert({
            ship_id: ship.id, planet_id: planet.id, player_id: player.id,
            action: 'remove', part_id: pid, finish_at: finishAt,
          })
          offset += min
        }
        for (const pid of toInstall) {
          const p = (partDefs ?? []).find(d => d.id === pid)
          const base = p?.build_minutes ?? Math.max(0.1, (p?.cells_required ?? 1) / 10)
          const min = applyDockBonus(base, 'time')
          const finishAt = new Date(Date.now() + (offset + min) * 60 * 1000).toISOString()
          await supabase.from('refit_queue').insert({
            ship_id: ship.id, planet_id: planet.id, player_id: player.id,
            action: 'install', part_id: pid, finish_at: finishAt,
          })
          offset += min
        }

        queryClient?.invalidateQueries(['dock-ships'])
        queryClient?.invalidateQueries(['refit-queue', ship.id])
        queryClient?.invalidateQueries(['planet', player.id])
        onRefit?.()
        onClose()
      } catch (err) {
        addNotification('Fehler: ' + err.message, 'error')
      } finally {
        setBuilding(false)
      }
      return
    }

    // ── Bau-Modus ──────────────────────────────────────────────────────────
    try {
      const updates = {}
      for (const [res, amt] of Object.entries(costs)) updates[res] = (planet[res] || 0) - amt
      await supabase.from('planets').update(updates).eq('id', planet.id)

      const buildMinutes = Math.max(2, Math.floor((chassis.shipyard_space ?? 100) / 50))

      const { data: design, error: designErr } = await supabase.from('ship_designs').insert({
        player_id:       player.id,
        name:            chassis.name,
        chassis_id:      chassis.id,
        installed_parts: selectedParts,
        total_hp:        stats.hp,
        total_defense:   stats.defense,
        total_attack:    stats.attack,
        total_speed:     stats.speed,
        total_maneuver:  stats.maneuver,
        total_cargo:     stats.cargo,
        total_cells_used: totalCells,
        shipyard_space:  chassis.shipyard_space ?? 100,
        build_minutes:   buildMinutes,
        cost_titan:      costs.titan ?? 0,
        cost_silizium:   costs.silizium ?? 0,
        cost_aluminium:  costs.aluminium ?? 0,
        cost_uran:       costs.uran ?? 0,
        cost_plutonium:  costs.plutonium ?? 0,
        is_valid:        true,
      }).select().single()

      if (designErr) throw designErr

      const finishAt = new Date(Date.now() + buildMinutes * 60000).toISOString()
      const { error: queueErr } = await supabase.from('ship_build_queue').insert({
        planet_id:         planet.id,
        design_id:         design.id,
        quantity:          1,
        minutes_remaining: buildMinutes,
        finish_at:         finishAt,
      })
      if (queueErr) throw queueErr

      addNotification(`🚀 ${chassis.name} in Bau (${buildMinutes} Min.)`, 'success')
      onBuilt?.()
      onClose()
    } catch (err) {
      addNotification('Fehler: ' + err.message, 'error')
    } finally {
      setBuilding(false)
    }
  }

  const color = CLASS_COLORS[chassis.class]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-lg flex flex-col"
        style={{ background: '#040d1a', border: '1px solid rgba(34,211,238,0.2)' }}>

        <div className="flex items-center justify-between p-4 border-b border-cyan-500/15">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded text-sm font-mono font-bold"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
              {chassis.class}
            </span>
            <h2 className="text-lg font-display font-bold text-slate-200">{chassis.name} — Designer</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Part selector */}
          <div className="w-60 flex-shrink-0 border-r border-cyan-500/10 overflow-y-auto p-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs font-mono text-slate-500 mb-1">
                <span>Zellen</span>
                <span style={{ color: totalCells > chassis.total_cells ? '#f87171' : '#22d3ee' }}>
                  {totalCells} / {chassis.total_cells}
                </span>
              </div>
              <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(totalCells / chassis.total_cells * 100, 100)}%`,
                    background: totalCells > chassis.total_cells ? '#ef4444' : '#22d3ee',
                  }} />
              </div>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-500">
              <span>Primärwaffen</span>
              <span style={{ color: primaryCount > maxPrimary ? '#f87171' : primaryCount > 0 ? '#4ade80' : '#475569' }}>
                {primaryCount} / {maxPrimary}
              </span>
            </div>
            <div className="flex justify-between text-xs font-mono text-slate-500">
              <span>Antrieb</span>
              <span style={{ color: engineCount === 1 ? '#4ade80' : '#f87171' }}>
                {engineCount === 0 ? 'Fehlt' : engineCount === 1 ? '✓' : `${engineCount}x (zu viele)`}
              </span>
            </div>

            {PART_CATEGORIES.map(({ id, label, required }) => {
              const parts = getAvailableParts(id)
              if (parts.length === 0) return null
              return (
                <div key={id}>
                  <p className="text-xs font-mono uppercase tracking-widest mb-1"
                    style={{ color: required ? '#fbbf24' : '#475569' }}>
                    {label}{required ? ' *' : ''}
                  </p>
                  <div className="space-y-0.5">
                    {parts.map(part => {
                      const count = selectedParts.filter(p => p === part.id).length
                      const sel   = count > 0
                      const canStack = isStackable(part.category)
                      const wouldExceed = (totalCells + (part.cells_required || 0)) > chassis.total_cells
                      const primaryFull = part.category === 'primary_weapon' && primaryCount >= maxPrimary
                      const cantAdd = wouldExceed || primaryFull

                      if (canStack) {
                        // Stackbare Parts: Zeile mit +/- Buttons
                        return (
                          <div key={part.id} className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
                            style={{
                              background: sel ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)',
                              border: sel ? '1px solid rgba(34,211,238,0.25)' : '1px solid rgba(255,255,255,0.06)',
                            }}>
                            <span className="flex-1 truncate" style={{ color: sel ? '#22d3ee' : '#94a3b8' }}>
                              {part.name}
                            </span>
                            <span className="text-slate-700 mr-1 flex-shrink-0">{part.cells_required}Z</span>
                            {/* − Button */}
                            <button
                              onClick={() => removePart(part.id)}
                              disabled={count === 0}
                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all font-bold text-sm leading-none"
                              style={{
                                background: count > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${count > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                color: count > 0 ? '#f87171' : '#1e293b',
                                cursor: count === 0 ? 'not-allowed' : 'pointer',
                              }}>
                              −
                            </button>
                            {/* Count */}
                            <span className="w-5 text-center font-mono font-bold text-xs flex-shrink-0"
                              style={{ color: count > 0 ? '#22d3ee' : '#334155' }}>
                              {count}
                            </span>
                            {/* + Button */}
                            <button
                              onClick={() => addPart(part.id)}
                              disabled={cantAdd}
                              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all font-bold text-sm leading-none"
                              style={{
                                background: !cantAdd ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${!cantAdd ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                color: !cantAdd ? '#22d3ee' : '#1e293b',
                                cursor: cantAdd ? 'not-allowed' : 'pointer',
                              }}>
                              +
                            </button>
                          </div>
                        )
                      }

                      // Nicht-stackbare Parts: normaler Toggle-Button
                      return (
                        <button key={part.id} onClick={() => togglePart(part.id)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs transition-all"
                          style={{
                            background: sel ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)',
                            border: sel ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.06)',
                            color: sel ? '#22d3ee' : '#94a3b8',
                          }}>
                          <div className="flex justify-between items-center">
                            <span className="truncate">{part.name}</span>
                            <span className="text-slate-600 ml-1 flex-shrink-0">{part.cells_required}Z</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-44 h-44 rounded overflow-hidden"
                style={{ border: '1px solid rgba(34,211,238,0.15)' }}>
                <img src={`/ships/${chassis.id}.png`} alt={chassis.name}
                  className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                {[
                  ['HP', stats.hp, baseStats.hp],
                  ['Angriff', stats.attack, baseStats.attack],
                  ['Verteidigung', stats.defense, baseStats.defense],
                  ['Geschw.', stats.speed, baseStats.speed],
                  ['Manöver', stats.maneuver, baseStats.maneuver],
                  ['Laderaum', stats.cargo, baseStats.cargo],
                ].map(([l, v, b]) => {
                  const origV = refitMode ? originalStats[{
                    HP: 'hp', Angriff: 'attack', Verteidigung: 'defense',
                    'Geschw.': 'speed', Manöver: 'maneuver', Laderaum: 'cargo'
                  }[l]] ?? v : b
                  const delta = v - origV
                  return (
                    <div key={l} className="px-3 py-2 rounded"
                      style={{ background: 'rgba(7,20,40,0.6)', border: '1px solid rgba(34,211,238,0.08)' }}>
                      <div className="text-xs text-slate-500 font-mono">{l}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {refitMode && delta !== 0 ? (
                          <>
                            <span className="text-sm font-mono text-slate-500 line-through">{origV}</span>
                            <span className="text-xs text-slate-600">→</span>
                            <span className="text-base font-mono font-bold"
                              style={{ color: delta > 0 ? '#4ade80' : '#f87171' }}>{v}</span>
                            <span className="text-xs font-mono font-semibold"
                              style={{ color: delta > 0 ? '#4ade80' : '#f87171' }}>
                              ({delta > 0 ? '+' : ''}{delta})
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-base font-mono font-bold text-slate-200">{v}</span>
                            {!refitMode && v - b !== 0 && (
                              <span className={`text-xs font-mono ${v > b ? 'text-green-400' : 'text-red-400'}`}>
                                {v > b ? `+${v - b}` : v - b}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Waffenliste */}
            {installedWeapons.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Bewaffnung</p>
                <div className="space-y-1">
                  {installedWeapons.map((w, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded text-xs font-mono"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-slate-300">{w.name}</span>
                      <span className="text-slate-500 flex items-center gap-2">
                        <span style={{ color: w.type === 'Primär' ? '#22d3ee' : '#a78bfa' }}>{w.type}</span>
                        <span>Klasse {w.weaponClass}</span>
                        <span className="font-semibold" style={{ color: '#f59e0b' }}>{w.attack} Atk</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {engineCount === 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-400 px-3 py-2 rounded"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <AlertTriangle size={14} /> Kein Antrieb — genau 1 Hauptantrieb erforderlich
              </div>
            )}
            {engineCount > 1 && (
              <div className="flex items-center gap-2 text-sm text-amber-400 px-3 py-2 rounded"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <AlertTriangle size={14} /> Zu viele Antriebe — nur 1 Hauptantrieb erlaubt
              </div>
            )}
            {!primaryOk && (
              <div className="flex items-center gap-2 text-sm text-amber-400 px-3 py-2 rounded"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                <AlertTriangle size={14} /> Zu viele Primärwaffen — max. {maxPrimary} für dieses Chassis
              </div>
            )}

            {Object.keys(costs).length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-mono mb-2">Gesamtkosten</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(costs).map(([res, amt]) => {
                    const rest = (planet?.[res] ?? 0) - amt
                    const ok   = rest >= 0
                    return (
                      <div key={res} className="grid text-sm font-mono px-2 py-1 rounded"
                        style={{ gridTemplateColumns: '1fr 55px 65px', background: 'rgba(4,13,26,0.6)' }}>
                        <span className="text-slate-400 capitalize">{res}</span>
                        <span className="text-right text-slate-300">{fmt(amt)}</span>
                        <span className={`text-right font-bold ${ok ? 'text-slate-500' : 'text-red-400'}`}>
                          {ok ? fmt(rest) : `-${fmt(Math.abs(rest))}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-cyan-500/15">
          <button onClick={onClose} className="btn-ghost text-sm">Abbrechen</button>
          <button onClick={handleBuild} disabled={!canBuild || busy}
            className={`btn-primary py-2 px-6 text-sm flex items-center gap-2 ${!canBuild ? 'opacity-40' : ''}`}>
            {busy
              ? <><Hammer size={14} className="animate-pulse" /> {refitMode ? 'Wird umgebaut...' : 'Wird gebaut...'}</>
              : refitMode
                ? <><Settings size={14} /> Umbau bestätigen</>
                : <><Rocket size={14} /> {chassis.name} bauen</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Chassis Card ──────────────────────────────────────────────────────────────

function ChassisCard({ chassis, player, shipyardLevel, onSelect }) {
  const noYard    = shipyardLevel < 1
  const wrongProf = chassis.required_profession && player?.profession !== chassis.required_profession
  const disabled  = noYard || wrongProf
  const color     = CLASS_COLORS[chassis.class]

  return (
    <motion.div className="panel overflow-hidden cursor-pointer" style={{ opacity: disabled ? 0.4 : 1 }}
      whileHover={!disabled ? { borderColor: `${color}50` } : {}}
      onClick={() => !disabled && onSelect(chassis)}>
      <div className="relative overflow-hidden" style={{ height: 300 }}>
        <img src={`/ships/${chassis.id}.png`} alt={chassis.name}
          className="w-full h-full object-cover"
          style={{ filter: disabled ? 'grayscale(80%) brightness(0.5)' : 'brightness(0.9)' }} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(4,13,26,0.97) 100%)' }} />
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold"
          style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>
          {chassis.class}
        </div>
        {!disabled && (
          <div className="absolute bottom-8 right-2 text-xs text-cyan-400/50 font-mono flex items-center gap-1">
            <ChevronRight size={11} /> Designer
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-slate-200">{chassis.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{CLASS_DESC[chassis.class]}</p>
          </div>
          {chassis.required_profession && (
            <span className="text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0"
              style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              {PROFESSION_LABELS[chassis.required_profession]}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 text-xs font-mono text-center">
          {[['HP', chassis.base_hp], ['ATK', chassis.base_attack], ['SPD', chassis.base_speed], ['MNV', chassis.base_maneuver]].map(([l, v]) => (
            <div key={l} className="rounded py-1" style={{ background: 'rgba(7,20,40,0.5)' }}>
              <div className="text-slate-600">{l}</div>
              <div className="text-slate-300">{v}</div>
            </div>
          ))}
        </div>
        {wrongProf && (
          <p className="text-xs text-red-400/60 font-mono">
            Nur für {PROFESSION_LABELS[chassis.required_profession]}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ShipyardPage() {
  const { planet, player, buildings, hasTech } = useGameStore()
  const [classFilter, setClassFilter] = useState('all')
  const [designer, setDesigner]       = useState(null)

  const shipyardLevel = buildings.find(b => b.building_id === 'shipyard')?.level ?? 0

  const { data: chassisDefs } = useQuery({
    queryKey: ['chassis-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('chassis_definitions').select('*').order('class')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const { data: partDefs } = useQuery({
    queryKey: ['part-defs'],
    queryFn: async () => {
      const { data } = await supabase.from('ship_part_definitions').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  const { data: myShips, refetch: refetchShips } = useQuery({
    queryKey: ['my-ships', player?.id],
    queryFn: async () => {
      const { data } = await supabase.from('ships')
        .select('*, ship_designs(shipyard_space), fleets!inner(player_id)')
        .eq('fleets.player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 15000,
  })

  const { data: buildQueue = [], refetch: refetchBuildQueue } = useQuery({
    queryKey: ['ship-build-queue', planet?.id],
    queryFn: async () => {
      const { data } = await supabase.from('ship_build_queue')
        .select('*, ship_designs(name, shipyard_space, chassis_id)')
        .eq('planet_id', planet.id)
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 10000,
  })

  const shipyardCapacity = shipyardLevel * 500
  const usedByShips = (myShips ?? []).reduce((sum, s) => sum + (s.ship_designs?.shipyard_space ?? 0), 0)
  const usedByQueue = buildQueue.reduce((sum, q) => sum + (q.ship_designs?.shipyard_space ?? 0) * (q.quantity ?? 1), 0)
  const usedCapacity = usedByShips + usedByQueue
  const freeCapacity = shipyardCapacity - usedCapacity

  const available = (chassisDefs ?? []).filter(c => !c.required_tech || hasTech(c.required_tech))
  const CLASS_ORDER = ['Z', 'A', 'B', 'C', 'D', 'E']
  const classes   = ['all', ...CLASS_ORDER.filter(cls => available.some(c => c.class === cls))]
  const filtered  = available.filter(c => classFilter === 'all' || c.class === classFilter)

  if (shipyardLevel < 1) return (
    <div className="max-w-2xl mx-auto">
      <div className="panel p-8 text-center space-y-3">
        <Rocket size={48} className="mx-auto text-slate-600" />
        <h2 className="text-xl font-display text-slate-300">Schiffswerft nicht gebaut</h2>
        <p className="text-slate-500">Baue zuerst eine Schiffswerft auf deinem Planeten.</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Schiffswerft</h2>
          <p className="text-sm text-slate-500 font-mono">Lvl {shipyardLevel} · {myShips?.length ?? 0} Schiffe</p>
        </div>
        <div className="panel p-3 min-w-[200px]">
          <div className="flex justify-between text-xs font-mono text-slate-500 mb-1.5">
            <span>Werftkapazität</span>
            <span style={{ color: freeCapacity <= 0 ? '#f87171' : '#22d3ee' }}>
              {usedCapacity} / {shipyardCapacity}
            </span>
          </div>
          <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-2 rounded-full transition-all"
              style={{
                width: `${shipyardCapacity > 0 ? Math.min(usedCapacity / shipyardCapacity * 100, 100) : 0}%`,
                background: freeCapacity <= 0 ? '#ef4444' : '#22d3ee',
              }} />
          </div>
          <p className="text-xs font-mono mt-1" style={{ color: freeCapacity <= 0 ? '#f87171' : '#4ade80' }}>
            {freeCapacity <= 0 ? 'Keine Kapazität frei' : `${freeCapacity} frei`}
          </p>
        </div>
      </div>

      {/* Build Queue */}
      {buildQueue.length > 0 && (
        <div className="panel p-3 space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">In Bau</p>
          {buildQueue.map(q => {
            const finishMs  = q.finish_at ? new Date(q.finish_at).getTime() : 0
            const remaining = Math.max(0, Math.floor((finishMs - Date.now()) / 1000))
            const mins = Math.floor(remaining / 60)
            const secs = remaining % 60
            return (
              <div key={q.id} className="flex items-center gap-3 text-sm font-mono">
                <Hammer size={13} className="text-amber-400 animate-pulse flex-shrink-0" />
                <span className="text-slate-300 flex-1">{q.ship_designs?.name ?? 'Schiff'}</span>
                <span className="text-amber-400">{mins}m {secs}s</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Class Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {classes.map(cls => {
          const clsColor = CLASS_COLORS[cls] ?? '#22d3ee'
          const isActive = classFilter === cls
          return (
            <button key={cls} onClick={() => setClassFilter(cls)}
              className="px-3 py-1.5 rounded text-sm font-mono transition-all"
              style={{
                background: isActive ? `${clsColor}20` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? `${clsColor}50` : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? clsColor : '#64748b',
              }}>
              {cls === 'all' ? 'Alle' : CLASS_LABELS[cls]}
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="panel p-8 text-center text-slate-500 text-sm">
          Keine Schiffe verfügbar. Erforsche neue Technologien im Forschungszentrum.
        </div>
      )}

      {/* Chassis Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(chassis => (
          <ChassisCard key={chassis.id} chassis={chassis} player={player}
            shipyardLevel={shipyardLevel} onSelect={setDesigner} />
        ))}
      </div>

      <AnimatePresence>
        {designer && (
          <ShipDesigner
            chassis={designer} planet={planet} player={player}
            partDefs={partDefs} hasTech={hasTech}
            onClose={() => setDesigner(null)}
            onBuilt={() => { refetchShips(); refetchBuildQueue(); }}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
