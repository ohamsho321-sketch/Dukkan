import type { Business, Product, Customer, Supplier, Sale, SaleReturn, Expense, Purchase, StockMovement, Payment, AppUser, InventoryBatch, BatchAllocation, InventoryLoss, SupplierReturn, AuditEvent, FiscalYear } from '../types'

export type Data = {
  setupComplete: boolean; business: Business; products: Product[]; customers: Customer[]; suppliers: Supplier[]
  sales: Sale[]; saleReturns: SaleReturn[]; expenses: Expense[]; categories: string[]; activeUser: string
  purchases: Purchase[]; movements: StockMovement[]; batches: InventoryBatch[]; inventoryLosses: InventoryLoss[]; supplierReturns: SupplierReturn[]; auditEvents: AuditEvent[]; payments: Payment[]; users: AppUser[]; fiscalYears: FiscalYear[]; lastBackup: string
}
export const emptyData: Data = {
  setupComplete: false,
  business: { name: 'سوق الضنية المركزي', type: 'متجر جملة وتجزئة', phone: '', address: 'الضنية، لبنان', taxNumber: '', logo: '', primaryColor: '#15803d', currency: 'USD' },
  products: [], customers: [], suppliers: [], sales: [], saleReturns: [], expenses: [], purchases: [], movements: [], batches: [], inventoryLosses: [], supplierReturns: [], auditEvents: [], payments: [], users: [], fiscalYears: [],
  categories: ['أدوات منزلية', 'أدوات كهربائية صغيرة', 'قرطاسية ومكتبة', 'ألعاب', 'مواد تنظيف', 'عناية شخصية', 'قطنيات', 'موسمية', 'أخرى'], activeUser: '', lastBackup: '',
}
function invalid(): never { throw new Error('بيانات غير صالحة: لم يتم استبدال السجلات الحالية') }
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function str(value: unknown, max = 10000): string { if (typeof value !== 'string' || value.length > max) return invalid(); return value }
function num(value: unknown, signed = false): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || (!signed && value < 0)) return invalid(); return value }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') return invalid(); return value }
function list<T>(value: unknown, parse: (v: unknown) => T): T[] { if (!Array.isArray(value)) return invalid(); return value.map(parse) }
function records<T extends { id: string }>(value: unknown, parse: (v: unknown) => T): T[] {
  const result = list(value, parse)
  if (new Set(result.map(r => r.id)).size !== result.length || result.some(r => !r.id)) return invalid()
  return result
}
export function businessData(value: unknown): Business {
  const b = obj(value), logo = str(b.logo, 1000000), color = str(b.primaryColor)
  if (logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)) return invalid()
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return invalid()
  return { name: str(b.name), type: str(b.type), phone: str(b.phone), address: str(b.address), taxNumber: str(b.taxNumber), logo, primaryColor: color, currency: str(b.currency) }
}
function party(value: unknown, signedBalance = false): Customer {
  const p = obj(value)
  return { id: str(p.id), name: str(p.name), phone: str(p.phone), city: str(p.city), balance: num(p.balance, signedBalance), purchases: num(p.purchases), lastPurchase: str(p.lastPurchase) }
}
function line(value: unknown) {
  const l = obj(value), qty = num(l.qty)
  if (!qty) return invalid()
  const batchAllocations = l.batchAllocations === undefined ? undefined : list(l.batchAllocations, batchAllocation)
  if (batchAllocations && batchAllocations.reduce((total, allocation) => total + allocation.quantity, 0) !== qty) return invalid()
  return { productId: str(l.productId), name: str(l.name), unit: str(l.unit), qty, price: num(l.price), cost: num(l.cost), ...(batchAllocations ? { batchAllocations } : {}) }
}
function batchAllocation(value: unknown): BatchAllocation {
  const a = obj(value), quantity = num(a.quantity)
  if (!quantity) return invalid()
  return { batchId: str(a.batchId), lotNumber: str(a.lotNumber), quantity, unitCost: num(a.unitCost), ...(a.expiryDate === undefined ? {} : { expiryDate: str(a.expiryDate) }) }
}
export function validateData(value: unknown, includeUsers = true): Data {
  const d = obj(value)
  const result: Data = {
    setupComplete: bool(d.setupComplete), business: businessData(d.business), activeUser: str(d.activeUser),
    categories: list(d.categories, v => str(v)), lastBackup: d.lastBackup === undefined ? '' : str(d.lastBackup),
    fiscalYears: records(d.fiscalYears ?? [], v => { const y = obj(v), status = str(y.status); if (!['open', 'locked', 'closed'].includes(status)) return invalid(); const startDate = str(y.startDate), endDate = str(y.endDate); if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return invalid(); let closingSummary: FiscalYear['closingSummary']; if (y.closingSummary !== undefined) { const s = obj(y.closingSummary); closingSummary = { sales: num(s.sales), costOfGoods: num(s.costOfGoods), expenses: num(s.expenses), inventoryLosses: num(s.inventoryLosses), estimatedProfit: num(s.estimatedProfit, true), inventoryValue: num(s.inventoryValue), receivables: num(s.receivables), payables: num(s.payables) } } return { id: str(y.id), name: str(y.name), startDate, endDate, status: status as FiscalYear['status'], createdAt: str(y.createdAt), ...(y.closedAt === undefined ? {} : { closedAt: str(y.closedAt) }), ...(closingSummary ? { closingSummary } : {}) } }),
    products: records(d.products, v => { const p = obj(v); if (!['active', 'inactive'].includes(str(p.status))) return invalid(); const trackInventory = bool(p.trackInventory), trackBatches = p.trackBatches === undefined ? false : bool(p.trackBatches), trackExpiry = p.trackExpiry === undefined ? false : bool(p.trackExpiry); if (trackBatches && !trackInventory || trackExpiry && !trackBatches) return invalid(); return { id: str(p.id), name: str(p.name), sku: str(p.sku), ...(p.barcode === undefined ? {} : { barcode: str(p.barcode) }), category: str(p.category), unit: str(p.unit), cost: num(p.cost), price: num(p.price), wholesalePrice: num(p.wholesalePrice), stock: num(p.stock), minStock: num(p.minStock), trackInventory, trackBatches, trackExpiry, expiryWarningDays: p.expiryWarningDays === undefined ? 30 : num(p.expiryWarningDays), status: p.status as Product['status'] } }),
    customers: records(d.customers, party), suppliers: records(d.suppliers, v => party(v, true)),
    sales: records(d.sales, v => {
      const s = obj(v), total = num(s.total), paid = num(s.paid)
      if (!['مدفوعة', 'آجلة', 'جزئية'].includes(str(s.status))) return invalid()
      const lines = s.lines === undefined ? undefined : list(s.lines, line)
      const discount = s.discount === undefined ? 0 : num(s.discount)
      if (lines && (lines.length === 0 || lines.reduce((n, l) => n + l.price * l.qty, 0) - discount !== total || lines.reduce((n, l) => n + l.qty, 0) !== num(s.items) || paid > total)) return invalid()
      return { id: str(s.id), customer: str(s.customer), total, paid, date: str(s.date), cashier: str(s.cashier), items: num(s.items), status: s.status as Sale['status'], ...(lines ? { lines, discount } : {}), ...(s.customerId === undefined ? {} : { customerId: str(s.customerId) }), ...(s.method === undefined ? {} : { method: str(s.method) }), ...(s.fiscalYearId === undefined ? {} : { fiscalYearId: str(s.fiscalYearId) }) }
    }),
    saleReturns: records(d.saleReturns ?? [], v => { const r = obj(v), lines = list(r.lines, line), total = num(r.total), creditApplied = num(r.creditApplied), cashRefund = num(r.cashRefund), gross = lines.reduce((n, l) => n + l.price * l.qty, 0); if (!lines.length || total > gross || creditApplied + cashRefund !== total) return invalid(); return { id: str(r.id), saleId: str(r.saleId), ...(r.customerId === undefined ? {} : { customerId: str(r.customerId) }), total, creditApplied, cashRefund, lines, reason: str(r.reason), userId: str(r.userId), userName: str(r.userName), date: str(r.date), ...(r.fiscalYearId === undefined ? {} : { fiscalYearId: str(r.fiscalYearId) }) } }),
    expenses: records(d.expenses, v => { const e = obj(v); return { id: str(e.id), category: str(e.category), note: str(e.note), amount: num(e.amount), date: str(e.date), ...(e.fiscalYearId === undefined ? {} : { fiscalYearId: str(e.fiscalYearId) }) } }),
    purchases: records(d.purchases ?? [], v => { const p = obj(v), lines = list(p.lines, line), total = num(p.total), paid = num(p.paid); if (!lines.length || total !== lines.reduce((n, l) => n + l.cost * l.qty, 0) || paid > total) return invalid(); return { id: str(p.id), supplierId: str(p.supplierId), supplier: str(p.supplier), date: str(p.date), total, paid, lines, note: str(p.note), ...(p.fiscalYearId === undefined ? {} : { fiscalYearId: str(p.fiscalYearId) }) } }),
    movements: records(d.movements ?? [], v => { const m = obj(v), type = m.type === undefined ? undefined : str(m.type); if (type && !['sale', 'sale_return', 'purchase', 'adjustment', 'expired_disposal', 'damaged_disposal', 'supplier_return'].includes(type)) return invalid(); return { id: str(m.id), productId: str(m.productId), name: str(m.name), amount: num(m.amount, true), balance: num(m.balance), date: str(m.date), reason: str(m.reason), ...(m.batchId === undefined ? {} : { batchId: str(m.batchId) }), ...(type ? { type: type as StockMovement['type'] } : {}) } }),
    batches: records(d.batches ?? [], v => { const b = obj(v); return { id: str(b.id), productId: str(b.productId), lotNumber: str(b.lotNumber), quantity: num(b.quantity), ...(b.productionDate === undefined ? {} : { productionDate: str(b.productionDate) }), ...(b.expiryDate === undefined ? {} : { expiryDate: str(b.expiryDate) }), unitCost: num(b.unitCost), supplierId: str(b.supplierId), purchaseId: str(b.purchaseId), createdAt: str(b.createdAt) } }),
    inventoryLosses: records(d.inventoryLosses ?? [], v => { const x = obj(v), kind = str(x.kind); if (!['expired', 'damaged'].includes(kind)) return invalid(); return { id: str(x.id), productId: str(x.productId), batchId: str(x.batchId), lotNumber: str(x.lotNumber), quantity: num(x.quantity), unitCost: num(x.unitCost), totalCost: num(x.totalCost), ...(x.expiryDate === undefined ? {} : { expiryDate: str(x.expiryDate) }), kind: kind as InventoryLoss['kind'], reason: str(x.reason), userId: str(x.userId), userName: str(x.userName), date: str(x.date) } }),
    supplierReturns: records(d.supplierReturns ?? [], v => { const x = obj(v); return { id: str(x.id), productId: str(x.productId), batchId: str(x.batchId), supplierId: str(x.supplierId), purchaseId: str(x.purchaseId), quantity: num(x.quantity), unitCost: num(x.unitCost), total: num(x.total), reason: str(x.reason), userId: str(x.userId), userName: str(x.userName), date: str(x.date) } }),
    auditEvents: records(d.auditEvents ?? [], v => { const x = obj(v), action = str(x.action); if (!['batch_adjustment', 'expired_disposal', 'damaged_disposal', 'supplier_return'].includes(action) || str(x.entityType) !== 'batch') return invalid(); return { id: str(x.id), action: action as AuditEvent['action'], entityType: 'batch', entityId: str(x.entityId), reference: str(x.reference), reason: str(x.reason), userId: str(x.userId), userName: str(x.userName), date: str(x.date) } }),
    payments: records(d.payments ?? [], v => { const p = obj(v); if (!['customer', 'supplier'].includes(str(p.kind))) return invalid(); return { id: str(p.id), partyId: str(p.partyId), kind: p.kind as Payment['kind'], amount: num(p.amount), date: str(p.date), note: str(p.note), ...(p.fiscalYearId === undefined ? {} : { fiscalYearId: str(p.fiscalYearId) }) } }),
    users: includeUsers ? records(d.users ?? [], v => { const u = obj(v); if (!['admin', 'cashier'].includes(str(u.role)) || !/^[a-f0-9]{64}$/.test(str(u.hash)) || !/^[a-f0-9]{32}$/.test(str(u.salt))) return invalid(); return { id: str(u.id), username: str(u.username), name: str(u.name), role: u.role as AppUser['role'], active: bool(u.active), salt: str(u.salt), hash: str(u.hash) } }) : [],
  }
  if (result.setupComplete && !result.fiscalYears.length) {
    const year = new Date().getFullYear()
    result.fiscalYears.push({ id: `FY-${year}`, name: `السنة المالية ${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: 'open', createdAt: `${year}-01-01T00:00:00.000Z` })
  }
  if (result.users.length && !result.users.some(u => u.active && u.role === 'admin')) return invalid()
  const orderedYears = [...result.fiscalYears].sort((a, b) => a.startDate.localeCompare(b.startDate))
  for (let i = 1; i < orderedYears.length; i++) if (orderedYears[i].startDate <= orderedYears[i - 1].endDate) return invalid()
  const fiscalIds = new Set(result.fiscalYears.map(y => y.id))
  for (const row of [...result.sales, ...result.saleReturns, ...result.purchases, ...result.expenses, ...result.payments]) if (row.fiscalYearId && !fiscalIds.has(row.fiscalYearId)) return invalid()
  if (new Set(result.users.map(u => u.username.toLowerCase())).size !== result.users.length) return invalid()
  const productById = new Map(result.products.map(product => [product.id, product]))
  const supplierIds = new Set(result.suppliers.map(supplier => supplier.id))
  const purchaseIds = new Set(result.purchases.map(purchase => purchase.id))
  const batchById = new Map(result.batches.map(batch => [batch.id, batch]))
  const batchKeys = new Set<string>(), batchStock = new Map<string, number>()
  for (const batch of result.batches) {
    const product = productById.get(batch.productId)
    const key = `${batch.productId}\0${batch.purchaseId}\0${batch.lotNumber}`
    if (!product?.trackBatches || batchKeys.has(key) || batch.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(batch.expiryDate) || !supplierIds.has(batch.supplierId) || !purchaseIds.has(batch.purchaseId)) return invalid()
    batchKeys.add(key)
    batchStock.set(batch.productId, (batchStock.get(batch.productId) || 0) + batch.quantity)
  }
  for (const product of result.products) if (product.trackBatches && (batchStock.get(product.id) || 0) !== product.stock) return invalid()
  for (const sale of result.sales) for (const saleLine of sale.lines || []) for (const allocation of saleLine.batchAllocations || []) { const batch = batchById.get(allocation.batchId); if (!batch || batch.productId !== saleLine.productId) return invalid() }
  const salesById = new Map(result.sales.map(sale => [sale.id, sale]))
  const returnedBySaleProduct = new Map<string, number>()
  for (const returned of result.saleReturns) {
    const sale = salesById.get(returned.saleId)
    if (!sale?.lines?.length) return invalid()
    for (const returnedLine of returned.lines) {
      const original = sale.lines.find(line => line.productId === returnedLine.productId)
      const key = `${sale.id}\0${returnedLine.productId}`
      const cumulative = (returnedBySaleProduct.get(key) || 0) + returnedLine.qty
      if (!original || returnedLine.price !== original.price || returnedLine.cost !== original.cost || cumulative > original.qty) return invalid()
      returnedBySaleProduct.set(key, cumulative)
      for (const allocation of returnedLine.batchAllocations || []) { const batch = batchById.get(allocation.batchId); if (!batch || batch.productId !== returnedLine.productId) return invalid() }
    }
  }
  for (const sale of result.sales) if (result.saleReturns.filter(r => r.saleId === sale.id).reduce((n, r) => n + r.total, 0) > sale.total) return invalid()
  for (const loss of result.inventoryLosses) { const batch = batchById.get(loss.batchId); if (loss.totalCost !== loss.quantity * loss.unitCost || !batch || batch.productId !== loss.productId) return invalid() }
  for (const returned of result.supplierReturns) { const batch = batchById.get(returned.batchId); if (returned.total !== returned.quantity * returned.unitCost || !batch || batch.productId !== returned.productId || batch.supplierId !== returned.supplierId) return invalid() }
  for (const event of result.auditEvents) if (!batchById.has(event.entityId)) return invalid()
  return result
}

export function parseBackup(text: string): Data {
  const backup = obj(JSON.parse(text))
  if (!['Dukkan Backup', 'Souk Al Dannyeh Backup'].includes(String(backup.format)) || ![1, 2, 3, 4, 5, 6].includes(Number(backup.version))) return invalid()
  return validateData(backup.data, false)
}
export function dayKey(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(T|$)/.test(date) || !Number.isFinite(Date.parse(date))) return ''
  if (date.length === 10) return date
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayKey = () => dayKey(new Date().toISOString())
export const displayDate = (date: string) => {
  if (!dayKey(date)) return date || 'غير مسجل'
  const local = date.length === 10 ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) : new Date(date)
  return local.toLocaleDateString('ar-LY')
}
