// Public dashboard (#/public): counts per zone as open data. Cells under min_cell are hidden ("<5").

import { Download, Globe, ShieldCheck } from 'lucide-react'
import { PUBLIC_CSV_URL, api } from '../api'
import { usePoll } from '../hooks'
import type { PublicCellKey, PublicRow } from '../types'
import { EmptyBox, ErrorBox, LoadingBox } from '../components/ui'

const COLUMNS: { key: PublicCellKey; label: string }[] = [
  { key: 'anomalies', label: 'شكاوى وقت الدور' },
  { key: 'explained', label: 'شكاوى خارج الدور' },
  { key: 'incidents', label: 'حوادث' },
]

/**
 * A cell is hidden when the API already masked it (null or "<5") or listed its key in `suppressed`.
 * A boolean `suppressed` only says the row has masked cells; the values themselves are trusted.
 */
function cellText(row: PublicRow, key: PublicCellKey, minCell: number): { text: string; hidden: boolean } {
  const v = row[key]
  const hiddenLabel = `<${minCell}`
  if (v === null || v === undefined || typeof v === 'string') return { text: typeof v === 'string' && v ? v : hiddenLabel, hidden: true }
  if (Array.isArray(row.suppressed) && row.suppressed.includes(key)) return { text: hiddenLabel, hidden: true }
  return { text: String(v), hidden: false }
}

export default function Public() {
  const q = usePoll(api.publicStats, 10000)
  const data = q.data
  const minCell = data?.min_cell ?? 5

  return (
    <div className="flex flex-col gap-5">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold sm:text-3xl">اللوحة العامة</h1>
        <p className="text-slate-600">
          أرقام مجمّعة لكل حي، بدون نصوص وبدون أي معلومة شخصية. أي حدا بيقدر ينزّلها ويستخدمها.
        </p>
      </header>

      {!data && q.loading && <LoadingBox />}
      {!data && !q.loading && q.error && <ErrorBox message={q.error} down={q.down} onRetry={() => void q.refresh()} />}

      {data && (
        <section className="card overflow-hidden" aria-label="الأرقام لكل حي">
          {data.rows.length === 0 ? (
            <div className="p-5">
              <EmptyBox title="لسا ما في أرقام" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-start text-lg">
                <thead className="bg-slate-50 text-sm text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">
                      الحي
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} scope="col" className="px-4 py-3 text-start font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row) => (
                    <tr key={row.zone_id}>
                      <th scope="row" className="px-4 py-2.5 text-start font-semibold">
                        {row.name_ar} <span className="font-mono text-xs font-normal text-slate-500">{row.zone_id}</span>
                      </th>
                      {COLUMNS.map((c) => {
                        const cell = cellText(row, c.key, minCell)
                        return (
                          <td key={c.key} className="px-4 py-2.5">
                            {cell.hidden ? (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-500" title="مخفي لحماية الخصوصية" dir="ltr">
                                {cell.text}
                              </span>
                            ) : (
                              <span className="num font-semibold">{cell.text}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card flex gap-3 p-4">
          <ShieldCheck className="mt-1 size-6 shrink-0 text-brand" aria-hidden />
          <div>
            <h2 className="font-bold">ليش في خلايا مخفية؟</h2>
            <p className="text-slate-600">
              أي رقم أقل من <span className="num">{minCell}</span> بنعرضه <span dir="ltr" className="font-mono">{`<${minCell}`}</span> عشان ما حدا ينعرف من قلّة العدد. وما
              في مجاميع، عشان ما ينحسب المخفي بالطرح.
            </p>
          </div>
        </div>
        <div className="card flex gap-3 p-4">
          <Download className="mt-1 size-6 shrink-0 text-brand" aria-hidden />
          <div>
            <h2 className="font-bold">نزّل البيانات</h2>
            <p className="text-slate-600">نفس الجدول كملف CSV، والخلايا المخفية فيه <span dir="ltr" className="font-mono">{`<${minCell}`}</span> كمان.</p>
            <a
              href={PUBLIC_CSV_URL}
              download="blue-balance-public.csv"
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              <Download className="size-4" aria-hidden />
              public.csv
            </a>
          </div>
        </div>
        <div className="card flex gap-3 p-4">
          <Globe className="mt-1 size-6 shrink-0 text-brand" aria-hidden />
          <div>
            <h2 className="font-bold">الرخصة</h2>
            <p className="text-slate-600">
              البيانات مرخّصة <b dir="ltr">CC BY 4.0</b>: استخدمها وانشرها وعدّل عليها، بس اذكر المصدر (Blue Balance).
            </p>
          </div>
        </div>
      </section>

      {data?.disclaimer_ar && <p className="text-sm text-slate-500">{data.disclaimer_ar}</p>}
    </div>
  )
}
