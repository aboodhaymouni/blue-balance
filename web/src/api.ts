/// <reference types="vite/client" />
// Typed fetch helpers. Every request goes to this same origin under /api (Vite proxies it to FastAPI on :8000).
// A module-level egress log counts every request the page makes, by host, so the UI can prove
// "0 requests to third parties".

import type {
  Analysis,
  Channel,
  Complaint,
  Health,
  NetworkResponse,
  PrivacyReport,
  PublicResponse,
  ReplayResult,
  SegmentActionResult,
  TranscribeResult,
} from './types'

export const DOWN_MESSAGE = 'الخادم مش شغّال: شغّل api'
export const PUBLIC_CSV_URL = '/api/public.csv'

export class ApiError extends Error {
  /** HTTP status; 0 when the request never got an answer. */
  readonly status: number
  /** true when the backend is unreachable (not running, proxy could not connect, timed out). */
  readonly down: boolean

  constructor(message: string, status: number, down: boolean) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.down = down
  }
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'صار خطأ غير متوقع'
}

export function isDown(err: unknown): boolean {
  return err instanceof ApiError && err.down
}

// ---------------------------------------------------------------------------------------------
// Egress log: requests by host.
// Fed by a PerformanceObserver that sees every resource the page loads (scripts, styles, fonts,
// images, fetches). If the browser has no PerformanceObserver, the fetch wrapper counts /api calls.
// ---------------------------------------------------------------------------------------------

export interface EgressRow {
  host: string
  count: number
  firstParty: boolean
}

export interface EgressSnapshot {
  rows: EgressRow[]
  total: number
  thirdParty: number
  /** 'observer' = every resource the page loaded; 'api' = only this module's own requests. */
  source: 'observer' | 'api'
}

const ownHost = typeof location !== 'undefined' ? location.host : ''
const egressCounts = new Map<string, number>()
const egressListeners = new Set<() => void>()
let egressSource: EgressSnapshot['source'] = 'api'
let egressSnapshot: EgressSnapshot = { rows: [], total: 0, thirdParty: 0, source: egressSource }
let notifyScheduled = false

function rebuildSnapshot() {
  const rows: EgressRow[] = [...egressCounts.entries()]
    .map(([host, count]) => ({ host, count, firstParty: host === ownHost }))
    .sort((a, b) => Number(b.firstParty) - Number(a.firstParty) || b.count - a.count)
  const total = rows.reduce((s, r) => s + r.count, 0)
  const thirdParty = rows.filter((r) => !r.firstParty).reduce((s, r) => s + r.count, 0)
  egressSnapshot = { rows, total, thirdParty, source: egressSource }
}

function notifyEgress() {
  // Batch bursts (page load fires dozens of entries) into one UI update.
  if (notifyScheduled) return
  notifyScheduled = true
  queueMicrotask(() => {
    notifyScheduled = false
    rebuildSnapshot()
    egressListeners.forEach((fn) => fn())
  })
}

function recordEgress(url: string) {
  let host: string
  try {
    const u = new URL(url, location.href)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return // data:, blob: never leave the machine
    host = u.host
  } catch {
    return
  }
  egressCounts.set(host, (egressCounts.get(host) ?? 0) + 1)
  notifyEgress()
}

function startObserver(): boolean {
  if (typeof PerformanceObserver === 'undefined') return false
  try {
    const supported = PerformanceObserver.supportedEntryTypes
    if (supported && !supported.includes('resource')) return false
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) recordEgress(entry.name)
    })
    obs.observe({ type: 'resource', buffered: true })
    // The HTML document itself.
    recordEgress(location.href)
    return true
  } catch {
    return false
  }
}

const observing = startObserver()
egressSource = observing ? 'observer' : 'api'
rebuildSnapshot()

export function subscribeEgress(fn: () => void): () => void {
  egressListeners.add(fn)
  return () => {
    egressListeners.delete(fn)
  }
}

export function getEgressSnapshot(): EgressSnapshot {
  return egressSnapshot
}

// ---------------------------------------------------------------------------------------------
// Request core
// ---------------------------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  json?: unknown
  body?: FormData
  /** Abort after this many ms (only for quick reads; extraction and replay can take long). */
  timeoutMs?: number
}

