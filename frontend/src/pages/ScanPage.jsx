// src/pages/ScanPage.jsx — v1.1

import { useGameStore } from '@/store/gameStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Navigation, Gem, Store, AlertTriangle, Globe } from 'lucide-react'

function fmt(n) {
  if (!n) return '0'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.floor(n).toLocaleString('de-DE')
}
function coords(x, y, z) { return `${x} / ${y} / ${z}` }

const ASTEROID_TYPE_META = {
  metal:    { label: 'Metallasteroid',        color: '#94a3b8' },
  silicate: { label: 'Silikatasteroid',        color: '#a78bfa' },
  ice:      { label: 'Eisasteroid',            color: '#67e8f9' },
  gas:      { label: 'Gasblase',               color: '#34d399' },
  ore:      { label: 'Erzasteroid',            color: '#f472b6' },
  rich:     { label: 'Reichhaltiger Asteroid', color: '#fbbf24' },
}
const NPC_TYPE_META = {
  pirat_leicht:    { label: 'Piraten-Patrouille', color: '#f87171', threat: 'Leicht' },
  pirat_mittel:    { label: 'Piratengruppe',       color: '#fb923c', threat: 'Mittel' },
  piraten_verbund: { label: 'Piraten-Verbund',     color: '#ef4444', threat: 'Schwer' },
  haendler_konvoi: { label: 'Händler-Konvoi',      color: '#34d399', threat: 'Passiv' },
}

