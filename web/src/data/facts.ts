// Every number on the story page comes from here, with its source. `status` says how far to trust it:
// "official" = published by a ministry, utility or UN body; "estimate" = an official estimate or one incident;
// "derived" = our own arithmetic on official figures. Re-check the links before quoting them on stage.

export type FactStatus = 'official' | 'estimate' | 'derived'

export interface Source {
  publisher: string
  date: string
  url: string
}

export interface Fact {
  id: string
  value: string
  label: string
  detail?: string
  status: FactStatus
  source: Source
}

export const FACTS = {
  noWaterCalls: {
    id: 'noWaterCalls',
    value: '207,948',
    label: 'شكوى «ما في مي» وصلت مركز شكاوى مياهنا بسنة 2025',
    detail: 'وفوقها 103,488 شكوى كسر خطوط بنفس السنة.',
    status: 'official',
    source: { publisher: 'مياهنا، التقرير السنوي 2025', date: '2026', url: 'https://www.miyahuna.com.jo/ebv4.0/root_storage/ar/eb_list_page/annual_report_arabic-0.pdf' },
  },
  per1000: {
    id: 'per1000',
    value: '255',
    label: 'شكوى «ما في مي» لكل 1,000 مشترك بالسنة بمناطق مياهنا',
    detail: '252 باليرموك و179 بالعقبة (2024).',
    status: 'official',
    source: { publisher: 'وحدة رقابة أداء المرافق، وزارة المياه، تقرير 2024', date: '2025', url: 'https://www.mwi.gov.jo/EBV4.0/Root_Storage/AR/EB_Info_Page/Report_2024.pdf' },
  },
  continuous: {
    id: 'continuous',
    value: '2.3%',
    label: 'بس من مشتركي عمّان عندهم مي على مدار الساعة',
    detail: 'والشبكة كانت مضغوطة حوالي 21% من الوقت (2022).',
    status: 'official',
    source: { publisher: 'مؤشرات أداء مياهنا، عمّان 2022 (بوابة البيانات المفتوحة)', date: '2022', url: 'https://opendata.gov.jo/dataset/MIGRATED-2523-2022/resource/d11f53fa-412e-4fcf-a853-50ceef857715/download/kpis_amman_2022.xlsx.xls' },
  },
  scheduled: {
    id: 'scheduled',
    value: '38 / 9',
    label: 'ساعة تزويد بالأسبوع: حوالي 38 بمناطق مياهنا، وحوالي 9 بالشمال',
    detail: 'هاي ساعات مجدولة، مش مقاسة. الوحدة نفسها بتقول إن ذروة الشكاوى بالصيف بتدلّ إن بيوت بتاخذ أقل من الجدول.',
    status: 'official',
    source: { publisher: 'وحدة رقابة أداء المرافق، تقرير 2024', date: '2025', url: 'https://www.mwi.gov.jo/EBV4.0/Root_Storage/AR/EB_Info_Page/Report_2024.pdf' },
  },
  nrw: {
    id: 'nrw',
    value: '41%',
    label: 'من المي المزوّدة ما بتنفوتر (فاقد)',
    detail: 'الهدف الوطني 25% بحلول 2040. التقييم الرسمي لـ 2024/2025 كان 45%.',
    status: 'official',
    source: { publisher: 'بترا، بيان وزارة المياه', date: '2026-08-24', url: 'https://petra.gov.jo/en/news/water-loss-cut-to-41-exceeding-target' },
  },
  aqaba: {
    id: 'aqaba',
    value: '3,500 م³',
    label: 'باليوم كانت تنسحب من خطوط 8 و16 إنش بالعقبة',
    detail: 'انكشفت «بعد ما انبلّغ عن انقطاعات وتوزيع مش منتظم». الكمية تقدير الوزارة لحادثة وحدة.',
    status: 'estimate',
    source: { publisher: 'بترا', date: '2026-07-21', url: 'https://petra.gov.jo/GetSimple/index.php/en/news/authorities-foil-major-water-theft-operation-in-aqaba-arrest-suspect' },
  },
  fear: {
    id: 'fear',
    value: 'خوف',
    label: 'سبب قلّة استعمال قنوات الشكاوى الحكومية',
    detail: '«الخوف وقلّة الثقة بآلية معالجة الشكاوى»، حسب شراكة الحكومة المفتوحة.',
    status: 'official',
    source: { publisher: 'Open Government Partnership، التزام JO0068', date: '2023', url: 'https://www.opengovpartnership.org/members/jordan/commitments/JO0068/' },
  },
  energy: {
    id: 'energy',
    value: '3.44',
    label: 'كيلوواط ساعة لكل متر مكعب مي بيوصل (2021)',
    detail: 'قطاع المياه أكبر مستهلك منفرد للكهرباء بالأردن، حوالي 10% منها. المي الضايعة كهرباء ضايعة.',
    status: 'official',
    source: { publisher: 'وزارة المياه، سياسة الطاقة لقطاع المياه 2023–2040', date: '2023', url: 'https://mwi.gov.jo/ebv4.0/root_storage/ar/eb_list_page/the_water_sectors_energy_policy.pdf' },
  },
  pdpl: {
    id: 'pdpl',
    value: '24/2023',
    label: 'قانون حماية البيانات الشخصية، نافذ من 17 آذار 2024',
    detail: 'موافقة مسبقة وواضحة ومكتوبة بغرض ومدة محدّدين، وقيود على نقل البيانات لبرّا.',
    status: 'official',
    source: { publisher: 'Clyde & Co، ملخص القانون', date: '2023-10', url: 'https://www.clydeco.com/en/insights/2023/10/jordan-issues-first-personal-data-protection-law' },
  },
} satisfies Record<string, Fact>

export type FactId = keyof typeof FACTS

/** Footnote order on the story page. */
export const FACT_ORDER: FactId[] = ['noWaterCalls', 'per1000', 'continuous', 'scheduled', 'nrw', 'aqaba', 'fear', 'energy', 'pdpl']

export function footnote(id: FactId): number {
  return FACT_ORDER.indexOf(id) + 1
}
