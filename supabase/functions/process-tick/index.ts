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

const NPC_DIFFICULTY = {
  pirat_leicht: 'rookie',
  pirat_mittel: 'veteran',
  piraten_verbund: 'elite',
  haendler_konvoi: 'rookie',
  npc_streitmacht: 'commander',
} as const

type Difficulty = 'rookie' | 'soldat' | 'veteran' | 'elite' | 'commander'

// Multiplikatoren pro Schwierigkeit
const DIFF_STATS: Record<Difficulty, { statMul: number; hpMul: number }> = {
  rookie:    { statMul: 1.0, hpMul: 1.5  },
  soldat:    { statMul: 1.5, hpMul: 2.0  },
  veteran:   { statMul: 2.0, hpMul: 2.5  },
  elite:     { statMul: 2.5, hpMul: 3.0  },
  commander: { statMul: 3.0, hpMul: 4.0  },
}

// Klassen-Pool pro Schwierigkeit: [Kampfschiffe, Handelsschiffe]
const DIFF_CLASSES: Record<Difficulty, { combat: string[]; trade: string[] }> = {
  rookie:    { combat: ['B','B','C'],           trade: ['Z'] },
  soldat:    { combat: ['B','C','C'],           trade: ['Z'] },
  veteran:   { combat: ['B','C','C','D'],       trade: ['A'] },
  elite:     { combat: ['C','C','D','D','E'],   trade: ['A'] },
  commander: { combat: ['D','D','E','E'],       trade: ['A'] },
}

// Schuss-Anzahl pro Klasse
const CLASS_SHOTS: Record<string, number> = {
  Z: 0, A: 0, B: 1, C: 2, D: 3, E: 6,
}

// Schadens-Formel
function calcDamage(attack: number, defense: number): number {
  const dmg = attack * (1 - defense / (defense + 100))
  return Math.max(1, Math.round(dmg))
}

// Trefferchance (10%-90%)
function hitChance(attackerManeuver: number, defenderManeuver: number): number {
  const raw = 50 + attackerManeuver * 0.5 - defenderManeuver * 0.5
  return Math.min(90, Math.max(10, raw)) / 100
}

// Zufallszahl 0-1
function rand(): number {
  return Math.random()
}

// ── NPC Schiff generieren ──────────────────────────────────────────────────────

interface NpcShip {
  id: string
  chassisClass: string
  chassisId: string
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
  maneuver: number
  cargo: number
  shots: number
  targetClass: string // priorisiertes Ziel
  isTrader: boolean
  loot: Record<string, number>
}

function buildNpcShip(
  chassis: any,
  diff: Difficulty,
  isTrader: boolean,
  idx: number
): NpcShip {
  const { statMul, hpMul } = DIFF_STATS[diff]
  const baseHp = Math.round(chassis.base_hp * hpMul)
  const shots = isTrader ? 0 : (CLASS_SHOTS[chassis.class] ?? 0)

  // Händler haben zufällige Rohstoffe
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
    id: `npc_${idx}`,
    chassisClass: chassis.class,
    chassisId: chassis.id,
    name: isTrader ? `${chassis.name} (Händler)` : chassis.name,
    hp: baseHp,
    maxHp: baseHp,
    attack:   Math.round(chassis.base_attack   * statMul),
    defense:  Math.round(chassis.base_defense  * statMul),
    speed:    Math.round(chassis.base_speed    * statMul),
    maneuver: Math.round(chassis.base_maneuver * statMul),
    cargo:    chassis.base_cargo,
    shots,
    targetClass: chassis.class, // gleiche Klasse wird priorisiert
    isTrader,
    loot,
  }
}

// NPC-Flotte für einen npc_type generieren
function buildNpcFleet(npcType: string, chassisDefs: any[]): NpcShip[] {
  const diff = (NPC_DIFFICULTY[npcType as keyof typeof NPC_DIFFICULTY] ?? 'rookie') as Difficulty
  const pool = DIFF_CLASSES[diff]

  const ships: NpcShip[] = []
  let idx = 0

  // 1-3 Kampfschiffe
  const combatCount = 1 + Math.floor(rand() * Math.min(3, pool.combat.length))
  for (let i = 0; i < combatCount; i++) {
    const cls = pool.combat[Math.floor(rand() * pool.combat.length)]
    const candidates = chassisDefs.filter(c => c.class === cls && !c.id.includes('station'))
    if (!candidates.length) continue
    const chassis = candidates[Math.floor(rand() * candidates.length)]
    ships.push(buildNpcShip(chassis, diff, false, idx++))
  }

  // 1 Handelsschiff
  const tradeCls = pool.trade[Math.floor(rand() * pool.trade.length)]
  const tradeCandidates = chassisDefs.filter(c =>
    c.class === tradeCls &&
    c.base_cargo > 0 &&
    !c.id.includes('station') &&
    !c.id.includes('probe')
  )
  if (tradeCandidates.length) {
    const chassis = tradeCandidates[Math.floor(rand() * tradeCandidates.length)]
    ships.push(buildNpcShip(chassis, diff, true, idx++))
  }

  return ships
}

