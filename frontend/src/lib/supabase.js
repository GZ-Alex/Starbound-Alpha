// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gxflrsskyuaizjhwsjix.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_WPKqLez4sg7Cab6bhN61VQ_KjKzyySh'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
})

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

// API helper that attaches session token
export async function callFunction(name, body) {
  const token = localStorage.getItem('sb_token')
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export async function getFunction(name, params = {}) {
  const token = localStorage.getItem('sb_token')
  const url = new URL(`${FUNCTIONS_URL}/${name}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, {
    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}
