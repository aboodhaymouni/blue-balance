// The pipe tree: reservoir at the top, the mains under it, the zones under each main.
// Tree mode: zones in turn = blue outline, out of turn = grey, hit = red fill with the anomaly count,
// and the top hypothesis segment glows red. Heatmap mode: zones coloured by anomaly count, heatmap_top ringed.

import type { ReactNode } from 'react'
import type { Analysis, IncidentStatus, NetNode, ZoneTurn } from '../types'
import { complaintsCount, pct } from './ui'

export type TreeMode = 'heatmap' | 'tree'

interface TreeProps {
  nodes: NetNode[]
  analysis: Analysis | null
  turns?: Record<string, ZoneTurn>
  mode: TreeMode
}

const W = 960
const H = 420
const PAD = 14
const GROUP_GAP = 0.45 // in zone slots, between the groups of two mains

const Y_RES = 46
const RES_W = 210
const RES_H = 58
const Y_MAIN = 178
const MAIN_W = 156
const MAIN_H = 52
const Y_ZONE = 340
const ZONE_H = 96

const BLUE = '#1d4ed8'
const RED = '#dc2626'
const AMBER = '#d97706'
const GREEN = '#16a34a'
const PIPE = '#cbd5e1'

interface Placed {
  node: NetNode
  x: number
  y: number
}

const byId = (a: NetNode, b: NetNode) => a.id.localeCompare(b.id, 'en', { numeric: true })

function layout(nodes: NetNode[]) {
  const reservoir = nodes.find((n) => n.type === 'reservoir') ?? null
  const mains = nodes.filter((n) => n.type === 'main').sort(byId)
  const zones = nodes.filter((n) => n.type === 'zone')
  const groups = mains.map((m) => ({ main: m, zones: zones.filter((z) => z.parent === m.id).sort(byId) }))

  const slotCount = groups.reduce((s, g) => s + Math.max(1, g.zones.length), 0)
  const units = slotCount + GROUP_GAP * Math.max(0, groups.length - 1)
  const slotW = (W - 2 * PAD) / Math.max(1, units)

  const mainPos: Placed[] = []
  const zonePos: Placed[] = []
  let cursor = 0 // in slots, from the right edge (RTL: the first main sits on the right)
  for (const g of groups) {
    const n = Math.max(1, g.zones.length)
    const xs: number[] = []
    for (let k = 0; k < n; k++) xs.push(W - PAD - (cursor + k + 0.5) * slotW)
    g.zones.forEach((z, k) => zonePos.push({ node: z, x: xs[k], y: Y_ZONE }))
    mainPos.push({ node: g.main, x: xs.reduce((a, b) => a + b, 0) / xs.length, y: Y_MAIN })
    cursor += n + GROUP_GAP
  }

  return {
    reservoir: reservoir ? { node: reservoir, x: W / 2, y: Y_RES } : null,
    mains: mainPos,
    zones: zonePos,
    zoneW: Math.min(90, slotW - 6),
  }
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

/** Split a zone name into at most two lines at the space nearest the middle. */
function nameLines(name: string, maxChars = 9): string[] {
  if (name.length <= maxChars || !name.includes(' ')) return [name]
  const mid = name.length / 2
  let best = -1
  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  }
  return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)]
}

/** white -> red, for the heatmap. */
function heat(t: number): string {
  const k = Math.max(0, Math.min(1, t))
  const mix = (from: number, to: number) => Math.round(from + (to - from) * k)
  return `rgb(${mix(255, 220)} ${mix(255, 38)} ${mix(255, 38)})`
}

function faultColour(status: IncidentStatus): string {
  return status === 'approved' ? AMBER : status === 'closed' ? GREEN : RED
}

