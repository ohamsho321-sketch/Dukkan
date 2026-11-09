import { dayKey, type Data } from './data'
import type { FiscalYear, SaleLine } from '../types'

export type DateRange = { from: string; to: string }
export const periods = { today: 'اليوم', yesterday: 'أمس', week: 'آخر 7 أيام', month: 'آخر 30 يوماً', currentMonth: 'الشهر الحالي', previousMonth: 'الشهر السابق', fiscal: 'السنة المالية الحالية', custom: 'فترة مخصصة' }
export type Period = keyof typeof periods
const DAY = 86400000
export function dateNumber(value: string): number {
  const n = Date.parse(value + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value) throw new Error('أدخل تاريخاً صحيحاً')
  return n
}
export function recordDay(value: string): string {
  try { dateNumber(value.slice(0, 10)); return dayKey(value) } catch { return '' }
}
export const shiftDay = (value: string, days: number) => new Date(dateNumber(value) + days * DAY).toISOString().slice(0, 10)
export function validateRange(range: DateRange): DateRange {
  if (dateNumber(range.to) < dateNumber(range.from)) throw new Error('تاريخ البداية يجب ألا يتجاوز النهاية')
  if (dateNumber(range.to) - dateNumber(range.from) > 3660 * DAY) throw new Error('اختر فترة لا تتجاوز عشر سنوات')
  return range
}
export function resolveRange(period: Period, today: string, years: FiscalYear[], custom?: DateRange): DateRange {
  dateNumber(today)
  const first = today.slice(0, 7) + '-01'
  switch (period) {
    case 'today': return { from: today, to: today }
    case 'yesterday': return { from: shiftDay(today, -1), to: shiftDay(today, -1) }
    case 'week': return { from: shiftDay(today, -6), to: today }
    case 'month': return { from: shiftDay(today, -29), to: today }
    case 'currentMonth': return { from: first, to: today }
    case 'previousMonth': { const to = shiftDay(first, -1); return { from: to.slice(0, 7) + '-01', to } }
    case 'fiscal': { const y = years.find(y => y.startDate <= today && y.endDate >= today); if (!y) throw new Error('لا توجد سنة مالية تغطي اليوم'); return { from: y.startDate, to: today } }
    case 'custom': if (custom) return validateRange(custom); throw new Error('حدد بداية الفترة ونهايتها')
    default: throw new Error('الفترة غير صالحة')
  }
}
export function previousRange(range: DateRange): DateRange {
  validateRange(range)
  const days = (dateNumber(range.to) - dateNumber(range.from)) / DAY + 1
  return { from: shiftDay(range.from, -days), to: shiftDay(range.from, -1) }
}
export function exact(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('تجاوز مجموع القيم نطاق الدقة الآمن؛ اختر فترة أقصر')
  return value
}
const add = (a: number, b: number) => exact(a + b)
const total = <T,>(rows: T[], value: (r: T) => number) => rows.reduce((sum, r) => add(sum, value(r)), 0)
export const historicalCost = (line: SaleLine) => line.batchAllocations ? total(line.batchAllocations, a => exact(a.quantity * a.unitCost)) : exact(line.qty * line.cost)
export const percentageChange = (current: number, previous: number): number | null => previous > 0 ? (current - previous) / previous * 100 : null
export type Destination = 'pos' | 'sales' | 'products' | 'inventory' | 'customers' | 'suppliers' | 'purchases' | 'expenses' | 'reports' | 'settings'
export type Insight = { id: string; priority: 'information' | 'opportunity' | 'warning' | 'critical'; text: string; rule: string; destination: Destination }
export type SeriesPoint = { key: string; sales: number; cost: number | null; profit: number | null; count: number }
export type Ranking = { id: string; name: string; quantity: number; revenue: number; profit: number }

