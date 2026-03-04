// supabase/functions/process-tick/index.ts
// Tick-System — läuft alle 30 Sekunden via externem Cron (Upstash/Render)
// Reihenfolge: Lock → Counter → Ressourcen → Energie → Build → Research → Flotten

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Konstanten ───────────────────────────────────────────────────────────────

// Produktion pro Mine pro Tick (30s)
// 120/h ÷ 120 Ticks/h = 1 pro Tick
const PROD_PER_MINE_PER_TICK = 1

const MINEABLE = [
  'titan','silizium','helium','nahrung','wasser',
  'bauxit','aluminium','uran','plutonium','wasserstoff'
] as const

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Nur POST, nur intern (Secret-Header)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const secret = req.headers.get("x-tick-secret") ?? url.searchParams.get("secret")
  if (secret !== Deno.env.get('TICK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // ── 1. Advisory Lock — verhindert doppelte Ticks ──────────────────────────
    const { data: lockData } = await supabase.rpc('try_tick_lock')
    if (!lockData) {
      return new Response(JSON.stringify({ skip: 'locked' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const tickStart = Date.now()
    const log: string[] = []

    try {
      // ── 2. Tick-Counter erhöhen ───────────────────────────────────────────
      const { data: tickRow } = await supabase
        .from('game_tick')
        .select('current_tick')
        .single()

      const currentTick = (tickRow?.current_tick ?? 0) + 1

      await supabase
        .from('game_tick')
        .update({ current_tick: currentTick, last_tick_at: new Date().toISOString() })
        .eq('id', 1)

      log.push(`tick=${currentTick}`)

      // ── 3. Alle aktiven Planeten laden ────────────────────────────────────
      const { data: planets, error: planetsError } = await supabase
        .from('planets')
        .select('id, owner_id, mine_distribution, total_mine_slots, energie, ' +
          MINEABLE.map(r => `${r}, prod_${r}`).join(', '))

      if (planetsError) throw planetsError
      if (!planets?.length) {
        log.push('no planets')
      } else {
        // ── 3a. Energieverbrauch pro Planet berechnen ─────────────────────
        // Energie-Kosten der Gebäude laden
        const { data: buildingDefs } = await supabase
          .from('building_definitions')
          .select('id, energy_cost')

        const { data: allPlanetBuildings } = await supabase
          .from('planet_buildings')
          .select('planet_id, building_id, level, is_active')

        const { data: kraftwerkDef } = await supabase
          .from('building_definitions')
          .select('id')
          .eq('id', 'power_plant')
          .single()

        // Energie-Produktion: Kraftwerk level × 100 pro Tick (aus Architektur: +100/Level)
        // Energie wird nicht gespeichert wie Ressourcen — sie ist ein gecachter Wert
        // Wir berechnen: hat der Planet genug Energie für alle aktiven Gebäude?

        for (const planet of planets) {
          await processPlanetTick(planet, allPlanetBuildings ?? [], buildingDefs ?? [], log)
        }

        log.push(`planets=${planets.length}`)
      }

      // ── 5. Build-Queue abarbeiten ─────────────────────────────────────────
      await processBuildQueue(log)

      // ── 6. Research-Queue abarbeiten ──────────────────────────────────────
      await processResearchQueue(log)

      // ── 8. Flotten-Bewegungen ─────────────────────────────────────────────
      await processFleets(currentTick, log)

    } finally {
      // ── Lock freigeben ────────────────────────────────────────────────────
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
  const planetBuildings = allBuildings.filter(b => b.planet_id === planet.id && b.is_active)

  // Energie berechnen
  // Kraftwerk: +100 × level pro Tick (vereinfacht: Energie ist sofort verfügbar)
  const kraftwerkLevel = planetBuildings.find(b => b.building_id === 'power_plant')?.level ?? 0
  const energieProduktion = kraftwerkLevel * 100

  // Energie-Verbrauch: Summe energy_cost × level aller aktiven Gebäude
  let energieVerbrauch = 0
  for (const pb of planetBuildings) {
    const def = buildingDefs.find(d => d.id === pb.building_id)
    if (def?.energy_cost) energieVerbrauch += def.energy_cost * pb.level
  }

  const energieSaldo = energieProduktion - energieVerbrauch
  const energieFaktor = energieSaldo >= 0 ? 1.0 : 0.5  // Zu wenig Energie → halbe Minenrate

  // Ressourcenproduktion berechnen
  const updates: Record<string, number> = {}
  const prodUpdates: Record<string, number> = {}

  for (const res of MINEABLE) {
    const mines = dist[res] ?? 0
    if (mines === 0) {
      prodUpdates[`prod_${res}`] = 0
      continue
    }

    const prodPerTick = mines * PROD_PER_MINE_PER_TICK * energieFaktor
    const prodPerHour = Math.round(prodPerTick * 60) // 60 Ticks/h (Cron jede Minute)

    updates[res] = (planet[res] ?? 0) + prodPerTick
    prodUpdates[`prod_${res}`] = prodPerHour
  }

  // Energie-Stand aktualisieren
  updates['energie'] = Math.max(0, energieSaldo)

  // Credits vom Regierungssitz
  const regierungssitzLevel = planetBuildings.find(b => b.building_id === 'government')?.level ?? 0
  if (regierungssitzLevel > 0) {
    // +10 Credits × level pro Tick
    updates['credits'] = (planet['credits'] ?? 0) + regierungssitzLevel * 10
    prodUpdates['prod_credits'] = regierungssitzLevel * 10 * 120
  }

  // Alles in einem Update zusammenfassen
  const allUpdates = { ...updates, ...prodUpdates }

  if (Object.keys(allUpdates).length > 0) {
    const { error } = await supabase
      .from('planets')
      .update(allUpdates)
      .eq('id', planet.id)

    if (error) {
      log.push(`planet_err(${planet.id}): ${error.message}`)
    }
  }
}

// ─── Build-Queue ──────────────────────────────────────────────────────────────

async function processBuildQueue(log: string[]) {
  // Alle Einträge deren finish_at überschritten ist
  const { data: doneItems } = await supabase
    .from('build_queue')
    .select('*')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  for (const item of doneItems) {
    // Gebäude auf target_level setzen
    const { error: upsertErr } = await supabase
      .from('planet_buildings')
      .upsert(
        { planet_id: item.planet_id, building_id: item.building_id, level: item.target_level, is_active: true },
        { onConflict: 'planet_id,building_id' }
      )

    if (upsertErr) {
      log.push(`build_err: ${upsertErr.message}`)
      continue
    }

    // HQ-Upgrade: Minenslots aktualisieren
    if (item.building_id === 'hq') {
      await supabase
        .from('planets')
        .update({ total_mine_slots: item.target_level * 50 })
        .eq('id', item.planet_id)
    }

    // Aus Queue entfernen
    await supabase.from('build_queue').delete().eq('id', item.id)
    completed++
  }

  if (completed > 0) log.push(`builds_done=${completed}`)
}

// ─── Research-Queue ───────────────────────────────────────────────────────────

async function processResearchQueue(log: string[]) {
  // Alle Forschungsaufträge deren finish_at überschritten ist
  const { data: doneItems } = await supabase
    .from('research_queue')
    .select('*, tech_definitions(base_success_chance)')
    .lte('finish_at', new Date().toISOString())

  if (!doneItems?.length) return

  let completed = 0
  let failed = 0

  for (const item of doneItems) {
    // Forscher-Bonus holen
    const { data: researchers } = await supabase
      .from('researchers')
      .select('id')
      .eq('player_id', item.player_id)

    const researcherBonus = (researchers?.length ?? 0) * 5
    const baseChance = item.tech_definitions?.base_success_chance ?? 80
    const chance = Math.min(95, baseChance + researcherBonus)
    const success = Math.random() * 100 <= chance

    if (success) {
      // Tech auf target_level setzen
      await supabase
        .from('player_technologies')
        .upsert(
          { player_id: item.player_id, tech_id: item.tech_id, level: item.target_level },
          { onConflict: 'player_id,tech_id' }
        )
      completed++
    } else {
      failed++
    }

    // Aus Queue entfernen
    await supabase.from('research_queue').delete().eq('id', item.id)
  }

  if (completed > 0) log.push(`research_done=${completed}`)
  if (failed > 0) log.push(`research_failed=${failed}`)
}

// ─── Flotten-Bewegungen ───────────────────────────────────────────────────────

async function processFleets(currentTick: number, log: string[]) {
  // Flotten die gerade reisen und deren arrive_at überschritten ist
  const { data: arrivedFleets } = await supabase
    .from('fleets')
    .select('*')
    .eq('is_in_transit', true)
    .lte('arrive_at', new Date().toISOString())

  if (!arrivedFleets?.length) return

  let arrived = 0
  for (const fleet of arrivedFleets) {
    await supabase
      .from('fleets')
      .update({
        is_in_transit: false,
        x: fleet.target_x,
        y: fleet.target_y,
        z: fleet.target_z ?? 100,
        target_x: null,
        target_y: null,
        target_z: null,
        arrive_at: null,
      })
      .eq('id', fleet.id)

    arrived++
    // TODO: Kampfauflösung wenn andere Flotten auf gleicher Koordinate
  }

  if (arrived > 0) log.push(`fleets_arrived=${arrived}`)
}
