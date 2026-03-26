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

      // ── Reparatur-Queue ───────────────────────────────────────────────────
      await processRepairQueue(log)

      // ── Umbau-Queue ───────────────────────────────────────────────────────
      await processRefitQueue(log)

      // ── HQ-Bau-Queue + Transit + Reparatur ────────────────────────────────
      await processHQBuildQueue(log)
      await processHQTransit(log)
      await processHQRepair(log)

      // ── 8. Flotten-Bewegungen ─────────────────────────────────────────────
      await processFleets(log)

      // ── 8b. NPC-Spawn Reservierungen ──────────────────────────────────────
      await processNpcSpawns(log)

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
      // Reservierung aufheben — Flotte ist angekommen
      await supabase.from('npc_spawn_reservations').delete().eq('fleet_id', fleet.id)

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

// ─── Reparatur-Queue ──────────────────────────────────────────────────────────

async function processRepairQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('repair_queue')
    .select('*, ships(id, max_hp)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  for (const item of doneItems) {
    // Schiff auf volle HP setzen
    const { error } = await supabase
      .from('ships')
      .update({ current_hp: item.max_hp })
      .eq('id', item.ship_id)

    if (error) { log.push(`repair_err: ${error.message}`); continue }

    await supabase.from('repair_queue').delete().eq('id', item.id)

    await notify(item.player_id, 'ship_built',
      'Reparatur abgeschlossen',
      `Dein Schiff wurde erfolgreich repariert.`,
      { ship_id: item.ship_id, planet_id: item.planet_id }
    )
    completed++
  }
  if (completed > 0) log.push(`repairs_done=${completed}`)
}

// ─── Umbau-Queue ──────────────────────────────────────────────────────────────

async function processRefitQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('refit_queue')
    .select('*, ships(id, design_id, max_hp, current_hp), ship_part_definitions(id, cells_required, hp_bonus, attack_bonus, defense_bonus, speed_bonus, maneuver_bonus, cargo_bonus, scan_range)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  for (const item of doneItems) {
    const ship = item.ships
    if (!ship) { await supabase.from('refit_queue').delete().eq('id', item.id); continue }

    // Ship design laden
    const { data: design } = await supabase
      .from('ship_designs')
      .select('*')
      .eq('id', ship.design_id)
      .single()

    if (!design) { await supabase.from('refit_queue').delete().eq('id', item.id); continue }

    const part = item.ship_part_definitions
    let parts: any[] = Array.isArray(design.installed_parts) ? design.installed_parts : []

    if (item.action === 'install') {
      // Bauteil hinzufügen
      parts = [...parts, { part_id: item.part_id }]
    } else {
      // Bauteil entfernen (erstes Vorkommen)
      const idx = parts.findIndex((p: any) => (typeof p === 'string' ? p : p.part_id) === item.part_id)
      if (idx >= 0) parts.splice(idx, 1)
    }

    // Stats neu berechnen — vereinfacht: wir triggern ein Update das den recalc in der DB auslöst
    // Für jetzt: installed_parts aktualisieren, total_* Stats bleiben bis nächster Recalc
    await supabase.from('ship_designs').update({ installed_parts: parts }).eq('id', design.id)
    await supabase.from('refit_queue').delete().eq('id', item.id)

    await notify(item.player_id, 'ship_built',
      'Umbau abgeschlossen',
      `Der Umbau deines Schiffes wurde abgeschlossen.`,
      { ship_id: item.ship_id, planet_id: item.planet_id, action: item.action, part_id: item.part_id }
    )
    completed++
  }
  if (completed > 0) log.push(`refits_done=${completed}`)
}

// ─── HQ Bonus-Berechnung ─────────────────────────────────────────────────────