function ScanEntry({ icon: Icon, iconColor, title, subtitle, distance, badge, wip }) {
  return (
    <motion.div layout
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{ background: 'rgba(4,13,26,0.7)', border: '1px solid rgba(255,255,255,0.06)', opacity: wip ? 0.65 : 1 }}>
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${iconColor}12`, border: `1px solid ${iconColor}25` }}>
        <Icon size={14} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-semibold text-slate-200 truncate">
          {title}
          {wip && <span className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>WIP</span>}
        </p>
        <p className="text-xs font-mono text-slate-500 truncate">{subtitle}</p>
      </div>
      <div className="flex-shrink-0 text-right space-y-0.5 min-w-[80px]">
        {badge}
        <p className="text-xs font-mono" style={{ color: '#334155' }}>{distance.toFixed(1)} pc</p>
      </div>
    </motion.div>
  )
}

export default function ScanPage() {
  const { planet, buildings, player, scanRanges } = useGameStore()
  const ranges = scanRanges
  const komm = (buildings ?? []).find(b => b.building_id === 'communications_network')?.level ?? 0
  const px = planet?.x ?? 0, py = planet?.y ?? 0, pz = planet?.z ?? 0

  const { data: objects = [], isLoading, error: scanError } = useQuery({
    queryKey: ['scan-objects', planet?.id, ranges.npc, ranges.asteroid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_scan_objects', {
        cx: px, cy: py, cz: pz,
        asteroid_range: ranges.asteroid,
        fleet_range: ranges.npc,
        player_id: player?.id ?? null,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!planet,
    refetchInterval: 30000,
  })

  const planets   = objects.filter(o => o.obj_type === 'planet')
  const stations  = objects.filter(o => o.obj_type === 'station')
  const asteroids = objects.filter(o => o.obj_type === 'asteroid')
  const npcs      = objects.filter(o => o.obj_type === 'npc')
  const fleets    = objects.filter(o => o.obj_type === 'fleet' && o.distance <= ranges.fleet)

  const allEntries = [...planets, ...stations, ...asteroids, ...npcs, ...fleets]
    .sort((a, b) => a.distance - b.distance)

  if (!planet) return <div className="flex items-center justify-center h-64 text-slate-500 font-mono text-sm">Kein Planet...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-cyan-400 tracking-wide">Scanbereich</h2>
          <p className="text-base text-slate-400 font-mono mt-1">{planet.name ?? 'Heimatplanet'} · {coords(px, py, pz)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-display font-bold text-cyan-400">{allEntries.length}</p>
          <p className="text-xs font-mono text-slate-500">Objekte in Reichweite</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Spielerflotten', range: ranges.fleet,    color: '#a78bfa', Icon: Navigation },
          { label: 'NPC / Kopfgeld', range: ranges.npc,      color: '#f87171', Icon: AlertTriangle, wip: true },
          { label: 'Asteroiden',     range: ranges.asteroid, color: '#fbbf24', Icon: Gem },
        ].map(({ label, range, color, Icon, wip }) => (
          <div key={label} className="panel px-4 py-3 flex items-center gap-3">
            <Icon size={14} style={{ color }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-slate-500 truncate">
                {label}{wip && <span className="ml-1 text-yellow-500/60">(WIP)</span>}
              </p>
              <div className="w-full h-1 rounded-full mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-1 rounded-full" style={{ width: `${Math.min((range / 100) * 100, 100)}%`, background: color }} />
              </div>
            </div>
            <span className="font-mono font-bold text-sm flex-shrink-0" style={{ color }}>{range} pc</span>
          </div>
        ))}
      </div>

      <div className="text-xs font-mono text-slate-600 px-1">
        Kommunikationsnetzwerk Lvl {komm} · +{Math.floor(komm / 2)} pc Bonus
        {komm === 0 && ' · Baue das Kommunikationsnetzwerk um die Reichweite zu erhöhen'}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: `Planeten (${planets.length})`,     color: '#38bdf8' },
          { label: `Stationen (${stations.length})`,   color: '#34d399' },
          { label: `Asteroiden (${asteroids.length})`, color: '#fbbf24' },
          { label: `NPC (${npcs.length})`,             color: '#f87171' },
          { label: `Flotten (${fleets.length})`,       color: '#a78bfa' },
        ].map(l => (
          <span key={l.label} className="text-xs font-mono px-2 py-1 rounded"
            style={{ background: `${l.color}10`, border: `1px solid ${l.color}20`, color: l.color }}>
            {l.label}
          </span>
        ))}
      </div>

      {isLoading && <div className="text-center py-8 text-slate-600 font-mono text-sm">Scanne...</div>}

      {scanError && (
        <div className="panel p-4 border border-red-500/20 bg-red-500/5">
          <p className="text-xs font-mono text-red-400 mb-1">RPC Fehler:</p>
          <p className="text-xs font-mono text-red-300">{scanError.message}</p>
        </div>
      )}

      {!isLoading && allEntries.length === 0 && (
        <div className="panel p-12 text-center space-y-3">
          <p className="text-2xl">📡</p>
          <p className="font-display text-slate-400 text-lg">Nichts in Reichweite</p>
          <p className="text-slate-600 font-mono text-sm">Baue das Kommunikationsnetzwerk aus um die Reichweite zu erhöhen.</p>
        </div>
      )}

      {!isLoading && allEntries.length > 0 && (
        <div className="space-y-2">
          {allEntries.map(entry => {
            const d = entry.data ?? {}
            if (entry.obj_type === 'planet') return (
              <ScanEntry key={entry.obj_id} icon={Globe} iconColor="#38bdf8"
                title={d.name ?? 'Unbenannter Planet'}
                subtitle={`${d.username ?? '—'} · ${d.race_id ?? '—'} · ${coords(entry.obj_x, entry.obj_y, entry.obj_z)}`}
                distance={entry.distance}
                badge={<span className="text-xs font-mono" style={{ color: '#38bdf8' }}>Spielerplanet</span>} />
            )
            if (entry.obj_type === 'station') return (
              <ScanEntry key={entry.obj_id} icon={Store} iconColor="#34d399"
                title={d.name ?? 'Handelsstation'}
                subtitle={`Quadrant ${d.quadrant} · ${coords(entry.obj_x, entry.obj_y, entry.obj_z)}`}
                distance={entry.distance} wip
                badge={<span className="text-xs font-mono" style={{ color: '#34d399' }}>Handelsstation</span>} />
            )
            if (entry.obj_type === 'asteroid') {
              const meta = ASTEROID_TYPE_META[d.type] ?? { label: d.type, color: '#94a3b8' }
              const res = d.resources ?? {}
              const total = Object.values(res).reduce((s, v) => s + v, 0)
              return (
                <ScanEntry key={entry.obj_id} icon={Gem} iconColor={meta.color}
                  title={meta.label}
                  subtitle={`${coords(entry.obj_x, entry.obj_y, entry.obj_z)} · ${Object.entries(res).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ')}`}
                  distance={entry.distance} wip
                  badge={<span className="text-xs font-mono" style={{ color: meta.color }}>~{fmt(total)}</span>} />
              )
            }
            if (entry.obj_type === 'npc') {
              const meta = NPC_TYPE_META[d.npc_type] ?? { label: d.npc_type, color: '#f87171', threat: '?' }
              return (
                <ScanEntry key={entry.obj_id} icon={AlertTriangle} iconColor={meta.color}
                  title={meta.label}
                  subtitle={`${d.ship_count ?? '?'} Schiffe · ${coords(entry.obj_x, entry.obj_y, entry.obj_z)}`}
                  distance={entry.distance}
                  badge={<span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30`, color: meta.color }}>{meta.threat}</span>} />
              )
            }
            if (entry.obj_type === 'fleet') return (
              <ScanEntry key={entry.obj_id} icon={Navigation} iconColor="#a78bfa"
                title={d.name ?? 'Unbenannte Flotte'}
                subtitle={`${d.username ?? '—'} · ${coords(entry.obj_x, entry.obj_y, entry.obj_z)}`}
                distance={entry.distance}
                badge={<span className="text-xs font-mono" style={{ color: '#a78bfa' }}>Spielerflotte</span>} />
            )
            return null
          })}
        </div>
      )}
    </div>
  )
}
