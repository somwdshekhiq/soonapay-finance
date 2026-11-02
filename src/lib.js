import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, useCallback, createContext, useContext } from 'react'

export const supabase = createClient(
  'https://zetoyopgfotjuwxfoenb.supabase.co',
  'sb_publishable_8HOEQbef6GEBtJu1iJMMxg_DhuLbb5R'
)

// ---------- Session / role / language context ----------
export const AppCtx = createContext({ role: 'viewer', lang: 'en', t: (k) => k })
export const useApp = () => useContext(AppCtx)

// ---------- Data hook ----------
export function useQuery(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true })
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true }))
    try {
      const data = await fn()
      set({ data, error: null, loading: false })
    } catch (e) {
      set({ data: null, error: e.message || String(e), loading: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run }
}

export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

// Fetch every row of a view/table in pages of 1000 (PostgREST limit)
export async function all(table, select = '*', build = (x) => x) {
  let out = [], from = 0
  for (;;) {
    const page = await q(build(supabase.from(table).select(select)).range(from, from + 999))
    out = out.concat(page)
    if (page.length < 1000) return out
    from += 1000
  }
}

// ---------- Formatting ----------
export const n = (v) => (v === null || v === undefined ? 0 : Number(v))
export function usd(v, dp = 2) {
  const x = n(v)
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  return (x < 0 ? '−$' : '$') + s
}
// Customer-money gap forecast: how many 14-day periods the Company reserve needs to cover the gap
export function gapForecast(gap, perPeriod) {
  if (!(gap > 0)) return null
  if (!(perPeriod > 0)) return { periods: Infinity, months: Infinity }
  const periods = Math.ceil(gap / perPeriod)
  return { periods, months: Math.round((periods * 14) / 30.4 * 10) / 10 }
}
export const int = (v) => n(v).toLocaleString('en-US')
export const pct = (v, dp = 1) => (v === null || v === undefined ? '—' : n(v).toFixed(dp) + '%')
export function day(v, lang = 'en') {
  if (!v) return '—'
  return new Date(v).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}
export const monthLabel = (v, lang = 'en') =>
  new Date(v).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', year: '2-digit' })

// ---------- Translations ----------
export const T = {
  en: {
    appName: 'SoonaPay', finance: 'Finance', dashboard: 'Dashboard', statistics: 'Statistics', distributions: 'Distributions',
    financePartners: 'Finance & partners', expenses: 'Expenses', promos: 'Promos & redemptions', rules: 'Rules', importFiles: 'Import files',
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password', viewOnly: 'View only', admin: 'Admin',
    currentPeriod: 'Current period', netProfit: 'Net profit this period', outstandingFinance: 'Outstanding finance',
    companyAccount: 'Company account', nextDistribution: 'Next distribution', draft: 'Draft', approved: 'Approved', paid: 'Paid',
    profitDistributedByMonth: 'Profit distributed by month', needsAttention: 'Needs attention',
    unpriced: 'transactions have no matching rule and count as $0 profit', waitingCards: 'free cards still waiting to be redeemed',
    moneyHeld: 'Money held & provider balances', customerWallets: 'Money held for customers (wallets)',
    customerWalletsNote: 'Owed to customers · not company money · wallets only, card balances excluded',
    providerBalance: 'Provider balance', balance: 'Balance', asOf: 'As of', updateBalances: 'Update balances', save: 'Save', cancel: 'Cancel',
    notEnteredYet: 'Not entered yet', moneyInOut: 'Money In & Money Out', moneyIn: 'Money In', moneyOut: 'Money Out',
    gateways: 'Gateways', flow: 'Flow', gateway: 'Gateway', transactions: 'Transactions', volume: 'Volume', share: 'Share',
    profit: 'Profit', margin: 'Margin', customers: 'Customers', allCustomers: 'All customers', newCustomers: 'New, last 30 days',
    activeCustomers: 'Active (60 days)', goneQuiet: 'Gone quiet', top10: 'Top 10 funders bring', top50: 'top 50 bring',
    avgFunded: 'Average funded', median: 'median', customer: 'Customer', status: 'Status', active: 'Active', new: 'New',
    productMix: 'Profit by product line, per quarter', productLine: 'Product line', range: 'Range', allTime: 'All time',
    howCalculated: 'How this period is calculated', grossProfit: 'Gross profit from transactions',
    lessPromos: 'Less promo, testing & redemption costs', adjustments: 'Adjustments & corrections', financeRepayment: 'Finance repayment',
    toDistribute: 'To distribute', splitFive: 'Split equally 5 ways', each: 'each', payouts: 'Payouts', party: 'Party',
    repayment: 'Repayment', total: 'Total', recalculate: 'Recalculate', approveLock: 'Approve & lock period',
    earlierPeriods: 'Earlier periods', periodEnding: 'Period ending', repaymentRate: 'Repayment rate', eachOfFive: 'Each of 5',
    cappedNote: 'Rate × net profit, capped at what is still owed', openNext: 'Open next period', noDraft: 'No open period.',
    lender: 'Lender', totalFinanced: 'Total financed', repaidSoFar: 'Repaid so far', stillOwed: 'Still owed',
    date: 'Date', entry: 'Entry', amount: 'Amount', owedAfter: 'Owed after', partnerStatements: 'Partner statements',
    profitShare: 'Profit share', category: 'Category', description: 'Description', paidFrom: 'Paid from',
    addedToFinance: 'Added to finance', newExpense: 'New expense', currency: 'Currency', inUsd: 'In USD',
    monthlySalaries: 'Monthly salaries', confirmPayment: 'Confirm payment', recentExpenses: 'Recent expenses',
    redeemed: 'Redeemed', waiting: 'Waiting', costSoFar: 'Cost so far', perCard: 'per card', waitingList: 'Waiting list',
    markDone: 'Mark done', note: 'Note', addEmail: 'Add customer email', add: 'Add', list: 'List',
    feeRules: 'Fee & profit rules', provider: 'Provider', txnType: 'Transaction type', method: 'Method',
    fixedProfit: 'Fixed profit', profitPct: 'Profit %', fixedCost: 'Fixed cost', costPct: 'Cost %', extraCost: 'Extra cost',
    validFrom: 'Valid from', validTo: 'Valid to', open: 'Open', loading: 'Loading…', error: 'Something went wrong',
    importSoon: 'File import with a slot per provider arrives in the next release. Until then, history is loaded up to 1 Nov 2026.',
    language: 'العربية', onlyAdmin: 'Only the admin can change data.', saved: 'Saved', since: 'since',
    notMember: 'Your login works, but it is not linked to SoonaPay Finance yet. Ask the admin to add you.',
    companyNote: 'In: the Company share of each distribution. Out: expenses paid from the Company account.',
    in: 'In', out: 'Out',
    importSub: 'One slot per provider · fill the ones you have, check the combined preview, then save all together',
    chooseFile: 'Choose file (CSV / Excel)', lastImport: 'Latest transaction', mapColumns: 'Some columns were not found in this file. Pick them once:',
    field_ref: 'Reference', field_time: 'Date & time', field_amount: 'Amount', saveMapping: 'Use these columns (remembered next time)',
    outcome_new: 'new', outcome_duplicate: 'already imported', outcome_other: 'other / test · $0', outcome_test: 'test account',
    outcome_needs_rule: 'needs a rule', outcome_invalid: 'missing date/amount', newCustomersShort: 'new customers',
    combinedPreview: 'Combined preview · files', show_attention: 'Needs attention', show_new: 'New', show_other: 'Other', show_duplicate: 'Already imported', show_all: 'All',
    legendPriced: 'Priced by a rule', legendOther: 'Other / test / already imported · $0', legendNeedsRule: 'Never seen · needs a decision',
    nothingHere: 'Nothing in this view', showingFirst: 'Showing first', profitInFiles: 'Profit in new rows', clear: 'Clear',
    saveRows: 'Save rows', recentImports: 'Recent imports', file: 'File',
    thisPeriod: 'This period', dateRange: 'Date range', from: 'From', to: 'To', apply: 'Apply', inRange: 'in range', redeemedList: 'Redeemed', walletsHeading: 'Customer money vs wallet balances', walletCol: 'Wallet', walletsTotal: 'Total in our wallets',
    customerOwed: 'Owed to customers (user balances)', gapShort: 'Shortfall (customer money in use)', surplus: 'Covered — surplus',
    gapForecastText: 'At the current Company reserve of {amt} per period, the shortfall closes in about {p} periods (~{m} months).',
    gapNoReserve: 'With no Company reserve the shortfall does not close.', companyRate: 'Company reserve rate', companyReserve: 'Company reserve',
    companyReserveNote: 'of what is left after repayment · goes to the Company account', splitFour: 'Split equally among the 4 founders',
    rate20Note: '20% = same as the old equal split (5 shares)', gapCloses: 'Shortfall now', closesIn: 'closes in about {p} periods (~{m} months) at this rate',
    customRate: 'Custom %', openPeriod: 'Open period', viewPayments: 'View', approvedOn: 'approved', paidOn: 'Paid on', reference: 'Reference', txnsInPeriod: 'Profit from transactions dated in this period', txnsInPeriodHint: 'For periods paid from Excel, the paid amount followed Excel\'s running total, so this breakdown can differ slightly from the net above.', openPeriodHint: 'This is the current period. It keeps counting new transactions until you press Approve & lock at the end of the period; then it is frozen and the next period opens.', removeFile: 'Remove file', markOther: 'Mark as Other · $0', cancelledList: 'Removed', removeFromList: 'Remove', restore: 'Restore', redeemedOn: 'Redeemed on', undoDone: 'Undo',
    feeProfitPct: 'Fee as profit', feeCostPct: 'Fee as cost', addRule: 'Add fee rule', changeFromDate: 'Change from a date', correctRule: 'Correct this rule',
    changeHint: 'Safe way to change a price: the current rule ends at the chosen date/time and the new values apply from then. Past transactions keep their profit.',
    correctHint: 'Use only to fix a typing mistake: the rule is changed for its whole validity. Open-period transactions are re-priced; locked periods are not touched.',
    addHint: 'A new rule applies from its start date to transactions of that provider and type (and method, if chosen).',
    anyMethod: 'Any method', rule: 'Rule', newPriceFrom: 'New price applies from', editTypeRule: 'Edit type rule', addTypeRule: 'Add type rule',
    typeRuleHint: 'Type rules decide what a provider row is. Checked by # (lowest first); the first match wins. Use % as a wildcard, e.g. %card funding%.',
    matchOn: 'Match on', categoryCol: 'Category column', typeCol: 'Type column', contains: 'Text (use % as wildcard)', direction: 'Direction', any: 'Any',
    priority: 'Order #', last: 'Last', allProviders: 'All providers', activeNow: 'Active now', upcoming: 'Upcoming', ended: 'Ended', all: 'All',
    search: 'Search', searchHint: 'Type, method, note…', feeRulesTab: 'Fee rules', typeRulesTab: 'Type rules', base: 'Base rule', correct: 'Correct',
    endRule: 'End now', edit: 'Edit', unknownType: 'Not recognised',
    unpricedHint: 'Rows that are not recognised (add a type rule) or have no fee rule (add a fee rule). After saving a rule, open-period rows are re-priced automatically.'
  },
  ar: {
    appName: 'سونا باي', finance: 'المالية', dashboard: 'لوحة المتابعة', statistics: 'الإحصائيات', distributions: 'توزيع الأرباح',
    financePartners: 'التمويل والشركاء', expenses: 'المصروفات', promos: 'العروض والاستردادات', rules: 'القواعد', importFiles: 'الاستيراد',
    signIn: 'تسجيل الدخول', signOut: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور', viewOnly: 'عرض فقط', admin: 'مدير',
    currentPeriod: 'الفترة الحالية', netProfit: 'صافي ربح الفترة', outstandingFinance: 'التمويل المتبقي',
    companyAccount: 'حساب الشركة', nextDistribution: 'التوزيع القادم', draft: 'مسودة', approved: 'معتمدة', paid: 'مدفوعة',
    profitDistributedByMonth: 'الأرباح الموزعة شهرياً', needsAttention: 'يحتاج إلى متابعة',
    unpriced: 'معاملة بدون قاعدة مطابقة وتُحسب بربح صفر', waitingCards: 'بطاقة مجانية ما زالت في انتظار الاسترداد',
    moneyHeld: 'أموال العملاء وأرصدة المزودين', customerWallets: 'أموال العملاء المحتفظ بها (المحافظ)',
    customerWalletsNote: 'مستحقة للعملاء · ليست أموال الشركة · المحافظ فقط بدون أرصدة البطاقات',
    providerBalance: 'رصيد المزود', balance: 'الرصيد', asOf: 'بتاريخ', updateBalances: 'تحديث الأرصدة', save: 'حفظ', cancel: 'إلغاء',
    notEnteredYet: 'لم يُدخل بعد', moneyInOut: 'الإيداع والسحب', moneyIn: 'الإيداع', moneyOut: 'السحب',
    gateways: 'بوابات الدفع', flow: 'الاتجاه', gateway: 'البوابة', transactions: 'المعاملات', volume: 'الحجم', share: 'الحصة',
    profit: 'الربح', margin: 'الهامش', customers: 'العملاء', allCustomers: 'كل العملاء', newCustomers: 'جدد خلال 30 يوماً',
    activeCustomers: 'نشطون (60 يوماً)', goneQuiet: 'متوقفون', top10: 'أعلى 10 عملاء يمثلون', top50: 'وأعلى 50 يمثلون',
    avgFunded: 'متوسط الإيداع', median: 'الوسيط', customer: 'العميل', status: 'الحالة', active: 'نشط', new: 'جديد',
    productMix: 'الربح حسب خط المنتج لكل ربع سنة', productLine: 'خط المنتج', range: 'الفترة', allTime: 'كل الفترات',
    howCalculated: 'طريقة حساب هذه الفترة', grossProfit: 'إجمالي الربح من المعاملات',
    lessPromos: 'ناقص تكاليف العروض والتجربة والاسترداد', adjustments: 'التسويات والتصحيحات', financeRepayment: 'سداد التمويل',
    toDistribute: 'المبلغ القابل للتوزيع', splitFive: 'يُقسم بالتساوي على 5', each: 'لكل', payouts: 'المدفوعات', party: 'الطرف',
    repayment: 'السداد', total: 'الإجمالي', recalculate: 'إعادة الحساب', approveLock: 'اعتماد وإقفال الفترة',
    earlierPeriods: 'الفترات السابقة', periodEnding: 'نهاية الفترة', repaymentRate: 'نسبة السداد', eachOfFive: 'لكل من الخمسة',
    cappedNote: 'النسبة × صافي الربح، بحد أقصى المتبقي من التمويل', openNext: 'فتح الفترة التالية', noDraft: 'لا توجد فترة مفتوحة.',
    lender: 'المموّل', totalFinanced: 'إجمالي التمويل', repaidSoFar: 'المسدد حتى الآن', stillOwed: 'المتبقي',
    date: 'التاريخ', entry: 'البيان', amount: 'المبلغ', owedAfter: 'المتبقي بعده', partnerStatements: 'كشوف الشركاء',
    profitShare: 'حصة الربح', category: 'التصنيف', description: 'الوصف', paidFrom: 'مدفوع من',
    addedToFinance: 'يُضاف إلى التمويل', newExpense: 'مصروف جديد', currency: 'العملة', inUsd: 'بالدولار',
    monthlySalaries: 'الرواتب الشهرية', confirmPayment: 'تأكيد الدفع', recentExpenses: 'آخر المصروفات',
    redeemed: 'تم الاسترداد', waiting: 'في الانتظار', costSoFar: 'التكلفة حتى الآن', perCard: 'للبطاقة', waitingList: 'قائمة الانتظار',
    markDone: 'تم', note: 'ملاحظة', addEmail: 'إضافة بريد عميل', add: 'إضافة', list: 'القائمة',
    feeRules: 'قواعد الرسوم والأرباح', provider: 'المزود', txnType: 'نوع المعاملة', method: 'الطريقة',
    fixedProfit: 'ربح ثابت', profitPct: 'نسبة الربح', fixedCost: 'تكلفة ثابتة', costPct: 'نسبة التكلفة', extraCost: 'تكلفة إضافية',
    validFrom: 'ساري من', validTo: 'ساري إلى', open: 'مفتوح', loading: 'جارٍ التحميل…', error: 'حدث خطأ',
    importSoon: 'استيراد الملفات بخانة لكل مزود سيكون في الإصدار القادم. البيانات التاريخية محمّلة حتى 1 نوفمبر 2026.',
    language: 'English', onlyAdmin: 'التعديل متاح للمدير فقط.', saved: 'تم الحفظ', since: 'منذ',
    notMember: 'تسجيل الدخول يعمل لكن الحساب غير مرتبط بسونا باي المالية بعد. اطلب من المدير إضافتك.',
    companyNote: 'الداخل: حصة الشركة من كل توزيع. الخارج: المصروفات المدفوعة من حساب الشركة.',
    in: 'داخل', out: 'خارج',
    importSub: 'خانة لكل مزود · ارفع الملفات المتوفرة، راجع المعاينة المجمعة، ثم احفظ الكل',
    chooseFile: 'اختر ملفاً (CSV / Excel)', lastImport: 'آخر معاملة', mapColumns: 'بعض الأعمدة غير موجودة في هذا الملف. حددها مرة واحدة:',
    field_ref: 'المرجع', field_time: 'التاريخ والوقت', field_amount: 'المبلغ', saveMapping: 'استخدم هذه الأعمدة (تُحفظ للمرات القادمة)',
    outcome_new: 'جديدة', outcome_duplicate: 'مستوردة سابقاً', outcome_other: 'أخرى / تجربة · $0', outcome_test: 'حساب تجربة',
    outcome_needs_rule: 'تحتاج قاعدة', outcome_invalid: 'تاريخ/مبلغ ناقص', newCustomersShort: 'عملاء جدد',
    combinedPreview: 'المعاينة المجمعة · ملفات', show_attention: 'يحتاج متابعة', show_new: 'جديدة', show_other: 'أخرى', show_duplicate: 'مستوردة سابقاً', show_all: 'الكل',
    legendPriced: 'مسعّرة بقاعدة', legendOther: 'أخرى / تجربة / مستوردة · $0', legendNeedsRule: 'غير معروفة · تحتاج قرار',
    nothingHere: 'لا يوجد شيء هنا', showingFirst: 'عرض أول', profitInFiles: 'الربح في المعاملات الجديدة', clear: 'مسح',
    saveRows: 'حفظ المعاملات', recentImports: 'آخر عمليات الاستيراد', file: 'الملف',
    thisPeriod: 'هذه الفترة', dateRange: 'نطاق تاريخ', from: 'من', to: 'إلى', apply: 'تطبيق', inRange: 'في النطاق', redeemedList: 'تم الاسترداد', walletsHeading: 'أموال العملاء مقابل أرصدة المحافظ', walletCol: 'المحفظة', walletsTotal: 'الإجمالي في محافظنا',
    customerOwed: 'المستحق للعملاء (أرصدة المستخدمين)', gapShort: 'العجز (أموال عملاء مستخدمة)', surplus: 'مغطى — فائض',
    gapForecastText: 'باحتياطي الشركة الحالي {amt} لكل فترة، يُغلق العجز خلال حوالي {p} فترة (~{m} شهر).',
    gapNoReserve: 'بدون احتياطي للشركة لن يُغلق العجز.', companyRate: 'نسبة احتياطي الشركة', companyReserve: 'احتياطي الشركة',
    companyReserveNote: 'من المتبقي بعد السداد · يذهب إلى حساب الشركة', splitFour: 'يُقسم بالتساوي على الشركاء الأربعة',
    rate20Note: '20% = نفس التقسيم المتساوي القديم (5 حصص)', gapCloses: 'العجز الحالي', closesIn: 'يُغلق خلال حوالي {p} فترة (~{m} شهر) بهذه النسبة',
    customRate: 'نسبة أخرى %', openPeriod: 'فترة مفتوحة', viewPayments: 'عرض', approvedOn: 'اعتُمدت', paidOn: 'تاريخ الدفع', reference: 'المرجع', txnsInPeriod: 'الربح من المعاملات المؤرخة في هذه الفترة', txnsInPeriodHint: 'الفترات المدفوعة من الإكسل اعتمدت على المجموع التراكمي، لذلك قد يختلف هذا التفصيل قليلاً عن الصافي أعلاه.', openPeriodHint: 'هذه هي الفترة الحالية. تستمر في احتساب المعاملات الجديدة حتى تضغط اعتماد وإقفال الفترة في نهايتها، ثم تُجمّد وتُفتح الفترة التالية.', removeFile: 'إزالة الملف', markOther: 'اعتبارها أخرى · $0', cancelledList: 'محذوفة', removeFromList: 'حذف', restore: 'استرجاع', redeemedOn: 'تاريخ الاسترداد', undoDone: 'تراجع',
    feeProfitPct: 'الرسوم كربح', feeCostPct: 'الرسوم كتكلفة', addRule: 'إضافة قاعدة رسوم', changeFromDate: 'تغيير ابتداءً من تاريخ', correctRule: 'تصحيح هذه القاعدة',
    changeHint: 'الطريقة الآمنة لتغيير السعر: تنتهي القاعدة الحالية في التاريخ والوقت المحدد وتُطبق القيم الجديدة بعده. تبقى أرباح المعاملات السابقة كما هي.',
    correctHint: 'للتصحيح فقط عند خطأ في الإدخال: تتغير القاعدة طوال مدة سريانها. يُعاد تسعير معاملات الفترة المفتوحة ولا تتأثر الفترات المقفلة.',
    addHint: 'القاعدة الجديدة تُطبق من تاريخ بدايتها على معاملات هذا المزود وهذا النوع (والطريقة إن حُددت).',
    anyMethod: 'أي طريقة', rule: 'القاعدة', newPriceFrom: 'السعر الجديد يسري من', editTypeRule: 'تعديل قاعدة النوع', addTypeRule: 'إضافة قاعدة نوع',
    typeRuleHint: 'قواعد النوع تحدد طبيعة كل سطر من ملف المزود. تُفحص حسب الترتيب (الأقل أولاً) وأول تطابق يُعتمد. استخدم % كحرف بدل، مثل %card funding%.',
    matchOn: 'المطابقة على', categoryCol: 'عمود التصنيف', typeCol: 'عمود النوع', contains: 'النص (استخدم % كبديل)', direction: 'الاتجاه', any: 'أي',
    priority: 'الترتيب', last: 'الأخير', allProviders: 'كل المزودين', activeNow: 'سارية الآن', upcoming: 'قادمة', ended: 'منتهية', all: 'الكل',
    search: 'بحث', searchHint: 'النوع، الطريقة، ملاحظة…', feeRulesTab: 'قواعد الرسوم', typeRulesTab: 'قواعد النوع', base: 'القاعدة الأساسية', correct: 'تصحيح',
    endRule: 'إنهاء الآن', edit: 'تعديل', unknownType: 'غير معروف',
    unpricedHint: 'معاملات غير معروفة (أضف قاعدة نوع) أو بدون قاعدة رسوم (أضف قاعدة رسوم). بعد حفظ القاعدة يُعاد تسعير معاملات الفترة المفتوحة تلقائياً.'
  }
}
