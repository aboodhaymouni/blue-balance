// Citizen page (#/): consent first, then a complaint by text or voice, then a result card that shows
// exactly which of the citizen's words each field came from.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  CircleCheck,
  Clock,
  Cpu,
  EyeOff,
  LoaderCircle,
  Lock,
  MapPin,
  MessageCircle,
  Mic,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { api, errorText } from '../api'
import type { Channel, Complaint, ComplaintFields, FieldName, NetworkResponse } from '../types'
import {
  FIELD_LABEL,
  FIELD_ORDER,
  FIELD_STYLE,
  StatusChip,
  droppedReasonText,
  engineLabel,
  fieldLabel,
  fieldValueText,
  fmtClockSeconds,
  secondsText,
} from '../components/ui'

interface VoiceInfo {
  /** Time the server spent transcribing. */
  seconds: number
  /** Length of the recording, when the server reports it. */
  audioSeconds: number | null
  model: string
  deleted: boolean
  at: Date
}

type Phase = 'form' | 'submitting' | 'result'
type RecState = 'idle' | 'starting' | 'recording' | 'transcribing'
type DeleteState = 'idle' | 'confirm' | 'busy' | 'done'

const MAX_RECORD_S = 60
const STEPS = ['تحويل الصوت', 'استخراج الحقول', 'فحص الجدول', 'تحديث الشجرة'] as const

// ---------- helpers ----------

function pickMimeType(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const t of options) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      // keep looking
    }
  }
  return ''
}

function makeRecorder(stream: MediaStream, mimeType: string): MediaRecorder | null {
  try {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    return null
  }
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4')) return 'm4a'
  return 'webm'
}

/** Prefer these zones for the quick samples; fall back to any zone with the wanted turn state. */
function zoneName(net: NetworkResponse | null, wantInTurn: boolean, prefer: string[]): string {
  const fallback = 'جبل النزهة'
  if (!net) return fallback
  const zones = net.network.nodes.filter((n) => n.type === 'zone')
  const ok = (id: string) => (net.turns[id]?.in_turn ?? false) === wantInTurn
  for (const id of prefer) {
    const z = zones.find((n) => n.id === id)
    if (z && ok(z.id)) return z.name_ar
  }
  return zones.find((n) => ok(n.id))?.name_ar ?? fallback
}

interface Span {
  start: number
  end: number
  kind: FieldName | 'pii'
}

/** Where each field's quote sits in the redacted text, plus the [masked] placeholders. No overlaps. */
function buildSpans(text: string, fields: ComplaintFields): Span[] {
  const spans: Span[] = []
  for (const name of FIELD_ORDER) {
    const quote = fields[name]?.quote
    if (!quote) continue
    const i = text.indexOf(quote)
    if (i >= 0) spans.push({ start: i, end: i + quote.length, kind: name })
  }
  const re = /\[[^\]\n]{1,24}\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) spans.push({ start: m.index, end: m.index + m[0].length, kind: 'pii' })

  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
  const out: Span[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.start < cursor) continue
    out.push(s)
    cursor = s.end
  }
  return out
}

function HighlightedText({ text, fields }: { text: string; fields: ComplaintFields }) {
  const spans = buildSpans(text, fields)
  const parts: ReactNode[] = []
  let cursor = 0
  spans.forEach((s, i) => {
    if (s.start > cursor) parts.push(<span key={`t${i}`}>{text.slice(cursor, s.start)}</span>)
    const piece = text.slice(s.start, s.end)
    parts.push(
      s.kind === 'pii' ? (
        <span key={`m${i}`} className="quote-mark bg-slate-800 text-white" title="معلومة شخصية انخفت">
          {piece}
        </span>
      ) : (
        <mark key={`m${i}`} className={clsx('quote-mark', FIELD_STYLE[s.kind].mark)} title={FIELD_LABEL[s.kind]}>
          {piece}
        </mark>
      ),
    )
    cursor = s.end
  })
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <p className="text-xl leading-[2.1]">{parts}</p>
}

// ---------- page ----------

