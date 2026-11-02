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
    financePartners: 'Finance & partners', expenses: 'Expenses', promos: 'Promos & redemptions', rules: 'Rules', importFiles: 'Import',
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email', password: 'Password', viewOnly: 'View only', admin: 'Admin',
    currentPeriod: 'Current period', netProfit: 'Net profit this period', outstandingFinance: 'Outstanding finance',
    companyAccount: 'Company account', nextDistribution: 'Next distribution', draft: 'Draft', approved: 'Approved', paid: 'Paid',
    profitDistributedByMonth: 'Profit distributed by month', needsAttention: 'Needs attention',
    unpriced: 'transactions have no matching rule and count as $0 profit', waitingCards: 'free cards still waiting to be redeemed',
    moneyHeld: 'Money held & provider balances', customerWallets: 'Money held for customers (wallets)',
    customerWalletsNote: 'Owed to customers · not company money · wallets only, card balances excluded',
    providerBalance: 'Provider balance', balance: 'Balance', asOf: 'As of', updateBalances: 'Update balances', save: 'Save', cancel: 'Cancel',
    notEnteredYet: 'Not entered yet', moneyInOut: 'Money In & Money Out by month', moneyIn: 'Money In', moneyOut: 'Money Out',
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
    in: 'In', out: 'Out'
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
    notEnteredYet: 'لم يُدخل بعد', moneyInOut: 'الإيداع والسحب شهرياً', moneyIn: 'الإيداع', moneyOut: 'السحب',
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
    in: 'داخل', out: 'خارج'
  }
}