async function recalcAllianceBonuses(allianceId: string) {
  // Alle Modul-Level laden
  const { data: levels } = await supabase
    .from('hq_module_levels')
    .select('module_id, level')
    .eq('alliance_id', allianceId)

  // Modul-Definitionen laden
  const { data: modules } = await supabase
    .from('hq_modules')
    .select('id, bonus_key, bonus_per_level, bonus_key_2, bonus_per_level_2')

  if (!levels || !modules) return

  // Bonuses berechnen
  const bonuses: Record<string, number> = {}
  for (const lvl of levels) {
    if (!lvl.level) continue
    const mod = modules.find((m: any) => m.id === lvl.module_id)
    if (!mod) continue
    if (mod.bonus_key) {
      bonuses[mod.bonus_key] = (bonuses[mod.bonus_key] ?? 0) + mod.bonus_per_level * lvl.level
    }
    if (mod.bonus_key_2) {
      bonuses[mod.bonus_key_2] = (bonuses[mod.bonus_key_2] ?? 0) + (mod.bonus_per_level_2 ?? 0) * lvl.level
    }
  }

  // Herz der Allianz: member_limit_bonus → member_limit auf alliances updaten
  const heartLevel = levels.find((l: any) => l.module_id === 'herz')?.level ?? 0
  await supabase.from('alliances')
    .update({ member_limit: 10 + heartLevel })
    .eq('id', allianceId)

  // alliance_bonuses auf alle Mitglieder schreiben
  const { data: members } = await supabase
    .from('alliance_members')
    .select('player_id')
    .eq('alliance_id', allianceId)

  if (!members) return
  for (const m of members) {
    await supabase.from('players')
      .update({ alliance_bonuses: bonuses })
      .eq('id', m.player_id)
  }
}

// ─── HQ-Bau-Queue ─────────────────────────────────────────────────────────────

async function processHQBuildQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('hq_build_queue')
    .select('*')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  for (const item of doneItems) {
    // Modul-Level erhöhen
    await supabase.from('hq_module_levels').upsert(
      { alliance_id: item.alliance_id, module_id: item.module_id, level: item.target_level },
      { onConflict: 'alliance_id,module_id' }
    )
    await supabase.from('hq_build_queue').delete().eq('id', item.id)

    // Boni neu berechnen
    await recalcAllianceBonuses(item.alliance_id)
    completed++
  }
  if (completed > 0) log.push(`hq_builds_done=${completed}`)
}

// ─── HQ-Transit ───────────────────────────────────────────────────────────────

async function processHQTransit(log: string[]) {
  const { data: alliances } = await supabase
    .from('alliances')
    .select('id, hq_x, hq_y, hq_z, hq_target_x, hq_target_y, hq_target_z, hq_in_transit, hq_arrives_at')
    .eq('hq_in_transit', true)
    .not('hq_arrives_at', 'is', null)
    .lte('hq_arrives_at', new Date().toISOString())

  if (!alliances?.length) return

  for (const a of alliances) {
    await supabase.from('alliances').update({
      hq_x: a.hq_target_x, hq_y: a.hq_target_y, hq_z: a.hq_target_z,
      hq_target_x: null, hq_target_y: null, hq_target_z: null,
      hq_in_transit: false, hq_arrives_at: null,
      hq_last_moved: new Date().toISOString(),
    }).eq('id', a.id)
    log.push(`hq_arrived(${a.id})`)
  }
}

// ─── HQ-Reparatur ─────────────────────────────────────────────────────────────

async function processHQRepair(log: string[]) {
  const { data: alliances } = await supabase
    .from('alliances')
    .select('id, hq_hp, hq_max_hp, hq_repair_finish_at')
    .eq('hq_status', 'repairing')
    .not('hq_repair_finish_at', 'is', null)
    .lte('hq_repair_finish_at', new Date().toISOString())

  if (!alliances?.length) return

  for (const a of alliances) {
    await supabase.from('alliances').update({
      hq_hp: a.hq_max_hp,
      hq_status: 'intact',
      hq_repair_finish_at: null,
    }).eq('id', a.id)
    log.push(`hq_repaired(${a.id})`)
  }
}

// ─── NPC-Spawn Verwaltung ─────────────────────────────────────────────────────
// Generiert NPC-Positionen deterministisch und schreibt sie in die DB
// Reserviert Positionen für anfliegende Spielerflotten