export default function Citizen({ net, active }: { net: NetworkResponse | null; active: boolean }) {
  const [consented, setConsented] = useState(false)

  const [text, setText] = useState('')
  const [channel, setChannel] = useState<Channel>('text')
  const [voice, setVoice] = useState<VoiceInfo | null>(null)

  const [rec, setRec] = useState<RecState>('idle')
  const [recSeconds, setRecSeconds] = useState(0)
  const [recError, setRecError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [step, setStep] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [submittedChannel, setSubmittedChannel] = useState<Channel>('text')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<Complaint | null>(null)
  const [del, setDel] = useState<DeleteState>('idle')
  const [delError, setDelError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const pressAtRef = useRef(0)
  const swallowUpRef = useRef(false)

  // ----- recording -----

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  useEffect(
    () => () => {
      const r = recorderRef.current
      if (r && r.state !== 'inactive') {
        r.onstop = null
        r.stop()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (tickRef.current !== null) window.clearInterval(tickRef.current)
    },
    [],
  )

  function stopRecording() {
    const r = recorderRef.current
    if (r && r.state === 'recording') r.stop() // onstop -> finishRecording
  }

  async function finishRecording(mime: string) {
    recorderRef.current = null
    releaseMic()
    const blob = new Blob(chunksRef.current, { type: mime })
    chunksRef.current = []
    if (blob.size < 800) {
      setRec('idle')
      setRecError('التسجيل قصير كثير. اضغط واحكي، وبعدين وقّف.')
      return
    }
    setRec('transcribing')
    try {
      const r = await api.transcribe(blob, `voice.${extFor(mime)}`)
      setText(r.text)
      setChannel('voice')
      setVoice({
        seconds: typeof r.seconds === 'number' ? r.seconds : 0,
        audioSeconds: typeof r.audio_seconds === 'number' ? r.audio_seconds : null,
        model: r.model || 'asr',
        deleted: r.audio_deleted === true,
        at: new Date(),
      })
      if (!r.text.trim()) setRecError('ما سمعنا كلام واضح. جرّب كمان مرة أو اكتب الشكوى.')
    } catch (err) {
      setRecError(errorText(err))
    } finally {
      setRec('idle')
    }
  }

  async function startRecording() {
    setRecError(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setRecError('التسجيل بيشتغل بس لما الصفحة تنفتح من localhost أو https. اكتب الشكوى بدالها.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecError('هالمتصفح ما بيدعم التسجيل. اكتب الشكوى بدالها.')
      return
    }
    setRec('starting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setRec('idle')
      setRecError('ما قدرنا نفتح المايك. اسمح للمتصفح يستخدمه وجرّب كمان مرة.')
      return
    }
    const mimeType = pickMimeType()
    const recorder = makeRecorder(stream, mimeType)
    if (!recorder) {
      stream.getTracks().forEach((t) => t.stop())
      setRec('idle')
      setRecError('ما قدرنا نبلّش التسجيل على هالمتصفح.')
      return
    }
    streamRef.current = stream
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      void finishRecording(recorder.mimeType || mimeType || 'audio/webm')
    }
    recorder.start(250)
    startedAtRef.current = Date.now()
    setRecSeconds(0)
    setRec('recording')
    tickRef.current = window.setInterval(() => {
      const s = (Date.now() - startedAtRef.current) / 1000
      setRecSeconds(s)
      if (s >= MAX_RECORD_S) stopRecording()
    }, 200)
  }

  // Press and release = push-to-talk; a quick tap = toggle (tap again to stop).
  function onRecPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    if (rec === 'recording') {
      swallowUpRef.current = true
      stopRecording()
      return
    }
    if (rec !== 'idle') return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // not fatal
    }
    pressAtRef.current = Date.now()
    swallowUpRef.current = false
    void startRecording()
  }

  function onRecPointerUp() {
    if (swallowUpRef.current) {
      swallowUpRef.current = false
      return
    }
    const r = recorderRef.current
    if (!r || r.state !== 'recording') return // still waiting for mic permission: stay in toggle mode
    const startedQuickly = startedAtRef.current - pressAtRef.current < 500
    const held = Date.now() - pressAtRef.current > 700
    if (startedQuickly && held) stopRecording()
  }

  function onRecClick(e: ReactMouseEvent<HTMLButtonElement>) {
    if (e.detail !== 0) return // mouse and touch are handled by the pointer events; detail 0 = keyboard
    if (rec === 'recording') stopRecording()
    else if (rec === 'idle') void startRecording()
  }

  // ----- submit -----

  async function submit() {
    const t = text.trim()
    if (!t || phase === 'submitting' || rec !== 'idle') return
    setSubmitError(null)
    setSubmittedChannel(channel)
    setStep(1)
    setElapsed(0)
    setPhase('submitting')
    try {
      const c = await api.createComplaint(t, channel)
      setResult(c)
      setDel('idle')
      setDelError(null)
      setPhase('result')
    } catch (err) {
      setSubmitError(errorText(err))
      setPhase('form')
    }
  }

  // Step progress while the local model works (~10 s). Steps advance on a clock; the result ends them.
  useEffect(() => {
    if (phase !== 'submitting') return
    const t0 = Date.now()
    const id = window.setInterval(() => {
      const s = (Date.now() - t0) / 1000
      setElapsed(s)
      setStep(s < 7 ? 1 : s < 9 ? 2 : 3)
    }, 200)
    return () => window.clearInterval(id)
  }, [phase])

  // While the result is on screen, pick up the engineer's approval / repair (template replies).
  const receipt = result?.receipt ?? null
  useEffect(() => {
    if (!active || phase !== 'result' || !receipt || del === 'done') return
    let stopped = false
    const id = window.setInterval(async () => {
      try {
        const list = await api.complaints()
        if (stopped) return
        const fresh = list.find((c) => c.receipt === receipt)
        if (!fresh) return
        setResult((prev) =>
          // Merge: the list omits POST-only keys (error, filled_by_rules), so keep them from the first answer.
          prev && (prev.segment_status !== fresh.segment_status || prev.reply_ar !== fresh.reply_ar) ? { ...prev, ...fresh } : prev,
        )
      } catch {
        // the shell already shows when the server is down
      }
    }, 4000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [active, phase, receipt, del])

  async function onDelete() {
    if (!result) return
    if (del === 'idle') {
      setDel('confirm')
      return
    }
    if (del !== 'confirm') return
    setDel('busy')
    setDelError(null)
    try {
      await api.deleteComplaint(result.receipt)
      setDel('done')
    } catch (err) {
      setDelError(errorText(err))
      setDel('idle')
    }
  }

  useEffect(() => {
    if (del !== 'confirm') return
    const t = window.setTimeout(() => setDel('idle'), 5000)
    return () => window.clearTimeout(t)
  }, [del])

  function newComplaint() {
    setText('')
    setChannel('text')
    setVoice(null)
    setRecError(null)
    setSubmitError(null)
    setResult(null)
    setDel('idle')
    setDelError(null)
    setPhase('form')
  }

  // ----- samples -----

  const inName = zoneName(net, true, ['Z05', 'Z04', 'Z06', 'Z01'])
  const outName = zoneName(net, false, ['Z08', 'Z09', 'Z10', 'Z03'])
  const samples = [
    { label: 'انقطاع وقت الدور', text: `من الصبح ما في مي عنا في ${inName}، والجيران كمان، مع إنه دورنا اليوم` },
    { label: 'مش دورنا', text: `ما في مي عنا في ${outName} من امبارح، وين المي؟` },
    { label: 'فيها اسم ورقم', text: `أنا أبو خالد ساكن في ${inName}، المي ضعيفة كثير من يومين. رقمي 0791234567` },
  ]

  // ----- render -----

  if (!consented) {
    return (
      <div className="mx-auto max-w-3xl">
        <section className="card p-6 sm:p-8" aria-labelledby="consent-title">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="size-8 text-brand" aria-hidden />
            <h1 id="consent-title" className="text-2xl font-bold">
              قبل ما تبعت شكواك
            </h1>
          </div>
          <ul className="space-y-3 text-lg">
            <ConsentItem title="الهدف">إصلاح أعطال التزويد بس. ما بنستخدم شكواك لإشي ثاني.</ConsentItem>
            <ConsentItem title="المدة">30 يوم ثم أرقام مجمّعة فقط.</ConsentItem>
            <ConsentItem title="بدون اسم">الشكوى مجهولة افتراضيًا، والأسماء والأرقام بتنخفى تلقائيًا قبل التخزين.</ConsentItem>
            <ConsentItem title="بدون حساب">ما بدنا حساب ولا رقم تلفون.</ConsentItem>
            <ConsentItem title="الصوت">بيتحوّل لنص على هالجهاز وبينحذف فورًا.</ConsentItem>
            <ConsentItem title="حقّك تحذف">بتاخذ رمز إيصال، وفيه بتحذف شكواك وقت ما بدك.</ConsentItem>
          </ul>
          <button
            type="button"
            onClick={() => setConsented(true)}
            className="mt-6 w-full rounded-xl bg-brand px-6 py-3 text-xl font-bold text-white hover:bg-blue-800 sm:w-auto"
          >
            موافق
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">بلّغ عن مشكلة المي</h1>
        <p className="text-slate-600">
          بدون اسم وبدون حساب. الموديل بيطلّع الحقول من كلامك، وكل حقل لازم يكون من كلامك بالحرف، وإلا بينحذف.
        </p>
      </header>

      {phase === 'form' && (
        <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-label="الشكوى">
          <label htmlFor="complaint-text" className="text-lg font-semibold">
            احكيلنا شو المشكلة
          </label>
          <textarea
            id="complaint-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (!e.target.value.trim()) setChannel('text')
            }}
            rows={4}
            maxLength={1000}
            dir="rtl"
            placeholder="مثلًا: من امبارح ما في مي عنا والجيران كمان، ودورنا اليوم"
            className="w-full resize-y rounded-xl border border-slate-300 bg-white p-4 text-xl leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onPointerDown={onRecPointerDown}
              onPointerUp={onRecPointerUp}
              onClick={onRecClick}
              onContextMenu={(e) => e.preventDefault()}
              disabled={rec === 'transcribing'}
              aria-busy={rec === 'starting' || rec === 'transcribing'}
              aria-pressed={rec === 'recording'}
              className={clsx(
                'hold-btn inline-flex items-center gap-2 rounded-xl px-5 py-3 text-lg font-semibold transition-colors',
                rec === 'recording'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand',
                (rec === 'transcribing' || rec === 'starting') && 'opacity-70',
              )}
            >
              {rec === 'recording' ? (
                <>
                  <Square className="size-5 fill-current" aria-hidden />
                  وقّف التسجيل <span className="num">{Math.floor(recSeconds)} ث</span>
                </>
              ) : rec === 'transcribing' ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  عم نحوّل الصوت لنص…
                </>
              ) : rec === 'starting' ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  عم نفتح المايك…
                </>
              ) : (
                <>
                  <Mic className="size-5" aria-hidden />
                  سجّل صوت
                </>
              )}
            </button>
            {rec === 'idle' && <span className="text-sm text-slate-500">اضغط مطوّل واحكي، أو اضغط مرة للبدء ومرة للوقف</span>}
            {rec === 'recording' && (
              <span className="inline-flex items-center gap-2 text-sm text-red-700">
                <span className="size-2.5 animate-pulse rounded-full bg-red-600" aria-hidden />
                عم نسجّل (حد أقصى {MAX_RECORD_S} ثانية)
              </span>
            )}
            {voice && rec === 'idle' && (
              <span
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
                  voice.deleted ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-300',
                )}
              >
                {voice.deleted ? <Trash2 className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
                {voice.deleted ? 'الصوت انحذف' : 'الخادم ما أكّد حذف الصوت'}
                <span className="num font-normal">{fmtClockSeconds(voice.at)}</span>
                <span className="font-normal text-slate-500">
                  · <span dir="ltr">{voice.model}</span>
                  {voice.audioSeconds !== null && (
                    <>
                      {' '}
                      · تسجيل <span className="num">{voice.audioSeconds.toFixed(1)}</span> ث
                    </>
                  )}{' '}
                  · تحويل <span className="num">{voice.seconds.toFixed(1)}</span> ث
                </span>
              </span>
            )}
          </div>
          {recError && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-900" role="alert">
              <TriangleAlert className="mt-1 size-5 shrink-0" aria-hidden />
              {recError}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-500">أمثلة سريعة</span>
            <div className="flex flex-wrap gap-2">
              {samples.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setText(s.text)
                    setChannel('text')
                    setVoice(null)
                    setRecError(null)
                  }}
                  className="rounded-full border border-slate-300 bg-slate-50 px-4 py-1.5 text-base text-slate-700 hover:border-brand hover:bg-brand-soft hover:text-brand-ink"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 font-semibold text-red-800" role="alert">
              <TriangleAlert className="mt-1 size-5 shrink-0" aria-hidden />
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Lock className="size-4" aria-hidden />
              كل المعالجة على هالجهاز. ولا طلب بيطلع لجهة ثانية.
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || rec !== 'idle'}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-xl font-bold text-white hover:bg-blue-800 disabled:bg-slate-300"
            >
              <Send className="size-5 -scale-x-100" aria-hidden />
              ابعت الشكوى
            </button>
          </div>
        </section>
      )}

      {phase === 'submitting' && <Progress step={step} elapsed={elapsed} voiceUsed={submittedChannel === 'voice'} />}

      {phase === 'result' && result && del === 'done' && (
        <section className="card flex flex-col items-start gap-3 p-6" role="status">
          <p className="inline-flex items-center gap-2 text-xl font-bold text-emerald-700">
            <CircleCheck className="size-6" aria-hidden />
            انحذفت شكواك ({result.receipt}).
          </p>
          <p className="text-slate-600">ما ضل نصها عنا.</p>
          <NewButton onClick={newComplaint} />
        </section>
      )}

      {phase === 'result' && result && del !== 'done' && (
        <ResultCard
          c={result}
          del={del}
          delError={delError}
          onDelete={() => void onDelete()}
          onNew={newComplaint}
        />
      )}
    </div>
  )
}

