// supabase/functions/process-tick/index.ts
// Tick-System — läuft alle 30 Sekunden via externem Cron (Upstash/Render)
// Reihenfolge: Lock → Counter → Ressourcen → Build → Research → Schiffsbau → Flotten

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Konstanten ───────────────────────────────────────────────────────────────

const PROD_PER_MINE_PER_TICK = 2  // bei 60 Ticks/h → 120/h pro Mine

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
      const { data: planets, error: planetsError } = await supabase
        .from('planets')
        .select('id, owner_id, mine_distribution, energie, credits, energy_consumed, ' +
          MINEABLE.map(r => r).join(', '))

      if (planetsError) throw planetsError

      if (planets?.length) {
        for (const planet of planets) {
          await processPlanetTick(planet, allPlanetBuildings ?? [], buildingDefs ?? [], log)
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
  log: string[]
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
    const prodPerTick = mines * PROD_PER_MINE_PER_TICK * energieFaktor
    const prodPerHour = Math.round(prodPerTick * 60)
    if (mines > 0) updates[res] = (planet[res] ?? 0) + prodPerTick
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

// ─── Gebäude-Queue ────────────────────────────────────────────────────────────

async function processBuildQueue(log: string[]) {
  const { data: doneItems } = await supabase
    .from('build_queue').select('*')
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
      completed++
    } else {
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

    // Flotte holen oder erstellen
    const { data: fleet } = await supabase
      .from('fleets').select('id')
      .eq('player_id', design.player_id)
      .eq('is_in_transit', false)
      .limit(1)
      .maybeSingle()

    let fleetId = fleet?.id

    if (!fleetId) {
      const { data: planet } = await supabase
        .from('planets').select('x, y, z')
        .eq('id', item.planet_id).single()

      const { data: newFleet } = await supabase.from('fleets').insert({
        player_id: design.player_id,
        name: 'Flotte 1',
        is_in_transit: false,
        x: planet?.x ?? 0,
        y: planet?.y ?? 0,
        z: planet?.z ?? 100,
      }).select().single()

      fleetId = newFleet?.id
    }

    if (fleetId) {
      const { error: shipErr } = await supabase.from('ships').insert({
        design_id: design.id,
        player_id: design.player_id,
        fleet_id: fleetId,
        name: design.name,
        current_hp: design.total_hp,
        max_hp: design.total_hp,
        planet_id: item.planet_id,
      })

      if (shipErr) {
        log.push(`ship_err: ${shipErr.message}`)
        continue
      }
    }

    await supabase.from('ship_build_queue').delete().eq('id', item.id)
    completed++
  }

  if (completed > 0) log.push(`ships_done=${completed}`)
}

// ─── Flotten-Bewegungen ───────────────────────────────────────────────────────

async function processFleets(log: string[]) {
  const { data: arrivedFleets } = await supabase
    .from('fleets').select('*')
    .eq('is_in_transit', true)
    .lte('arrive_at', new Date().toISOString())

  if (!arrivedFleets?.length) return

  let arrived = 0
  for (const fleet of arrivedFleets) {
    await supabase.from('fleets').update({
      is_in_transit: false,
      x: fleet.target_x,
      y: fleet.target_y,
      z: fleet.target_z ?? 100,
      target_x: null,
      target_y: null,
      target_z: null,
      arrive_at: null,
    }).eq('id', fleet.id)
    arrived++
  }

  if (arrived > 0) log.push(`fleets_arrived=${arrived}`)
}