async function processNpcSpawns(log: string[]) {
  const npcStep = 15
  const timeSlot = Math.floor(Date.now() / 1000 / (5 * 60))  // 5 Min. (Test)

  // Alle bestehenden NPC-Positionen laden (für Mindestabstand-Check)
  const { data: existing } = await supabase
    .from('npc_combat_fleets')
    .select('x, y, z')
    .gt('expires_at', new Date().toISOString())

  const existingSet = new Set((existing ?? []).map((e: any) => `${e.x},${e.y},${e.z}`))

  // Alle anfliegenden Spielerflotten laden — für Reservierungen
  const { data: transitFleets } = await supabase
    .from('fleets')
    .select('id, target_x, target_y, target_z, arrive_at, player_id')
    .eq('is_in_transit', true)
    .not('target_x', 'is', null)

  // Bereits reservierte Positionen
  const { data: existingReservations } = await supabase
    .from('npc_spawn_reservations')
    .select('x, y, z, fleet_id')
  const reservedFleetIds = new Set((existingReservations ?? []).map((r: any) => r.fleet_id))

  let spawned = 0, reserved = 0

  // Für jede anfliegende Flotte prüfen ob Zielkoord. einen NPC haben sollte
  for (const fleet of transitFleets ?? []) {
    if (!fleet.target_x || !fleet.target_y) continue
    if (reservedFleetIds.has(fleet.id)) continue  // schon reserviert

    const fx = fleet.target_x, fy = fleet.target_y, fz = fleet.target_z ?? 0

    // Prüf ob Ziel auf NPC-Gitter liegt (gleiche Logik wie get_scan_objects)
    const gx = Math.round(fx / npcStep) * npcStep
    const gy = Math.round(fy / npcStep) * npcStep
    const gz = Math.round(fz / npcStep) * npcStep
    if (gx !== fx || gy !== fy || gz !== fz) continue
    if (((fx/npcStep + fy/npcStep * 37 + fz/npcStep * 1009) % 10) !== 0) continue

    // Cooldown prüfen
    const { data: cooldown } = await supabase
      .from('npc_spawn_cooldowns')
      .select('blocked_until')
      .eq('x', fx).eq('y', fy).eq('z', fz)
      .maybeSingle()
    if (cooldown) continue

    // NPC-Typ berechnen (gleiche MD5-Logik wie get_scan_objects)
    const hashInput = `${fx},${fy},${fz},${timeSlot}`
    // Vereinfachter deterministischer Hash (Deno-kompatibel ohne crypto)
    let h = 0
    for (let i = 0; i < hashInput.length; i++) {
      h = ((h << 5) - h + hashInput.charCodeAt(i)) & 0x7FFFFFFF
    }
    const npcH = h / 2147483647.0

    const npcDiff = npcH < 0.30 ? 'rookie'
                  : npcH < 0.65 ? 'seasoned'
                  : npcH < 0.90 ? 'veteran'
                  : npcH < 0.98 ? 'elite'
                  : 'commander'

    let sH = 0
    const sInput = `${fx},${fz},${fy},${timeSlot+99}`
    for (let i = 0; i < sInput.length; i++) {
      sH = ((sH << 5) - sH + sInput.charCodeAt(i)) & 0x7FFFFFFF
    }
    const sizeH = sH / 2147483647.0
    const npcSize = sizeH < 0.40 ? 'staffel'
                  : sizeH < 0.70 ? 'geschwader'
                  : sizeH < 0.90 ? 'flotte'
                  : 'armada'

    const npcType = npcDiff + '_' + npcSize

    // Reservierung anlegen — hält bis Ankunft + 30 Min Puffer
    const arriveAt = fleet.arrive_at ? new Date(fleet.arrive_at) : new Date()
    const expiresAt = new Date(arriveAt.getTime() + 30 * 60 * 1000)

    await supabase.from('npc_spawn_reservations').insert({
      x: fx, y: fy, z: fz,
      npc_type: npcType,
      difficulty: npcDiff,
      fleet_id: fleet.id,
      expires_at: expiresAt.toISOString(),
    })
    reserved++
  }

  if (reserved > 0) log.push(`npc_reserved=${reserved}`)
}

async function processAsteroidTick(log: string[]) {
  const { data, error } = await supabase.rpc('asteroid_tick')
  if (error) { log.push(`asteroid_tick_err: ${error.message}`); return }
  if (data?.despawned > 0) log.push(`asteroids_despawned=${data.despawned}`)
  if (data?.respawned  > 0) log.push(`asteroids_respawned=${data.respawned}`)
}

// ─── Kampfsystem ──────────────────────────────────────────────────────────────

// ── NPC Chassis-Pool nach Schwierigkeit ──────────────────────────────────────

// ─── NPC-Typ-System: 5 Schwierigkeiten × 4 Größen ───────────────────────────
// Format: {difficulty}_{size}, z.B. 'rookie_staffel', 'commander_armada'

type Difficulty = 'rookie' | 'seasoned' | 'veteran' | 'elite' | 'commander'
type FleetSize  = 'staffel' | 'geschwader' | 'flotte' | 'armada'

