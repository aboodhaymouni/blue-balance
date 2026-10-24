// Shell: top bar (name, nav, model badges, internet indicator, egress count), the permanent
// "illustrative network" banner, the API-down banner, and hash routing without a router library.

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { AudioLines, Cpu, Info, Lock, LockOpen, ServerOff, Wifi, WifiOff } from 'lucide-react'
import { api } from './api'
import { useEgress, useOnline, usePoll } from './hooks'
import type { Health } from './types'
import Citizen from './pages/Citizen'
import Ops from './pages/Ops'
import Public from './pages/Public'
import Privacy from './pages/Privacy'
import Story from './pages/Story'
import Logo from './components/Logo'

type Route = 'story' | 'citizen' | 'ops' | 'public' | 'privacy'

const ROUTES: { route: Route; hash: string; label: string }[] = [
  { route: 'story', hash: '#/', label: 'الفكرة' },
  { route: 'citizen', hash: '#/report', label: 'المواطن' },
  { route: 'ops', hash: '#/ops', label: 'غرفة التحكم' },
  { route: 'public', hash: '#/public', label: 'اللوحة العامة' },
  { route: 'privacy', hash: '#/privacy', label: 'الخصوصية' },
]

const FALLBACK_NETWORK_NAME = 'شبكة توضيحية'
const FALLBACK_DISCLAIMER = 'أسماء الأحياء حقيقية، أما الأنابيب والجداول فمُخترعة للعرض.'

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/ops') return 'ops'
  if (path === '/public') return 'public'
  if (path === '/privacy') return 'privacy'
  if (path === '/report') return 'citizen'
  return 'story'
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

type DotState = 'ok' | 'warn' | 'off' | 'unknown'

function Dot({ state }: { state: DotState }) {
  return (
    <span
      className={clsx(
        'size-2.5 shrink-0 rounded-full',
        state === 'ok' && 'bg-emerald-500',
        state === 'warn' && 'bg-amber-500',
        state === 'off' && 'bg-red-500',
        state === 'unknown' && 'bg-slate-300',
      )}
      aria-hidden
    />
  )
}

function ModelBadges({ health }: { health: Health | null }) {
  const llmState: DotState = !health ? 'unknown' : health.llm.available ? 'ok' : 'off'
  const asrState: DotState = !health ? 'unknown' : health.asr.loaded ? 'ok' : 'warn'
  const llmTitle = !health
    ? 'حالة الموديل مش معروفة'
    : health.llm.available
      ? 'موديل اللغة شغّال على هالجهاز'
      : 'موديل اللغة مش متاح: الاستخراج بيصير بالقواعد'
  const asrTitle = !health
    ? 'حالة تحويل الصوت مش معروفة'
    : health.asr.loaded
      ? 'تحويل الصوت جاهز على هالجهاز'
      : health.asr.error
        ? `تحويل الصوت فيه مشكلة: ${health.asr.error}`
        : 'تحويل الصوت بيتحمّل عند أول تسجيل'
  return (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200" title={llmTitle}>
        <Cpu className="size-4 text-slate-500" aria-hidden />
        <Dot state={llmState} />
        <span className="font-mono" dir="ltr">
          {health?.llm.model ?? '—'}
        </span>
        <span className="sr-only">{llmTitle}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200" title={asrTitle}>
        <AudioLines className="size-4 text-slate-500" aria-hidden />
        <Dot state={asrState} />
        <span className="font-mono" dir="ltr">
          {health ? `${health.asr.model}${health.asr.device ? ` · ${health.asr.device}` : ''}` : '—'}
        </span>
        <span className="sr-only">{asrTitle}</span>
      </span>
    </>
  )
}

function OnlineBadge() {
  const online = useOnline()
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1',
        online ? 'bg-slate-50 text-slate-700 ring-slate-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-300',
      )}
      title={online ? 'الجهاز موصول بالنت، بس ولا طلب بيطلع لبرّا' : 'الجهاز بدون نت، وكل إشي شغّال محليًا'}
    >
      {online ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
      النت: {online ? 'شغّال' : 'مطفي'}
    </span>
  )
}

function EgressBadge() {
  const egress = useEgress()
  const clean = egress.thirdParty === 0
  return (
    <a
      href="#/privacy"
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ring-1',
        clean ? 'bg-emerald-50 text-emerald-800 ring-emerald-300 hover:bg-emerald-100' : 'bg-red-600 text-white ring-red-700',
      )}
      title="كل طلب بتعمله هالصفحة، حسب الجهة"
    >
      {clean ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
      <span className="num">{egress.thirdParty}</span> طلب لجهات خارجية
    </a>
  )
}

export default function App() {
  const route = useHashRoute()
  const health = usePoll(api.health, 10000)
  const net = usePoll(api.network, 20000)

  useEffect(() => {
    const label = ROUTES.find((r) => r.route === route)?.label ?? ''
    document.title = `${label} · Blue Balance · بلو بالانس`
  }, [route])

  const networkName = net.data?.network.name_ar ?? health.data?.network_name_ar ?? FALLBACK_NETWORK_NAME
  const disclaimer = net.data?.network.disclaimer_ar ?? FALLBACK_DISCLAIMER
  const apiProblem = health.error && !health.loading ? health.error : null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <a href="#/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-lg font-bold leading-tight text-ink">Blue Balance · بلو بالانس</span>
          </a>

          <nav aria-label="الصفحات" className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 lg:order-none lg:mx-0 lg:w-auto lg:px-0">
            {ROUTES.map((r) => (
              <a
                key={r.route}
                href={r.hash}
                aria-current={route === r.route ? 'page' : undefined}
                className={clsx(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold',
                  route === r.route ? 'bg-brand-soft text-brand-ink' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {r.label}
              </a>
            ))}
          </nav>

          <div className="ms-auto flex flex-wrap items-center gap-2 text-sm">
            <ModelBadges health={health.data} />
            <OnlineBadge />
            <EgressBadge />
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-slate-100">
        <p className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-1.5 text-sm text-slate-700">
          <Info className="mt-1 size-4 shrink-0 text-slate-500" aria-hidden />
          <span>
            <b className="font-semibold">{networkName}:</b> {disclaimer}
          </span>
        </p>
      </div>

      {apiProblem && (
        <div className="bg-red-600 text-white" role="alert">
          <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2 font-semibold">
            <ServerOff className="size-5 shrink-0" aria-hidden />
            {apiProblem}
            {health.down && (
              <span className="text-sm font-normal opacity-90">
                (الواجهة بتستنّى الـ API على <span dir="ltr">127.0.0.1:8000</span>)
              </span>
            )}
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {/* The citizen page stays mounted so its form and result survive a trip to the other pages. */}
        <div hidden={route !== 'citizen'}>
          <Citizen net={net.data} active={route === 'citizen'} />
        </div>
        {route === 'story' && <Story />}
        {route === 'ops' && <Ops net={net.data} />}
        {route === 'public' && <Public />}
        {route === 'privacy' && <Privacy />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="mx-auto max-w-7xl px-4 text-center text-sm text-slate-500">
          Blue Balance · نماذج مفتوحة شغّالة على هالجهاز، بدون نت وبدون جهات خارجية
        </p>
      </footer>
    </div>
  )
}
