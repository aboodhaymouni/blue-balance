// Mirrors CONTRACTS.md (the single source of truth). Keep field names exactly as the API sends them.

// ---------- network.json / schedules.json ----------

export type NodeType = 'reservoir' | 'main' | 'zone'

export interface NetNode {
  id: string
  type: NodeType
  name_ar: string
  parent: string | null
  diameter_mm?: number
  subscribers?: number
}

export interface Network {
  name_ar: string
  disclaimer_ar: string
  nodes: NetNode[]
}

export type Day = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

export interface TurnWindow {
  day: Day
  start: string
  end: string
}

export interface ZoneTurn {
  in_turn: boolean
  next_window_ar: string
}

/** GET /api/network */
export interface NetworkResponse {
  network: Network
  schedules: Record<string, TurnWindow[]>
  turns: Record<string, ZoneTurn>
  demo_now: string
}

// ---------- GET /api/health ----------

export interface Health {
  ok: boolean
  llm: { model: string; available: boolean; license?: string; runs?: string }
  /** device is null until Whisper has loaded. */
  asr: { model: string; device: string | null; loaded: boolean; license?: string; error?: string | null }
  demo_now: string
  network_name_ar: string | null
}

// ---------- extraction fields ----------

export type IssueValue = 'no_water' | 'weak_pressure' | 'cut_early' | 'leak_seen' | 'dirty_water' | 'billing' | 'other'
export type SinceValue = 'today' | 'yesterday' | 'two_three_days' | 'week_plus'

/** Every field is {value, quote}; both null when the citizen did not say it. */
export interface FieldOf<V> {
  value: V | null
  quote: string | null
}

export interface ComplaintFields {
  issue?: FieldOf<IssueValue>
  since?: FieldOf<SinceValue>
  turn_claim?: FieldOf<boolean>
  neighbours_too?: FieldOf<boolean>
  tanker_seen?: FieldOf<boolean>
  place_phrase?: FieldOf<string>
}

export type FieldName = keyof ComplaintFields

export interface DroppedField {
  field: string
  /** "quote_not_found" | "no_quote" | "invalid_value"; anything else is shown as-is. */
  reason: string
}

// ---------- Complaint ----------

export type Channel = 'text' | 'voice'
export type ComplaintStatus = 'anomaly' | 'explained' | 'other' | 'unclear_place'
export type SegmentStatus = 'approved' | 'closed' | null

export interface ZoneMatch {
  id: string | null
  name_ar: string | null
  match: 'gazetteer' | 'unclear'
}

export interface Complaint {
  receipt: string
  ts: string
  channel: Channel
  text_redacted: string
  fields: ComplaintFields
  dropped: DroppedField[]
  pii_masked: number
  zone: ZoneMatch | null
  status: ComplaintStatus
  reply_ar: string
  /** "qwen2.5:7b" (or another local model), "<model> (replay)", or "rules" */
  engine: string
  latency_ms: number
  segment_status: SegmentStatus
  /** Only on the POST /api/complaints response: why the model was not used (null when it was). */
  error?: string | null
  /** Only on the POST /api/complaints response: fields the keyword rules filled after the model. */
  filled_by_rules?: string[]
  source?: 'live' | 'replay'
}

// ---------- Analysis (GET /api/incidents) ----------

export interface ZoneStat {
  anomalies: number
  explained: number
  in_turn: boolean
  hit: boolean
}

export type HypothesisKind = 'main' | 'zone' | 'reservoir' | 'none'

export interface Hypothesis {
  segment_id: string
  name_ar: string
  kind: HypothesisKind
  posterior: number
  zones: string[]
}

export type IncidentStatus = 'open' | 'approved' | 'closed'

export interface IncidentQuote {
  zone_id: string
  quote: string
}

export interface Incident {
  segment_id: string
  posterior: number
  status: IncidentStatus
  quotes: IncidentQuote[]
}

export interface Analysis {
  window_hours: number
  demo_now: string
  zones: Record<string, ZoneStat>
  heatmap_top: { zone_id: string; anomalies: number } | null
  /** Top 3, including the "none" (no fault) hypothesis. */
  hypotheses: Hypothesis[]
  incident: Incident | null
}

// ---------- other endpoints ----------

/** POST /api/transcribe */
export interface TranscribeResult {
  text: string
  /** Time spent transcribing. */
  seconds: number
  /** Length of the recording. */
  audio_seconds?: number
  model: string
  device?: string | null
  audio_deleted: boolean
}

export interface TemplateReply {
  receipt: string
  text_ar: string
}

/** POST /api/incidents/approve and /api/incidents/close */
export interface SegmentActionResult {
  segment_id: string
  replies: TemplateReply[]
}

/** POST /api/replay */
export interface ReplayResult {
  loaded: number
  /** Live replay runs in the background: loaded is 0 and queued says how many are on the way. */
  queued?: number
  source: 'cache' | 'live'
  model: string
}

/** One row of GET /api/public. A suppressed cell may arrive as null or "<5". */
export type PublicCell = number | string | null
export type PublicCellKey = 'anomalies' | 'explained' | 'incidents'

export interface PublicRow {
  zone_id: string
  name_ar: string
  anomalies: PublicCell
  explained: PublicCell
  incidents: PublicCell
  /** true (row has hidden cells) or the list of hidden cell keys. */
  suppressed: boolean | string[]
}

export interface PublicResponse {
  rows: PublicRow[]
  min_cell: number
  disclaimer_ar: string
}

/** GET /api/privacy */
export interface PrivacyReport {
  complaints_stored: number
  audio_files_on_disk: number
  stored_fields: string[]
  /** e.g. "http://127.0.0.1:11434 (Ollama, same machine)" */
  outbound_hosts: string[]
  retention_days: number
  not_stored?: string[]
}