const DIFF_STATS: Record<Difficulty, { statMul: number; hpMul: number }> = {
  rookie:    { statMul: 1.0, hpMul: 1.5 },
  seasoned:  { statMul: 1.5, hpMul: 2.0 },
  veteran:   { statMul: 2.0, hpMul: 2.5 },
  elite:     { statMul: 2.5, hpMul: 3.0 },
  commander: { statMul: 3.0, hpMul: 3.5 },
}

// Verfügbare Chassis-Klassen pro Schwierigkeit
const DIFF_CLASSES: Record<Difficulty, { combat: string[]; trade: string[] }> = {
  rookie:    { combat: ['B'],             trade: ['Z'] },
  seasoned:  { combat: ['B','C'],         trade: ['Z','A'] },
  veteran:   { combat: ['B','C','D'],     trade: ['A'] },
  elite:     { combat: ['B','C','D','E'], trade: ['A'] },
  commander: { combat: ['B','C','D','E'], trade: ['A'] },
}

// Schiffsanzahl pro Größe: [basis, extraMin, extraMax]
// Gesamt = basis + rand(extraMin..extraMax) Kampfschiffe + 0-1 Händler
const SIZE_SHIPS: Record<FleetSize, { base: number; extra: number }> = {
  staffel:    { base: 3,  extra: 3  },  // 3–6
  geschwader: { base: 6,  extra: 6  },  // 6–12
  flotte:     { base: 9,  extra: 9  },  // 9–18
  armada:     { base: 16, extra: 24 },  // 16–40  (Boss-Flotte)
}

// NPC-Label für den Scanner — statisch statt for-loop (Deno Edge kompatibel)
const NPC_LABELS: Record<string, { name: string; difficulty: string }> = {
  rookie_staffel:       { name: 'Piraten-Staffel',      difficulty: 'Rookie'    },
  rookie_geschwader:    { name: 'Piraten-Geschwader',   difficulty: 'Rookie'    },
  rookie_flotte:        { name: 'Piraten-Flotte',       difficulty: 'Rookie'    },
  rookie_armada:        { name: 'Piraten-Armada',       difficulty: 'Rookie'    },
  seasoned_staffel:     { name: 'Piraten-Staffel',      difficulty: 'Seasoned'  },
  seasoned_geschwader:  { name: 'Piraten-Geschwader',   difficulty: 'Seasoned'  },
  seasoned_flotte:      { name: 'Piraten-Flotte',       difficulty: 'Seasoned'  },
  seasoned_armada:      { name: 'Piraten-Armada',       difficulty: 'Seasoned'  },
  veteran_staffel:      { name: 'Piraten-Staffel',      difficulty: 'Veteran'   },
  veteran_geschwader:   { name: 'Piraten-Geschwader',   difficulty: 'Veteran'   },
  veteran_flotte:       { name: 'Piraten-Flotte',       difficulty: 'Veteran'   },
  veteran_armada:       { name: 'Piraten-Armada',       difficulty: 'Veteran'   },
  elite_staffel:        { name: 'Piraten-Staffel',      difficulty: 'Elite'     },
  elite_geschwader:     { name: 'Piraten-Geschwader',   difficulty: 'Elite'     },
  elite_flotte:         { name: 'Piraten-Flotte',       difficulty: 'Elite'     },
  elite_armada:         { name: 'Piraten-Armada',       difficulty: 'Elite'     },
  commander_staffel:    { name: 'Piraten-Staffel',      difficulty: 'Commander' },
  commander_geschwader: { name: 'Piraten-Geschwader',   difficulty: 'Commander' },
  commander_flotte:     { name: 'Piraten-Flotte',       difficulty: 'Commander' },
  commander_armada:     { name: 'Piraten-Armada',       difficulty: 'Commander' },
  haendler_konvoi:      { name: 'Händler-Konvoi',       difficulty: 'Rookie'    },
}

