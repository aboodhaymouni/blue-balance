// Privacy (#/privacy): what the server keeps (from /api/privacy) and what this page sent where
// (the egress log in api.ts, filled from the browser's own resource timing).

import { clsx } from 'clsx'
import { Database, FileAudio, Globe, HardDrive, Lock, Server, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { api } from '../api'
import { useEgress, usePoll } from '../hooks'
import { ErrorBox, LoadingBox } from '../components/ui'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/** "http://127.0.0.1:11434 (Ollama, same machine)" or "127.0.0.1:11434" -> is it this machine? */
function isLocal(hostLike: string): boolean {
  let host = hostLike.trim().split(/\s+/)[0] ?? ''
  try {
    host = new URL(host.includes('://') ? host : `http://${host}`).hostname
  } catch {
    // keep the raw value
  }
  host = host.toLowerCase()
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.startsWith('127.')
}

function Stat({ icon, value, label, good }: { icon: ReactNode; value: ReactNode; label: string; good?: boolean }) {
  return (
    <div
      className={clsx(
        'card flex items-center gap-4 p-4',
        good === true && 'border-emerald-200 bg-emerald-50',
        good === false && 'border-red-200 bg-red-50',
      )}
    >
      <div className={clsx('shrink-0', good === false ? 'text-red-600' : good === true ? 'text-emerald-600' : 'text-brand')}>{icon}</div>
      <div>
        <div className="num text-3xl font-bold leading-tight">{value}</div>
        <div className="text-slate-600">{label}</div>
      </div>
    </div>
  )
}

export default function Privacy() {
  const q = usePoll(api.privacy, 5000)
  const egress = useEgress()
  const p = q.data

  return (
    <div className="flex flex-col gap-5">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold sm:text-3xl">الخصوصية</h1>
        <p className="mt-1 inline-flex items-start gap-2 rounded-xl bg-brand-soft px-4 py-3 text-xl font-semibold text-brand-ink">
          <ShieldCheck className="mt-1 size-6 shrink-0" aria-hidden />
          البيانات الشخصية بتضل عندنا، وغير الشخصية بتصير بيانات مفتوحة.
        </p>
      </header>

      {/* What the server keeps */}
      <section aria-label="شو بيخزّن الخادم" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">شو بيخزّن الخادم</h2>
        {!p && q.loading && <LoadingBox />}
        {!p && !q.loading && q.error && <ErrorBox message={q.error} down={q.down} onRetry={() => void q.refresh()} />}
        {p && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat icon={<Database className="size-8" aria-hidden />} value={p.complaints_stored} label="شكوى مخزّنة (النص بعد الإخفاء بس)" />
              <Stat
                icon={<FileAudio className="size-8" aria-hidden />}
                value={p.audio_files_on_disk}
                label={p.audio_files_on_disk === 0 ? 'ملفات صوت على القرص: ولا ملف' : 'ملفات صوت على القرص: لازم تكون صفر!'}
                good={p.audio_files_on_disk === 0}
              />
              <Stat
                icon={<HardDrive className="size-8" aria-hidden />}
                value={p.retention_days}
                label="يوم، بعدها أرقام مجمّعة فقط"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-2 font-bold">الحقول اللي بتنخزّن</h3>
                {p.stored_fields.length === 0 ? (
                  <p className="text-slate-500">ولا حقل.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {p.stored_fields.map((f) => (
                      <li key={f} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-700" dir="ltr">
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {p.not_stored && p.not_stored.length > 0 ? (
                  <>
                    <h3 className="mb-2 mt-4 font-bold">اللي ما بنخزّنه أبدًا</h3>
                    <ul className="flex flex-wrap gap-2">
                      {p.not_stored.map((f) => (
                        <li key={f} className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-sm text-emerald-800 line-through decoration-emerald-400" dir="ltr">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">ما في اسم، ولا رقم تلفون، ولا ملف صوت، ولا حساب.</p>
                )}
              </div>

              <div className="card p-4">
                <h3 className="mb-2 font-bold">وين بيحكي الخادم</h3>
                {p.outbound_hosts.length === 0 ? (
                  <p className="text-emerald-700">ولا جهة.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {p.outbound_hosts.map((h) => {
                      const local = isLocal(h)
                      return (
                        <li key={h} className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2 font-mono text-sm" dir="ltr">
                            <Server className="size-4 text-slate-400" aria-hidden />
                            {h}
                          </span>
                          <span
                            className={clsx(
                              'rounded-full px-2.5 py-0.5 text-sm font-semibold',
                              local ? 'bg-emerald-100 text-emerald-800' : 'bg-red-600 text-white',
                            )}
                          >
                            {local ? 'نفس الجهاز' : 'جهة خارجية'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* What this page sent */}
      <section aria-label="شو بعتت هالصفحة" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">شو بعتت هالصفحة، ولوين</h2>
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Stat
            icon={egress.thirdParty === 0 ? <Lock className="size-8" aria-hidden /> : <Globe className="size-8" aria-hidden />}
            value={egress.thirdParty}
            label="طلب لجهات خارجية"
            good={egress.thirdParty === 0}
          />
          <div className="card overflow-hidden">
            <table className="w-full text-start">
              <thead className="bg-slate-50 text-sm text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">
                    الجهة
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">
                    عدد الطلبات
                  </th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">
                    النوع
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {egress.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-slate-500">
                      لسا ما في طلبات.
                    </td>
                  </tr>
                )}
                {egress.rows.map((r) => (
                  <tr key={r.host}>
                    <td className="px-4 py-2 font-mono text-sm" dir="ltr">
                      {r.host}
                    </td>
                    <td className="num px-4 py-2 font-semibold">{r.count}</td>
                    <td className="px-4 py-2">
                      <span
                        className={clsx(
                          'rounded-full px-2.5 py-0.5 text-sm font-semibold',
                          r.firstParty ? 'bg-emerald-100 text-emerald-800' : 'bg-red-600 text-white',
                        )}
                      >
                        {r.firstParty ? 'نفس الموقع' : 'جهة خارجية'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
              {egress.source === 'observer'
                ? 'العدّ من سجل المتصفح نفسه لكل ملف وطلب حمّلته الصفحة (سكربتات، خطوط، طلبات API).'
                : 'العدّ لطلبات الـ API من هالصفحة بس (المتصفح ما بيدعم سجل الموارد).'}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
