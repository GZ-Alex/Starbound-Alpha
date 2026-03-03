// src/lib/utils.js

export function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return `${d}d ${h}h`
}

export function formatNumber(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`
  return n.toLocaleString()
}

export function timeUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  if (diff <= 0) return 'Fertig'
  return formatTime(Math.floor(diff / 1000))
}

export function clsx(...args) {
  return args.filter(Boolean).join(' ')
}

export const RESOURCE_NAMES = {
  titan: 'Titan', silizium: 'Silizium', helium: 'Helium',
  nahrung: 'Nahrung', wasser: 'Wasser', bauxit: 'Bauxit',
  aluminium: 'Aluminium', uran: 'Uran', plutonium: 'Plutonium',
  wasserstoff: 'Wasserstoff', energie: 'Energie', credits: 'Credits'
}

export const RESOURCE_COLORS = {
  titan: '#94a3b8', silizium: '#a78bfa', helium: '#34d399',
  nahrung: '#86efac', wasser: '#67e8f9', bauxit: '#fb923c',
  aluminium: '#c0c0c0', uran: '#4ade80', plutonium: '#f472b6',
  wasserstoff: '#38bdf8', energie: '#fbbf24', credits: '#fde68a'
}