// NPC-Typ → Schwierigkeit (statisch, kein for-loop)
const NPC_DIFFICULTY: Record<string, string> = {
  rookie_staffel: 'rookie',    rookie_geschwader: 'rookie',
  rookie_flotte:  'rookie',    rookie_armada:     'rookie',
  seasoned_staffel: 'seasoned', seasoned_geschwader: 'seasoned',
  seasoned_flotte:  'seasoned', seasoned_armada:     'seasoned',
  veteran_staffel: 'veteran',  veteran_geschwader: 'veteran',
  veteran_flotte:  'veteran',  veteran_armada:     'veteran',
  elite_staffel:   'elite',    elite_geschwader:   'elite',
  elite_flotte:    'elite',    elite_armada:       'elite',
  commander_staffel: 'commander', commander_geschwader: 'commander',
  commander_flotte:  'commander', commander_armada:     'commander',
  haendler_konvoi: 'rookie',
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
  // npcType format: '{difficulty}_{size}' z.B. 'veteran_flotte'
  const parts    = npcType.split('_')
  const size     = parts[parts.length - 1] as FleetSize
  const diff     = (NPC_DIFFICULTY[npcType] ?? 'rookie') as Difficulty
  const pool     = DIFF_CLASSES[diff]
  const sizeConf = SIZE_SHIPS[size] ?? SIZE_SHIPS['staffel']
  const ships: NpcShip[] = []
  let idx = 0

  // Anzahl Kampfschiffe: basis + rand(0..extra)
  const combatCount = sizeConf.base + Math.floor(rand() * (sizeConf.extra + 1))

  for (let i = 0; i < combatCount; i++) {
    // Klassen-Pool: höhere Schwierigkeit bevorzugt stärkere Klassen
    // Gewichtung: letzte Klasse im Pool häufiger bei höheren Levels
    const clsIdx = Math.floor(Math.pow(rand(), 0.6) * pool.combat.length)
    const cls = pool.combat[Math.min(clsIdx, pool.combat.length - 1)]
    const cands = chassisDefs.filter((c: any) => c.class === cls && !c.id.includes('station') && !c.id.includes('probe'))
    if (!cands.length) continue
    ships.push(buildNpcShip(cands[Math.floor(rand() * cands.length)], diff, false, idx++))
  }

  // Händler: Armada hat immer 1-2, kleinere Flotten manchmal einen
  const traderChance = size === 'armada' ? 2 : size === 'flotte' ? 1 : rand() < 0.4 ? 1 : 0
  for (let t = 0; t < traderChance; t++) {
    const tradeCls = pool.trade[Math.floor(rand() * pool.trade.length)]
    const tradeCands = chassisDefs.filter((c: any) =>
      c.class === tradeCls && c.base_cargo > 0 && !c.id.includes('station') && !c.id.includes('probe')
    )
    if (tradeCands.length)
      ships.push(buildNpcShip(tradeCands[Math.floor(rand() * tradeCands.length)], diff, true, idx++))
  }
  return ships
}

// Waffenklasse → bevorzugte Ziel-Chassisklasse (laut WEAPONS_SYSTEM.md)
const WEAPON_TARGET_CLASS: Record<string, string> = {
  A: 'A', B: 'B', C: 'C', D: 'D', E: 'E',
}

// Ziel-Prioritätskette pro Klasse: welche Klassen werden bevorzugt angegriffen
const TARGET_PRIORITY: Record<string, string[]> = {
  A: ['E','D','C','B','A'],  // Händler/Sonde: flieht, greift stärkste Bedrohung an wenn muss
  B: ['B','C','A','D','E'],  // Leichte Kampfschiffe: bevorzugen Gleichklasse
  C: ['C','B','D','A','E'],
  D: ['D','C','E','B','A'],
  E: ['E','D','C','B','A'],  // Schwere: fokussieren stärkste Ziele zuerst
  Z: ['B','C','D','E','A'],  // Z-Klasse (Frachter): letzter Fallback
}

// Zielauswahl nach Angriffskraft — stärkste Bedrohung zuerst, leichte Zufallskomponente
function pickTarget<T extends { chassisClass: string; attack: number; hp: number; id: string }>(
  attacker: { chassisClass: string },
  alive: T[]
): T {
  const priority = TARGET_PRIORITY[attacker.chassisClass] ?? TARGET_PRIORITY['B']

  // Erste Prioritätsklasse mit lebenden Zielen finden
  for (const cls of priority) {
    const group = alive.filter(s => s.chassisClass === cls)
    if (!group.length) continue

    // Sortieren nach Angriffskraft (stärkste Bedrohung zuerst)
    group.sort((a, b) => b.attack - a.attack)

    // Leichte Zufallskomponente: 30% Chance auf zweitstärkstes wenn nahe beieinander
    if (group.length > 1 && rand() < 0.30) {
      const diff = group[0].attack - group[1].attack
      if (diff < 20) return group[1]
    }
    return group[0]
  }

  // Absoluter Fallback: irgendein lebendes Ziel
  return alive[Math.floor(rand() * alive.length)]
}

