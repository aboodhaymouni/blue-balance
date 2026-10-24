// Small shared pieces: labels, chips, states and formatting. No logic that talks to the API.

import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { Inbox, LoaderCircle, ServerOff, TriangleAlert } from 'lucide-react'
import type { ComplaintStatus, FieldName, HypothesisKind, IncidentStatus } from '../types'

// ---------- extraction fields ----------

export const FIELD_ORDER: readonly FieldName[] = ['issue', 'since', 'turn_claim', 'neighbours_too', 'tanker_seen', 'place_phrase']

export const FIELD_LABEL: Record<FieldName, string> = {
  issue: 'نوع المشكلة',
  since: 'من إمتى',
  turn_claim: 'دورنا اليوم',
  neighbours_too: 'الجيران كمان',
  tanker_seen: 'صهريج',
  place_phrase: 'المكان',
}

/** Literal class strings so Tailwind picks them up. */
export const FIELD_STYLE: Record<FieldName, { mark: string; dot: string }> = {
  issue: { mark: 'bg-blue-100 text-blue-950 ring-1 ring-blue-300', dot: 'bg-blue-600' },
  since: { mark: 'bg-violet-100 text-violet-950 ring-1 ring-violet-300', dot: 'bg-violet-600' },
  turn_claim: { mark: 'bg-amber-100 text-amber-950 ring-1 ring-amber-300', dot: 'bg-amber-500' },
  neighbours_too: { mark: 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300', dot: 'bg-emerald-600' },
  tanker_seen: { mark: 'bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300', dot: 'bg-cyan-600' },
  place_phrase: { mark: 'bg-fuchsia-100 text-fuchsia-950 ring-1 ring-fuchsia-300', dot: 'bg-fuchsia-600' },
}

const ISSUE_AR: Record<string, string> = {
  no_water: 'ما في مي',
  weak_pressure: 'ضغط ضعيف',
  cut_early: 'انقطعت بدري',
  leak_seen: 'تسريب',
  dirty_water: 'مي مش نظيفة',
  billing: 'فاتورة',
  other: 'إشي ثاني',
}

const SINCE_AR: Record<string, string> = {
  today: 'اليوم',
  yesterday: 'من امبارح',
  two_three_days: 'من يومين-ثلاث',
  week_plus: 'أسبوع وأكثر',
}

/** Arabic text for a field value, or null when the field is empty. */
export function fieldValueText(name: FieldName, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'آه' : 'لأ'
  if (typeof value !== 'string') return String(value)
  if (name === 'issue') return ISSUE_AR[value] ?? value
  if (name === 'since') return SINCE_AR[value] ?? value
  return value
}

export function fieldLabel(name: string): string {
  return name in FIELD_LABEL ? FIELD_LABEL[name as FieldName] : name
}

export function droppedReasonText(reason: string): string {
  if (reason === 'quote_not_found') return 'انحذف: الاقتباس مش موجود بالنص'
  if (reason === 'no_quote') return 'انحذف: بدون اقتباس من النص'
  if (reason === 'invalid_value') return 'انحذف: قيمة مش من القائمة'
  return `انحذف: ${reason}`
}

// ---------- status chips ----------

const STATUS_META: Record<ComplaintStatus, { label: string; cls: string }> = {
  anomaly: { label: 'شكوى وقت الدور', cls: 'bg-red-600 text-white' },
  explained: { label: 'مش عطل: مش دوركم', cls: 'bg-slate-200 text-slate-700' },
  unclear_place: { label: 'المكان مش واضح', cls: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' },
  other: { label: 'موضوع ثاني', cls: 'bg-white text-slate-600 ring-1 ring-slate-300' },
}

export function StatusChip({ status, className }: { status: ComplaintStatus; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700' }
  return (
    <span className={clsx('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-sm font-semibold', meta.cls, className)}>
      {meta.label}
    </span>
  )
}

export const INCIDENT_STATUS_META: Record<IncidentStatus, { label: string; cls: string }> = {
  open: { label: 'مفتوح: بانتظار اعتماد مهندس', cls: 'bg-red-600 text-white' },
  approved: { label: 'معتمد: الفرقة بالطريق', cls: 'bg-amber-500 text-white' },
  closed: { label: 'تم الإصلاح', cls: 'bg-emerald-600 text-white' },
}

export const KIND_LABEL: Record<HypothesisKind, string> = {
  main: 'خط رئيسي',
  zone: 'مغذّي الحي',
  reservoir: 'الخزان',
  none: 'ولا مقطع',
}

// ---------- states ----------

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 text-slate-500', className)} role="status">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  )
}

export function LoadingBox({ label = 'عم نحمّل…' }: { label?: string }) {
  return (
    <div className="card grid min-h-40 place-items-center p-6">
      <Spinner label={label} />
    </div>
  )
}

export function ErrorBox({ message, down, onRetry }: { message: string; down?: boolean; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col gap-3 border-red-200 bg-red-50 p-5 text-red-900 sm:flex-row sm:items-center" role="alert">
      {down ? <ServerOff className="size-7 shrink-0" aria-hidden /> : <TriangleAlert className="size-7 shrink-0" aria-hidden />}
      <div className="flex-1">
        <p className="text-lg font-semibold">{message}</p>
        {down && (
          <p className="text-sm text-red-800">
            الواجهة شغّالة، بس الـ API على <span className="font-mono" dir="ltr">127.0.0.1:8000</span> مش راد. شغّله والصفحة بتتحدّث لحالها.
          </p>
        )}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-800 hover:bg-red-100">
          جرّب كمان مرة
        </button>
      )}
    </div>
  )
}

export function EmptyBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-600">
      <Inbox className="size-7 text-slate-400" aria-hidden />
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="text-sm">{children}</div>}
    </div>
  )
}

// ---------- formatting ----------

const LOCALE = 'ar-JO-u-nu-latn'

function safeFormat(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(LOCALE, { timeZone: 'Asia/Amman', hour12: false, ...opts }).format(d)
  } catch {
    return d.toLocaleTimeString()
  }
}

/** 10:03 */
export function fmtClock(iso: string | null | undefined): string {
  return safeFormat(iso, { hour: '2-digit', minute: '2-digit' })
}

/** 10:03:12 */
export function fmtClockSeconds(date: Date): string {
  try {
    return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)
  } catch {
    return date.toLocaleTimeString()
  }
}

/** السبت 10:03 */
export function fmtDemoNow(iso: string | null | undefined): string {
  return safeFormat(iso, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}

export function secondsText(ms: number): string {
  return `${(ms / 1000).toFixed(1)} ث`
}

export function pct(p: number): string {
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`
}

export function complaintsCount(n: number): string {
  if (n === 1) return 'شكوى وحدة'
  if (n === 2) return 'شكوتين'
  return `${n} شكاوى`
}

export function engineLabel(engine: string): string {
  return engine === 'rules' ? 'قواعد (بدون موديل)' : engine
}
