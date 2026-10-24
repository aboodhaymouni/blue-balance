// Story page (#/): what Blue Balance is, for a judge or a first-time visitor, in one scroll.
// Every number links to its numbered source at the bottom (data/facts.ts).

import { clsx } from 'clsx'
import {
  ArrowLeft,
  AudioLines,
  BookOpenCheck,
  Calculator,
  CircleCheck,
  CircleSlash,
  Clock,
  Cpu,
  FileText,
  GitBranch,
  Lock,
  MapPin,
  MessageSquareText,
  Scale,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { FACTS, FACT_ORDER, footnote, type FactId } from '../data/facts'

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] as const

// Two illustrative weekly schedules with the published totals (38 h and 9 h). The days and hours are invented.
const WEEK_A: Record<number, [number, number][]> = { 0: [[6, 20]], 3: [[6, 20]], 5: [[8, 18]] }
const WEEK_B: Record<number, [number, number][]> = { 2: [[8, 17]] }

function Fn({ id }: { id: FactId }) {
  return (
    <a href={`#src-${id}`} className="ms-0.5 align-super font-mono text-[0.65em] text-water-700 hover:underline" onClick={(e) => { e.preventDefault(); document.getElementById(`src-${id}`)?.scrollIntoView({ behavior: 'smooth' }) }}>
      [{footnote(id)}]
    </a>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-sm font-medium uppercase tracking-wide text-water-700">{children}</p>
}

function Section({ id, eyebrow, title, lead, children }: { id: string; eyebrow: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-14">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 max-w-3xl text-3xl font-bold text-ink sm:text-4xl">{title}</h2>
      {lead && <p className="mt-3 max-w-3xl text-lg text-ink-2/80">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  )
}

function FactCard({ id, tone = 'water' }: { id: FactId; tone?: 'water' | 'turn' | 'fault' }) {
  const f = FACTS[id]
  return (
    <div className="card flex flex-col gap-2 p-5">
      <p
        className={clsx(
          'num font-mono text-4xl font-medium leading-none',
          tone === 'water' && 'text-water-700',
          tone === 'turn' && 'text-turn',
          tone === 'fault' && 'text-fault',
        )}
        dir="ltr"
      >
        {f.value}
      </p>
      <p className="font-semibold text-ink">
        {f.label}
        <Fn id={id} />
      </p>
      {f.detail && <p className="text-sm text-ink-2/75">{f.detail}</p>}
      {f.status === 'estimate' && <span className="mt-auto w-fit rounded-full bg-turn-soft px-2 py-0.5 text-xs font-semibold text-turn">تقدير رسمي</span>}
    </div>
  )
}

function WeekStrip({ title, hours, week }: { title: string; hours: number; week: Record<number, [number, number][]> }) {
  const on = (d: number, h: number) => (week[d] ?? []).some(([s, e]) => h >= s && h < e)
  return (
    <figure className="card p-5">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-ink">{title}</span>
        <span className="num font-mono text-2xl text-water-700" dir="ltr">
          {hours}h
        </span>
      </figcaption>
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1">
        {DAYS.map((day, d) => (
          <div key={day} className="contents">
            <span className="text-sm text-ink-2/70">{day}</span>
            <div className="grid grid-cols-24 gap-[2px]" dir="ltr" role="img" aria-label={`${day}: ${(week[d] ?? []).map(([s, e]) => `${s}–${e}`).join('، ') || 'ما في مي'}`}>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className={clsx('h-3.5 rounded-[2px]', on(d, h) ? 'bg-water' : 'bg-line')} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex justify-between font-mono text-[11px] text-ink-2/60" dir="ltr">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </p>
    </figure>
  )
}

function Outcome({ tone, icon, title, quote, verdict, reply }: { tone: 'turn' | 'fault'; icon: ReactNode; title: string; quote: string; verdict: string; reply: string }) {
  return (
    <div className={clsx('card overflow-hidden', tone === 'fault' && 'ring-1 ring-fault/30')}>
      <div className={clsx('flex items-center gap-2 px-5 py-3 font-semibold', tone === 'turn' ? 'bg-turn-soft text-turn' : 'bg-fault-soft text-fault')}>
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-3 p-5">
        <p className="rounded-xl bg-mist px-4 py-3 text-ink">«{quote}»</p>
        <p className="font-semibold text-ink">{verdict}</p>
        <p className="rounded-xl rounded-ss-sm bg-water-50 px-4 py-3 text-sm text-ink-2">{reply}</p>
      </div>
    </div>
  )
}

const STEPS: { who: 'model' | 'code' | 'human'; icon: ReactNode; title: string; body: string }[] = [
  { who: 'model', icon: <AudioLines className="size-5" aria-hidden />, title: 'الصوت ← نص', body: 'Whisper بيحوّل رسالة صوتية باللهجة لنص. الصوت بيضل بالذاكرة وبينحذف، وما بيوصل للقرص أبدًا.' },
  { who: 'model', icon: <MessageSquareText className="size-5" aria-hidden />, title: 'النص ← حقول بدليل', body: 'Qwen بيستخرج نوع المشكلة ومن إمتى والمكان. كل حقل لازم يقتبس كلام المواطن بالحرف، والحقل اللي ما إله اقتباس بينحذف.' },
  { who: 'code', icon: <MapPin className="size-5" aria-hidden />, title: 'المكان ← منطقة', body: 'قاموس أماكن حقيقية بيحوّل «جنب دوار التاج» لمنطقة تزويد. النموذج عمره ما بيختار موقع.' },
  { who: 'code', icon: <Clock className="size-5" aria-hidden />, title: 'مقارنة بالجدول', body: 'إذا المنطقة مش دورها، الشكوى «مفسّرة» والمواطن بياخذ موعد دوره فورًا. إذا دورها، الشكوى إشارة.' },
  { who: 'code', icon: <GitBranch className="size-5" aria-hidden />, title: 'تتبّع على شجرة الأنابيب', body: 'معادلة احتمالات بتقارن كل خط مع فرضية «ما في عطل»، وبتأشّر على الخط اللي فوق المناطق اللي بتشتكي.' },
  { who: 'human', icon: <UserCheck className="size-5" aria-hidden />, title: 'المهندس بيعتمد', body: 'ولا عطل بيصير حقيقة بدون كبسة مهندس. بعدها كل مواطن مربوط بياخذ رد من قالب ثابت، مش من النموذج.' },
]

const WHO = {
  model: { label: 'نموذج مفتوح', cls: 'bg-water-100 text-water-700' },
  code: { label: 'كود ورياضيات', cls: 'bg-turn-soft text-turn' },
  human: { label: 'إنسان', cls: 'bg-ink text-white' },
} as const

const EVAL: { engine: string; issue: string; values: string; invented: string; shipped?: boolean }[] = [
  { engine: 'قواعد كلمات (أساس للمقارنة)', issue: '14/20', values: '14/37', invented: '0' },
  { engine: 'qwen2.5:7b لحاله', issue: '14/20', values: '28/37', invented: '3' },
  { engine: 'qwen2.5:7b + تعبئة بالقواعد', issue: '17/20', values: '31/37', invented: '3', shipped: true },
]

export default function Story() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Hero */}
      <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:py-16">
        <div>
          <Eyebrow>Hacktoberfest Hack Day · عمّان 2026 · Open Governance</Eyebrow>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.25] text-ink sm:text-6xl">
            كل «ما في مي»
            <br />
            <span className="text-water">حسّاس.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2/85">
            مياهنا وصلها {FACTS.noWaterCalls.value} شكوى «ما في مي» بسنة وحدة<Fn id="noWaterCalls" />. Blue Balance بيقرأها: نماذج مفتوحة بتفهم اللهجة، وجدول الأدوار بيفرز اللي مش عطل، وشجرة الأنابيب بتأشّر على الخط اللي ضاعت فيه المي.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/report" className="inline-flex items-center gap-2 rounded-xl bg-water px-5 py-3 font-semibold text-white hover:bg-water-700">
              جرّب تبعت شكوى
              <ArrowLeft className="size-5" aria-hidden />
            </a>
            <a href="#/ops" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-ink ring-1 ring-line hover:bg-mist">
              <GitBranch className="size-5" aria-hidden />
              غرفة التحكم
            </a>
          </div>
          <ul className="mt-7 flex flex-wrap gap-2 text-sm">
            {['Apache-2.0', 'Qwen2.5-7B · Apache-2.0', 'Whisper · MIT', '0 طلب لجهات خارجية'].map((t) => (
              <li key={t} className="rounded-full bg-white px-3 py-1 font-mono text-ink-2 ring-1 ring-line" dir="auto">
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* The pipeline in one card: a complaint becomes evidence, a turn check and a segment. */}
        <div className="card relative overflow-hidden p-0" aria-label="مثال: من الشكوى للخط المشتبه">
          <div className="flex items-center gap-2 border-b border-line bg-ink px-5 py-3 text-sm text-white">
            <Scale className="size-4" aria-hidden />
            سجلّ الشكوى
            <span className="ms-auto font-mono text-water-300">BB-7Q2K</span>
          </div>
          <div className="flex flex-col gap-4 p-5">
            <p className="text-lg leading-loose text-ink">
              «<mark className="quote-mark bg-water-100 text-ink">من امبارح</mark> <mark className="quote-mark bg-fault-soft text-ink">ما في مي</mark>{' '}
              <mark className="quote-mark bg-turn-soft text-ink">بالهاشمي الشمالي</mark> و<mark className="quote-mark bg-water-100 text-ink">الجيران كمان</mark>، أنا{' '}
              <span className="rounded bg-ink px-1.5 text-sm text-white">[اسم]</span>»
            </p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['المشكلة', 'ما في مي'],
                ['من إمتى', 'من امبارح'],
                ['المنطقة', 'الهاشمي الشمالي'],
                ['الجدول', 'بدورها هلأ ← إشارة'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-mist px-3 py-2">
                  <dt className="text-ink-2/60">{k}</dt>
                  <dd className="font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-3 rounded-xl bg-fault-soft px-4 py-3">
              <GitBranch className="size-5 shrink-0 text-fault" aria-hidden />
              <p className="text-sm text-ink">
                <b>الخط الرئيسي ٢</b> المغذّي لـ 4 أحياء
              </p>
              <span className="num ms-auto font-mono text-xl text-fault">90%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <Section id="problem" eyebrow="المشكلة" title="الشكاوى بتنعدّ، بس ما بتنقرأ" lead="الأرقام الرسمية بتقول إن الناس بتشتكي كثير، وإن ما حدا بيقيس شو بيوصل فعلًا للبيوت.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FactCard id="noWaterCalls" />
          <FactCard id="per1000" />
          <FactCard id="nrw" tone="fault" />
          <FactCard id="aqaba" tone="fault" />
        </div>
      </Section>

      {/* The insight: water arrives by turns */}
      <Section
        id="turns"
        eyebrow="الفكرة الأساسية"
        title="المي بتيجي بالدور، فـ«ما في مي» إلها معنيين"
        lead={
          <>
            {FACTS.continuous.value} بس من مشتركي عمّان عندهم مي على طول<Fn id="continuous" />. برّا الدور «ما في مي» طبيعي، ووقت الدور عطل. وساعات التزويد المنشورة مجدولة، مش مقاسة<Fn id="scheduled" />.
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <WeekStrip title="مثال: منطقة بمياهنا (حوالي 38 ساعة)" hours={38} week={WEEK_A} />
          <WeekStrip title="مثال: منطقة بالشمال (حوالي 9 ساعات)" hours={9} week={WEEK_B} />
        </div>
        <p className="mt-3 text-sm text-ink-2/60">الأيام والساعات بالرسم توضيحية؛ المجموع الأسبوعي من تقرير الوزارة.</p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <Outcome
            tone="turn"
            icon={<Clock className="size-5" aria-hidden />}
            title="شكوى برّا الدور ← مفسّرة"
            quote="ما في ولا نقطة مي عنا بجبل التاج من امبارح"
            verdict="جبل التاج مش دورها اليوم. هاد مش عطل."
            reply="هاد مش عطل: منطقة جبل التاج مش دورها هلأ. دوركم الجاي يوم الأحد من 06:00 لـ 20:00."
          />
          <Outcome
            tone="fault"
            icon={<TriangleAlert className="size-5" aria-hidden />}
            title="شكوى وقت الدور ← إشارة"
            quote="اليوم دورنا ومن الساعة ٧ ما في مي بالهاشمي الشمالي"
            verdict="الهاشمي الشمالي بدورها هلأ. الشكوى بتدخل الشجرة."
            reply="منطقتكم بدورها هلأ، فعم نفحص إذا في عطل على الخط المغذّي إلها."
          />
        </div>
      </Section>

      {/* How */}
      <Section id="how" eyebrow="كيف بيشتغل" title="الذكاء الاصطناعي للغة، والرياضيات للموقع، والإنسان للقرار" lead="كل خطوة إلها صاحب واضح. النموذج بيقرأ، الكود بيحسب، والمهندس بيقرّر.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className="num grid size-9 place-items-center rounded-full bg-ink font-mono text-white">{i + 1}</span>
                <span className="text-ink-2/70">{s.icon}</span>
                <span className={clsx('ms-auto rounded-full px-2.5 py-0.5 text-xs font-semibold', WHO[s.who].cls)}>{WHO[s.who].label}</span>
              </div>
              <h3 className="text-lg font-bold text-ink">{s.title}</h3>
              <p className="text-ink-2/80">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Open and measured */}
      <Section id="open" eyebrow="مفتوح ومقاس" title="نماذج مفتوحة بتشتغل على لابتوب واحد، وأرقامها منشورة" lead="ولا API مغلق. الكود Apache-2.0، والبيانات CC BY 4.0، وكل نموذج إله رخصته.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-4">
            {[
              { icon: <Cpu className="size-5" aria-hidden />, name: 'Qwen2.5-7B-Instruct', lic: 'Apache-2.0', role: 'استخراج الحقول مع الاقتباس، وكشف الأسماء والأرقام. مقيّد بـ JSON schema، حرارة 0.', where: 'Ollama · RTX 3060' },
              { icon: <AudioLines className="size-5" aria-hidden />, name: 'Whisper large-v3-turbo', lic: 'MIT', role: 'الصوت ← نص باللهجة. الصوت بينحذف بعد التحويل.', where: 'faster-whisper · CUDA' },
            ].map((m) => (
              <div key={m.name} className="card flex flex-col gap-2 p-5">
                <div className="flex items-center gap-2 text-ink">
                  {m.icon}
                  <span className="font-mono font-medium" dir="ltr">
                    {m.name}
                  </span>
                  <span className="ms-auto rounded-full bg-water-100 px-2 py-0.5 font-mono text-xs text-water-700">{m.lic}</span>
                </div>
                <p className="text-ink-2/80">{m.role}</p>
                <p className="font-mono text-xs text-ink-2/60" dir="ltr">
                  {m.where}
                </p>
              </div>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-5 py-3 font-semibold text-ink">
              <BookOpenCheck className="size-5 text-water-700" aria-hidden />
              مقاس اليوم على 20 شكوى اختبار ما شافها البرومبت
            </div>
            <table className="w-full text-start text-sm">
              <thead className="bg-mist text-ink-2/70">
                <tr>
                  <th className="px-4 py-2 text-start font-semibold">المحرّك</th>
                  <th className="px-4 py-2 text-start font-semibold">نوع المشكلة</th>
                  <th className="px-4 py-2 text-start font-semibold">قيم صحيحة</th>
                  <th className="px-4 py-2 text-start font-semibold">حقول مخترعة</th>
                </tr>
              </thead>
              <tbody>
                {EVAL.map((r) => (
                  <tr key={r.engine} className={clsx('border-t border-line', r.shipped && 'bg-water-50 font-semibold')}>
                    <td className="px-4 py-3 text-ink">
                      {r.engine}
                      {r.shipped && <span className="ms-2 rounded-full bg-water px-2 py-0.5 text-xs text-white">المستعمل</span>}
                    </td>
                    <td className="num px-4 py-3 font-mono" dir="ltr">{r.issue}</td>
                    <td className="num px-4 py-3 font-mono" dir="ltr">{r.values}</td>
                    <td className="num px-4 py-3 font-mono" dir="ltr">{r.invented}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-2/60">المنطقة صحيحة 18/18، والمعلومات الشخصية انخفت 2/2. المجموعة صغيرة، فهاي قياس أوّلي مش حكم نهائي.</p>
          </div>
        </div>
      </Section>

      {/* Privacy */}
      <Section id="privacy" eyebrow="الخصوصية بالتصميم" title="البيانات الشخصية بتضل عندنا، وغير الشخصية بتصير بيانات مفتوحة" lead={<>مصمّم على قانون حماية البيانات الشخصية رقم 24 لسنة 2023<Fn id="pdpl" />، وعلى نتيجة إن الناس بتخاف تشتكي<Fn id="fear" />.</>}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [<Lock key="i" className="size-5" aria-hidden />, 'مجهول افتراضيًا', 'بدون حساب ولا رقم تلفون. رمز إيصال بيخلّيك تحذف شكواك.'],
            [<CircleSlash key="i" className="size-5" aria-hidden />, 'الصوت ما بينحفظ', 'بيتحوّل لنص بالذاكرة وبينحذف. ملفات الصوت على القرص: صفر.'],
            [<ShieldCheck key="i" className="size-5" aria-hidden />, 'الأسماء والأرقام بتنخفى', 'النموذج بيكشفها، وقواعد ثابتة بتمسك التلفونات والأرقام الوطنية واللوحات والكنى.'],
            [<FileText key="i" className="size-5" aria-hidden />, 'البيانات العامة مجمّعة', 'أي خانة أقل من 5 شكاوى مخفية، والتصدير CSV مفتوح بدون نصوص.'],
            [<UserCheck key="i" className="size-5" aria-hidden />, 'ملاحظات عن أنابيب، مش اتهامات', 'ولا عطل بيصير حقيقة بدون مهندس، والنموذج ما بيكتب للمواطن.'],
            [<Calculator key="i" className="size-5" aria-hidden />, 'كل إشي محلي', 'الجهة الوحيدة اللي بيحكي معها الخادم هي Ollama على نفس الجهاز.'],
          ].map(([icon, title, body]) => (
            <li key={String(title)} className="card flex gap-3 p-5">
              <span className="mt-0.5 text-water-700">{icon}</span>
              <span>
                <b className="block text-ink">{title}</b>
                <span className="text-ink-2/80">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Honest limits */}
      <Section id="limits" eyebrow="بصراحة" title="شو حقيقي، وشو محاكى">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <p className="mb-3 flex items-center gap-2 font-semibold text-ink">
              <CircleCheck className="size-5 text-water-700" aria-hidden />
              حقيقي وشغّال
            </p>
            <ul className="list-disc space-y-1.5 ps-5 text-ink-2/85">
              <li>النماذج المفتوحة على اللابتوب، بدون أي API مغلق</li>
              <li>فحص الاقتباس، والإخفاء، وفحص الجدول، وتتبّع الشجرة</li>
              <li>الأرقام المقاسة بـ eval/results، والأرقام الرسمية مع مصادرها</li>
            </ul>
          </div>
          <div className="card p-5">
            <p className="mb-3 flex items-center gap-2 font-semibold text-ink">
              <TriangleAlert className="size-5 text-turn" aria-hidden />
              محاكى ومكتوب عليه
            </p>
            <ul className="list-disc space-y-1.5 ps-5 text-ink-2/85">
              <li>شبكة الأنابيب والجداول (أسماء الأحياء حقيقية)</li>
              <li>كل الشكاوى مكتوبة من الفريق، وما فيها بيانات حدا حقيقي</li>
              <li>التتبّع مجرّب على شجرتنا؛ الخطوة الجاية شبكة هيدروليكية عامة (EPANET/WNTR)</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-ink-2/80">
          ونفس الفكرة بتوفّر كهرباء: كل متر مكعب بيوصل بكلّف {FACTS.energy.value} كيلوواط ساعة<Fn id="energy" />، فالمي اللي بتضيع كهرباء ضايعة.
        </p>
      </Section>

      {/* Sources */}
      <section id="sources" className="border-t border-line py-12">
        <Eyebrow>المصادر</Eyebrow>
        <ol className="mt-4 grid gap-2 text-sm">
          {FACT_ORDER.map((id) => {
            const f = FACTS[id]
            return (
              <li key={id} id={`src-${id}`} className="flex scroll-mt-24 gap-3">
                <span className="num w-7 shrink-0 font-mono text-water-700">[{footnote(id)}]</span>
                <span className="text-ink-2/85">
                  {f.source.publisher}، {f.source.date}.{' '}
                  <a href={f.source.url} target="_blank" rel="noreferrer" className="break-all text-water-700 underline-offset-2 hover:underline" dir="ltr">
                    {new URL(f.source.url).hostname}
                  </a>
                  {f.status === 'estimate' && <span className="ms-2 text-turn">(تقدير)</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