// Waffenart → weaponType string (aus Part-ID erkannt)
function weaponTypeFromId(id: string): string {
  if (id.startsWith('laser'))      return 'laser'
  if (id.startsWith('ion_cannon')) return 'ion'
  if (id.startsWith('railgun'))    return 'railgun'
  if (id.startsWith('plasma'))     return 'plasma'
  if (id.startsWith('torpedo'))    return 'torpedo'
  if (id.startsWith('laser_turret'))    return 'laser'
  if (id.startsWith('ion_turret'))      return 'ion'
  if (id.startsWith('railgun_turret'))  return 'railgun'
  if (id.startsWith('plasma_turret'))   return 'plasma'
  if (id.startsWith('torpedo_turret'))  return 'torpedo'
  return 'laser' // Fallback
}

interface Weapon {
  weaponType: string   // laser | ion | railgun | plasma | torpedo
  weaponClass: string  // A | B | C | D | E
  attack: number       // Schadenswert dieser Waffe
  targetClass: string  // Bevorzugte Ziel-Chassisklasse
  isPrimary: boolean
}

// ─── Tech-Boni für Kampf laden ────────────────────────────────────────────────
// Gibt Multiplikatoren zurück: { attack: 1.15, defense: 1.10, hp: 1.05, ... }
async function loadPlayerTechBonuses(playerId: string): Promise<{
  attack: number; defense: number; hp: number;
  militarySpeed: number; civilianSpeed: number; cargo: number
}> {
  const defaults = { attack: 1.0, defense: 1.0, hp: 1.0, militarySpeed: 1.0, civilianSpeed: 1.0, cargo: 1.0 }

  const { data: techs } = await supabase
    .from('player_technologies')
    .select('tech_id, level')
    .eq('player_id', playerId)
    .gt('level', 0)

  if (!techs?.length) return defaults

  const techIds = techs.map((t: any) => t.tech_id)
  const { data: defs } = await supabase
    .from('tech_definitions')
    .select('id, effects')
    .in('id', techIds)

  if (!defs?.length) return defaults

  const levelMap: Record<string, number> = {}
  for (const t of techs) levelMap[t.tech_id] = t.level

  let atkBonus = 0, defBonus = 0, hpBonus = 0
  let milSpdBonus = 0, civSpdBonus = 0, cargoBonus = 0

  for (const def of defs) {
    if (!def.effects) continue
    const lvl = levelMap[def.id] ?? 1
    const e = def.effects
    if (e.ship_attack_bonus)    atkBonus    += e.ship_attack_bonus    * lvl
    if (e.ship_defense_bonus)   defBonus    += e.ship_defense_bonus   * lvl
    if (e.ship_hp_bonus)        hpBonus     += e.ship_hp_bonus        * lvl
    if (e.military_speed_bonus) milSpdBonus += e.military_speed_bonus * lvl
    if (e.civilian_speed_bonus) civSpdBonus += e.civilian_speed_bonus * lvl
    if (e.ship_cargo_bonus)     cargoBonus  += e.ship_cargo_bonus     * lvl
  }

  return {
    attack:       1.0 + atkBonus,
    defense:      1.0 + defBonus,
    hp:           1.0 + hpBonus,
    militarySpeed: 1.0 + milSpdBonus,
    civilianSpeed: 1.0 + civSpdBonus,
    cargo:        1.0 + cargoBonus,
  }
}

interface CombatShip {
  id: string; name: string; chassisClass: string
  hp: number; maxHp: number; attack: number; defense: number
  speed: number; maneuver: number
  weapons: Weapon[]    // Eine Einheit pro Waffe (inkl. Duplikate)
  autoRetreatAt: number; isPlayer: true
}