function detailOf(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
      const detail = (parsed as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      if (Array.isArray(detail)) {
        return detail
          .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
          .join('، ')
      }
      return JSON.stringify(detail)
    }
  } catch {
    // not JSON
  }
  return raw.slice(0, 200)
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!observing) recordEgress(path)

  const headers = new Headers({ Accept: 'application/json' })
  let body: BodyInit | undefined
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(opts.json)
  } else if (opts.body) {
    body = opts.body // the browser sets the multipart boundary itself
  }

  const ctrl = new AbortController()
  const timer = opts.timeoutMs ? window.setTimeout(() => ctrl.abort(), opts.timeoutMs) : undefined

  try {
    let res: Response
    try {
      res = await fetch(path, { method: opts.method ?? 'GET', headers, body, signal: ctrl.signal, cache: 'no-store' })
    } catch {
      if (ctrl.signal.aborted) throw new ApiError('الخادم ما ردّ بالوقت: تأكّد إنه api شغّال', 0, true)
      throw new ApiError(DOWN_MESSAGE, 0, true)
    }

    const raw = await res.text()

    if (!res.ok) {
      // Vite's proxy answers an empty 500 when nothing listens on :8000; 502/503/504 come from other proxies.
      if (res.status === 502 || res.status === 503 || res.status === 504 || (res.status === 500 && raw.trim() === '')) {
        throw new ApiError(DOWN_MESSAGE, res.status, true)
      }
      throw new ApiError(`خطأ من الخادم (${res.status}): ${detailOf(raw)}`, res.status, false)
    }

    try {
      return JSON.parse(raw) as T
    } catch {
      throw new ApiError('رد الخادم مش JSON: تأكّد إن /api واصل على FastAPI', res.status, false)
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (ctrl.signal.aborted) throw new ApiError('الخادم ما ردّ بالوقت: تأكّد إنه api شغّال', 0, true)
    throw new ApiError(DOWN_MESSAGE, 0, true)
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------------------------
// Static demo (GitHub Pages): built with VITE_STATIC=1, it replays responses recorded from the
// local stack (eval/snapshot.py). The open models only run on the laptop.
// ---------------------------------------------------------------------------------------------

export const STATIC_DEMO = import.meta.env.VITE_STATIC === '1'
const OUT_OF_TURN_PLACES = ['جبل التاج', 'التاج', 'الأشرفية', 'المحطة', 'جبل القلعة', 'القلعة']

async function snapshot<T>(name: string): Promise<T> {
  recordEgress(`${import.meta.env.BASE_URL}snapshot/${name}.json`)
  const res = await fetch(`${import.meta.env.BASE_URL}snapshot/${name}.json`, { cache: 'no-store' })
  if (!res.ok) throw new ApiError(`ما لقينا النتيجة المسجّلة (${name})`, res.status, false)
  return (await res.json()) as T
}

const staticApi = {
  health: () => snapshot<Health>('health'),
  network: () => snapshot<NetworkResponse>('network'),
  transcribe: async (_audio: Blob, _filename: string): Promise<TranscribeResult> => {
    throw new ApiError('التسجيل بالصوت بيشتغل بالنسخة المحلية بس (Whisper على اللابتوب). اكتب الشكوى أو جرّب الأمثلة.', 0, false)
  },
  createComplaint: (text: string, _channel: Channel) =>
    snapshot<Complaint>(OUT_OF_TURN_PLACES.some((p) => text.includes(p)) ? 'complaint_explained' : 'complaint_anomaly'),
  complaints: () => snapshot<Complaint[]>('complaints'),
  deleteComplaint: async (_receipt: string) => ({ deleted: true }),
  incidents: () => snapshot<Analysis>('incidents'),
  approve: (_segment_id: string) => snapshot<SegmentActionResult>('approve'),
  close: (_segment_id: string) => snapshot<SegmentActionResult>('close'),
  replay: () => snapshot<ReplayResult>('replay'),
  reset: async () => ({ ok: true }),
  publicStats: () => snapshot<PublicResponse>('public'),
  privacy: () => snapshot<PrivacyReport>('privacy'),
}

// ---------------------------------------------------------------------------------------------
// Endpoints (CONTRACTS.md, "HTTP API")
// ---------------------------------------------------------------------------------------------

const liveApi = {
  health: () => request<Health>('/api/health', { timeoutMs: 8000 }),

  network: () => request<NetworkResponse>('/api/network', { timeoutMs: 8000 }),

  transcribe: (audio: Blob, filename: string) => {
    const form = new FormData()
    form.append('audio', audio, filename)
    return request<TranscribeResult>('/api/transcribe', { method: 'POST', body: form })
  },

  createComplaint: (text: string, channel: Channel) =>
    request<Complaint>('/api/complaints', { method: 'POST', json: { text, channel } }),

  complaints: () => request<Complaint[]>('/api/complaints', { timeoutMs: 10000 }),

  deleteComplaint: (receipt: string) =>
    request<{ deleted: boolean }>(`/api/complaints/${encodeURIComponent(receipt)}`, { method: 'DELETE' }),

  incidents: () => request<Analysis>('/api/incidents', { timeoutMs: 10000 }),

  approve: (segment_id: string) =>
    request<SegmentActionResult>('/api/incidents/approve', { method: 'POST', json: { segment_id } }),

  close: (segment_id: string) =>
    request<SegmentActionResult>('/api/incidents/close', { method: 'POST', json: { segment_id } }),

  replay: () => request<ReplayResult>('/api/replay', { method: 'POST' }),

  reset: () => request<{ ok: boolean }>('/api/reset', { method: 'POST' }),

  publicStats: () => request<PublicResponse>('/api/public', { timeoutMs: 10000 }),

  privacy: () => request<PrivacyReport>('/api/privacy', { timeoutMs: 10000 }),
}

export const api: typeof liveApi = STATIC_DEMO ? staticApi : liveApi
