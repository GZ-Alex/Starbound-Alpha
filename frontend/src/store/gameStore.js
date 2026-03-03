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

  register: async (username) => {
    const data = await callFunction('auth/register', { username })
    localStorage.setItem('sb_token', data.token)
    localStorage.setItem('sb_player', JSON.stringify(data.player))
    set({ player: data.player, token: data.token, planet: data.planet })
    get().loadGameData()
    return data
  },

  login: async (username) => {
    const data = await callFunction('auth/login', { username })
    localStorage.setItem('sb_token', data.token)
    localStorage.setItem('sb_player', JSON.stringify(data.player))
    set({ player: data.player, token: data.token, planet: data.planet })
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

    // Load techs
    const { data: techs } = await supabase
      .from('player_technologies')
      .select('tech_id')
      .eq('player_id', player.id)
    set({ technologies: techs?.map(t => t.tech_id) ?? [] })

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
        if (payload.new) set({ planet: payload.new })
      })
      .subscribe()
  },

  loadPlanetData: async (planetId) => {
    const { data: buildings } = await supabase
      .from('planet_buildings')
      .select('*')
      .eq('planet_id', planetId)
    set({ buildings: buildings ?? [] })

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

  // -------------------------------------------------------
  // BUILDINGS
  // -------------------------------------------------------
  queueBuild: async (buildingId) => {
    const { planet } = get()
    const result = await callFunction('build-action', {
      planet_id: planet.id,
      building_id: buildingId
    })
    await get().loadPlanetData(planet.id)
    await get().refreshPlanet()
    return result
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
    // Refresh research queue
    const { planet } = get()
    await get().loadPlanetData(planet.id)
    return result
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
