import { create } from 'zustand'
import type { Business, Product, Customer, Sale, SaleLine, SaleReturn, AppUser, Purchase, Payment, InventoryBatch, BatchAllocation, FiscalYear } from './types'
import { emptyData, validateData, businessData, parseBackup, todayKey, type Data } from './lib/data'
import { credentials, verifyPassword } from './lib/auth'

const storageKey = 'dukkan-local-db-v1'
// A database with no app_state row has revision -1. The first persisted state
// therefore becomes revision 0 and must use -1 as its expected revision.
let storageRevision = -1
const tauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const tauriApi = () => import('@tauri-apps/api/core')
async function authenticateDashboard(username: string, password: string) {
  if (tauriRuntime()) { const { invoke } = await tauriApi(); await invoke('dashboard_login', { username, password }) }
}
async function persistDesktop(data: Data, expectedRevision: number, revision: number) {
  const stateJson = JSON.stringify(data)
  const { invoke } = await tauriApi()
  await invoke('save_app_state', { expectedRevision, revision, stateJson })
}
const id = (prefix: string) => prefix + '-' + crypto.randomUUID()
const now = () => new Date().toISOString()
const required = (s: string) => { if (!s.trim()) throw new Error('أكمل البيانات المطلوبة'); return s.trim() }
const amount = (n: number) => { if (!Number.isSafeInteger(n) || n < 0) throw new Error('المبلغ أو الكمية غير صالح'); return n }
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
type PersonInput = Pick<Customer, 'name' | 'phone' | 'city'>
type ProductInput = Omit<Product, 'id' | 'sku' | 'trackBatches' | 'trackExpiry' | 'expiryWarningDays'> & { sku?: string; trackBatches?: boolean; trackExpiry?: boolean; expiryWarningDays?: number }
type PurchaseInput = { productId: string; qty: number; cost: number; lotNumber?: string; productionDate?: string; expiryDate?: string }
type State = Data & {
  sessionId: string | null; loadError: string
  completeSetup: (business: Business, user: { name: string; username: string; password: string }) => Promise<void>
  createAdmin: (name: string, username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>; logout: () => void
  addUser: (name: string, username: string, password: string, role: AppUser['role']) => Promise<void>
  toggleUser: (userId: string) => Promise<void>
  addProduct: (product: ProductInput) => Promise<void>
  editProduct: (product: Product) => Promise<void>
  addCustomer: (person: PersonInput) => Promise<void>; addSupplier: (person: PersonInput) => Promise<void>
  addExpense: (expense: { category: string; note: string; amount: number; date?: string }) => Promise<void>
  completeSale: (cart: { productId: string; qty: number }[], paid: number, customerId: string, method: string, discount: number) => Promise<Sale>
  returnSale: (saleId: string, items: { productId: string; qty: number }[], reason: string) => Promise<SaleReturn>
  completePurchase: (supplierId: string, cart: PurchaseInput[], paid: number, date: string, note: string) => Promise<Purchase>
  recordPayment: (kind: Payment['kind'], partyId: string, amount: number, note: string) => Promise<void>
  updateBusiness: (business: Partial<Business>) => Promise<void>
  addFiscalYear: (name: string, startDate: string, endDate: string) => Promise<void>
  setFiscalYearStatus: (yearId: string, status: FiscalYear['status']) => Promise<void>
  closeFiscalYear: (yearId: string) => Promise<FiscalYear>
  adjustStock: (productId: string, change: number, reason: string) => Promise<void>
  adjustBatchStock: (batchId: string, change: number, reason: string) => Promise<void>
  disposeBatchStock: (batchId: string, quantity: number, kind: 'expired' | 'damaged', reason: string) => Promise<void>
  returnBatchToSupplier: (batchId: string, quantity: number, reason: string) => Promise<void>
  restoreBackup: (text: string) => Promise<void>; backup: () => string; markBackup: () => Promise<void>
}
let loadError = ''
function load(): Data {
  try {
    if (typeof localStorage === 'undefined') return structuredClone(emptyData)
    const stored = localStorage.getItem(storageKey)
    if (!stored) return structuredClone(emptyData)
    const envelope = JSON.parse(stored)
    storageRevision = Number.isSafeInteger(envelope.revision) && envelope.revision >= 0 ? envelope.revision : -1
    return validateData(envelope.state)
  } catch { loadError = 'تعذر قراءة البيانات المحفوظة. لم يتم حذفها أو استبدالها. احتفظ بنسخة من بيانات المتصفح.'; return structuredClone(emptyData) }
}
const initial = load()
export const useAppStore = create<State>()((set, get) => {
  const snapshot = (): Data => Object.fromEntries(Object.keys(emptyData).map(key => [key, get()[key as keyof Data]])) as Data
  // Persist the complete transaction before publishing it to the UI.
  const commit = async (changes: Partial<Data>) => {
    if (get().loadError) throw new Error(get().loadError)
    const data = validateData({ ...snapshot(), ...changes })
    const revision = storageRevision + 1
    if (tauriRuntime()) {
      try { await persistDesktop(data, storageRevision, revision) }
      catch { throw new Error('تعذر حفظ العملية في قاعدة البيانات المحلية. لم تسجل العملية؛ أعد المحاولة.') }
    } else {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify({ state: data, version: 1, revision })) }
      catch { throw new Error('تعذر حفظ البيانات على الجهاز. لم تسجل العملية؛ تحقق من مساحة التخزين.') }
    }
    storageRevision = revision
    if (tauriRuntime()) try { localStorage.setItem(storageKey, JSON.stringify({ state: data, version: 1, revision })) } catch { /* SQLite is authoritative on desktop. */ }
    set(data)
  }
  const access = (admin = false) => {
    const user = get().users.find(u => u.id === get().sessionId && u.active)
    if (!user || (admin && user.role !== 'admin')) throw new Error('ليست لديك صلاحية لهذه العملية')
    return user
  }
  const fiscalFor = (date: string) => {
    const key = date.slice(0, 10), years = get().fiscalYears
    const year = years.find(y => key >= y.startDate && key <= y.endDate)
    if (!year) throw new Error('لا توجد سنة مالية تغطي تاريخ العملية. أضفها من الإعدادات أولاً')
    if (year.status !== 'open') throw new Error('السنة المالية المرتبطة بهذه العملية ليست مفتوحة')
    return year
  }
  const newUser = async (name: string, username: string, password: string, role: AppUser['role']): Promise<AppUser> => {
    name = required(name); username = required(username)
    if (get().users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('اسم المستخدم موجود بالفعل')
    return { id: id('USR'), name, username, role, active: true, ...await credentials(password) }
  }
  return {
    ...initial, loadError, sessionId: null,
    completeSetup: async (business, input) => {
      if (get().setupComplete || get().users.length) throw new Error('تم إعداد النشاط بالفعل')
      required(business.name)
      const user = await newUser(input.name, input.username, input.password, 'admin')
      if (get().setupComplete) throw new Error('تم إعداد النشاط بالفعل')
      const year = new Date().getFullYear()
      await commit({ business: businessData(business), users: [user], activeUser: user.name, setupComplete: true, fiscalYears: [{ id: id('FY'), name: `السنة المالية ${year}`, startDate: `${year}-01-01`, endDate: `${year}-12-31`, status: 'open', createdAt: now() }] })
      await authenticateDashboard(input.username, input.password)
      set({ sessionId: user.id })
    },
    createAdmin: async (name, username, password) => {
      if (get().users.length || !get().setupComplete) throw new Error('تم إنشاء حساب المدير بالفعل')
      const user = await newUser(name, username, password, 'admin')
      if (get().users.length) throw new Error('تم إنشاء حساب المدير بالفعل')
      await commit({ users: [user], activeUser: user.name }); await authenticateDashboard(username, password); set({ sessionId: user.id })
    },
    login: async (username, password) => {
      const user = get().users.find(u => u.username.toLowerCase() === username.trim().toLowerCase() && u.active)
      if (tauriRuntime()) {
        try { await authenticateDashboard(username, password) }
        catch (error) { throw new Error(error instanceof Error ? error.message : String(error)) }
      } else if (!user || !await verifyPassword(user, password)) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')
      if (!user) {
        if (tauriRuntime()) { const { invoke } = await tauriApi(); await invoke('dashboard_logout') }
        throw new Error('بيانات الحساب المحلية قديمة. أعد تشغيل التطبيق')
      }
      if (!get().users.some(u => u.id === user.id && u.active && u.hash === user.hash)) throw new Error('الحساب غير متاح')
      set({ sessionId: user.id, activeUser: user.name })
    },
    logout: () => { set({ sessionId: null }); if (tauriRuntime()) void tauriApi().then(({ invoke }) => invoke('dashboard_logout')).catch(() => { /* No dashboard is rendered after logout. */ }) },
    addUser: async (name, username, password, role) => {
      access(true); const user = await newUser(name, username, password, role); access(true)
      if (get().users.some(u => u.username.toLowerCase() === user.username.toLowerCase())) throw new Error('اسم المستخدم موجود بالفعل')
      await commit({ users: [...get().users, user] })
    },
    toggleUser: async userId => {
      const self = access(true)
      if (self.id === userId) throw new Error('لا يمكنك تعطيل حسابك الحالي')
      await commit({ users: get().users.map(u => u.id === userId ? { ...u, active: !u.active } : u) })
    },
    addProduct: async product => {
      access(true); required(product.name)
      const sku = product.sku?.trim() || id('PRD')
      if (get().products.some(p => p.sku === sku || (product.barcode && p.barcode === product.barcode))) throw new Error('رمز المنتج أو الباركود موجود بالفعل')
      const trackBatches = Boolean(product.trackBatches), trackExpiry = Boolean(product.trackExpiry)
      if (trackBatches && !product.trackInventory || trackExpiry && !trackBatches) throw new Error('تتبع الصلاحية يتطلب تتبع الدفعات والمخزون')
      if (trackBatches && product.stock) throw new Error('أضف رصيد المنتج المتتبع بالدفعات من خلال فاتورة شراء')
      const p: Product = { ...product, trackBatches, trackExpiry, expiryWarningDays: product.expiryWarningDays ?? 30, sku, id: id('P') }
      await commit({ products: [...get().products, p], movements: p.trackInventory && p.stock ? [{ id: id('MOV'), productId: p.id, name: p.name, amount: p.stock, date: now(), reason: 'رصيد افتتاحي', balance: p.stock }, ...get().movements] : get().movements })
    },
    editProduct: async product => {
      access(true); required(product.name)
      if (get().products.some(p => p.id !== product.id && (p.sku === product.sku || (product.barcode && p.barcode === product.barcode)))) throw new Error('رمز المنتج أو الباركود موجود بالفعل')
      const old = get().products.find(p => p.id === product.id)
      if (!old) throw new Error('المنتج غير موجود')
      if (product.trackBatches && !old.trackBatches && old.stock) throw new Error('صفّر المخزون الحالي قبل تفعيل تتبع الدفعات')
      if (!product.trackBatches && get().batches.some(b => b.productId === product.id && b.quantity)) throw new Error('لا يمكن إيقاف تتبع الدفعات مع وجود كميات في دفعات نشطة')
      await commit({ products: get().products.map(p => p.id === product.id ? { ...product, stock: old.stock } : p) })
    },
    addCustomer: async person => { access(); await commit({ customers: [...get().customers, { ...person, name: required(person.name), id: id('C'), balance: 0, purchases: 0, lastPurchase: '' }] }) },
    addSupplier: async person => { access(true); await commit({ suppliers: [...get().suppliers, { ...person, name: required(person.name), id: id('S'), balance: 0, purchases: 0, lastPurchase: '' }] }) },
    addExpense: async expense => { access(true); if (!amount(expense.amount)) throw new Error('أدخل مبلغاً أكبر من صفر'); if (expense.date && !validDate(expense.date)) throw new Error('التاريخ غير صالح'); const date = expense.date || now(), fiscalYearId = fiscalFor(date).id; await commit({ expenses: [{ ...expense, id: id('EXP'), date, fiscalYearId }, ...get().expenses] }) },
    completeSale: async (cart, paid, customerId, method, discount) => {
      const user = access(), state = get(); amount(paid); amount(discount)
      if (!cart.length) throw new Error('أضف منتجاً إلى السلة')
      if (!['نقدي', 'بطاقة', 'تحويل', 'صك'].includes(method)) throw new Error('طريقة الدفع غير صالحة')
      const quantities = new Map<string, number>()
      cart.forEach(l => { if (!amount(l.qty)) throw new Error('الكمية يجب أن تكون أكبر من صفر'); quantities.set(l.productId, amount((quantities.get(l.productId) || 0) + l.qty)) })
      const allocations = new Map<string, BatchAllocation[]>()
      const lines: SaleLine[] = Array.from(quantities, ([productId, qty]) => {
        const p = state.products.find(p => p.id === productId && p.status === 'active')
        if (!p) throw new Error('أحد المنتجات غير متاح')
        if (p.trackInventory && p.stock < qty) throw new Error('الكمية غير متوفرة: ' + p.name + '، المتاح ' + p.stock)
        if (p.trackBatches) {
          const today = todayKey()
          const eligible = state.batches
            .filter(b => b.productId === p.id && b.quantity > 0 && (!p.trackExpiry || Boolean(b.expiryDate && b.expiryDate >= today)))
            .sort((a, b) => (a.expiryDate || '9999-12-31').localeCompare(b.expiryDate || '9999-12-31') || a.createdAt.localeCompare(b.createdAt))
          let remaining = qty
          const selected: BatchAllocation[] = []
          for (const batch of eligible) {
            const quantity = Math.min(remaining, batch.quantity)
            if (quantity) selected.push({ batchId: batch.id, lotNumber: batch.lotNumber, quantity, unitCost: batch.unitCost, ...(batch.expiryDate ? { expiryDate: batch.expiryDate } : {}) })
            remaining -= quantity
            if (!remaining) break
          }
          if (remaining) throw new Error('الكمية الصالحة للبيع غير كافية: ' + p.name)
          allocations.set(productId, selected)
          const costTotal = selected.reduce((total, allocation) => total + allocation.quantity * allocation.unitCost, 0)
          return { productId, qty, name: p.name, price: p.price, cost: Math.round(costTotal / qty), unit: p.unit, batchAllocations: selected }
        }
        return { productId, qty, name: p.name, price: p.price, cost: p.cost, unit: p.unit }
      })
      const subtotal = amount(lines.reduce((n, l) => n + l.qty * l.price, 0))
      if (discount > subtotal) throw new Error('الخصم أكبر من إجمالي الفاتورة')
      const total = subtotal - discount, customer = state.customers.find(c => c.id === customerId)
      if (customerId && !customer) throw new Error('العميل غير موجود')
      if (paid < total && !customer) throw new Error('اختر عميلاً للبيع الآجل')
      const date = now(), appliedPaid = Math.min(paid, total), fiscalYearId = fiscalFor(date).id
      const sale: Sale = { id: id('SAL'), customer: customer?.name || 'عميل نقدي', customerId, total, paid: appliedPaid, status: appliedPaid === total ? 'مدفوعة' : appliedPaid ? 'جزئية' : 'آجلة', date, cashier: user.name, items: lines.reduce((n, l) => n + l.qty, 0), lines, method, discount, fiscalYearId }
      const movements = [...state.movements]
      const products = state.products.map(p => {
        const qty = quantities.get(p.id)
        if (!qty || !p.trackInventory) return p
        const stock = p.stock - qty
        const selected = allocations.get(p.id)
        if (selected) {
          let balance = p.stock
          for (const allocation of selected) {
            balance -= allocation.quantity
            movements.unshift({ id: id('MOV'), productId: p.id, name: p.name, amount: -allocation.quantity, date, reason: sale.id, balance, batchId: allocation.batchId })
          }
        } else movements.unshift({ id: id('MOV'), productId: p.id, name: p.name, amount: -qty, date, reason: sale.id, balance: stock })
        return { ...p, stock }
      })
      const batches = state.batches.map(batch => {
        const allocation = allocations.get(batch.productId)?.find(a => a.batchId === batch.id)
        return allocation ? { ...batch, quantity: batch.quantity - allocation.quantity } : batch
      })
      await commit({ sales: [sale, ...state.sales], products, batches, movements, customers: state.customers.map(c => c.id === customerId ? { ...c, balance: amount(c.balance + total - appliedPaid), purchases: amount(c.purchases + total), lastPurchase: date } : c) })
      return sale
    },
    returnSale: async (saleId, items, reason) => {
      const user = access(true), state = get(), sale = state.sales.find(s => s.id === saleId)
      if (!sale?.lines?.length) throw new Error('لا يمكن إرجاع فاتورة قديمة بلا تفاصيل أصناف')
      reason = required(reason)
      if (!items.length || new Set(items.map(item => item.productId)).size !== items.length) throw new Error('اختر صنفاً واحداً على الأقل للإرجاع')
      const previous = state.saleReturns.filter(r => r.saleId === saleId)
      const returnedQty = (productId: string) => previous.flatMap(r => r.lines).filter(l => l.productId === productId).reduce((n, l) => n + l.qty, 0)
      const returnedBatchQty = (batchId: string) => previous.flatMap(r => r.lines).flatMap(l => l.batchAllocations || []).filter(a => a.batchId === batchId).reduce((n, a) => n + a.quantity, 0)
      const lines: SaleLine[] = items.map(item => {
        const original = sale.lines!.find(line => line.productId === item.productId)
        if (!original || !Number.isSafeInteger(item.qty) || item.qty <= 0 || item.qty > original.qty - returnedQty(item.productId)) throw new Error('كمية المرتجع غير صالحة أو تتجاوز الكمية المباعة')
        let batchAllocations: BatchAllocation[] | undefined
        if (original.batchAllocations?.length) {
          let remaining = item.qty
          batchAllocations = []
          for (const allocation of original.batchAllocations) {
            const available = allocation.quantity - returnedBatchQty(allocation.batchId)
            const quantity = Math.min(remaining, available)
            if (quantity > 0) batchAllocations.push({ ...allocation, quantity })
            remaining -= quantity
            if (!remaining) break
          }
          if (remaining) throw new Error('تعذر مطابقة المرتجع مع دفعات الفاتورة الأصلية')
        }
        return { ...original, qty: item.qty, ...(batchAllocations ? { batchAllocations } : {}) }
      })
      const saleGross = sale.lines.reduce((n, line) => n + line.price * line.qty, 0)
      const previousGross = previous.flatMap(r => r.lines).reduce((n, line) => n + line.price * line.qty, 0)
      const returnedGross = lines.reduce((n, line) => n + line.price * line.qty, 0)
      const previousNet = previous.reduce((n, r) => n + r.total, 0)
      const cumulativeGross = previousGross + returnedGross
      const cumulativeNet = cumulativeGross === saleGross ? sale.total : Number(BigInt(sale.total) * BigInt(cumulativeGross) / BigInt(saleGross))
      const total = amount(cumulativeNet - previousNet)
      const customer = sale.customerId ? state.customers.find(c => c.id === sale.customerId) : undefined
      const creditApplied = customer ? Math.min(customer.balance, total) : 0
      const cashRefund = total - creditApplied
      const date = now(), fiscalYearId = fiscalFor(date).id
      const returned: SaleReturn = { id: id('SRET'), saleId, ...(sale.customerId ? { customerId: sale.customerId } : {}), total, creditApplied, cashRefund, lines, reason, userId: user.id, userName: user.name, date, fiscalYearId }
      const quantities = new Map(lines.map(line => [line.productId, line.qty]))
      const movements = [...state.movements]
      const products = state.products.map(product => {
        const quantity = quantities.get(product.id)
        if (!quantity || !product.trackInventory) return product
        const balance = amount(product.stock + quantity)
        const returnedLine = lines.find(line => line.productId === product.id)!
        if (returnedLine.batchAllocations?.length) {
          let running = product.stock
          for (const allocation of returnedLine.batchAllocations) {
            running += allocation.quantity
            movements.unshift({ id: id('MOV'), productId: product.id, name: product.name, amount: allocation.quantity, date, reason: returned.id, balance: running, batchId: allocation.batchId, type: 'sale_return' })
          }
        } else movements.unshift({ id: id('MOV'), productId: product.id, name: product.name, amount: quantity, date, reason: returned.id, balance, type: 'sale_return' })
        return { ...product, stock: balance }
      })
      const batches = state.batches.map(batch => {
        const allocation = lines.flatMap(line => line.batchAllocations || []).find(a => a.batchId === batch.id)
        return allocation ? { ...batch, quantity: amount(batch.quantity + allocation.quantity) } : batch
      })
      await commit({
        saleReturns: [returned, ...state.saleReturns], products, batches, movements,
        customers: state.customers.map(c => c.id === sale.customerId ? { ...c, balance: c.balance - creditApplied, purchases: Math.max(0, c.purchases - total), lastPurchase: date } : c),
      })
      return returned
    },
    completePurchase: async (supplierId, cart, paid, date, note) => {
      access(true); const state = get(), supplier = state.suppliers.find(s => s.id === supplierId)
      if (!supplier || !cart.length) throw new Error('اختر المورد وأضف الأصناف')
      if (!validDate(date)) throw new Error('التاريخ غير صالح')
      const fiscalYearId = fiscalFor(date).id
      if (new Set(cart.map(l => l.productId)).size !== cart.length) throw new Error('المنتج مكرر في الفاتورة')
      const lines = cart.map(l => {
        const p = state.products.find(p => p.id === l.productId)
        if (!p || !p.trackInventory || !amount(l.qty)) throw new Error('الصنف أو الكمية غير صالح')
        if (p.trackBatches) {
          required(l.lotNumber || '')
          if (p.trackExpiry && (!l.expiryDate || !validDate(l.expiryDate))) throw new Error('تاريخ انتهاء الدفعة مطلوب')
          if (l.productionDate && !validDate(l.productionDate)) throw new Error('تاريخ الإنتاج غير صالح')
          if (l.productionDate && l.expiryDate && l.productionDate > l.expiryDate) throw new Error('تاريخ الإنتاج يجب أن يسبق انتهاء الصلاحية')
        }
        return { productId: p.id, name: p.name, unit: p.unit, qty: l.qty, cost: amount(l.cost), price: p.price }
      })
      const total = amount(lines.reduce((n, l) => n + l.qty * l.cost, 0)); amount(paid)
      if (paid > total) throw new Error('المدفوع أكبر من الإجمالي')
      const purchase: Purchase = { id: id('PUR'), supplierId, supplier: supplier.name, date, lines, total, paid, note, fiscalYearId }
      const movements = [...state.movements]
      const batches: InventoryBatch[] = structuredClone(state.batches)
      const products = state.products.map(p => {
        const l = lines.find(l => l.productId === p.id); if (!l) return p
        const stock = amount(p.stock + l.qty), cost = Math.round((p.stock * p.cost + l.qty * l.cost) / stock)
        let batchId: string | undefined
        if (p.trackBatches) {
          const input = cart.find(item => item.productId === p.id)!, lotNumber = input.lotNumber!.trim()
          const batch: InventoryBatch = { id: id('BAT'), productId: p.id, lotNumber, quantity: l.qty, unitCost: l.cost, supplierId, purchaseId: purchase.id, createdAt: now(), ...(input.productionDate ? { productionDate: input.productionDate } : {}), ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}) }
          batches.push(batch); batchId = batch.id
        }
        movements.unshift({ id: id('MOV'), productId: p.id, name: p.name, amount: l.qty, date, reason: purchase.id, balance: stock, ...(batchId ? { batchId } : {}) })
        return { ...p, stock, cost }
      })
      await commit({ purchases: [purchase, ...state.purchases], products, batches, movements, suppliers: state.suppliers.map(s => s.id === supplierId ? { ...s, balance: amount(s.balance + total - paid), purchases: amount(s.purchases + total), lastPurchase: date } : s) })
      return purchase
    },
    recordPayment: async (kind, partyId, value, note) => {
      access(kind === 'supplier'); amount(value)
      const key = kind === 'customer' ? 'customers' : 'suppliers', party = get()[key].find(p => p.id === partyId)
      if (!party || !value || value > party.balance) throw new Error('الدفعة يجب أن تكون أكبر من صفر ولا تتجاوز الرصيد')
      const date = now(), fiscalYearId = fiscalFor(date).id
      await commit({ [key]: get()[key].map(p => p.id === partyId ? { ...p, balance: p.balance - value } : p), payments: [{ id: id('PAY'), kind, partyId, amount: value, date, note, fiscalYearId }, ...get().payments] })
    },
    updateBusiness: async business => { access(true); const merged = businessData({ ...get().business, ...business }); required(merged.name); await commit({ business: merged }) },
    addFiscalYear: async (name, startDate, endDate) => {
      access(true); name = required(name)
      if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error('نطاق السنة المالية غير صالح')
      if (get().fiscalYears.some(y => startDate <= y.endDate && endDate >= y.startDate)) throw new Error('تتداخل هذه الفترة مع سنة مالية موجودة')
      await commit({ fiscalYears: [...get().fiscalYears, { id: id('FY'), name, startDate, endDate, status: 'open', createdAt: now() }] })
    },
    setFiscalYearStatus: async (yearId, status) => {
      access(true)
      if (!['open', 'locked', 'closed'].includes(status)) throw new Error('حالة السنة المالية غير صالحة')
      if (status === 'closed') throw new Error('استخدم معالج نهاية السنة للإغلاق النهائي')
      const year = get().fiscalYears.find(y => y.id === yearId)
      if (!year) throw new Error('السنة المالية غير موجودة')
      if (year.status === 'closed') throw new Error('السنة المغلقة نهائياً لا يمكن إعادة فتحها')
      await commit({ fiscalYears: get().fiscalYears.map(y => y.id === yearId ? { ...y, status } : y) })
    },
    closeFiscalYear: async yearId => {
      access(true); const state = get(), year = state.fiscalYears.find(y => y.id === yearId)
      if (!year || year.status === 'closed') throw new Error('السنة المالية غير متاحة للإقفال')
      if (!state.lastBackup) throw new Error('أنشئ نسخة احتياطية قبل إقفال السنة')
      const inYear = (date: string) => { const key = date.slice(0, 10); return key >= year.startDate && key <= year.endDate }
      const salesRows = state.sales.filter(x => x.fiscalYearId === year.id || (!x.fiscalYearId && inYear(x.date)))
      const returnRows = state.saleReturns.filter(x => x.fiscalYearId === year.id || (!x.fiscalYearId && inYear(x.date)))
      const expenses = state.expenses.filter(x => x.fiscalYearId === year.id || (!x.fiscalYearId && inYear(x.date))).reduce((n, x) => n + x.amount, 0)
      const losses = state.inventoryLosses.filter(x => inYear(x.date)).reduce((n, x) => n + x.totalCost, 0)
      const sales = salesRows.reduce((n, x) => n + x.total, 0) - returnRows.reduce((n, x) => n + x.total, 0)
      const costOfGoods = salesRows.reduce((n, x) => n + (x.lines || []).reduce((a, l) => a + l.qty * l.cost, 0), 0) - returnRows.reduce((n, x) => n + x.lines.reduce((a, l) => a + l.qty * l.cost, 0), 0)
      const summary = { sales, costOfGoods, expenses, inventoryLosses: losses, estimatedProfit: sales - costOfGoods - expenses - losses, inventoryValue: state.products.reduce((n, p) => n + p.stock * p.cost, 0), receivables: state.customers.reduce((n, p) => n + p.balance, 0), payables: state.suppliers.reduce((n, p) => n + Math.max(0, p.balance), 0) }
      const start = new Date(`${year.endDate}T00:00:00Z`); start.setUTCDate(start.getUTCDate() + 1)
      const end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1); end.setUTCDate(end.getUTCDate() - 1)
      const startDate = start.toISOString().slice(0, 10), endDate = end.toISOString().slice(0, 10)
      const next: FiscalYear = { id: id('FY'), name: `السنة المالية ${startDate.slice(0, 4)}`, startDate, endDate, status: 'open', createdAt: now() }
      if (state.fiscalYears.some(y => y.id !== year.id && startDate <= y.endDate && endDate >= y.startDate)) throw new Error('أنشئت السنة التالية مسبقاً؛ راجع السنوات المالية قبل الإقفال')
      await commit({ fiscalYears: state.fiscalYears.map(y => y.id === year.id ? { ...y, status: 'closed', closedAt: now(), closingSummary: summary } as FiscalYear : y).concat(next) })
      return next
    },
    adjustStock: async (productId, change, reason) => {
      access(true); fiscalFor(now()); const p = get().products.find(p => p.id === productId)
      if (!p || !p.trackInventory || !Number.isSafeInteger(change) || !change || p.stock + change < 0) throw new Error('التسوية غير صالحة أو تتجاوز المخزون')
      if (p.trackBatches) throw new Error('تسوية هذا المنتج يجب أن تتم على مستوى الدفعة')
      required(reason); const balance = amount(p.stock + change)
      await commit({ products: get().products.map(p => p.id === productId ? { ...p, stock: balance } : p), movements: [{ id: id('MOV'), productId, name: p.name, amount: change, date: now(), reason, balance }, ...get().movements] })
    },
    adjustBatchStock: async (batchId, change, reason) => {
      const user = access(true); fiscalFor(now()); const state = get(), batch = state.batches.find(b => b.id === batchId), product = batch && state.products.find(p => p.id === batch.productId)
      if (!batch || !product || !Number.isSafeInteger(change) || !change || batch.quantity + change < 0 || product.stock + change < 0) throw new Error('تسوية الدفعة غير صالحة أو تتجاوز الكمية المتاحة')
      reason = required(reason); const date = now(), reference = id('ADJ'), balance = product.stock + change
      await commit({
        batches: state.batches.map(b => b.id === batchId ? { ...b, quantity: b.quantity + change } : b),
        products: state.products.map(p => p.id === product.id ? { ...p, stock: balance } : p),
        movements: [{ id: id('MOV'), productId: product.id, name: product.name, amount: change, date, reason, balance, batchId, type: 'adjustment' }, ...state.movements],
        auditEvents: [{ id: id('AUD'), action: 'batch_adjustment', entityType: 'batch', entityId: batchId, reference, reason, userId: user.id, userName: user.name, date }, ...state.auditEvents],
      })
    },
    disposeBatchStock: async (batchId, quantity, kind, reason) => {
      const user = access(true); fiscalFor(now()); const state = get(), batch = state.batches.find(b => b.id === batchId), product = batch && state.products.find(p => p.id === batch.productId)
      if (!batch || !product || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > batch.quantity || !['expired', 'damaged'].includes(kind)) throw new Error('كمية الإتلاف غير صالحة أو تتجاوز كمية الدفعة')
      if (kind === 'expired' && (!batch.expiryDate || batch.expiryDate >= new Date().toISOString().slice(0, 10))) throw new Error('لا يمكن تسجيل الدفعة كمنتهية قبل تاريخ انتهاء الصلاحية')
      reason = required(reason); const date = now(), lossId = id('LOS'), totalCost = amount(quantity * batch.unitCost), balance = product.stock - quantity
      const movementType = kind === 'expired' ? 'expired_disposal' : 'damaged_disposal'
      await commit({
        batches: state.batches.map(b => b.id === batchId ? { ...b, quantity: b.quantity - quantity } : b),
        products: state.products.map(p => p.id === product.id ? { ...p, stock: balance } : p),
        movements: [{ id: id('MOV'), productId: product.id, name: product.name, amount: -quantity, date, reason, balance, batchId, type: movementType }, ...state.movements],
        inventoryLosses: [{ id: lossId, productId: product.id, batchId, lotNumber: batch.lotNumber, quantity, unitCost: batch.unitCost, totalCost, ...(batch.expiryDate ? { expiryDate: batch.expiryDate } : {}), kind, reason, userId: user.id, userName: user.name, date }, ...state.inventoryLosses],
        auditEvents: [{ id: id('AUD'), action: movementType, entityType: 'batch', entityId: batchId, reference: lossId, reason, userId: user.id, userName: user.name, date }, ...state.auditEvents],
      })
    },
    returnBatchToSupplier: async (batchId, quantity, reason) => {
      const user = access(true); fiscalFor(now()); const state = get(), batch = state.batches.find(b => b.id === batchId), product = batch && state.products.find(p => p.id === batch.productId), supplier = batch && state.suppliers.find(s => s.id === batch.supplierId)
      if (!batch || !product || !supplier || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > batch.quantity) throw new Error('كمية الإرجاع غير صالحة أو تتجاوز كمية الدفعة')
      reason = required(reason); const date = now(), returnId = id('RET'), total = amount(quantity * batch.unitCost), balance = product.stock - quantity
      await commit({
        batches: state.batches.map(b => b.id === batchId ? { ...b, quantity: b.quantity - quantity } : b),
        products: state.products.map(p => p.id === product.id ? { ...p, stock: balance } : p),
        suppliers: state.suppliers.map(s => s.id === supplier.id ? { ...s, balance: s.balance - total } : s),
        movements: [{ id: id('MOV'), productId: product.id, name: product.name, amount: -quantity, date, reason, balance, batchId, type: 'supplier_return' }, ...state.movements],
        supplierReturns: [{ id: returnId, productId: product.id, batchId, supplierId: supplier.id, purchaseId: batch.purchaseId, quantity, unitCost: batch.unitCost, total, reason, userId: user.id, userName: user.name, date }, ...state.supplierReturns],
        auditEvents: [{ id: id('AUD'), action: 'supplier_return', entityType: 'batch', entityId: batchId, reference: returnId, reason, userId: user.id, userName: user.name, date }, ...state.auditEvents],
      })
    },
    restoreBackup: async text => { access(true); const restored = parseBackup(text); await commit({ ...restored, setupComplete: true, users: get().users, activeUser: get().activeUser }) },
    backup: () => { access(true); const { users: _users, ...data } = snapshot(); return JSON.stringify({ format: 'Souk Al Dannyeh Backup', version: 6, exportedAt: now(), data }, null, 2) },
    markBackup: async () => { access(true); await commit({ lastBackup: now() }) },
  }
})
export const isAdmin = () => useAppStore.getState().users.some(u => u.id === useAppStore.getState().sessionId && u.role === 'admin' && u.active)

