// src/pages/ScanPage.jsx — v1.0
import { useMemo } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Navigation, Gem, Store, AlertTriangle, Globe } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dist3d(ax, ay, az, bx, by, bz) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}

function coords(x, y, z) {
  return `${x} / ${y} / ${z}`
}

const ASTEROID_TYPE_LABELS = {
  metall:      { label: 'Metallasteroid',  color: '#94a3b8', resources: ['titan', 'aluminium'] },
  silikat:     { label: 'Silikatasteroid', color: '#a78bfa', resources: ['silizium', 'bauxit'] },
  eis:         { label: 'Eisasteroid',     color: '#67e8f9', resources: ['wasser', 'nahrung'] },
  gas:         { label: 'Gasblase',        color: '#34d399', resources: ['helium', 'wasserstoff'] },
  erz:         { label: 'Erzasteroid',     color: '#f472b6', resources: ['uran', 'plutonium'] },
  reichhaltig: { label: 'Reichhaltiger Asteroid', color: '#fbbf24', resources: ['titan', 'silizium', 'uran'] },
}

const NPC_TYPE_LABELS = {
  pirat_leicht:     { label: 'Piraten-Patrouille', color: '#f87171', threat: 'Leicht'  },
  pirat_mittel:     { label: 'Piratengruppe',       color: '#fb923c', threat: 'Mittel'  },
  piraten_verbund:  { label: 'Piraten-Verbund',     color: '#ef4444', threat: 'Schwer'  },
  haendler_konvoi:  { label: 'Händler-Konvoi',      color: '#34d399', threat: 'Passiv'  },
  npc_streitmacht:  { label: 'NPC-Streitmacht',     color: '#8b5cf6', threat: 'Extrem'  },
}

// ─── Scan-Reichweite berechnen ────────────────────────────────────────────────

function useScanRange(buildings) {
  return useMemo(() => {
    const komm = buildings.find(b => b.building_id === 'communications_network')?.level ?? 0
    return 10 + Math.floor(komm / 2)
  }, [buildings])
}

// ─── Eintrags-Komponenten ─────────────────────────────────────────────────────