function ConsentItem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <CircleCheck className="mt-1.5 size-5 shrink-0 text-brand" aria-hidden />
      <span>
        <b className="font-semibold">{title}:</b> {children}
      </span>
    </li>
  )
}

function NewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:border-brand hover:text-brand"
    >
      <RotateCcw className="size-5" aria-hidden />
      شكوى جديدة
    </button>
  )
}

function Progress({ step, elapsed, voiceUsed }: { step: number; elapsed: number; voiceUsed: boolean }) {
  return (
    <section className="card p-6" aria-live="polite" aria-busy="true">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">عم نشتغل على شكواك</h2>
        <span className="num text-slate-500">{elapsed.toFixed(1)} ث</span>
      </div>
      <ol className="space-y-3">
        {STEPS.map((label, i) => {
          const skipped = i === 0 && !voiceUsed
          const done = i < step
          const current = i === step
          return (
            <li key={label} className="flex items-center gap-3 text-lg">
              {skipped ? (
                <span className="grid size-6 place-items-center text-slate-300" aria-hidden>
                  —
                </span>
              ) : done ? (
                <CircleCheck className="size-6 text-emerald-600" aria-hidden />
              ) : current ? (
                <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden />
              ) : (
                <span className="size-6 rounded-full border-2 border-slate-200" aria-hidden />
              )}
              <span className={clsx(skipped && 'text-slate-400', current && 'font-semibold text-brand-ink', !done && !current && !skipped && 'text-slate-400')}>
                {label}
                {skipped && <span className="ms-2 text-sm">(شكوى مكتوبة)</span>}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-sm text-slate-500">الموديل شغّال على هالجهاز بدون نت، وبياخذ حوالي 10 ثواني.</p>
    </section>
  )
}

function ResultCard({
  c,
  del,
  delError,
  onDelete,
  onNew,
}: {
  c: Complaint
  del: DeleteState
  delError: string | null
  onDelete: () => void
  onNew: () => void
}) {
  const fields: ComplaintFields = c.fields ?? {}
  const filledByRules = c.filled_by_rules ?? []
  const droppedList = c.dropped ?? []
  const droppedByField = new Map<string, string>(droppedList.map((d): [string, string] => [d.field, d.reason]))
  const extraDropped = droppedList.filter((d) => !(FIELD_ORDER as readonly string[]).includes(d.field))
  const zoneText = c.zone?.name_ar ?? (c.status === 'unclear_place' ? 'المكان مش واضح' : '—')

  return (
    <section className="card flex flex-col gap-5 p-5 sm:p-6" aria-label="نتيجة الشكوى">
      {/* status line */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={c.status} className="text-base" />
        <span className="inline-flex items-center gap-1.5 text-lg font-semibold">
          <MapPin className="size-5 text-slate-500" aria-hidden />
          {zoneText}
          {c.zone?.id && <span className="font-mono text-sm text-slate-500">{c.zone.id}</span>}
        </span>
        {c.segment_status === 'approved' && (
          <span className="rounded-full bg-amber-500 px-3 py-0.5 text-sm font-semibold text-white">فرقة الصيانة بالطريق</span>
        )}
        {c.segment_status === 'closed' && (
          <span className="rounded-full bg-emerald-600 px-3 py-0.5 text-sm font-semibold text-white">تم الإصلاح</span>
        )}
      </div>

      {/* redacted text with quotes highlighted */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">شكواك مثل ما انخزنت (بعد إخفاء المعلومات الشخصية)</h2>
        <div className="rounded-xl bg-slate-50 p-4">
          <HighlightedText text={c.text_redacted ?? ''} fields={fields} />
        </div>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
          <EyeOff className="size-4" aria-hidden />
          {c.pii_masked > 0 ? `انخفت ${c.pii_masked} معلومة شخصية` : 'ما في معلومات شخصية بالنص'}
        </p>
      </div>

      {/* field list */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">الحقول، وكل حقل مع كلامك اللي طلع منه</h2>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {FIELD_ORDER.map((name) => {
            const f = fields[name]
            const value = fieldValueText(name, f?.value)
            const quote = f?.quote ?? null
            const dropped = droppedByField.get(name)
            return (
              <div key={name} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[10rem_1fr]">
                <dt className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <span className={clsx('size-2.5 rounded-full', value ? FIELD_STYLE[name].dot : 'bg-slate-300')} aria-hidden />
                  {FIELD_LABEL[name]}
                </dt>
                <dd className="min-w-0">
                  {value ? (
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold">{value}</span>
                      {quote && <span className="text-slate-600">«{quote}»</span>}
                      {filledByRules.includes(name) && (
                        <span className="rounded-md bg-slate-100 px-1.5 text-xs text-slate-600 ring-1 ring-slate-200">عبّته القواعد</span>
                      )}
                    </span>
                  ) : dropped ? (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200">{droppedReasonText(dropped)}</span>
                  ) : (
                    <span className="text-slate-400">ما انذكر</span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
        {extraDropped.map((d) => (
          <p key={d.field} className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-amber-900 ring-1 ring-amber-200">
            {fieldLabel(d.field)}: {droppedReasonText(d.reason)}
          </p>
        ))}
      </div>

      {/* reply bubble: a fixed template, never written by the model */}
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-2xl rounded-ee-sm bg-brand-soft px-4 py-3 text-brand-ink sm:max-w-[80%]">
          <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <MessageCircle className="size-3.5" aria-hidden />
            رد بلو بالانس · من قالب ثابت، مش من الموديل
          </div>
          <p className="text-lg leading-relaxed whitespace-pre-line">{c.reply_ar}</p>
        </div>
      </div>

      {/* receipt + engine */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm text-slate-500">رمز الإيصال (احتفظ فيه عشان تحذف شكواك)</div>
          <div className="font-mono text-2xl font-bold tracking-wider" dir="ltr">
            {c.receipt}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            <Cpu className="size-4 text-slate-500" aria-hidden />
            {engineLabel(c.engine)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            <Clock className="size-4 text-slate-500" aria-hidden />
            <span className="num">{secondsText(c.latency_ms)}</span>
          </span>
          {c.channel === 'voice' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
              <Mic className="size-4 text-slate-500" aria-hidden />
              صوت
            </span>
          )}
        </div>
      </div>

      {c.engine === 'rules' && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            الموديل ما اشتغل هالمرة، فطلّعنا نوع المشكلة بقواعد كلمات بس.
            {c.error && (
              <span className="ms-1 font-mono text-xs" dir="ltr">
                ({c.error})
              </span>
            )}
          </span>
        </p>
      )}

      {delError && (
        <p className="rounded-lg bg-red-50 p-3 font-semibold text-red-800" role="alert">
          {delError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onDelete}
          disabled={del === 'busy'}
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold',
            del === 'confirm' ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
          )}
        >
          {del === 'busy' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
          {del === 'confirm' ? 'متأكد؟ اضغط كمان مرة للحذف' : 'احذف شكواي'}
        </button>
        <NewButton onClick={onNew} />
      </div>
    </section>
  )
}