export async function initializeDesktopPersistence(): Promise<void> {
  if (!tauriRuntime()) return
  try {
    const { invoke } = await tauriApi()
    type StoredState = { revision: number; stateJson: string }
    const stored = await invoke<StoredState | null>('load_app_state')
    const current = Object.fromEntries(Object.keys(emptyData).map(key => [key, useAppStore.getState()[key as keyof Data]])) as Data
    if (stored && stored.revision > storageRevision) {
      const data = validateData(JSON.parse(stored.stateJson))
      storageRevision = stored.revision
      localStorage.setItem(storageKey, JSON.stringify({ state: data, version: 1, revision: storageRevision }))
      useAppStore.setState({ ...data, sessionId: null, loadError: '' })
    } else if (!stored && !current.setupComplete && !current.users.length) {
      // Keep a fresh database empty until setup creates the first administrator.
      storageRevision = -1
      return
    } else if (!stored || storageRevision > stored.revision) {
      await invoke('save_app_state', { expectedRevision: stored?.revision ?? -1, revision: storageRevision, stateJson: JSON.stringify(current) })
    }
  } catch (error) {
    console.error('SQLite initialization failed', error)
    useAppStore.setState({ loadError: 'تعذر فتح قاعدة البيانات المحلية. لم يتم تعديل بياناتك.' })
  }
}
