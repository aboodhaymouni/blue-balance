// Control room (#/ops): the pipe tree, the incident with its top-3 hypotheses, the engineer's
// approve / close buttons, and the live complaint feed. Polls every 3 s.

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Clock, Flame, GitBranch, LoaderCircle, Play, RotateCcw, Send, Wrench } from 'lucide-react'
import { api, errorText } from '../api'
import { usePoll, type PollState } from '../hooks'
import type { Analysis, Complaint, ComplaintStatus, Hypothesis, NetworkResponse, ReplayResult, SegmentActionResult } from '../types'
import Tree, { TreeLegend, type TreeMode } from '../components/Tree'
import {
  EmptyBox,
  ErrorBox,
  INCIDENT_STATUS_META,
  KIND_LABEL,
  Spinner,
  StatusChip,
  complaintsCount,
  engineLabel,
  fmtClock,
  fmtDemoNow,
  pct,
} from '../components/ui'

type Busy = null | 'replay' | 'reset' | 'approve' | 'close'

interface Sent {
  kind: 'approve' | 'close'
  result: SegmentActionResult
}

export default function Ops({ net }: { net: NetworkResponse | null }) {
  const inc = usePoll(api.incidents, 3000)
  const feed = usePoll(api.complaints, 3000)

  const [mode, setMode] = useState<TreeMode>('tree')
  const [busy, setBusy] = useState<Busy>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [replay, setReplay] = useState<ReplayResult | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [resetArmed, setResetArmed] = useState(false)

  useEffect(() => {
    if (!resetArmed) return
    const t = window.setTimeout(() => setResetArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [resetArmed])

  const nodes = net?.network.nodes ?? []
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name_ar ?? id

  async function act<T>(kind: Exclude<Busy, null>, fn: () => Promise<T>): Promise<T | null> {
    setBusy(kind)
    setActionError(null)
    try {
      return await fn()
    } catch (err) {
      setActionError(errorText(err))
      return null
    } finally {
      setBusy(null)
      void inc.refresh()
      void feed.refresh()
    }
  }

  async function onReplay() {
    const r = await act('replay', api.replay)
    if (r) setReplay(r)
  }

  async function onReset() {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    setResetArmed(false)
    const r = await act('reset', api.reset)
    if (r) {
      setReplay(null)
      setSent(null)
    }
  }

  async function onApprove(segmentId: string) {
    const r = await act('approve', () => api.approve(segmentId))
    if (r) setSent({ kind: 'approve', result: r })
  }

  async function onClose(segmentId: string) {
    const r = await act('close', () => api.close(segmentId))
    if (r) setSent({ kind: 'close', result: r })
  }

  const analysis = inc.data
  const demoNow = analysis?.demo_now ?? net?.demo_now ?? null

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold sm:text-3xl">غرفة التحكم</h1>
          <p className="text-slate-600">
            الشكاوى اللي بتيجي وقت الدور بتطلع لفوق بشجرة الأنابيب لحد المقطع الأرجح. المهندس بيعتمد، والناس بيوصلهم رد من قالب ثابت.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
            <Clock className="size-4 text-slate-500" aria-hidden />
            وقت العرض:
            <b className="num">{fmtDemoNow(demoNow)}</b>
          </span>
          <button
            type="button"
            onClick={() => void onReplay()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300"
          >
            {busy === 'replay' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Play className="size-5 -scale-x-100" aria-hidden />}
            شغّل بلاغات الصبح (Replay)
          </button>
          <button
            type="button"
            onClick={() => void onReset()}
            disabled={busy !== null}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 font-semibold disabled:opacity-50',
              resetArmed ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-slate-300 bg-white text-slate-700 hover:border-red-300 hover:text-red-700',
            )}
          >
            {busy === 'reset' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />}
            {resetArmed ? 'متأكد؟ اضغط كمان مرة' : 'تصفير'}
          </button>
        </div>
      </header>

      {busy === 'replay' && (
        <p className="rounded-xl bg-blue-50 p-3 text-blue-900" role="status">
          عم نشغّل Replay لبلاغات الصبح المسجّلة عبر نفس الخط… من الكاش بياخذ ثواني، والتشغيل الحي على الموديل ممكن ياخذ دقايق.
        </p>
      )}
      {replay && busy !== 'replay' && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-blue-950" role="status">
          <b className="rounded-md bg-blue-700 px-2 py-0.5 text-sm text-white">Replay</b>
          {replay.source === 'live' && replay.loaded === 0 && replay.queued ? (
            <span>
              عم يمرّ <b className="num">{replay.queued}</b> بلاغ مسجّل من الصبح على الموديل بالخلفية، وبيظهروا تباعًا. مش بث مباشر.
            </span>
          ) : (
            <span>
              انحمّل <b className="num">{replay.loaded}</b> بلاغ مسجّل من الصبح، مش بث مباشر.
            </span>
          )}
          <span>
            المصدر: <b>{replay.source === 'cache' ? 'نتائج محفوظة (cache)' : 'تشغيل حي على الموديل (live)'}</b>
          </span>
          <span>
            الموديل: <b className="font-mono" dir="ltr">{engineLabel(replay.model)}</b>
          </span>
        </p>
      )}
      {actionError && <ErrorBox message={actionError} />}
      {inc.error && !analysis && <ErrorBox message={inc.error} down={inc.down} onRetry={() => void inc.refresh()} />}
      {inc.error && analysis && (
        <p className="text-sm text-red-700" role="alert">
          آخر تحديث فشل ({inc.error}). عم نعرض آخر بيانات وصلت.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card flex flex-col gap-3 p-4 sm:p-5" aria-label="شبكة الأنابيب">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{net?.network.name_ar ?? 'شبكة الأنابيب'}</h2>
              {analysis && <p className="text-sm text-slate-500">آخر {analysis.window_hours} ساعات</p>}
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="طريقة العرض">
              {(['heatmap', 'tree'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={clsx(
                    'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 font-semibold',
                    mode === m ? 'bg-white text-brand shadow-sm' : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {m === 'heatmap' ? <Flame className="size-4" aria-hidden /> : <GitBranch className="size-4" aria-hidden />}
                  {m === 'heatmap' ? 'خريطة حرارية' : 'الشجرة'}
                </button>
              ))}
            </div>
          </div>

          {nodes.length > 0 ? (
            <Tree nodes={nodes} analysis={analysis} turns={net?.turns} mode={mode} />
          ) : (
            <div className="grid min-h-64 place-items-center">
              {inc.loading ? <Spinner label="عم نحمّل الشبكة…" /> : <EmptyBox title="الشبكة ما وصلت">شغّل الـ API وبتظهر الشجرة لحالها.</EmptyBox>}
            </div>
          )}

          <TreeLegend mode={mode} />
          <ModeCaption mode={mode} analysis={analysis} nameOf={nameOf} />
        </section>

        <IncidentCard
          analysis={analysis}
          loading={inc.loading}
          nameOf={nameOf}
          busy={busy}
          sent={sent}
          onApprove={(id) => void onApprove(id)}
          onClose={(id) => void onClose(id)}
        />
      </div>

      <Feed poll={feed} />
    </div>
  )
}

function ModeCaption({ mode, analysis, nameOf }: { mode: TreeMode; analysis: Analysis | null; nameOf: (id: string) => string }) {
  if (!analysis) return null
  let text: string
  if (mode === 'heatmap') {
    const top = analysis.heatmap_top
    text =
      top && top.anomalies > 0
        ? `الخريطة الحرارية بتأشّر على ${nameOf(top.zone_id)} (${top.zone_id}): ${complaintsCount(top.anomalies)} وقت الدور. بس العدّ لحاله ما بيقول وين العطل بالأنابيب.`
        : 'لسا ما في شكاوى وقت الدور.'
  } else {
    const top = [...analysis.hypotheses].sort((a, b) => b.posterior - a.posterior)[0]
    if (!top) text = 'لسا ما في فرضيات.'
    else if (top.kind === 'none') text = `الاحتمال الأعلى إنه ما في عطل (${pct(top.posterior)}).`
    else
      text = `الشجرة بتجمع الشكاوى لفوق: العطل الأرجح على ${top.name_ar || nameOf(top.segment_id)} (${top.segment_id}) باحتمال ${pct(top.posterior)}.`
  }
  return <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{text}</p>
}

function HypothesisRow({ h, first, nameOf }: { h: Hypothesis; first: boolean; nameOf: (id: string) => string }) {
  const none = h.kind === 'none'
  const label = none ? 'ما في عطل' : h.name_ar || nameOf(h.segment_id)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-semibold">{label}</span>
          {!none && (
            <>
              {' '}
              <span className="font-mono text-sm text-slate-500">{h.segment_id}</span>{' '}
              <span className="text-sm text-slate-500">· {KIND_LABEL[h.kind] ?? h.kind}</span>
            </>
          )}
        </span>
        <span className="num shrink-0 text-lg font-bold">{pct(h.posterior)}</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx('h-full rounded-full transition-[width] duration-500', none ? 'bg-slate-400' : first ? 'bg-red-600' : 'bg-red-300')}
          style={{ width: pct(h.posterior) }}
        />
      </div>
      {!none && h.zones.length > 0 && <p className="mt-1 text-xs text-slate-500">بيغذّي: {h.zones.map(nameOf).join('، ')}</p>}
    </li>
  )
}

function IncidentCard({
  analysis,
  loading,
  nameOf,
  busy,
  sent,
  onApprove,
  onClose,
}: {
  analysis: Analysis | null
  loading: boolean
  nameOf: (id: string) => string
  busy: Busy
  sent: Sent | null
  onApprove: (segmentId: string) => void
  onClose: (segmentId: string) => void
}) {
  if (!analysis) {
    return (
      <section className="card grid min-h-64 place-items-center p-5" aria-label="الحادث">
        {loading ? <Spinner label="عم نحمّل…" /> : <EmptyBox title="ما في بيانات">الـ API مش راد.</EmptyBox>}
      </section>
    )
  }

  const hyps = [...analysis.hypotheses].sort((a, b) => b.posterior - a.posterior).slice(0, 3)
  const incident = analysis.incident
  const quotesByZone = new Map<string, string[]>()
  for (const q of incident?.quotes ?? []) {
    const list = quotesByZone.get(q.zone_id) ?? []
    list.push(q.quote)
    quotesByZone.set(q.zone_id, list)
  }
  const statusMeta = incident ? (INCIDENT_STATUS_META[incident.status] ?? null) : null

  return (
    <section className="card flex flex-col gap-4 p-5" aria-label="الحادث">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">الحادث</h2>
        {statusMeta && <span className={clsx('rounded-full px-3 py-0.5 text-sm font-semibold', statusMeta.cls)}>{statusMeta.label}</span>}
      </div>

      {incident ? (
        <p className="text-lg">
          المقطع المشتبه فيه: <b>{nameOf(incident.segment_id)}</b> <span className="font-mono text-base text-slate-500">{incident.segment_id}</span>
          <span className="num ms-2 font-bold text-red-700">{pct(incident.posterior)}</span>
        </p>
      ) : (
        <EmptyBox title="ما في حادث مفتوح">شغّل بلاغات الصبح (Replay) أو استنّى شكاوى وقت الدور.</EmptyBox>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500">أرجح 3 فرضيات</h3>
        {hyps.length > 0 ? (
          <ul className="space-y-3">
            {hyps.map((h, i) => (
              <HypothesisRow key={`${h.kind}-${h.segment_id}`} h={h} first={i === 0} nameOf={nameOf} />
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">لسا ما في فرضيات.</p>
        )}
      </div>

      {incident && quotesByZone.size > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">من كلام الناس، حسب الحي</h3>
          <ul className="max-h-64 space-y-2 overflow-auto pe-1">
            {[...quotesByZone].map(([zoneId, quotes]) => (
              <li key={zoneId} className="rounded-lg bg-slate-50 p-2.5">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-semibold">{nameOf(zoneId)}</span>
                  <span className="font-mono text-xs text-slate-500">{zoneId}</span>
                  <span className="text-xs text-slate-500">· {complaintsCount(quotes.length)}</span>
                </div>
                <ul className="space-y-0.5 text-slate-700">
                  {quotes.slice(0, 4).map((q, i) => (
                    <li key={i}>«{q}»</li>
                  ))}
                  {quotes.length > 4 && <li className="text-sm text-slate-500">و{quotes.length - 4} كمان</li>}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incident && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApprove(incident.segment_id)}
              disabled={incident.status !== 'open' || busy !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-bold text-white hover:bg-blue-800 disabled:bg-slate-300"
            >
              {busy === 'approve' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Send className="size-5 -scale-x-100" aria-hidden />}
              اعتمد وأرسل فرقة
            </button>
            <button
              type="button"
              onClick={() => onClose(incident.segment_id)}
              disabled={incident.status !== 'approved' || busy !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {busy === 'close' ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Wrench className="size-5" aria-hidden />}
              تم الإصلاح
            </button>
          </div>
          <p className="text-xs text-slate-500">الردود للمواطنين قوالب ثابتة. الموديل ما بيكتب للناس أبدًا.</p>
        </div>
      )}

      {sent && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="font-semibold">
            {sent.kind === 'approve' ? 'ردود الاعتماد اللي انبعتت' : 'ردود الإصلاح اللي انبعتت'}
            <span className="ms-2 text-sm font-normal text-slate-500">
              <span className="num">{sent.result.replies.length}</span> رد · <span className="font-mono">{sent.result.segment_id}</span>
            </span>
          </h3>
          {sent.result.replies.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">ما في شكاوى مربوطة بهالمقطع.</p>
          ) : (
            <ul className="mt-2 max-h-56 space-y-2 overflow-auto pe-1">
              {sent.result.replies.map((r) => (
                <li key={r.receipt} className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                  <span className="font-mono text-xs text-slate-500" dir="ltr">
                    {r.receipt}
                  </span>
                  <p className="leading-relaxed">{r.text_ar}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

const FEED_LIMIT = 60

function Feed({ poll }: { poll: PollState<Complaint[]> }) {
  const list = poll.data ? [...poll.data].sort((a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0)) : null
  const counts: Record<ComplaintStatus, number> = { anomaly: 0, explained: 0, unclear_place: 0, other: 0 }
  for (const c of list ?? []) if (c.status in counts) counts[c.status] += 1

  return (
    <section className="card p-4 sm:p-5" aria-label="الشكاوى">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">
          الشكاوى <span className="num text-base font-normal text-slate-500">({list?.length ?? 0})</span>
        </h2>
        {list && list.length > 0 && (
          <p className="flex flex-wrap gap-x-4 text-sm text-slate-600">
            <span>
              وقت الدور: <b className="num text-red-700">{counts.anomaly}</b>
            </span>
            <span>
              خارج الدور: <b className="num">{counts.explained}</b>
            </span>
            <span>
              مكان مش واضح: <b className="num">{counts.unclear_place}</b>
            </span>
            <span>
              موضوع ثاني: <b className="num">{counts.other}</b>
            </span>
          </p>
        )}
      </div>

      {!list && poll.loading && <Spinner label="عم نحمّل الشكاوى…" />}
      {!list && !poll.loading && poll.error && <ErrorBox message={poll.error} down={poll.down} onRetry={() => void poll.refresh()} />}
      {list && list.length === 0 && <EmptyBox title="لسا ما في شكاوى">ابعت شكوى من صفحة المواطن، أو شغّل بلاغات الصبح (Replay).</EmptyBox>}

      {list && list.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {list.slice(0, FEED_LIMIT).map((c) => (
            <li key={c.receipt} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex shrink-0 items-center gap-2 sm:w-60">
                <time className="num font-mono text-sm text-slate-500" dateTime={c.ts}>
                  {fmtClock(c.ts)}
                </time>
                <StatusChip status={c.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{c.zone?.name_ar ?? 'مكان مش واضح'}</span>
                  {c.zone?.id && <span className="font-mono text-xs text-slate-500">{c.zone.id}</span>}
                  {c.segment_status === 'approved' && <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">الفرقة بالطريق</span>}
                  {c.segment_status === 'closed' && <span className="rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-900">تم الإصلاح</span>}
                </div>
                <p className="line-clamp-2 text-slate-700">{c.text_redacted}</p>
              </div>
              <div className="shrink-0 font-mono text-xs text-slate-500" dir="ltr">
                {c.receipt} · {engineLabel(c.engine)} · {(c.latency_ms / 1000).toFixed(1)}s
              </div>
            </li>
          ))}
        </ul>
      )}
      {list && list.length > FEED_LIMIT && <p className="mt-2 text-sm text-slate-500">عم نعرض آخر {FEED_LIMIT}.</p>}
    </section>
  )
}