// Read-only, single-pass aggregation of the authoritative local snapshot. Never reads current product cost for historical sales.
export function calculateDashboard(data: Data, range: DateRange, today: string, grouping: 'daily' | 'weekly' | 'monthly' = 'daily') {
  validateRange(range); dateNumber(today)
  const previous = previousRange(range)
  const inside = (date: string, r = range) => { const key = recordDay(date); return Boolean(key && key >= r.from && key <= r.to) }
  const rows = data.sales.filter(s => inside(s.date)), prior = data.sales.filter(s => inside(s.date, previous))
  const returned = data.saleReturns.filter(r => inside(r.date)), priorReturned = data.saleReturns.filter(r => inside(r.date, previous))
  const revenue = exact(total(rows, s => s.total) - total(returned, r => r.total)), previousRevenue = exact(total(prior, s => s.total) - total(priorReturned, r => r.total))
  const costs = (sales: typeof rows, returns: typeof returned) => sales.every(s => s.lines?.length) ? exact(total(sales, s => total(s.lines!, historicalCost)) - total(returns, r => total(r.lines, historicalCost))) : null
  const cost = costs(rows, returned), previousCost = costs(prior, priorReturned)
  const grossProfit = cost === null ? null : exact(revenue - cost)
  const margin = revenue > 0 && grossProfit !== null ? grossProfit / revenue * 100 : null
  const previousMargin = previousRevenue > 0 && previousCost !== null ? (previousRevenue - previousCost) / previousRevenue * 100 : null
  const expenses = total(data.expenses.filter(e => inside(e.date)), e => e.amount)
  const losses = total(data.inventoryLosses.filter(e => inside(e.date)), e => e.totalCost)
  const receivables = total(data.customers, p => Math.max(0, p.balance)), payables = total(data.suppliers, p => Math.max(0, p.balance))
  const customerPayments = exact(add(total(rows, s => s.paid), total(data.payments.filter(p => p.kind === 'customer' && inside(p.date)), p => p.amount)) - total(returned, r => r.cashRefund))
  const supplierPayments = add(total(data.purchases.filter(p => inside(p.date)), p => p.paid), total(data.payments.filter(p => p.kind === 'supplier' && inside(p.date)), p => p.amount))
  const productById = new Map(data.products.map(p => [p.id, p]))
  let inventoryValue = total(data.products.filter(p => p.trackInventory && !p.trackBatches), p => exact(p.stock * p.cost))
  let expiring = 0, expired = 0
  for (const batch of data.batches) {
    const p = productById.get(batch.productId)
    if (!p?.trackInventory || !p.trackBatches) continue
    inventoryValue = add(inventoryValue, exact(batch.quantity * batch.unitCost))
    if (p.trackExpiry && batch.quantity && batch.expiryDate) {
      const days = (dateNumber(batch.expiryDate) - dateNumber(today)) / DAY
      if (days < 0) expired++
      else if (days <= p.expiryWarningDays) expiring++
    }
  }
  const tracked = data.products.filter(p => p.trackInventory && p.status === 'active')
  const out = tracked.filter(p => p.stock === 0).length, low = tracked.filter(p => p.stock > 0 && p.stock <= p.minStock).length
  const healthy = tracked.length - out - low
  const bucket = (day: string) => grouping === 'monthly' ? day.slice(0, 7) : grouping === 'weekly' ? shiftDay(range.from, Math.floor((dateNumber(day) - dateNumber(range.from)) / DAY / 7) * 7) : day
  const points = new Map<string, SeriesPoint>()
  for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) { const key = bucket(day); if (!points.has(key)) points.set(key, { key, sales: 0, cost: 0, profit: 0, count: 0 }) }
  const products = new Map<string, Ranking>()
  for (const sale of rows) {
    const point = points.get(bucket(recordDay(sale.date)))!
    point.sales = add(point.sales, sale.total); point.count++
    if (!sale.lines?.length) { point.cost = null; point.profit = null; continue }
    const saleCost = total(sale.lines, historicalCost)
    if (point.cost !== null) { point.cost = add(point.cost, saleCost); point.profit = exact(point.sales - point.cost) }
    // Cumulative proportional allocation keeps the exact total without putting all rounding remainders on one product.
    const subtotal = total(sale.lines, l => exact(l.price * l.qty))
    let allocated = 0, cumulativeGross = 0
    sale.lines.forEach((line, index) => {
      cumulativeGross = add(cumulativeGross, exact(line.price * line.qty))
      const cumulativeNet = index === sale.lines!.length - 1 ? sale.total : subtotal ? Number(BigInt(sale.total) * BigInt(cumulativeGross) / BigInt(subtotal)) : 0
      const net = cumulativeNet - allocated
      allocated = cumulativeNet
      const p = products.get(line.productId) || { id: line.productId, name: line.name, quantity: 0, revenue: 0, profit: 0 }
      p.quantity = add(p.quantity, line.qty); p.revenue = add(p.revenue, net); p.profit = add(p.profit, exact(net - historicalCost(line))); products.set(p.id, p)
    })
  }
  for (const saleReturn of returned) {
    const point = points.get(bucket(recordDay(saleReturn.date)))!
    point.sales = exact(point.sales - saleReturn.total)
    const returnCost = total(saleReturn.lines, historicalCost)
    if (point.cost !== null) { point.cost = exact(point.cost - returnCost); point.profit = exact(point.sales - point.cost) }
    const gross = total(saleReturn.lines, l => exact(l.price * l.qty))
    let allocated = 0, cumulativeGross = 0
    saleReturn.lines.forEach((line, index) => {
      cumulativeGross = add(cumulativeGross, exact(line.price * line.qty))
      const cumulativeNet = index === saleReturn.lines.length - 1 ? saleReturn.total : gross ? Number(BigInt(saleReturn.total) * BigInt(cumulativeGross) / BigInt(gross)) : 0
      const net = cumulativeNet - allocated; allocated = cumulativeNet
      const p = products.get(line.productId) || { id: line.productId, name: line.name, quantity: 0, revenue: 0, profit: 0 }
      p.quantity = exact(p.quantity - line.qty); p.revenue = exact(p.revenue - net); p.profit = exact(p.profit - (net - historicalCost(line))); products.set(p.id, p)
    })
  }
  const categories = new Map<string, number>()
  for (const e of data.expenses) if (inside(e.date)) categories.set(e.category, add(categories.get(e.category) || 0, e.amount))
  const growth = percentageChange(revenue, previousRevenue)
  const insights: Insight[] = []
  if (expired) insights.push({ id: 'expired', priority: 'critical', text: `${expired} دفعات منتهية الصلاحية ما زالت تحتوي مخزوناً. راجع الإتلاف أو الإرجاع.`, rule: 'positive batch quantity; expiry date < today', destination: 'inventory' })
  if (out + low) insights.push({ id: 'stock', priority: out ? 'critical' : 'warning', text: `${out} منتجات نافدة و${low} منتجات عند الحد الأدنى للمخزون.`, rule: 'active tracked products: stock = 0; 0 < stock <= minStock', destination: 'inventory' })
  if (expiring) insights.push({ id: 'expiry', priority: 'warning', text: `${expiring} دفعات ضمن مهلة تنبيه الصلاحية المحددة لكل منتج.`, rule: '0 <= expiryDate - today <= product.expiryWarningDays; quantity > 0', destination: 'inventory' })
  if (receivables > 0) insights.push({ id: 'receivables', priority: 'information', text: 'توجد أرصدة مستحقة لدى العملاء. راجع كشوف الحساب؛ لا تتوفر تواريخ استحقاق لتحديد التأخر.', rule: 'sum of positive current customer balances > 0', destination: 'customers' })
  if (payables > 0) insights.push({ id: 'payables', priority: 'information', text: 'توجد مستحقات للموردين. راجع كشوف الحساب لتنظيم الدفعات؛ مواعيد الاستحقاق غير مسجلة.', rule: 'sum of positive supplier balances > 0; supplier credits are excluded', destination: 'suppliers' })
  if (growth !== null && growth !== 0) insights.push({ id: 'sales', priority: growth > 0 ? 'opportunity' : 'warning', text: `${growth > 0 ? 'ارتفعت' : 'انخفضت'} المبيعات بنسبة ${Math.abs(growth).toFixed(1)}% مقارنة بالفترة السابقة المساوية في عدد الأيام.`, rule: '(current revenue - previous revenue) / previous revenue * 100; previous > 0', destination: 'sales' })
  if (margin !== null && previousMargin !== null && margin < previousMargin) insights.push({ id: 'margin', priority: 'warning', text: `انخفض هامش مجمل الربح بمقدار ${(previousMargin - margin).toFixed(1)} نقطة مئوية.`, rule: 'previous gross margin minus current gross margin; both revenues > 0 and costs known', destination: 'reports' })
  if (revenue > 0 && expenses > 0) insights.push({ id: 'expenses', priority: expenses > revenue ? 'warning' : 'information', text: `تمثل المصروفات التشغيلية ${(expenses / revenue * 100).toFixed(1)}% من المبيعات خلال الفترة.`, rule: 'period operating expenses / period revenue * 100', destination: 'expenses' })
  if (losses > 0) insights.push({ id: 'losses', priority: 'warning', text: 'سُجلت خسائر تلف أو إتلاف خلال الفترة. راجع سجل المخزون.', rule: 'sum of recorded inventoryLosses.totalCost in range > 0', destination: 'inventory' })
  const unknownDates = [...data.sales, ...data.saleReturns, ...data.expenses, ...data.payments, ...data.purchases, ...data.inventoryLosses].filter(r => !recordDay(r.date)).length
  return { range, previous, revenue, previousRevenue, cost, grossProfit, margin, previousMargin, expenses, losses, netResult: grossProfit === null ? null : exact(grossProfit - expenses - losses), invoiceCount: rows.length, returnCount: returned.length, average: rows.length ? Math.round(revenue / rows.length) : null, growth, receivables, payables, customerPayments, supplierPayments, inventoryValue, low, out, healthy, expiring, expired, points: [...points.values()], products: [...products.values()], categories: [...categories].map(([name, value]) => ({ name, value })), insights, unknownDates, missingCosts: rows.filter(s => !s.lines?.length).length }
}
export type DashboardData = ReturnType<typeof calculateDashboard>
