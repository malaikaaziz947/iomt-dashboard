import { useState, useMemo, useEffect, useRef } from 'react'
import { useIomt } from './hooks/useIomt'
import { useAlerts } from './hooks/useAlerts'
import { nodeState } from './lib/vitals'
import { useAlarmSound } from './hooks/useAlarmSound'
import Dashboard from './components/Dashboard'
import NodeDetail from './components/NodeDetail'
import AlertLog from './components/AlertLog'
import SearchBar from './components/SearchBar'
import AlarmBell from './components/AlarmBell'

// Mutes auto-expire so audio resumes (IEC 60601-1-8 audio-pause principle).
const MUTE_MS = 2 * 60 * 1000

export default function App() {
  const iomt = useIomt()
  const { patients, readings, manual, nodeOrder, ready, saveOrder } = iomt
  const { alerts, acknowledgeAlert } = useAlerts()
  const [query, setQuery] = useState('')
  const [openDevice, setOpenDevice] = useState(null)
  const [view, setView] = useState('dashboard')   // 'dashboard' | 'log'
  const [now, setNow] = useState(Date.now())

  // Two mute layers — AUDIO ONLY. Blinking values are never suppressed.
  const [globalMuted, setGlobalMuted] = useState(false)
  const [mutedDevices, setMutedDevices] = useState(() => new Set())
  const globalTimerRef = useRef(null)
  const deviceTimersRef = useRef(new Map())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const patientByDevice = useMemo(() => {
    const m = {}; patients.forEach(p => { if (p.device_id) m[p.device_id] = p }); return m
  }, [patients])
  const latestVitals = useMemo(() => {
    const m = {}; readings.forEach(r => { m[r.device_id] = r }); return m
  }, [readings])
  const latestManual = useMemo(() => {
    const m = {}; manual.forEach(e => { (m[e.device_id] ||= {})[e.kind] = e.value }); return m
  }, [manual])

  const deviceIds = useMemo(() => {
    const s = new Set()
    patients.forEach(p => p.device_id && s.add(p.device_id))
    readings.forEach(r => s.add(r.device_id))
    return [...s]
  }, [patients, readings])

  const nodes = useMemo(() => deviceIds.map(id => ({
    device_id: id,
    patient: patientByDevice[id] || null,
    latest: latestVitals[id] || null,
    manual: latestManual[id] || {},
  })), [deviceIds, patientByDevice, latestVitals, latestManual])

  const ordered = useMemo(() => {
    const idx = new Map(nodeOrder.map((id, i) => [id, i]))
    return [...nodes].sort((a, b) => {
      const ia = idx.has(a.device_id) ? idx.get(a.device_id) : 1e9
      const ib = idx.has(b.device_id) ? idx.get(b.device_id) : 1e9
      return ia - ib || a.device_id.localeCompare(b.device_id)
    })
  }, [nodes, nodeOrder])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter(n =>
      n.device_id.toLowerCase().includes(q) ||
      (n.patient?.full_name || '').toLowerCase().includes(q) ||
      (n.patient?.mrn || '').toLowerCase().includes(q))
  }, [ordered, query])

  const canDrag = query.trim() === ''
  const openNode = openDevice ? nodes.find(n => n.device_id === openDevice) : null

  // Device ids currently in 'alarm' state (drives the bell count + audio).
  const alarmingIds = useMemo(
    () => nodes.filter(n => nodeState(n.patient, n.latest, now).state === 'alarm')
                .map(n => n.device_id),
    [nodes, now]
  )

  // Live vs inactive counts for the header subtitle (recomputed as nodes go stale).
  const liveCount = useMemo(
    () => nodes.filter(n => nodeState(n.patient, n.latest, now).state !== 'inactive').length,
    [nodes, now]
  )
  const inactiveCount = nodes.length - liveCount

  // Audio is active only when NOT globally muted AND at least one alarming
  // node is not individually muted.
  const audioActive = !globalMuted && alarmingIds.some(id => !mutedDevices.has(id))
  const { resumeAudio } = useAlarmSound({ alarmActive: audioActive, muted: false })

  // Browsers require a user gesture before audio can start; resume on the
  // first interaction so the alarm can sound.
  useEffect(() => {
    const handler = () => resumeAudio?.()
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [resumeAudio])

  // Clear all pending mute timers on unmount.
  useEffect(() => () => {
    if (globalTimerRef.current) clearTimeout(globalTimerRef.current)
    deviceTimersRef.current.forEach(clearTimeout)
  }, [])

  function toggleGlobalMute() {
    resumeAudio?.()
    setGlobalMuted(prev => {
      const next = !prev
      if (globalTimerRef.current) { clearTimeout(globalTimerRef.current); globalTimerRef.current = null }
      if (next) globalTimerRef.current = setTimeout(() => setGlobalMuted(false), MUTE_MS)
      return next
    })
  }

  function toggleDeviceMute(id) {
    resumeAudio?.()
    setMutedDevices(prev => {
      const next = new Set(prev)
      const timers = deviceTimersRef.current
      if (next.has(id)) {
        next.delete(id)
        if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id) }
      } else {
        next.add(id)
        timers.set(id, setTimeout(() => {
          setMutedDevices(p => { const n = new Set(p); n.delete(id); return n })
          timers.delete(id)
        }, MUTE_MS))
      }
      return next
    })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>HITEC IoMT Telemedicine Dashboard</h1>
          <p className="sub">{liveCount} live · {inactiveCount} inactive</p>
        </div>
        <div className="topbar-right">
          <AlarmBell alarmCount={alarmingIds.length} muted={globalMuted} onToggleMute={toggleGlobalMute} />
          <button type="button"
                  className={['btn', view === 'log' && 'btn-primary'].filter(Boolean).join(' ')}
                  onClick={() => setView(v => (v === 'log' ? 'dashboard' : 'log'))}>
            {view === 'log' ? 'Dashboard' : 'Event Log'}
          </button>
          {view === 'dashboard' && <SearchBar value={query} onChange={setQuery} />}
        </div>
      </header>

      {!ready && <div className="warn">Supabase not configured — set <code>web/.env.local</code> and restart.</div>}

      {view === 'log' ? (
        <AlertLog alerts={alerts} patientByDevice={patientByDevice}
                  onAcknowledge={acknowledgeAlert} />
      ) : openNode ? (
        <NodeDetail node={openNode} readings={readings} manual={manual}
                    now={now} onBack={() => setOpenDevice(null)} iomt={iomt} />
      ) : (
        <Dashboard nodes={filtered} totalNodes={nodes.length} now={now}
                   canDrag={canDrag} onReorder={saveOrder}
                   onOpen={setOpenDevice} iomt={iomt}
                   mutedDevices={mutedDevices} onToggleMute={toggleDeviceMute} />
      )}

      <footer className="foot">IoMT teaching prototype — not a medical device.</footer>
    </div>
  )
}