function ScanEntry({ icon: Icon, iconColor, title, subtitle, distance, right, wip }) {
  return (
    <motion.div layout
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        background: 'rgba(4,13,26,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: wip ? 0.6 : 1,
      }}>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${iconColor}12`, border: `1px solid ${iconColor}25` }}>
        <Icon size={14} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-semibold text-slate-200 truncate">
          {title}
          {wip && <span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            WIP
          </span>}
        </p>
        <p className="text-xs font-mono text-slate-500 truncate">{subtitle}</p>
      </div>
      <div className="flex-shrink-0 text-right space-y-0.5">
        {right}
        <p className="text-xs font-mono" style={{ color: '#334155' }}>
          {distance.toFixed(1)} pc
        </p>
      </div>
    </motion.div>
  )
}

// ─── ScanPage ─────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const { planet, buildings, player } = useGameStore()

  const scanRange = useScanRange(buildings)

  const px = planet?.x ?? 0
  const py = planet?.y ?? 0
  const pz = planet?.z ?? 0

  // Andere Spielerplaneten
  const { data: otherPlanets = [] } = useQuery({
    queryKey: ['scan-planets', planet?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('planets')
        .select('id, name, owner_id, x, y, z, players(username, race_id)')
        .neq('id', planet.id)
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 30000,
  })

  // Handelsstationen
  const { data: stations = [] } = useQuery({
    queryKey: ['trade-stations'],
    queryFn: async () => {
      const { data } = await supabase.from('trade_stations').select('*')
      return data ?? []
    },
    staleTime: Infinity,
  })

  // Asteroiden
  const { data: asteroids = [] } = useQuery({
    queryKey: ['asteroids-scan'],
    queryFn: async () => {
      const { data } = await supabase
        .from('asteroids')
        .select('*')
        .eq('is_depleted', false)
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 60000,
  })

  // NPC-Flotten
  const { data: npcFleets = [] } = useQuery({
    queryKey: ['npc-fleets-scan'],
    queryFn: async () => {
      const { data } = await supabase.from('npc_fleets').select('*, npc_ships(id)')
      return data ?? []
    },
    refetchInterval: 30000,
  })

  // Eigene Flotten anderer Spieler (WIP — nur wenn in Reichweite)
  const { data: playerFleets = [] } = useQuery({
    queryKey: ['player-fleets-scan', player?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fleets')
        .select('id, name, x, y, z, player_id, players(username)')
        .neq('player_id', player.id)
      return data ?? []
    },
    enabled: !!player,
    refetchInterval: 30000,
  })

  // Alles filtern was in Reichweite ist
  const inRange = (x, y, z) => dist3d(px, py, pz, x, y, z) <= scanRange

  const nearPlanets  = otherPlanets.filter(p => inRange(p.x, p.y, p.z))
  const nearStations = stations.filter(s => inRange(s.x, s.y, s.z))
  const nearAsteroids = asteroids.filter(a => inRange(a.x, a.y, a.z))
  const nearNPC      = npcFleets.filter(f => inRange(f.x, f.y, f.z))
  const nearFleets   = playerFleets.filter(f => inRange(f.x, f.y, f.z))

  const totalVisible = nearPlanets.length + nearStations.length + nearAsteroids.length + nearNPC.length + nearFleets.length

  // Alle Einträge zusammen, nach Distanz sortiert
  const allEntries = [
    ...nearPlanets.map(p => ({
      type: 'planet', key: p.id,
      dist: dist3d(px, py, pz, p.x, p.y, p.z),
      data: p,
    })),
    ...nearStations.map(s => ({
      type: 'station', key: s.id,
      dist: dist3d(px, py, pz, s.x, s.y, s.z),
      data: s,
    })),
    ...nearAsteroids.map(a => ({
      type: 'asteroid', key: a.id,
      dist: dist3d(px, py, pz, a.x, a.y, a.z),
      data: a,
    })),
    ...nearNPC.map(f => ({
      type: 'npc', key: f.id,
      dist: dist3d(px, py, pz, f.x, f.y, f.z),
      data: f,
    })),
    ...nearFleets.map(f => ({
      type: 'fleet', key: f.id,
      dist: dist3d(px, py, pz, f.x, f.y, f.z),
      data: f,
    })),
  ].sort((a, b) => a.dist - b.dist)

  if (!planet) return (
    <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">
      Kein Planet...
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Scanbereich</h2>
          <p className="text-base text-slate-400 font-mono mt-1">
            {planet.name ?? 'Heimatplanet'} · {coords(px, py, pz)} · Reichweite{' '}
            <span style={{ color: '#22d3ee' }}>{scanRange} pc</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-bold text-cyan-400">{totalVisible}</p>
          <p className="text-xs font-mono text-slate-500">Objekte in Reichweite</p>
        </div>
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: `Planeten (${nearPlanets.length})`,    color: '#38bdf8' },
          { label: `Stationen (${nearStations.length})`,  color: '#34d399' },
          { label: `Asteroiden (${nearAsteroids.length})`,color: '#fbbf24' },
          { label: `NPC-Flotten (${nearNPC.length})`,     color: '#f87171' },
          { label: `Spielerflotten (${nearFleets.length})`,color:'#a78bfa' },
        ].map(l => (
          <span key={l.label} className="text-xs font-mono px-2 py-1 rounded"
            style={{ background: `${l.color}10`, border: `1px solid ${l.color}20`, color: l.color }}>
            {l.label}
          </span>
        ))}
      </div>

      {/* Scan-Radius Visualisierung (simpel) */}
      <div className="panel px-4 py-3 flex items-center gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(34,211,238,0.08)', border: '2px solid rgba(34,211,238,0.2)' }}>
            <Globe size={16} style={{ color: '#22d3ee' }} />
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs font-mono text-slate-500">
            Kommunikationsnetzwerk Lvl {buildings.find(b => b.building_id === 'communications_network')?.level ?? 0} · Basisreichweite 10 pc + {Math.floor((buildings.find(b => b.building_id === 'communications_network')?.level ?? 0) / 2)} pc Bonus
          </p>
          <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-1 rounded-full" style={{ width: `${Math.min((scanRange / 35) * 100, 100)}%`, background: '#22d3ee' }} />
          </div>
        </div>
        <span className="font-mono font-bold text-sm flex-shrink-0" style={{ color: '#22d3ee' }}>{scanRange} pc</span>
      </div>

      {/* Ergebnisliste */}
      {allEntries.length === 0 ? (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">📡</p>
          <p className="font-display text-slate-400 text-lg">Nichts in Reichweite</p>
          <p className="text-slate-600 font-mono text-sm">
            Baue das Kommunikationsnetzwerk aus um die Scanreichweite zu erhöhen.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allEntries.map(entry => {
            if (entry.type === 'planet') {
              const p = entry.data
              return (
                <ScanEntry key={entry.key}
                  icon={Globe} iconColor="#38bdf8"
                  title={p.name ?? 'Unbenannter Planet'}
                  subtitle={`${p.players?.username ?? '—'} · ${p.players?.race_id ?? '—'} · ${coords(p.x, p.y, p.z)}`}
                  distance={entry.dist}
                  right={<span className="text-xs font-mono" style={{ color: '#38bdf8' }}>Spielerplanet</span>}
                />
              )
            }

            if (entry.type === 'station') {
              const s = entry.data
              return (
                <ScanEntry key={entry.key}
                  icon={Store} iconColor="#34d399"
                  title={s.name}
                  subtitle={`Quadrant ${s.quadrant} · ${coords(s.x, s.y, s.z)}`}
                  distance={entry.dist}
                  wip
                  right={<span className="text-xs font-mono" style={{ color: '#34d399' }}>Handelsstation</span>}
                />
              )
            }

            if (entry.type === 'asteroid') {
              const a = entry.data
              const meta = ASTEROID_TYPE_LABELS[a.asteroid_type] ?? { label: a.asteroid_type, color: '#94a3b8', resources: [] }
              const totalRes = meta.resources.reduce((s, r) => s + (a[r] ?? 0), 0)
              return (
                <ScanEntry key={entry.key}
                  icon={Gem} iconColor={meta.color}
                  title={meta.label}
                  subtitle={`${coords(a.x, a.y, a.z)} · ${meta.resources.filter(r => a[r] > 0).map(r => `${r}: ${fmt(a[r])}`).join(' · ') || 'Ressourcen unbekannt'}`}
                  distance={entry.dist}
                  wip
                  right={
                    <span className="text-xs font-mono" style={{ color: meta.color }}>
                      ~{fmt(totalRes)} Einheiten
                    </span>
                  }
                />
              )
            }

            if (entry.type === 'npc') {
              const f = entry.data
              const meta = NPC_TYPE_LABELS[f.npc_type] ?? { label: f.npc_type, color: '#f87171', threat: '?' }
              const shipCount = f.npc_ships?.length ?? 0
              return (
                <ScanEntry key={entry.key}
                  icon={AlertTriangle} iconColor={meta.color}
                  title={f.name}
                  subtitle={`${shipCount} Schiff${shipCount !== 1 ? 'e' : ''} · ${coords(f.x, f.y, f.z)} · Bedrohung: ${meta.threat}`}
                  distance={entry.dist}
                  right={
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                      {meta.threat}
                    </span>
                  }
                />
              )
            }

            if (entry.type === 'fleet') {
              const f = entry.data
              return (
                <ScanEntry key={entry.key}
                  icon={Navigation} iconColor="#a78bfa"
                  title={f.name ?? 'Unbenannte Flotte'}
                  subtitle={`${f.players?.username ?? '—'} · ${coords(f.x, f.y, f.z)}`}
                  distance={entry.dist}
                  right={<span className="text-xs font-mono" style={{ color: '#a78bfa' }}>Spielerflotte</span>}
                />
              )
            }

            return null
          })}
        </div>
      )}
    </div>
  )
}
