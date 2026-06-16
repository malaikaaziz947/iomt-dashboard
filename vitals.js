// Single source of truth for vital types — add one here and it flows
// through the readout, charts, and manual-entry form automatically.
export const VITAL_TYPES = [
  // These keys MUST match your Supabase column names
  { key: 'heart_rate', label: 'Heart rate', ... },
  { key: 'body_temp',  label: 'Body temp',  ... },
  // ...

]
export const MANUAL_KINDS = VITAL_TYPES.filter(v => v.source === 'manual')
export const DEFAULT_THRESHOLDS = { hr_min: 50, hr_max: 120, temp_min: 35, temp_max: 38 }

// A node is "inactive" if no reading has arrived for this long.
// Default 15 min ~= 5 missed sends at the 3-minute interval. Tune freely.
export const INACTIVE_AFTER_MS = 15 * 60 * 1000

export function fmt(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '\u2014'
  return Number(v).toFixed(d)
}

// Effective alarm thresholds for a node (patient overrides fall back to
// defaults). Exposed so the detail view can show the numeric limits.
export function getThresholds(patient) {
  const t = patient || {}
  return {
    hr_min: t.hr_min ?? DEFAULT_THRESHOLDS.hr_min,
    hr_max: t.hr_max ?? DEFAULT_THRESHOLDS.hr_max,
    temp_min: t.temp_min ?? DEFAULT_THRESHOLDS.temp_min,
    temp_max: t.temp_max ?? DEFAULT_THRESHOLDS.temp_max,
  }
}

// Returns which vitals are out of range as a map, e.g.
// { heart_rate: 'high', body_temp: 'low' }. A key is present only when that
// vital breaches its limit. `alarm` is true when the map is non-empty.
export function checkAlarm(patient, latest) {
  if (!latest) return { alarm: false, breaches: {} }
  const { hr_min: hrMin, hr_max: hrMax, temp_min: tMin, temp_max: tMax } = getThresholds(patient)
  const breaches = {}
  const hr = Number(latest.heart_rate)
  const tp = Number(latest.body_temp)
  if (!Number.isNaN(hr)) {
    if (hr < hrMin) breaches.heart_rate = 'low'
    else if (hr > hrMax) breaches.heart_rate = 'high'
  }
  if (!Number.isNaN(tp)) {
    if (tp < tMin) breaches.body_temp = 'low'
    else if (tp > tMax) breaches.body_temp = 'high'
  }
  return { alarm: Object.keys(breaches).length > 0, breaches }
}

// Overall card state. Inactive takes precedence over alarm (stale data
// shouldn't flash red as if it were a live emergency).
export function nodeState(patient, latest, now = Date.now()) {
  if (!latest) return { state: 'inactive', breaches: {}, lastSeenMs: null }
  const age = now - new Date(latest.recorded_at).getTime()
  if (age > INACTIVE_AFTER_MS) return { state: 'inactive', breaches: {}, lastSeenMs: age }
  const { alarm, breaches } = checkAlarm(patient, latest)
  return { state: alarm ? 'alarm' : 'ok', breaches, lastSeenMs: age }
}

export function lastSeenLabel(ms) {
  if (ms == null) return 'no data'
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}
