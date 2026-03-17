// supabase/functions/process-tick/index.ts
// Tick-System — läuft alle 30 Sekunden via externem Cron (Upstash/Render)
// Reihenfolge: Lock → Counter → Ressourcen → Build → Research → Schiffsbau → Flotten

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Konstanten ───────────────────────────────────────────────────────────────

const PROD_PER_MINE_PER_TICK = 50 / 60  // 50/h bei 60 Ticks/h

const MINEABLE = [
  'titan','silizium','helium','nahrung','wasser',
  'bauxit','aluminium','uran','plutonium','wasserstoff'
] as const

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const secret = req.headers.get('x-tick-secret') ?? url.searchParams.get('secret')
  if (secret !== Deno.env.get('TICK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // ── 1. Advisory Lock ──────────────────────────────────────────────────────
    const { data: lockData } = await supabase.rpc('try_tick_lock')
    if (!lockData) {
      return new Response(JSON.stringify({ skip: 'locked' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const tickStart = Date.now()
    const log: string[] = []

    try {
      // ── 2. Tick-Counter ───────────────────────────────────────────────────
      const { data: tickRow } = await supabase
        .from('game_tick').select('current_tick').single()

      const currentTick = (tickRow?.current_tick ?? 0) + 1

      await supabase.from('game_tick')
        .update({ current_tick: currentTick, last_tick_at: new Date().toISOString() })
        .eq('id', 1)

      log.push(`tick=${currentTick}`)

      // ── 3. Gebäude-Definitionen laden (einmalig für alle Planeten) ─────────
      const { data: buildingDefs } = await supabase
        .from('building_definitions')
        .select('id, energy_per_level')  // ⚠ energy_per_level, NICHT energy_cost!

      const { data: allPlanetBuildings } = await supabase
        .from('planet_buildings')
        .select('planet_id, building_id, level, is_active')
        .eq('is_active', true)

      // ── 4. Ressourcenproduktion ───────────────────────────────────────────
      // Boni via SQL JOIN direkt auf DB berechnen — kein EarlyDrop durch viele Requests
      const { data: playerBoni } = await supabase.rpc('get_mine_bonuses')

      const bonusMap: Record<string, number> = {}
      for (const row of playerBoni ?? []) {
        bonusMap[row.player_id] = 1.0 + Number(row.total_bonus)
      }

      const { data: planets, error: planetsError } = await supabase
        .from('planets')
        .select('id, owner_id, mine_distribution, energie, credits, energy_consumed, ' +
          MINEABLE.map(r => r).join(', '))

      if (planetsError) throw planetsError

      if (planets?.length) {
        for (const planet of planets) {
          const mineBonus = bonusMap[planet.owner_id] ?? 1.0
          await processPlanetTick(planet, allPlanetBuildings ?? [], buildingDefs ?? [], log, mineBonus)
        }
        log.push(`planets=${planets.length}`)
      }

      // ── 5. Gebäude-Queue ──────────────────────────────────────────────────
      await processBuildQueue(log)

      // ── 6. Research-Queue ─────────────────────────────────────────────────
      await processResearchQueue(log)

      // ── 7. Schiffsbau-Queue ───────────────────────────────────────────────
      await processShipBuildQueue(log)

      // ── 8. Flotten-Bewegungen ─────────────────────────────────────────────
      await processFleets(log)

      // ── 9. Kämpfe auflösen ────────────────────────────────────────────────
      await processCombat(log)

      // ── 10. Asteroiden Despawn / Respawn ──────────────────────────────────
      await processAsteroidTick(log)

    } finally {
      await supabase.rpc('release_tick_lock')
    }

    const duration = Date.now() - tickStart
    log.push(`${duration}ms`)

    return new Response(JSON.stringify({ ok: true, log }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Tick error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

// ─── Planet-Tick ──────────────────────────────────────────────────────────────

async function processPlanetTick(
  planet: any,
  allBuildings: any[],
  buildingDefs: any[],
  log: string[],
  mineBonus: number = 1.0
) {
  const dist = planet.mine_distribution ?? {}
  const planetBuildings = allBuildings.filter(b => b.planet_id === planet.id)

  // Energie
  const kraftwerkLevel = planetBuildings.find(b => b.building_id === 'power_plant')?.level ?? 0
  const energieProduktion = kraftwerkLevel * 100

  let energieVerbrauch = 0
  for (const pb of planetBuildings) {
    const def = buildingDefs.find(d => d.id === pb.building_id)
    if (def?.energy_per_level) energieVerbrauch += def.energy_per_level * pb.level
  }

  const energieSaldo = energieProduktion - energieVerbrauch
  const energieFaktor = energieSaldo >= 0 ? 1.0 : 0.5

  // Ressourcenproduktion
  const updates: Record<string, number> = {}
  const prodUpdates: Record<string, number> = {}

  for (const res of MINEABLE) {
    const mines = dist[res] ?? 0
    const prodPerTick = mines * PROD_PER_MINE_PER_TICK * energieFaktor * mineBonus
    const prodPerHour = Math.round(mines * 50 * energieFaktor * mineBonus)
    if (mines > 0) updates[res] = Math.floor((planet[res] ?? 0) + prodPerTick)
    prodUpdates[`prod_${res}`] = prodPerHour
  }

  // Energie gecacht
  updates['energie'] = Math.max(0, energieSaldo)
  updates['energy_consumed'] = energieVerbrauch

  // Credits: Regierungssitz
  const govLevel = planetBuildings.find(b => b.building_id === 'gov_center')?.level ?? 0
  if (govLevel > 0) {
    updates['credits'] = (planet['credits'] ?? 0) + govLevel * 10
    prodUpdates['prod_credits'] = govLevel * 10 * 60
  }

  const allUpdates = { ...updates, ...prodUpdates }
  if (Object.keys(allUpdates).length > 0) {
    const { error } = await supabase.from('planets').update(allUpdates).eq('id', planet.id)
    if (error) log.push(`planet_err(${planet.id}): ${error.message}`)
  }
}

// ─── Notifications Helper ─────────────────────────────────────────────────────

async function notify(playerId: string, type: string, title: string, message: string, data: Record<string, any> = {}) {
  await supabase.from('player_notifications').insert({ player_id: playerId, type, title, message, data })
}

// ─── Gebäude-Queue ────────────────────────────────────────────────────────────

async function processBuildQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('build_queue').select('*, planets(owner_id)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  for (const item of doneItems) {
    const { error } = await supabase.from('planet_buildings').upsert(
      { planet_id: item.planet_id, building_id: item.building_id, level: item.target_level, is_active: true },
      { onConflict: 'planet_id,building_id' }
    )
    if (error) { log.push(`build_err: ${error.message}`); continue }

    if (item.building_id === 'hq') {
      await supabase.from('planets')
        .update({ total_mine_slots: item.target_level * 50 })
        .eq('id', item.planet_id)
    }

    await supabase.from('build_queue').delete().eq('id', item.id)

    const ownerId = item.planets?.owner_id
    if (ownerId) {
      await notify(ownerId, 'building_done',
        'Gebäude fertiggestellt',
        `${item.building_id} wurde auf Level ${item.target_level} ausgebaut.`,
        { building_id: item.building_id, level: item.target_level, planet_id: item.planet_id }
      )
    }
    completed++
  }

  if (completed > 0) log.push(`builds_done=${completed}`)
}

// ─── Research-Queue ───────────────────────────────────────────────────────────

async function processResearchQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('research_queue')
    .select('*, tech_definitions(base_success_chance)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  let failed = 0

  for (const item of doneItems) {
    // Forscher-Bonus: researchers.count für diesen branch
    const { data: resRows } = await supabase
      .from('researchers')
      .select('count')
      .eq('player_id', item.player_id)
      .eq('branch', item.branch)

    const researcherCount = resRows?.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0) ?? 0
    const researcherBonus = researcherCount * 5
    const baseChance = item.tech_definitions?.base_success_chance ?? 80
    const chance = Math.min(95, baseChance + researcherBonus)
    const success = Math.random() * 100 <= chance

    if (success) {
      const { data: existing } = await supabase
        .from('player_technologies')
        .select('level')
        .eq('player_id', item.player_id)
        .eq('tech_id', item.tech_id)
        .maybeSingle()

      const newLevel = (existing?.level ?? 0) + 1

      await supabase.from('player_technologies').upsert(
        { player_id: item.player_id, tech_id: item.tech_id, level: newLevel },
        { onConflict: 'player_id,tech_id' }
      )
      await notify(item.player_id, 'research_done',
        'Forschung erfolgreich',
        `${item.tech_id} wurde erfolgreich auf Level ${newLevel} erforscht.`,
        { tech_id: item.tech_id, level: newLevel }
      )
      completed++
    } else {
      await notify(item.player_id, 'research_failed',
        'Forschung fehlgeschlagen',
        `${item.tech_id} konnte nicht auf das nächste Level erforscht werden.`,
        { tech_id: item.tech_id }
      )
      failed++
    }

    await supabase.from('research_queue').delete().eq('id', item.id)
  }

  if (completed > 0) log.push(`research_done=${completed}`)
  if (failed > 0) log.push(`research_failed=${failed}`)
}

// ─── Schiffsbau-Queue ─────────────────────────────────────────────────────────

async function processShipBuildQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('ship_build_queue')
    .select('*, ship_designs(*)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0

  for (const item of doneItems) {
    const design = item.ship_designs
    if (!design) {
      await supabase.from('ship_build_queue').delete().eq('id', item.id)
      continue
    }

    // Schiff wird OHNE fleet_id erstellt — Position = Heimatplanet
    // Planet-Position aus ship_build_queue.planet_id holen
    const { data: buildPlanet } = await supabase
      .from('planets').select('x, y, z').eq('id', item.planet_id).single()

    const { error: shipErr } = await supabase.from('ships').insert({
      design_id: design.id,
      player_id: design.player_id,
      fleet_id: null,
      name: design.name,
      current_hp: design.total_hp,
      max_hp: design.total_hp,
      x: buildPlanet?.x ?? null,
      y: buildPlanet?.y ?? null,
      z: buildPlanet?.z ?? null,
    })

    if (shipErr) {
      log.push(`ship_err: ${shipErr.message}`)
      continue
    }

    await notify(design.player_id, 'ship_built',
      'Schiff fertiggestellt',
      `${design.name} wurde erfolgreich gebaut und befindet sich im Dock.`,
      { ship_name: design.name, chassis_id: design.chassis_id, planet_id: item.planet_id }
    )

    await supabase.from('ship_build_queue').delete().eq('id', item.id)
    completed++
  }

  if (completed > 0) log.push(`ships_done=${completed}`)
}

// ─── Flotten-Bewegungen ───────────────────────────────────────────────────────

async function processFleets(log: string[]) {
  // Alle Flotten die unterwegs sind und deren arrive_at erreicht/überschritten ist
  const { data: arrivedFleets } = await supabase
    .from('fleets')
    .select('*')
    .eq('is_in_transit', true)
    .not('arrive_at', 'is', null)
    .lte('arrive_at', new Date().toISOString())

  if (!arrivedFleets?.length) return

  let arrived = 0
  for (const fleet of arrivedFleets) {
    const newX = fleet.target_x
    const newY = fleet.target_y
    const newZ = fleet.target_z ?? fleet.z

    const { error } = await supabase.from('fleets').update({
      is_in_transit: false,
      mission: 'idle',
      x: newX,
      y: newY,
      z: newZ,
      target_x: null,
      target_y: null,
      target_z: null,
      arrive_at: null,
    }).eq('id', fleet.id)

    if (!error) {
      // Schiffe in der Flotte mitbewegen
      await supabase.from('ships').update({ x: newX, y: newY, z: newZ })
        .eq('fleet_id', fleet.id)

      await notify(fleet.player_id, 'fleet_arrived',
        'Flotte angekommen',
        `${fleet.name ?? 'Flotte'} ist an den Koordinaten ${newX} / ${newY} / ${newZ} angekommen.`,
        { fleet_id: fleet.id, fleet_name: fleet.name, x: newX, y: newY, z: newZ }
      )
      arrived++
    } else {
      log.push(`fleet_arrive_err(${fleet.id}): ${error.message}`)
    }
  }

  if (arrived > 0) log.push(`fleets_arrived=${arrived}`)
}

async function processAsteroidTick(log: string[]) {
  const { data, error } = await supabase.rpc('asteroid_tick')
  if (error) { log.push(`asteroid_tick_err: ${error.message}`); return }
  if (data?.despawned > 0) log.push(`asteroids_despawned=${data.despawned}`)
  if (data?.respawned  > 0) log.push(`asteroids_respawned=${data.respawned}`)
}

// ─── Kampfsystem ──────────────────────────────────────────────────────────────

// ── NPC Chassis-Pool nach Schwierigkeit ──────────────────────────────────────

const NPC_DIFFICULTY: Record<string, string> = {
  pirat_leicht:    'rookie',
  pirat_mittel:    'veteran',
  piraten_verbund: 'elite',
  haendler_konvoi: 'rookie',
  npc_streitmacht: 'commander',
}

type Difficulty = 'rookie' | 'soldat' | 'veteran' | 'elite' | 'commander'

const DIFF_STATS: Record<Difficulty, { statMul: number; hpMul: number }> = {
  rookie:    { statMul: 1.0, hpMul: 1.5 },
  soldat:    { statMul: 1.5, hpMul: 2.0 },
  veteran:   { statMul: 2.0, hpMul: 2.5 },
  elite:     { statMul: 2.5, hpMul: 3.0 },
  commander: { statMul: 3.0, hpMul: 4.0 },
}

const DIFF_CLASSES: Record<Difficulty, { combat: string[]; trade: string[] }> = {
  rookie:    { combat: ['B','B','C'],         trade: ['Z'] },
  soldat:    { combat: ['B','C','C'],         trade: ['Z'] },
  veteran:   { combat: ['B','C','C','D'],     trade: ['A'] },
  elite:     { combat: ['C','C','D','D','E'], trade: ['A'] },
  commander: { combat: ['D','D','E','E'],     trade: ['A'] },
}

const CLASS_SHOTS: Record<string, number> = { Z: 0, A: 0, B: 1, C: 2, D: 3, E: 6 }

function calcDamage(attack: number, defense: number): number {
  return Math.max(1, Math.round(attack * (1 - defense / (defense + 100))))
}

function hitChance(atkManeuver: number, defManeuver: number): number {
  return Math.min(0.90, Math.max(0.10, (50 + atkManeuver * 0.5 - defManeuver * 0.5) / 100))
}

function rand(): number { return Math.random() }

interface NpcShip {
  id: string; chassisClass: string; chassisId: string; name: string
  hp: number; maxHp: number; attack: number; defense: number
  speed: number; maneuver: number; cargo: number; shots: number
  targetClass: string; isTrader: boolean; loot: Record<string, number>
}

function buildNpcShip(chassis: any, diff: Difficulty, isTrader: boolean, idx: number): NpcShip {
  const { statMul, hpMul } = DIFF_STATS[diff]
  const loot: Record<string, number> = {}
  if (isTrader) {
    const resources = ['titan','silizium','helium','aluminium','uran']
    const count = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
      const res = resources[Math.floor(rand() * resources.length)]
      loot[res] = (loot[res] ?? 0) + Math.floor(500 + rand() * 2000)
    }
  }
  return {
    id: `npc_${idx}`, chassisClass: chassis.class, chassisId: chassis.id,
    name: isTrader ? `${chassis.name} (Händler)` : chassis.name,
    hp: Math.round(chassis.base_hp * hpMul), maxHp: Math.round(chassis.base_hp * hpMul),
    attack:   Math.round(chassis.base_attack   * statMul),
    defense:  Math.round(chassis.base_defense  * statMul),
    speed:    Math.round(chassis.base_speed    * statMul),
    maneuver: Math.round(chassis.base_maneuver * statMul),
    cargo: chassis.base_cargo,
    shots: isTrader ? 0 : (CLASS_SHOTS[chassis.class] ?? 0),
    targetClass: chassis.class, isTrader, loot,
  }
}

function buildNpcFleet(npcType: string, chassisDefs: any[]): NpcShip[] {
  const diff = (NPC_DIFFICULTY[npcType] ?? 'rookie') as Difficulty
  const pool = DIFF_CLASSES[diff]
  const ships: NpcShip[] = []
  let idx = 0
  const combatCount = 1 + Math.floor(rand() * Math.min(3, pool.combat.length))
  for (let i = 0; i < combatCount; i++) {
    const cls = pool.combat[Math.floor(rand() * pool.combat.length)]
    const cands = chassisDefs.filter((c: any) => c.class === cls && !c.id.includes('station'))
    if (!cands.length) continue
    ships.push(buildNpcShip(cands[Math.floor(rand() * cands.length)], diff, false, idx++))
  }
  const tradeCls = pool.trade[Math.floor(rand() * pool.trade.length)]
  const tradeCands = chassisDefs.filter((c: any) =>
    c.class === tradeCls && c.base_cargo > 0 && !c.id.includes('station') && !c.id.includes('probe')
  )
  if (tradeCands.length)
    ships.push(buildNpcShip(tradeCands[Math.floor(rand() * tradeCands.length)], diff, true, idx++))
  return ships
}

interface CombatShip {
  id: string; name: string; chassisClass: string
  hp: number; maxHp: number; attack: number; defense: number
  speed: number; maneuver: number; shots: number
  autoRetreatAt: number; isPlayer: true
}

function playerShipToCombat(ship: any, chassisDefs: any[]): CombatShip {
  const d = ship.ship_designs
  const chassis = chassisDefs.find((c: any) => c.id === d?.chassis_id)
  const cls = chassis?.class ?? 'B'
  const parts: string[] = d?.installed_parts ?? []
  const weaponCount = parts.filter((p: string) =>
    p.startsWith('laser') || p.startsWith('ion_cannon') || p.startsWith('railgun') || p.startsWith('turret')
  ).length
  return {
    id: ship.id, name: ship.name ?? d?.name ?? 'Schiff', chassisClass: cls,
    hp: ship.current_hp, maxHp: ship.max_hp,
    attack:   d?.total_attack   ?? chassis?.base_attack   ?? 10,
    defense:  d?.total_defense  ?? chassis?.base_defense  ?? 5,
    speed:    d?.total_speed    ?? chassis?.base_speed    ?? 20,
    maneuver: d?.total_maneuver ?? chassis?.base_maneuver ?? 20,
    shots: Math.max(1, weaponCount),
    autoRetreatAt: ship.auto_retreat_at ?? 0,
    isPlayer: true,
  }
}

interface RoundAction {
  attackerId: string; attackerName: string
  targetId: string; targetName: string
  hit: boolean; damage: number; targetHpAfter: number; destroyed: boolean
}

// Simuliert EINE Runde — mutiert hp in-place
// NPCs fliehen nie (no autoRetreat for NPCs)
function simulateOneRound(
  pShips: CombatShip[],
  nShips: NpcShip[]
): { actions: RoundAction[]; playerHpTotal: number; npcHpTotal: number; fleeingPlayerIds: string[] } {
  const actions: RoundAction[] = []
  const fleeingPlayerIds: string[] = []

  type Fighter = { id: string; name: string; maneuver: number; side: 'player' | 'npc' }
  const order: Fighter[] = [
    ...pShips.filter(s => s.hp > 0).map(s => ({ id: s.id, name: s.name, maneuver: s.maneuver + rand() * 5, side: 'player' as const })),
    ...nShips.filter(s => s.hp > 0).map(s => ({ id: s.id, name: s.name, maneuver: s.maneuver + rand() * 5, side: 'npc' as const })),
  ].sort((a, b) => b.maneuver - a.maneuver)

  for (const fighter of order) {
    if (fighter.side === 'player') {
      const attacker = pShips.find(s => s.id === fighter.id)
      if (!attacker || attacker.hp <= 0) continue
      const targets = nShips.filter(s => s.hp > 0)
      if (!targets.length) break
      for (let shot = 0; shot < attacker.shots; shot++) {
        const alive = nShips.filter(s => s.hp > 0)
        if (!alive.length) break
        const pref = alive.filter(s => s.chassisClass === attacker.chassisClass)
        const target = pref.length ? pref[Math.floor(rand() * pref.length)] : alive[Math.floor(rand() * alive.length)]
        const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
        const damage = hit ? calcDamage(attacker.attack, target.defense) : 0
        if (hit) target.hp = Math.max(0, target.hp - damage)
        actions.push({ attackerId: attacker.id, attackerName: attacker.name, targetId: target.id, targetName: target.name, hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0 })
      }
    } else {
      const attacker = nShips.find(s => s.id === fighter.id)
      if (!attacker || attacker.hp <= 0 || attacker.isTrader || attacker.shots === 0) continue
      const alive = pShips.filter(s => s.hp > 0)
      if (!alive.length) break
      for (let shot = 0; shot < attacker.shots; shot++) {
        const stillAlive = pShips.filter(s => s.hp > 0)
        if (!stillAlive.length) break
        const pref = stillAlive.filter(s => s.chassisClass === attacker.targetClass)
        const target = pref.length ? pref[Math.floor(rand() * pref.length)] : stillAlive[Math.floor(rand() * stillAlive.length)]
        const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
        const damage = hit ? calcDamage(attacker.attack, target.defense) : 0
        if (hit) target.hp = Math.max(0, target.hp - damage)
        actions.push({ attackerId: attacker.id, attackerName: attacker.name, targetId: target.id, targetName: target.name, hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0 })
      }
    }
  }

  // Auto-Retreat prüfen nach der Runde
  for (const ps of pShips) {
    if (ps.hp > 0 && ps.autoRetreatAt > 0) {
      if ((ps.hp / ps.maxHp) * 100 <= ps.autoRetreatAt) {
        ps.hp = -1 // geflohen
        fleeingPlayerIds.push(ps.id)
      }
    }
  }

  return {
    actions,
    playerHpTotal: pShips.filter(s => s.hp > 0).reduce((a, s) => a + s.hp, 0),
    npcHpTotal:    nShips.filter(s => s.hp > 0).reduce((a, s) => a + s.hp, 0),
    fleeingPlayerIds,
  }
}

// ── Hauptfunktion: Kämpfe im Tick auflösen ────────────────────────────────────

async function processCombat(log: string[]) {
  const chassisDefs = await supabase.from('chassis_definitions').select('*').then(r => r.data ?? [])
  if (!chassisDefs.length) return

  // ── 1. Abgelaufene NPC-Kampfflotten löschen ────────────────────────────────
  await supabase.from('npc_combat_fleets').delete().lt('expires_at', new Date().toISOString())

  // ── 2. Laufende Kämpfe: je eine Runde simulieren ──────────────────────────
  const { data: activeBattles } = await supabase
    .from('active_battles')
    .select('*, fleets(player_id, flight_mode, x, y, z, ships(*, ship_designs(*)))')

  let battlesResolved = 0

  for (const battle of activeBattles ?? []) {
    const pShips: CombatShip[] = battle.player_ships
    const nShips: NpcShip[]    = battle.npc_ships
    const alivePlayers = pShips.filter((s: CombatShip) => s.hp > 0)
    const aliveNpcs    = nShips.filter((s: NpcShip) => s.hp > 0)

    if (!alivePlayers.length || !aliveNpcs.length) {
      // Kampf bereits entschieden — aufräumen
      await finalizeBattle(battle, pShips, nShips, chassisDefs, log)
      await supabase.from('active_battles').delete().eq('id', battle.id)
      battlesResolved++
      continue
    }

    // Eine Runde simulieren
    const roundResult = simulateOneRound(pShips, nShips)
    const roundLog = {
      round: battle.round + 1,
      actions: roundResult.actions,
      playerHpTotal: roundResult.playerHpTotal,
      npcHpTotal: roundResult.npcHpTotal,
    }
    const newRoundsLog = [...(battle.rounds_log ?? []), roundLog]

    const stillAlivePlayers = pShips.filter((s: CombatShip) => s.hp > 0)
    const stillAliveNpcs    = nShips.filter((s: NpcShip) => s.hp > 0)
    const battleOver = !stillAlivePlayers.length || !stillAliveNpcs.length

    if (battleOver) {
      // Kampf vorbei — finalisieren
      await supabase.from('active_battles').update({
        player_ships: pShips, npc_ships: nShips,
        round: battle.round + 1, rounds_log: newRoundsLog,
        last_tick_at: new Date().toISOString(),
      }).eq('id', battle.id)
      await finalizeBattle({ ...battle, rounds_log: newRoundsLog, round: battle.round + 1 }, pShips, nShips, chassisDefs, log)
      await supabase.from('active_battles').delete().eq('id', battle.id)
      battlesResolved++
    } else {
      // Kampf läuft weiter
      await supabase.from('active_battles').update({
        player_ships: pShips, npc_ships: nShips,
        round: battle.round + 1, rounds_log: newRoundsLog,
        last_tick_at: new Date().toISOString(),
      }).eq('id', battle.id)
    }
  }

  // ── 3. Neue Kämpfe auslösen ────────────────────────────────────────────────
  const { data: aggressiveFleets } = await supabase
    .from('fleets')
    .select('*, ships(*, ship_designs(*))')
    .eq('is_in_transit', false)
    .in('flight_mode', ['enemy', 'annihilation', 'bounty'])

  let newBattles = 0

  for (const fleet of aggressiveFleets ?? []) {
    const ships = (fleet.ships ?? []) as any[]
    if (!ships.length) continue

    // Kein Kampf wenn bereits aktiver Kampf
    const { data: existing } = await supabase
      .from('active_battles').select('id').eq('fleet_id', fleet.id).limit(1)
    if (existing?.length) continue

    const fx = fleet.x ?? 0, fy = fleet.y ?? 0, fz = fleet.z ?? 0

    // Persistente NPC-Flotte an dieser Position suchen
    let { data: npcFleetRow } = await supabase
      .from('npc_combat_fleets')
      .select('*')
      .eq('x', fx).eq('y', fy).eq('z', fz)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    // Wenn keine persistente NPC-Flotte: Modulo-Check ob NPC hier sein sollte
    // Gleiche Logik wie get_scan_objects: jeder 10. Gitterpunkt (npc_step=15)
    if (!npcFleetRow) {
      const npcStep = 15
      // Koordinaten müssen auf Gitter ausgerichtet sein
      const gx = Math.round(fx / npcStep) * npcStep
      const gy = Math.round(fy / npcStep) * npcStep
      const gz = Math.round(fz / npcStep) * npcStep
      if (gx !== fx || gy !== fy || gz !== fz) continue // Flotte nicht auf NPC-Gitter
      if (((fx/npcStep + fy/npcStep * 37 + fz/npcStep * 1009) % 10) !== 0) continue

      const timeSlot = Math.floor(Date.now() / 1000 / (4 * 3600))
      const typeHash = coordHashJs(fx, fy, fz, timeSlot + 1)
      const npcType = typeHash < 0.70 ? 'pirat_leicht' : typeHash < 0.90 ? 'pirat_mittel' : 'piraten_verbund'
      if (fleet.flight_mode === 'bounty' && !npcType.startsWith('pirat')) continue

      const diff = (NPC_DIFFICULTY[npcType] ?? 'rookie') as Difficulty
      const npcShips = buildNpcFleet(npcType, chassisDefs)

      const { data: inserted } = await supabase.from('npc_combat_fleets').insert({
        npc_type: npcType, difficulty: diff, x: fx, y: fy, z: fz,
        ships: npcShips, time_slot: timeSlot,
        expires_at: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      }).select().single()
      npcFleetRow = inserted
    }

    if (!npcFleetRow) continue

    const npcShips: NpcShip[] = npcFleetRow.ships
    const aliveNpcs = npcShips.filter((s: NpcShip) => s.hp > 0)
    if (!aliveNpcs.length) continue // NPC-Flotte bereits zerstört

    // Neuen Kampf starten
    const pShips = ships.map((s: any) => playerShipToCombat(s, chassisDefs))
    await supabase.from('active_battles').insert({
      player_id: fleet.player_id, fleet_id: fleet.id,
      npc_fleet_id: npcFleetRow.id, x: fx, y: fy, z: fz,
      player_ships: pShips, npc_ships: npcShips,
      round: 0, rounds_log: [],
    })

    await notify(fleet.player_id, 'battle',
      'Kampf begonnen',
      `${fleet.name ?? 'Flotte'} hat Feindkontakt bei ${fx} / ${fy} / ${fz}.`,
      { fleet_id: fleet.id, x: fx, y: fy, z: fz }
    )
    newBattles++
    log.push(`battle_started@${fx}/${fy}/${fz}`)
  }

  if (battlesResolved > 0) log.push(`battles_resolved=${battlesResolved}`)
  if (newBattles > 0) log.push(`battles_new=${newBattles}`)
}

// ── Kampf finalisieren ────────────────────────────────────────────────────────

async function finalizeBattle(
  battle: any, pShips: CombatShip[], nShips: NpcShip[],
  chassisDefs: any[], log: string[]
) {
  const playerSurvivors = pShips.filter((s: CombatShip) => s.hp > 0).map((s: CombatShip) => s.id)
  const npcSurvivors    = nShips.filter((s: NpcShip) => s.hp > 0)
  const winner = !playerSurvivors.length && !npcSurvivors.length ? 'draw'
    : !playerSurvivors.length ? 'npc' : 'player'

  // Spieler-Schiff HP aktualisieren
  for (const ps of pShips) {
    if (ps.hp === -1) {
      await supabase.from('ships').update({ current_hp: 1 }).eq('id', ps.id) // geflohen
    } else if (ps.hp <= 0) {
      await supabase.from('wrecks').insert({ x: battle.x, y: battle.y, z: battle.z, resources: {} })
      await supabase.from('ships').delete().eq('id', ps.id) // zerstört
    } else {
      await supabase.from('ships').update({ current_hp: ps.hp }).eq('id', ps.id)
    }
  }

  // NPC-Flotte HP aktualisieren (bleibt persistent bis zerstört)
  if (battle.npc_fleet_id) {
    if (!npcSurvivors.length) {
      await supabase.from('npc_combat_fleets').delete().eq('id', battle.npc_fleet_id)
    } else {
      await supabase.from('npc_combat_fleets').update({ ships: nShips }).eq('id', battle.npc_fleet_id)
    }
  }

  // Loot sammeln
  const loot: Record<string, number> = {}
  if (winner === 'player') {
    for (const trader of nShips.filter((s: NpcShip) => s.hp <= 0 && s.isTrader)) {
      for (const [res, amt] of Object.entries(trader.loot ?? {})) {
        loot[res] = (loot[res] ?? 0) + (amt as number)
      }
    }
    if (Object.keys(loot).length > 0) {
      const { data: fleetData } = await supabase.from('fleets').select('cargo').eq('id', battle.fleet_id).single()
      const newCargo: Record<string, number> = { ...(fleetData?.cargo ?? {}) }
      for (const [res, amt] of Object.entries(loot)) newCargo[res] = (newCargo[res] ?? 0) + (amt as number)
      await supabase.from('fleets').update({ cargo: newCargo }).eq('id', battle.fleet_id)
    }
  }

  // Battle Report
  const { data: reportData } = await supabase.from('battle_reports').insert({
    attacker_id: battle.player_id, defender_id: null,
    x: battle.x, y: battle.y, z: battle.z,
    attacker_fleet: { fleet_id: battle.fleet_id, ships: pShips },
    defender_fleet: { npc_fleet_id: battle.npc_fleet_id, ships: nShips },
    rounds: battle.rounds_log ?? [],
    result: { winner, player_survivors: playerSurvivors.length, npc_survivors: npcSurvivors.length, rounds_fought: battle.round, loot },
    winner: winner === 'player' ? 'attacker' : winner === 'npc' ? 'defender' : 'draw',
    loot,
  }).select('id').single()

  const winText = winner === 'player' ? 'gewonnen' : winner === 'npc' ? 'verloren' : 'unentschieden'
  await notify(battle.player_id, 'battle',
    `Kampf ${winText}`,
    `Deine Flotte hat den Kampf bei ${battle.x} / ${battle.y} / ${battle.z} ${winText}.`,
    { battle_report_id: reportData?.id, fleet_id: battle.fleet_id, x: battle.x, y: battle.y, z: battle.z, winner, loot }
  )
  log.push(`battle_finished(${winner})@${battle.x}/${battle.y}/${battle.z}`)
}

// Deterministischer Hash — exaktes JS-Äquivalent zur PostgreSQL coord_hash Funktion
function coordHashJs(x: number, y: number, z: number, salt: number): number {
  const h = ((x * 1000003) ^ (y * 999983) ^ (z * 999979) ^ salt) & 2147483647
  return h / 2147483647.0
}