// ── Spieler-Schiff Interface ───────────────────────────────────────────────────

interface CombatShip {
  id: string
  name: string
  chassisClass: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
  maneuver: number
  shots: number
  autoRetreatAt: number // HP-% 0=nie
  isPlayer: true
}

function playerShipToCombat(ship: any, chassisDefs: any[]): CombatShip {
  const d = ship.ship_designs
  const chassis = chassisDefs.find((c: any) => c.id === d?.chassis_id)
  const cls = chassis?.class ?? 'B'

  // Waffen zählen aus installed_parts
  const parts: string[] = d?.installed_parts ?? []
  const weaponCount = parts.filter((p: string) =>
    p.startsWith('laser') || p.startsWith('ion_cannon') ||
    p.startsWith('railgun') || p.startsWith('turret')
  ).length
  const shots = Math.max(1, weaponCount)

  return {
    id: ship.id,
    name: ship.name ?? d?.name ?? 'Schiff',
    chassisClass: cls,
    hp: ship.current_hp,
    maxHp: ship.max_hp,
    attack: d?.total_attack ?? chassis?.base_attack ?? 10,
    defense: d?.total_defense ?? chassis?.base_defense ?? 5,
    speed: d?.total_speed ?? chassis?.base_speed ?? 20,
    maneuver: d?.total_maneuver ?? chassis?.base_maneuver ?? 20,
    shots,
    autoRetreatAt: ship.auto_retreat_at ?? 0,
    isPlayer: true,
  }
}

// ── Kampf-Simulation ──────────────────────────────────────────────────────────

interface RoundLog {
  round: number
  actions: Array<{
    attackerId: string
    attackerName: string
    targetId: string
    targetName: string
    hit: boolean
    damage: number
    targetHpAfter: number
    destroyed: boolean
  }>
  playerHpTotal: number
  npcHpTotal: number
}