export default function Tree({ nodes, analysis, turns, mode }: TreeProps) {
  const { reservoir, mains, zones, zoneW } = layout(nodes)

  const stat = (id: string) => analysis?.zones[id]
  const inTurn = (id: string) => stat(id)?.in_turn ?? turns?.[id]?.in_turn ?? false
  const anomalies = (id: string) => stat(id)?.anomalies ?? 0
  const maxAnomalies = Math.max(0, ...zones.map((z) => anomalies(z.node.id)))
  const heatTop = analysis?.heatmap_top?.zone_id ?? null

  // The suspect segment (tree mode only): the incident's segment, else the top hypothesis unless it is "none".
  const incident = analysis?.incident ?? null
  const top = [...(analysis?.hypotheses ?? [])].sort((a, b) => b.posterior - a.posterior)[0]
  const suspectId = mode === 'tree' ? (incident?.segment_id ?? (top && top.kind !== 'none' ? top.segment_id : null)) : null
  const suspectStatus: IncidentStatus = incident && incident.segment_id === suspectId ? incident.status : 'open'
  const suspectPosterior = incident && incident.segment_id === suspectId ? incident.posterior : (top?.posterior ?? 0)
  const fault = faultColour(suspectStatus)
  const tagText =
    suspectStatus === 'approved' ? `${suspectId} · الفرقة بالطريق` : suspectStatus === 'closed' ? `${suspectId} · تم الإصلاح` : `${suspectId} · ${pct(suspectPosterior)}`

  const mainById = new Map<string, Placed>(mains.map((m): [string, Placed] => [m.node.id, m]))
  const mainFlows = (mainId: string) => zones.some((z) => z.node.parent === mainId && inTurn(z.node.id))

  let tag: { x: number; y: number } | null = null

  function edge(key: string, segId: string, d: string, width: number, flowing: boolean): ReactNode {
    const suspect = segId === suspectId
    return (
      <g key={key}>
        {suspect && (
          <path
            d={d}
            fill="none"
            stroke={fault}
            strokeWidth={width + 16}
            strokeLinecap="round"
            filter="url(#bb-glow)"
            className={suspectStatus === 'open' ? 'bb-pulse' : undefined}
            opacity={0.35}
          />
        )}
        <path
          d={d}
          fill="none"
          stroke={suspect ? fault : PIPE}
          strokeWidth={suspect ? width + 4 : width}
          strokeLinecap="round"
          strokeDasharray={suspect && suspectStatus === 'approved' ? '16 9' : undefined}
        />
        {!suspect && flowing && (
          <path d={d} fill="none" stroke="#60a5fa" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="3 9" className="bb-flow" />
        )}
      </g>
    )
  }

  const edges: ReactNode[] = []
  if (reservoir) {
    for (const m of mains) {
      const y1 = reservoir.y + RES_H / 2
      const y2 = m.y - MAIN_H / 2
      edges.push(edge(`e-${m.node.id}`, m.node.id, curve(reservoir.x, y1, m.x, y2), 7, mainFlows(m.node.id)))
      if (m.node.id === suspectId) tag = { x: (reservoir.x + m.x) / 2, y: (y1 + y2) / 2 }
    }
  }
  for (const z of zones) {
    const m = z.node.parent ? mainById.get(z.node.parent) : undefined
    if (!m) continue
    const y1 = m.y + MAIN_H / 2
    const y2 = z.y - ZONE_H / 2
    edges.push(edge(`e-${z.node.id}`, z.node.id, curve(m.x, y1, z.x, y2), 4, inTurn(z.node.id)))
    if (z.node.id === suspectId) tag = { x: (m.x + z.x) / 2, y: (y1 + y2) / 2 }
  }
  if (reservoir && reservoir.node.id === suspectId) tag = { x: reservoir.x - RES_W / 2 - 70, y: reservoir.y }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label={mode === 'tree' ? 'شجرة الأنابيب مع المقطع المشتبه فيه' : 'خريطة حرارية للشكاوى وقت الدور'}
    >
      <defs>
        <filter id="bb-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {edges}

      {/* Reservoir */}
      {reservoir && (
        <g>
          <rect
            x={reservoir.x - RES_W / 2}
            y={reservoir.y - RES_H / 2}
            width={RES_W}
            height={RES_H}
            rx={16}
            fill={reservoir.node.id === suspectId ? '#fef2f2' : '#eff6ff'}
            stroke={reservoir.node.id === suspectId ? fault : BLUE}
            strokeWidth={reservoir.node.id === suspectId ? 4 : 2}
          />
          <text x={reservoir.x} y={reservoir.y - 2} textAnchor="middle" fontSize={17} fontWeight={700} fill="#1e3a8a">
            {reservoir.node.name_ar}
          </text>
          <text x={reservoir.x} y={reservoir.y + 18} textAnchor="middle" fontSize={12} fill="#475569" direction="ltr" fontFamily="ui-monospace, monospace">
            {reservoir.node.id}
          </text>
        </g>
      )}

      {/* Mains */}
      {mains.map((m) => {
        const suspect = m.node.id === suspectId
        return (
          <g key={m.node.id}>
            <title>{`${m.node.name_ar} (${m.node.id})${m.node.diameter_mm ? ` · قطر ${m.node.diameter_mm} مم` : ''}`}</title>
            <rect
              x={m.x - MAIN_W / 2}
              y={m.y - MAIN_H / 2}
              width={MAIN_W}
              height={MAIN_H}
              rx={MAIN_H / 2}
              fill={suspect ? '#fef2f2' : '#ffffff'}
              stroke={suspect ? fault : '#94a3b8'}
              strokeWidth={suspect ? 4 : 2}
            />
            <text x={m.x} y={m.y - 1} textAnchor="middle" fontSize={16} fontWeight={600} fill={suspect ? '#7f1d1d' : '#0f172a'}>
              {m.node.name_ar}
            </text>
            <text x={m.x} y={m.y + 17} textAnchor="middle" fontSize={12} fill="#64748b" direction="ltr" fontFamily="ui-monospace, monospace">
              {m.node.id}
            </text>
          </g>
        )
      })}

      {/* Zones */}
      {zones.map((z) => {
        const id = z.node.id
        const s = stat(id)
        const n = anomalies(id)
        const explained = s?.explained ?? 0
        const turn = inTurn(id)
        const hit = s?.hit ?? n > 0
        const suspect = id === suspectId
        const isHeatTop = mode === 'heatmap' && heatTop === id

        let fill: string
        let stroke: string
        let strokeWidth = 2.5
        let ink: string
        let sub: string
        if (mode === 'heatmap') {
          const t = maxAnomalies > 0 ? n / maxAnomalies : 0
          fill = n > 0 ? heat(0.12 + 0.88 * t) : '#f8fafc'
          ink = t > 0.55 ? '#ffffff' : '#0f172a'
          sub = t > 0.55 ? '#fee2e2' : '#475569'
          stroke = isHeatTop ? '#7f1d1d' : turn ? BLUE : '#cbd5e1'
          strokeWidth = isHeatTop ? 5 : 2.5
        } else if (hit) {
          fill = RED
          stroke = suspect ? fault : '#991b1b'
          strokeWidth = suspect ? 5 : 2.5
          ink = '#ffffff'
          sub = '#fee2e2'
        } else if (turn) {
          fill = '#ffffff'
          stroke = suspect ? fault : BLUE
          strokeWidth = suspect ? 5 : 2.5
          ink = '#1e3a8a'
          sub = '#475569'
        } else {
          fill = '#f1f5f9'
          stroke = suspect ? fault : '#cbd5e1'
          strokeWidth = suspect ? 5 : 2
          ink = '#64748b'
          sub = '#94a3b8'
        }

        const statusLine =
          n > 0 ? complaintsCount(n) : explained > 0 ? `${explained} خارج الدور` : turn ? 'وقت الدور' : 'مش دورها'
        const lines = nameLines(z.node.name_ar)
        const boxTop = z.y - ZONE_H / 2

        return (
          <g key={id}>
            <title>
              {`${z.node.name_ar} (${id}) · ${turn ? 'وقت الدور' : 'مش دورها اليوم'} · شكاوى وقت الدور: ${n} · خارج الدور: ${explained}`}
            </title>
            <rect x={z.x - zoneW / 2} y={boxTop} width={zoneW} height={ZONE_H} rx={14} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
            {lines.map((line, i) => (
              <text
                key={i}
                x={z.x}
                y={boxTop + (lines.length === 1 ? 32 : 24) + i * 19}
                textAnchor="middle"
                fontSize={15}
                fontWeight={700}
                fill={ink}
              >
                {line}
              </text>
            ))}
            <text x={z.x} y={boxTop + 66} textAnchor="middle" fontSize={12} fontWeight={n > 0 ? 700 : 500} fill={n > 0 && mode === 'tree' ? '#ffffff' : sub}>
              {statusLine}
            </text>
            <text x={z.x} y={boxTop + 85} textAnchor="middle" fontSize={11} fill={sub} direction="ltr" fontFamily="ui-monospace, monospace">
              {id}
            </text>
            {isHeatTop && (
              <g>
                <rect x={z.x - 34} y={boxTop - 26} width={68} height={22} rx={11} fill="#7f1d1d" />
                <text x={z.x} y={boxTop - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#ffffff">
                  الأعلى
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* Posterior tag on the suspect segment */}
      {tag && suspectId && (
        <g>
          <rect x={tag.x - 78} y={tag.y - 15} width={156} height={30} rx={15} fill={fault} />
          <text x={tag.x} y={tag.y + 6} textAnchor="middle" fontSize={14} fontWeight={700} fill="#ffffff">
            {tagText}
          </text>
        </g>
      )}
    </svg>
  )
}

/** Legend under the tree, in HTML so it stays crisp. */
export function TreeLegend({ mode }: { mode: TreeMode }) {
  if (mode === 'heatmap') {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="text-xs">قليل</span>
          <span className="h-3 w-28 rounded-full" style={{ background: 'linear-gradient(to left, #fde2e2, #dc2626)' }} aria-hidden />
          <span className="text-xs">كثير</span>
          <span>شكاوى وقت الدور</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-4 border-[#7f1d1d] bg-white" aria-hidden />
          الحي الأعلى
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-4 rounded border-2 border-[#1d4ed8] bg-white" aria-hidden />
          وقت الدور
        </span>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
      <span className="inline-flex items-center gap-2">
        <span className="size-4 rounded border-2 border-[#1d4ed8] bg-white" aria-hidden />
        وقت الدور
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-4 rounded border-2 border-slate-300 bg-slate-100" aria-hidden />
        مش دورها اليوم
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="size-4 rounded bg-red-600" aria-hidden />
        شكاوى وقت الدور
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-8 rounded-full bg-red-600 shadow-[0_0_8px_2px_rgba(220,38,38,0.6)]" aria-hidden />
        المقطع المشتبه فيه
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-0.5 w-8 border-t-2 border-dashed border-blue-400" aria-hidden />
        مي ماشية
      </span>
    </div>
  )
}