function playerShipToCombat(ship: any, chassisDefs: any[], partDefs: any[], techBonuses?: { attack: number; defense: number; hp: number; militarySpeed: number; civilianSpeed: number; cargo: number }): CombatShip {
  const tb = techBonuses ?? { attack: 1.0, defense: 1.0, hp: 1.0, militarySpeed: 1.0, civilianSpeed: 1.0, cargo: 1.0 }
  const isMilitary = !['Z'].includes(ship.ship_designs?.chassis?.class ?? 'B')
  const d = ship.ship_designs
  const chassis = chassisDefs.find((c: any) => c.id === d?.chassis_id)
  const cls = chassis?.class ?? 'B'
  const baseAtk = chassis?.base_attack ?? 10

  // installed_parts kann Array von strings oder {part_id} sein
  const rawParts: string[] = (d?.installed_parts ?? []).map((p: any) =>
    typeof p === 'string' ? p : p?.part_id
  ).filter(Boolean)

  // Waffen aus Part-Definitionen bauen
  const weapons: Weapon[] = []
  for (const partId of rawParts) {
    const part = partDefs.find((p: any) => p.id === partId)
    if (!part) continue
    if (part.category === 'primary_weapon') {
      const wClass = part.weapon_class ?? 'B'
      weapons.push({
        weaponType: weaponTypeFromId(partId),
        weaponClass: wClass,
        attack: (part.attack_bonus ?? 0) + baseAtk,
        targetClass: WEAPON_TARGET_CLASS[wClass] ?? cls,
        isPrimary: true,
      })
    } else if (part.category === 'turret') {
      const wClass = part.weapon_class ?? 'B'
      weapons.push({
        weaponType: weaponTypeFromId(partId),
        weaponClass: wClass,
        attack: (part.attack_bonus ?? 0) + Math.floor(baseAtk / 2),
        targetClass: WEAPON_TARGET_CLASS[wClass] ?? cls,
        isPrimary: false,
      })
    }
  }

  // Fallback: kein Weapon in DB → generische Waffe NUR wenn Chassis Waffen erlaubt
  const maxWeapons = chassis?.max_primary_weapons ?? 1
  if (weapons.length === 0 && maxWeapons > 0) {
    weapons.push({
      weaponType: 'laser',
      weaponClass: cls,
      attack: d?.total_attack ?? baseAtk,
      targetClass: cls,
      isPrimary: true,
    })
  }

  const rawAtk  = d?.total_attack   ?? chassis?.base_attack   ?? 0
  const rawDef  = d?.total_defense  ?? chassis?.base_defense  ?? 5
  const rawHp   = ship.max_hp ?? 0
  const rawSpd  = d?.total_speed    ?? chassis?.base_speed    ?? 20
  const rawMnv  = d?.total_maneuver ?? chassis?.base_maneuver ?? 20
  const speedMul = cls === 'Z' ? tb.civilianSpeed : tb.militarySpeed

  // Waffen-Angriff auch mit Tech-Bonus skalieren
  const boostedWeapons = weapons.map(w => ({
    ...w,
    attack: Math.round(w.attack * tb.attack),
  }))

  const boostedMaxHp = Math.round(rawHp * tb.hp)

  return {
    id: ship.id, name: ship.name ?? d?.name ?? 'Schiff', chassisClass: cls,
    hp: Math.min(ship.current_hp, boostedMaxHp),  // HP nie höher als boosted max
    maxHp: boostedMaxHp,
    attack:   Math.round(rawAtk * tb.attack),
    defense:  Math.round(rawDef * tb.defense),
    speed:    Math.round(rawSpd * speedMul),
    maneuver: Math.round(rawMnv * tb.attack * 0.3 + rawMnv * 0.7),  // leichter Manöver-Bonus
    weapons:  boostedWeapons,
    autoRetreatAt: ship.auto_retreat_at ?? 0,
    isPlayer: true,
  }
}

interface RoundAction {
  attackerId: string; attackerName: string
  targetId: string; targetName: string
  weaponType: string; weaponClass: string; isPrimary: boolean
  hit: boolean; damage: number; targetHpAfter: number; destroyed: boolean
}

