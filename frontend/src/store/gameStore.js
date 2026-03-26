// src/store/gameStore.js
import { create } from 'zustand'
import { supabase, callFunction } from '@/lib/supabase'

export const useGameStore = create((set, get) => ({
  // Auth
  player: null,
  token: null,
  isLoading: true,

  // Game data
  planet: null,
  buildings: [],
  buildQueue: [],
  technologies: [],
  researchers: [],
  fleets: [],
  ships: [],
  scanResults: [],
  currentTick: 0,
  notifications: [],
  race: null,           // Rassen-Daten inkl. mine_production_bonus
  playerSkills: {},     // { skill_key: points_spent }
  techEffects: {},      // { tech_id: { mine_production: 0.05, ... } }
  techLevels:  {},      // { tech_id: level } — korrekte Level für Bonus-Berechnung
  mineProductionBonus: 1.0, // berechneter Multiplikator (1.0 = kein Bonus)
  scanRanges: { fleet: 10, npc: 20, asteroid: 40 }, // Scanreichweiten in pc

  // UI state
  tutorialStep: 0,
  sidebarOpen: true,

  // -------------------------------------------------------
  // AUTH
  // -------------------------------------------------------
  initFromStorage: async () => {
    const token = localStorage.getItem('sb_token')
    const playerStr = localStorage.getItem('sb_player')
    if (!token || !playerStr) {
      set({ isLoading: false })
      return
    }
    const player = JSON.parse(playerStr)
    set({ player, token, isLoading: false })
    get().loadGameData()
  },

  register: async (username, profession, raceId) => {
    const { data: player, error } = await supabase
      .from('players')
      .insert({ username, profession, race_id: raceId })
      .select()
      .single()
    if (error) throw new Error(error.message)

    const { error: planetError } = await supabase.from('planets').insert({
      owner_id: player.id,
      name: `${username}s Heimatwelt`,
      x: Math.floor(Math.random() * 400) + 50,
      y: Math.floor(Math.random() * 400) + 50,
      z: 100,
      is_homeworld: true,
      titan: 5000, silizium: 4000, helium: 2000,
      nahrung: 2000, wasser: 2000, bauxit: 3000,
      aluminium: 3000, uran: 1000, plutonium: 500,
      wasserstoff: 1500, credits: 2000,
      energie: 0,
      energy_capacity: 0,
      energy_consumed: 0,
      prod_titan: 0, prod_silizium: 0, prod_helium: 0,
      prod_nahrung: 0, prod_wasser: 0, prod_bauxit: 0,
      prod_aluminium: 0, prod_uran: 0, prod_plutonium: 0,
      prod_wasserstoff: 0, prod_energie: 0, prod_credits: 0,
      total_mine_slots: 50,
      mine_distribution: {},
      scan_range: 10
    })
    if (planetError) throw new Error('Planet-Fehler: ' + planetError.message)

    const token = player.id
    localStorage.setItem('sb_token', token)
    localStorage.setItem('sb_player', JSON.stringify(player))
    set({ player, token })
    get().loadGameData()
    return player
  },

  login: async (username) => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('username', username)
      .single()
    if (error) throw new Error('Spieler nicht gefunden')
    const token = data.id
    localStorage.setItem('sb_token', token)
    localStorage.setItem('sb_player', JSON.stringify(data))
    set({ player: data, token })
    get().loadGameData()
    return data
  },

  logout: () => {
    localStorage.removeItem('sb_token')
    localStorage.removeItem('sb_player')
    set({ player: null, token: null, planet: null, buildings: [], buildQueue: [], fleets: [] })
  },

  // -------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------
  loadGameData: async () => {
    const { player } = get()
    if (!player) return

    // Load planet
    const { data: planet } = await supabase
      .from('planets')
      .select('*')
      .eq('owner_id', player.id)
      .single()

    if (planet) {
      set({ planet })
      get().loadPlanetData(planet.id)
    }

    // Load techs + tech effects
    await get().refreshTechnologies(player.id)

    // Rasse laden
    let race = null
    if (player.race_id) {
      const { data: raceData } = await supabase
        .from('races')
        .select('id, mine_production_bonus')
        .eq('id', player.race_id)
        .single()
      race = raceData
      set({ race })
    }

    // Skills laden
    const { data: skills } = await supabase
      .from('player_skills')
      .select('skill_key, points_spent')
      .eq('player_id', player.id)
    const skillMap = {}
    for (const s of skills ?? []) skillMap[s.skill_key] = s.points_spent
    set({ playerSkills: skillMap })

    // scanRanges berechnen
    get().recalcScanRanges()

    // Load researchers
    const { data: researchers } = await supabase
      .from('researchers')
      .select('*')
      .eq('player_id', player.id)
    set({ researchers: researchers ?? [] })

    // Load fleets
    const { data: fleets } = await supabase
      .from('fleets')
      .select('*, ships(*)')
      .eq('player_id', player.id)
    set({ fleets: fleets ?? [] })

    // Subscribe to planet changes (realtime)
    supabase.channel('planet-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'planets',
        filter: `owner_id=eq.${player.id}`
      }, (payload) => {
        if (payload.new) {
          const current = get().planet
          // Realtime vom Tick darf mine_distribution nicht überschreiben
          // wenn der lokale Wert neuer ist (höhere Summe = mehr Minen gebaut)
          const incomingDist = payload.new.mine_distribution ?? {}
          const currentDist  = current?.mine_distribution ?? {}
          const incomingSum  = Object.values(incomingDist).reduce((a, b) => a + b, 0)
          const currentSum   = Object.values(currentDist).reduce((a, b) => a + b, 0)
          if (incomingSum >= currentSum) {
            set({ planet: payload.new })
          } else {
            // Nur prod_* und Ressourcenwerte übernehmen, mine_distribution behalten
            set({ planet: { ...payload.new, mine_distribution: currentDist } })
          }
        }
      })
      .subscribe()

    // Client-seitiger Tick: alle 10 Sekunden Bauqueue prüfen
    get().processBuildQueue()
    setInterval(() => get().processBuildQueue(), 10000)
    // Planet alle 60s refreshen (Ressourcenproduktion durch Tick-System)
    setInterval(() => get().refreshPlanet(), 60000)
  },

  // Technologien neu laden (wird nach Forschungsabschluss und periodisch aufgerufen)
  refreshTechnologies: async (playerId) => {
    const pid = playerId ?? get().player?.id
    if (!pid) return

    const { data: techs } = await supabase
      .from('player_technologies')
      .select('tech_id, level')
      .eq('player_id', pid)
    set({ technologies: techs?.map(t => t.tech_id) ?? [] })

    const techIds = (techs ?? []).filter(t => t.level > 0).map(t => t.tech_id)
    let techEffectsMap = {}
    if (techIds.length) {
      const { data: defs } = await supabase
        .from('tech_definitions')
        .select('id, effects')
        .in('id', techIds)
      for (const def of defs ?? []) {
        if (def.effects) techEffectsMap[def.id] = def.effects
      }
    }
    const techLevelMap = {}
    for (const t of techs ?? []) techLevelMap[t.tech_id] = t.level
    set({ techEffects: techEffectsMap, techLevels: techLevelMap })

    // Boni neu berechnen mit frischen Tech-Daten
    const { race, playerSkills } = get()
    get().recalcMineBonus(race, playerSkills, techEffectsMap, techLevelMap)
    get().recalcScanRanges()
  },

  loadPlanetData: async (planetId) => {
    const { data: buildings } = await supabase
      .from('planet_buildings')
      .select('*')
      .eq('planet_id', planetId)
    set({ buildings: buildings ?? [] })
    get().recalcScanRanges()

    const { data: queue } = await supabase
      .from('build_queue')
      .select('*')
      .eq('planet_id', planetId)
      .order('queue_position')
    set({ buildQueue: queue ?? [] })
  },

  refreshPlanet: async () => {
    const { player, planet } = get()
    if (!player || !planet) return
    const { data } = await supabase.from('planets').select('*').eq('id', planet.id).single()
    if (data) set({ planet: data })
  },

  processBuildQueue: async () => {
    const { planet } = get()
    if (!planet) return

    const { data: queue } = await supabase
      .from('build_queue')
      .select('*')
      .eq('planet_id', planet.id)
      .order('queue_position')

    if (!queue || queue.length === 0) return

    const now = new Date()
    for (const item of queue) {
      if (new Date(item.finish_at) <= now) {
        // Gebäude fertigstellen
        const { data: existing } = await supabase
          .from('planet_buildings')
          .select('*')
          .eq('planet_id', planet.id)
          .eq('building_id', item.building_id)
          .single()

        if (existing) {
          await supabase.from('planet_buildings')
            .update({ level: item.target_level })
            .eq('planet_id', planet.id)
            .eq('building_id', item.building_id)
        } else {
          await supabase.from('planet_buildings')
            .insert({ planet_id: planet.id, building_id: item.building_id, level: item.target_level })
        }

        // Aus Queue entfernen
        await supabase.from('build_queue').delete().eq('id', item.id)
      }
    }

    await get().loadPlanetData(planet.id)
    await get().refreshPlanet()
  },

  // -------------------------------------------------------
  // BUILDINGS
  // -------------------------------------------------------
  queueBuild: async (buildingId) => {
    const { planet, buildings } = get()

    const currentLevel = buildings.find(b => b.building_id === buildingId)?.level ?? 0
    const nextLevel = currentLevel + 1

    const { data: def } = await supabase
      .from('building_definitions')
      .select('*')
      .eq('id', buildingId)
      .single()
    if (!def) throw new Error('Gebäude nicht gefunden')

    const scale = Math.pow(def.cost_scale_factor, currentLevel)
    const costs = {
      titan:       Math.floor((def.cost_titan       || 0) * scale),
      silizium:    Math.floor((def.cost_silizium    || 0) * scale),
      helium:      Math.floor((def.cost_helium      || 0) * scale),
      nahrung:     Math.floor((def.cost_nahrung     || 0) * scale),
      wasser:      Math.floor((def.cost_wasser      || 0) * scale),
      bauxit:      Math.floor((def.cost_bauxit      || 0) * scale),
      aluminium:   Math.floor((def.cost_aluminium   || 0) * scale),
      uran:        Math.floor((def.cost_uran        || 0) * scale),
      plutonium:   Math.floor((def.cost_plutonium   || 0) * scale),
      wasserstoff: Math.floor((def.cost_wasserstoff || 0) * scale),
      credits:     Math.floor((def.cost_credits     || 0) * scale),
    }

    for (const [res, amount] of Object.entries(costs)) {
      if (amount > 0 && (planet[res] || 0) < amount) {
        throw new Error(`Zu wenig ${res} (benötigt: ${amount})`)
      }
    }

    const updates = {}
    for (const [res, amount] of Object.entries(costs)) {
      if (amount > 0) updates[res] = (planet[res] || 0) - amount
    }
    await supabase.from('planets').update(updates).eq('id', planet.id)

    const buildSeconds = Math.floor(def.base_build_seconds * Math.pow(def.growth_factor, currentLevel))

    const { data: existingQueue } = await supabase
      .from('build_queue')
      .select('*')
      .eq('planet_id', planet.id)
      .order('queue_position')

    const position = (existingQueue?.length ?? 0) + 1
    if (position > 2) throw new Error('Bauqueue ist voll (max. 2 Einträge)')

    await supabase.from('build_queue').insert({
      planet_id: planet.id,
      building_id: buildingId,
      target_level: nextLevel,
      queue_position: position,
      ticks_remaining: Math.ceil(buildSeconds / 60),
      finish_at: new Date(Date.now() + buildSeconds * 1000).toISOString()
    })

    await get().loadPlanetData(planet.id)
    await get().refreshPlanet()
  },

  getBuildingLevel: (buildingId) => {
    const { buildings } = get()
    return buildings.find(b => b.building_id === buildingId)?.level ?? 0
  },

  // -------------------------------------------------------
  // RESEARCH
  // -------------------------------------------------------
  startResearch: async (techId, planetId) => {
    const result = await callFunction('research-action', { tech_id: techId, planet_id: planetId })
    const { planet } = get()
    await get().loadPlanetData(planet.id)
    return result
  },

  // Minen-Bonus live berechnen
  recalcMineBonus: (race, skills, techEffects, techLevels) => {
    const r = race ?? get().race
    const sk = skills ?? get().playerSkills
    const te = techEffects ?? get().techEffects
    const tl = techLevels ?? get().techLevels ?? (() => {
      const map = {}
      for (const id of get().technologies) map[id] = 1
      return map
    })()

    let bonus = 0

    // Rassenbonus (flat %)
    if (r?.mine_production_bonus) bonus += r.mine_production_bonus / 100

    // Skillpunkte: mine_production skill × 0.10 pro Punkt
    if (sk?.mine_production) bonus += sk.mine_production * 0.10

    // Tech-Boni: effects.mine_production × level
    for (const [techId, effects] of Object.entries(te)) {
      if (effects?.mine_production) {
        const lvl = tl[techId] ?? 1
        bonus += effects.mine_production * lvl
      }
    }

    set({ mineProductionBonus: 1.0 + bonus })
  },

  // Scan-Reichweiten live berechnen
  // Basis bei Lvl 1 Kommunikationsnetzwerk:
  //   fleet:    10 pc  (Spielerflotten)
  //   npc:      20 pc  (NPC / Kopfgeld, 2× fleet)
  //   asteroid: 40 pc  (Asteroiden, 4× fleet)
  // Bonus pro 2 Gebäude-Level: +1 / +2 / +4 pc
  // Techs: scan_range Effekt addiert auf fleet-Basis
  // Rasse: scan_range_bonus (%) auf fleet-Basis
  recalcScanRanges: () => {
    const { buildings, race, techEffects } = get()
    const technologies = get().technologies

    // Gebäude-Bonus: Kommunikationsnetzwerk
    const kommLevel = (buildings ?? []).find(b => b.building_id === 'communications_network')?.level ?? 0
    const kommBonus = Math.floor(kommLevel / 2)

    // Basis fleet-Reichweite
    let fleetBase = 10 + kommBonus

    // Tech-Boni: scan_range Effekt
    for (const [techId, effects] of Object.entries(techEffects ?? {})) {
      if (effects?.scan_range && technologies.includes(techId)) {
        fleetBase += effects.scan_range
      }
    }

    // Rassenbonus (%)
    if (race?.scan_range_bonus) {
      fleetBase = Math.round(fleetBase * (1 + race.scan_range_bonus / 100))
    }

    set({
      scanRanges: {
        fleet:    fleetBase,
        npc:      fleetBase * 2,
        asteroid: fleetBase * 4,
      }
    })
  },

  hasTech: (techId) => {
    return get().technologies.includes(techId)
  },

  // -------------------------------------------------------
  // FLEET
  // -------------------------------------------------------
  moveFleet: async (fleetId, targetX, targetY, targetZ, speedPercent, flightMode) => {
    return callFunction('fleet-action', {
      fleet_id: fleetId,
      action: 'move',
      target_x: targetX,
      target_y: targetY,
      target_z: targetZ,
      speed_percent: speedPercent,
      flight_mode: flightMode
    })
  },

  // -------------------------------------------------------
  // NOTIFICATIONS
  // -------------------------------------------------------
  addNotification: (msg, type = 'info') => {
    const id = Date.now()
    set(s => ({ notifications: [...s.notifications, { id, msg, type }] }))
    setTimeout(() => {
      set(s => ({ notifications: s.notifications.filter(n => n.id !== id) }))
    }, 5000)
  },

  // -------------------------------------------------------
  // TUTORIAL
  // -------------------------------------------------------
  setTutorialStep: (step) => set({ tutorialStep: step }),
  completeTutorial: async () => {
    const { player } = get()
    await supabase.from('players').update({ tutorial_done: true }).eq('id', player.id)
    set(s => ({ player: { ...s.player, tutorial_done: true } }))
  }
}))