function simulateBattle(
  playerShips: CombatShip[],
  npcShips: NpcShip[],
  maxRounds = 20
): {
  rounds: RoundLog[]
  playerSurvivors: string[]
  npcSurvivors: string[]
  winner: 'player' | 'npc' | 'draw'
  loot: Record<string, number>
} {
  // Arbeits-Kopien mit HP
  const pShips = playerShips.map(s => ({ ...s }))
  const nShips = npcShips.map(s => ({ ...s }))
  const rounds: RoundLog[] = []

  for (let round = 1; round <= maxRounds; round++) {
    const alivePlayers = pShips.filter(s => s.hp > 0)
    const aliveNpcs    = nShips.filter(s => s.hp > 0)
    if (!alivePlayers.length || !aliveNpcs.length) break

    const actions: RoundLog['actions'] = []

    // Alle Kämpfer in Reihenfolge: höheres Manöver geht zuerst
    type Fighter = { id: string; name: string; maneuver: number; isPlayer: boolean; side: 'player'|'npc' }
    const order: Fighter[] = [
      ...alivePlayers.map(s => ({ id: s.id, name: s.name, maneuver: s.maneuver + rand() * 5, isPlayer: true as const, side: 'player' as const })),
      ...aliveNpcs.map(s => ({ id: s.id, name: s.name, maneuver: s.maneuver + rand() * 5, isPlayer: false as const, side: 'npc' as const })),
    ].sort((a, b) => b.maneuver - a.maneuver)

    for (const fighter of order) {
      if (fighter.isPlayer) {
        const attacker = pShips.find(s => s.id === fighter.id)
        if (!attacker || attacker.hp <= 0) continue
        const enemiesAlive = nShips.filter(s => s.hp > 0)
        if (!enemiesAlive.length) break

        // Schießt so oft wie shots erlaubt
        for (let shot = 0; shot < attacker.shots; shot++) {
          const stillAlive = nShips.filter(s => s.hp > 0)
          if (!stillAlive.length) break
          // Priorisiere gleiche Klasse, sonst zufällig
          const preferred = stillAlive.filter(s => s.chassisClass === attacker.chassisClass)
          const target = preferred.length ? preferred[Math.floor(rand() * preferred.length)] : stillAlive[Math.floor(rand() * stillAlive.length)]
          const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
          const damage = hit ? calcDamage(attacker.attack, target.defense) : 0
          if (hit) target.hp = Math.max(0, target.hp - damage)
          actions.push({
            attackerId: attacker.id, attackerName: attacker.name,
            targetId: target.id, targetName: target.name,
            hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0,
          })
        }
      } else {
        const attacker = nShips.find(s => s.id === fighter.id)
        if (!attacker || attacker.hp <= 0 || attacker.isTrader || attacker.shots === 0) continue
        const enemiesAlive = pShips.filter(s => s.hp > 0)
        if (!enemiesAlive.length) break

        for (let shot = 0; shot < attacker.shots; shot++) {
          const stillAlive = pShips.filter(s => s.hp > 0)
          if (!stillAlive.length) break
          // Priorisiere gleiche Klasse
          const preferred = stillAlive.filter(s => s.chassisClass === attacker.targetClass)
          const target = preferred.length ? preferred[Math.floor(rand() * preferred.length)] : stillAlive[Math.floor(rand() * stillAlive.length)]
          const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
          const damage = hit ? calcDamage(attacker.attack, target.defense) : 0
          if (hit) target.hp = Math.max(0, target.hp - damage)
          actions.push({
            attackerId: attacker.id, attackerName: attacker.name,
            targetId: target.id, targetName: target.name,
            hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0,
          })
        }
      }

      // Auto-Retreat prüfen für Spieler-Schiffe nach jedem Schuss-Satz
      for (const ps of pShips) {
        if (ps.hp > 0 && ps.autoRetreatAt > 0) {
          const hpPct = (ps.hp / ps.maxHp) * 100
          if (hpPct <= ps.autoRetreatAt) ps.hp = -1 // markiert als geflohen
        }
      }
    }

    rounds.push({
      round,
      actions,
      playerHpTotal: pShips.filter(s => s.hp > 0).reduce((s, p) => s + p.hp, 0),
      npcHpTotal:    nShips.filter(s => s.hp > 0).reduce((s, n) => s + n.hp, 0),
    })

    if (!pShips.filter(s => s.hp > 0).length || !nShips.filter(s => s.hp > 0).length) break
  }

  const playerSurvivors = pShips.filter(s => s.hp > 0).map(s => s.id)
  const npcSurvivors    = nShips.filter(s => s.hp > 0).map(s => s.id)

  // Loot von zerstörten/übergebenen Händlern sammeln
  const loot: Record<string, number> = {}
  const destroyedTraders = nShips.filter(s => s.hp <= 0 && s.isTrader)
  for (const trader of destroyedTraders) {
    for (const [res, amt] of Object.entries(trader.loot ?? {})) {
      loot[res] = (loot[res] ?? 0) + (amt as number)
    }
  }

  let winner: 'player' | 'npc' | 'draw'
  if (!playerSurvivors.length && !npcSurvivors.length) winner = 'draw'
  else if (!playerSurvivors.length) winner = 'npc'
  else winner = 'player'

  return { rounds, playerSurvivors, npcSurvivors, winner, loot }
}

// ── Hauptfunktion: Kämpfe im Tick auslösen ────────────────────────────────────