// Simuliert EINE Runde — mutiert hp in-place
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
      if (!attacker || attacker.hp <= 0 || attacker.weapons.length === 0) continue
      if (!nShips.filter(s => s.hp > 0).length) break

      // Jede Waffe schießt separat auf ihr bevorzugtes Ziel
      for (const weapon of attacker.weapons) {
        const alive = nShips.filter(s => s.hp > 0)
        if (!alive.length) break
        const target = pickTarget(attacker, alive)
        const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
        const damage = hit ? calcDamage(weapon.attack, target.defense) : 0
        if (hit) target.hp = Math.max(0, target.hp - damage)
        actions.push({
          attackerId: attacker.id, attackerName: attacker.name,
          targetId: target.id, targetName: target.name,
          weaponType: weapon.weaponType, weaponClass: weapon.weaponClass, isPrimary: weapon.isPrimary,
          hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0,
        })
      }
    } else {
      const attacker = nShips.find(s => s.id === fighter.id)
      if (!attacker || attacker.hp <= 0 || attacker.isTrader || attacker.shots === 0) continue
      const alive = pShips.filter(s => s.hp > 0)
      if (!alive.length) break
      const npcWeaponType = ({ A: 'railgun', B: 'laser', C: 'ion', D: 'plasma', E: 'torpedo' } as Record<string,string>)[attacker.chassisClass] ?? 'laser'
      for (let shot = 0; shot < attacker.shots; shot++) {
        const stillAlive = pShips.filter(s => s.hp > 0)
        if (!stillAlive.length) break
        const target = pickTarget(attacker, stillAlive)
        const hit = rand() < hitChance(attacker.maneuver, target.maneuver)
        const damage = hit ? calcDamage(attacker.attack, target.defense) : 0
        if (hit) target.hp = Math.max(0, target.hp - damage)
        actions.push({
          attackerId: attacker.id, attackerName: attacker.name,
          targetId: target.id, targetName: target.name,
          weaponType: npcWeaponType, weaponClass: attacker.chassisClass, isPrimary: true,
          hit, damage, targetHpAfter: target.hp, destroyed: target.hp <= 0,
        })
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
  const partDefs = await supabase.from('ship_part_definitions').select('id, category, weapon_class, attack_bonus').then(r => r.data ?? [])

  // ── 1. Abgelaufene NPC-Kampfflotten + Cooldowns + Reservierungen löschen ──
  await supabase.from('npc_combat_fleets').delete().lt('expires_at', new Date().toISOString())
  await supabase.from('npc_spawn_cooldowns').delete().lt('blocked_until', new Date().toISOString())
  await supabase.from('npc_spawn_reservations').delete().lt('expires_at', new Date().toISOString())

  // ── 2. Laufende Kämpfe: je eine Runde simulieren ──────────────────────────
  const { data: activeBattles } = await supabase
    .from('active_battles')
    .select('*, fleets(player_id, flight_mode, x, y, z, ships(*, ship_designs(*)))')

  let battlesResolved = 0

  for (const battle of activeBattles ?? []) {
    // Tech-Boni für diesen Spieler laden
    const playerId = battle.fleets?.player_id
    const techBonuses = playerId ? await loadPlayerTechBonuses(playerId) : undefined
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

    // Wenn keine persistente NPC-Flotte: Cooldown prüfen
    if (!npcFleetRow) {
      const { data: cooldown } = await supabase
        .from('npc_spawn_cooldowns')
        .select('blocked_until')
        .eq('x', fx).eq('y', fy).eq('z', fz)
        .maybeSingle()
      if (cooldown) continue // Koordinate noch gesperrt
    }

    // Kein NPC-Spawn wenn bereits eine andere Spielerflotte auf der Koordinate steht
    // → verhindert inaktives Farmen durch stehenlassen der Flotte
    if (!npcFleetRow) {
      const { data: fleetsOnCoord } = await supabase
        .from('fleets')
        .select('id')
        .eq('x', fx).eq('y', fy).eq('z', fz)
        .eq('is_in_transit', false)
        .neq('id', fleet.id)  // eigene Flotte nicht zählen
        .limit(1)
      if (fleetsOnCoord?.length) continue  // Koordinate besetzt
    }

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
      // Schwierigkeit: 30% rookie / 35% seasoned / 25% veteran / 8% elite / 2% commander
      const diffHash = coordHashJs(fx, fy, fz, timeSlot + 42)
      const diff = diffHash < 0.30 ? 'rookie'
                 : diffHash < 0.65 ? 'seasoned'
                 : diffHash < 0.90 ? 'veteran'
                 : diffHash < 0.98 ? 'elite'
                 : 'commander'
      // Größe: 40% staffel / 30% geschwader / 20% flotte / 10% armada
      const sizeHash = coordHashJs(fx, fz, fy, timeSlot + 99)
      const size = sizeHash < 0.40 ? 'staffel'
                 : sizeHash < 0.70 ? 'geschwader'
                 : sizeHash < 0.90 ? 'flotte'
                 : 'armada'
      const npcType = diff + '_' + size
      if (fleet.flight_mode === 'bounty' && diff === 'commander' && size === 'armada') continue

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
    const newBattleTechBonuses = fleet.player_id ? await loadPlayerTechBonuses(fleet.player_id) : undefined
    const pShips = ships.map((s: any) => playerShipToCombat(s, chassisDefs, partDefs, newBattleTechBonuses))
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
      // Cooldown setzen: 3h kein Respawn an dieser Koordinate
      await supabase.from('npc_spawn_cooldowns').upsert({
        x: battle.x, y: battle.y, z: battle.z,
        blocked_until: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      }, { onConflict: 'x,y,z' })
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