async function processCombat(log: string[]) {
  // Alle stationären, aggressiven Spielerflotten laden
  const { data: aggressiveFleets } = await supabase
    .from('fleets')
    .select('*, ships(*, ship_designs(*))')
    .eq('is_in_transit', false)
    .in('flight_mode', ['enemy', 'annihilation', 'bounty'])

  if (!aggressiveFleets?.length) return

  // Chassis-Definitionen für NPC-Generierung
  const { data: chassisDefs } = await supabase
    .from('chassis_definitions')
    .select('id, class, base_hp, base_attack, base_defense, base_speed, base_maneuver, base_cargo')

  if (!chassisDefs?.length) return

  let battles = 0

  for (const fleet of aggressiveFleets) {
    const ships = (fleet.ships ?? []) as any[]
    if (!ships.length) continue

    const fx = fleet.x ?? 0, fy = fleet.y ?? 0, fz = fleet.z ?? 0

    // Prüfe ob NPCs an dieser Position existieren (gleiche Logik wie coord_hash im RPC)
    // Wir nutzen einen einfachen deterministischen Hash: gleiche Koordinate + time_slot
    const timeSlot = Math.floor(Date.now() / 1000 / (4 * 3600))
    const hashVal = coordHashJs(fx, fy, fz, timeSlot)
    if (hashVal > 0.25) continue // kein NPC an dieser Position

    // NPC-Typ bestimmen
    const typeHash = coordHashJs(fx, fy, fz, timeSlot + 1)
    let npcType: string
    if (typeHash < 0.70)       npcType = 'pirat_leicht'
    else if (typeHash < 0.90)  npcType = 'pirat_mittel'
    else                       npcType = 'piraten_verbund'

    // Nur kämpfen wenn flight_mode es erlaubt
    if (fleet.flight_mode === 'bounty' && !npcType.startsWith('pirat')) continue

    // Kampf bereits diesen Tick? (vermeidet Doppelkämpfe)
    const { data: existingReport } = await supabase
      .from('battle_reports')
      .select('id')
      .eq('attacker_id', fleet.player_id)
      .gte('occurred_at', new Date(Date.now() - 35000).toISOString()) // letzte 35s
      .limit(1)
    if (existingReport?.length) continue

    // Spieler-Schiffe vorbereiten
    const playerCombatShips = ships.map((s: any) => playerShipToCombat(s, chassisDefs))

    // NPC-Flotte generieren
    const npcFleet = buildNpcFleet(npcType, chassisDefs)

    // Simulation
    const pShipsCopy = playerCombatShips.map(s => ({ ...s }))
    const result = simulateBattle(pShipsCopy, npcFleet)

    // HP der Spieler-Schiffe aktualisieren
    for (const ps of pShipsCopy) {
      const ship = ships.find((s: any) => s.id === ps.id)
      if (!ship) continue
      const survived = result.playerSurvivors.includes(ps.id)
      if (survived) {
        await supabase.from('ships').update({ current_hp: Math.max(1, ps.hp) }).eq('id', ps.id)
      } else {
        // Schiff zerstört oder geflohen
        if (ps.hp === -1) {
          // Geflohen: bleibt mit 1 HP
          await supabase.from('ships').update({ current_hp: 1 }).eq('id', ps.id)
        } else {
          // Zerstört: als Wrack
          await supabase.from('wrecks').insert({ x: fx, y: fy, z: fz, resources: {} })
          await supabase.from('ships').delete().eq('id', ps.id)
        }
      }
    }

    // Loot auf Flotte verteilen wenn Spieler gewonnen
    if (result.winner === 'player' && Object.keys(result.loot).length > 0) {
      const currentCargo = fleet.cargo ?? {}
      const newCargo: Record<string, number> = { ...currentCargo }
      for (const [res, amt] of Object.entries(result.loot)) {
        newCargo[res] = (newCargo[res] ?? 0) + (amt as number)
      }
      await supabase.from('fleets').update({ cargo: newCargo }).eq('id', fleet.id)
    }

    // Battle Report speichern
    const npcShipSnapshot = npcFleet.map(s => ({
      id: s.id, name: s.name, chassisClass: s.chassisClass,
      hp: s.hp, maxHp: s.maxHp, attack: s.attack, defense: s.defense,
    }))
    const playerShipSnapshot = ships.map((s: any) => ({
      id: s.id, name: s.name ?? s.ship_designs?.name,
      maxHp: s.max_hp, attack: s.ship_designs?.total_attack,
    }))

    const { data: reportData } = await supabase.from('battle_reports').insert({
      attacker_id:    fleet.player_id,
      defender_id:    null,
      x: fx, y: fy, z: fz,
      attacker_fleet: { fleet_id: fleet.id, ships: playerShipSnapshot },
      defender_fleet: { npc_type: npcType, ships: npcShipSnapshot },
      rounds:         result.rounds,
      result: {
        winner:           result.winner,
        player_survivors: result.playerSurvivors.length,
        npc_survivors:    result.npcSurvivors.length,
        rounds_fought:    result.rounds.length,
        loot:             result.loot,
      },
      winner: result.winner === 'player' ? 'attacker' : result.winner === 'npc' ? 'defender' : 'draw',
      loot: result.loot,
    }).select('id').single()

    const winText = result.winner === 'player' ? 'gewonnen' : result.winner === 'npc' ? 'verloren' : 'unentschieden'
    await notify(fleet.player_id, 'battle',
      `Kampf ${winText}`,
      `${fleet.name ?? 'Flotte'} war in einen Kampf bei ${fx} / ${fy} / ${fz} verwickelt und hat ${winText}.`,
      { battle_report_id: reportData?.id, fleet_id: fleet.id, x: fx, y: fy, z: fz, winner: result.winner, loot: result.loot }
    )

    battles++
    log.push(`combat(${npcType}@${fx}/${fy}/${fz}):${result.winner}`)
  }

  if (battles > 0) log.push(`battles=${battles}`)
}

// Deterministischer Hash — exaktes JS-Äquivalent zur PostgreSQL coord_hash Funktion:
// SELECT (((x * 1000003) # (y * 999983) # (z * 999979) # salt) & 2147483647)::FLOAT / 2147483647.0
function coordHashJs(x: number, y: number, z: number, salt: number): number {
  // XOR-Verknüpfung wie in PostgreSQL (# = XOR in PG)
  // Wichtig: JavaScript Bitoperationen arbeiten mit 32-bit signed integers
  const h = ((x * 1000003) ^ (y * 999983) ^ (z * 999979) ^ salt) & 2147483647
  return h / 2147483647.0
}
