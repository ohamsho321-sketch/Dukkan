import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './store'
import { emptyData, parseBackup } from './lib/data'
import type { Product } from './types'

let saved = ''
const business = { ...emptyData.business, name: 'Test Store' }
beforeEach(async () => {
  saved = ''
  vi.stubGlobal('localStorage', { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value } })
  useAppStore.setState({ ...structuredClone(emptyData), sessionId: null, loadError: '' })
  await useAppStore.getState().completeSetup(business, { name: 'Admin', username: 'admin', password: 'test-only-123' })
})
async function seed() {
  const s = useAppStore.getState()
  await s.addProduct({ name: 'Rice', category: 'Food', unit: 'Bag', cost: 2000, price: 5000, wholesalePrice: 4000, stock: 3, minStock: 1, trackInventory: true, status: 'active' })
  await s.addCustomer({ name: 'Customer', phone: '', city: '' })
  await s.addSupplier({ name: 'Supplier', phone: '', city: '' })
  return { product: useAppStore.getState().products[0], customer: useAppStore.getState().customers[0], supplier: useAppStore.getState().suppliers[0] }
}
describe('business transactions', () => {
  it('updates fully paid customer purchases and stock; retains line cost and payment method', async () => {
    const { product, customer } = await seed()
    const sale = await useAppStore.getState().completeSale([{ productId: product.id, qty: 2 }], 10000, customer.id, 'بطاقة', 0)
    expect(sale.lines?.[0].cost).toBe(2000)
    expect(sale.method).toBe('بطاقة')
    expect(useAppStore.getState().customers[0]).toMatchObject({ purchases: 10000, balance: 0, lastPurchase: sale.date })
    expect(useAppStore.getState().products[0].stock).toBe(1)
    expect(JSON.parse(saved).state.sales[0].id).toBe(sale.id)
  })
  it('rejects overselling even if duplicated cart lines individually fit', async () => {
    const { product } = await seed(), before = saved
    await expect(useAppStore.getState().completeSale([{ productId: product.id, qty: 2 }, { productId: product.id, qty: 2 }], 20000, '', 'نقدي', 0)).rejects.toThrow()
    expect(saved).toBe(before)
    expect(useAppStore.getState().products[0].stock).toBe(3)
    expect(useAppStore.getState().sales).toHaveLength(0)
  })
  it('records credit, discount and later payments without double counting purchases', async () => {
    const { product, customer } = await seed(), s = useAppStore.getState()
    await s.completeSale([{ productId: product.id, qty: 2 }], 3000, customer.id, 'نقدي', 1000)
    expect(useAppStore.getState().customers[0]).toMatchObject({ balance: 6000, purchases: 9000 })
    await s.recordPayment('customer', customer.id, 2000, 'Payment')
    expect(useAppStore.getState().customers[0]).toMatchObject({ balance: 4000, purchases: 9000 })
    await expect(s.recordPayment('customer', customer.id, 5000, '')).rejects.toThrow()
  })
  it('records partial sales returns, restores stock and separates credit from cash refund', async () => {
    const { product, customer } = await seed(), s = useAppStore.getState()
    const sale = await s.completeSale([{ productId: product.id, qty: 2 }], 3000, customer.id, 'نقدي', 1000)
    const first = await s.returnSale(sale.id, [{ productId: product.id, qty: 1 }], 'غير مناسب')
    expect(first).toMatchObject({ total: 4500, creditApplied: 4500, cashRefund: 0 })
    expect(useAppStore.getState().customers[0]).toMatchObject({ balance: 1500, purchases: 4500 })
    expect(useAppStore.getState().products[0].stock).toBe(2)
    const second = await s.returnSale(sale.id, [{ productId: product.id, qty: 1 }], 'إرجاع الباقي')
    expect(second).toMatchObject({ total: 4500, creditApplied: 1500, cashRefund: 3000 })
    expect(useAppStore.getState().customers[0]).toMatchObject({ balance: 0, purchases: 0 })
    expect(useAppStore.getState().products[0].stock).toBe(3)
    await expect(s.returnSale(sale.id, [{ productId: product.id, qty: 1 }], 'زائد')).rejects.toThrow('تتجاوز')
  })
  it('records purchases and updates weighted cost, inventory and supplier debt', async () => {
    const { product, supplier } = await seed()
    await useAppStore.getState().completePurchase(supplier.id, [{ productId: product.id, qty: 3, cost: 4000 }], 2000, '2026-09-12', '')
    expect(useAppStore.getState().products[0]).toMatchObject({ stock: 6, cost: 3000 })
    expect(useAppStore.getState().suppliers[0]).toMatchObject({ purchases: 12000, balance: 10000 })
    expect(useAppStore.getState().purchases).toHaveLength(1)
    expect(useAppStore.getState().movements[0].amount).toBe(3)
  })
  it('leaves the whole transaction unchanged when persistent storage fails', async () => {
    const { product } = await seed()
    localStorage.setItem = () => { throw new Error('quota') }
    await expect(useAppStore.getState().completeSale([{ productId: product.id, qty: 1 }], 5000, '', 'نقدي', 0)).rejects.toThrow('تعذر حفظ')
    expect(useAppStore.getState().sales).toHaveLength(0)
    expect(useAppStore.getState().products[0].stock).toBe(3)
  })
  it('validates stock adjustments and persists the chosen product attributes and settings', async () => {
    const { product } = await seed(), s = useAppStore.getState()
    expect(product).toMatchObject({ category: 'Food', unit: 'Bag' })
    await expect(s.adjustStock(product.id, -4, 'test')).rejects.toThrow()
    await s.adjustStock(product.id, -2, 'Damaged')
    expect(useAppStore.getState().movements[0]).toMatchObject({ reason: 'Damaged', balance: 1 })
    await s.updateBusiness({ phone: '123', address: 'City', taxNumber: '456', type: 'خدمات' })
    expect(JSON.parse(saved).state.business).toMatchObject({ phone: '123', address: 'City', taxNumber: '456', type: 'خدمات' })
    await s.addExpense({ category: 'نقل', note: 'delivery', amount: 1000 })
    expect(useAppStore.getState().expenses[0].category).toBe('نقل')
  })
})
describe('accounts and backups', () => {
  it('links transactions to an open fiscal year and blocks locked periods', async () => {
    const { product } = await seed(), s = useAppStore.getState(), year = s.fiscalYears[0]
    const sale = await s.completeSale([{ productId: product.id, qty: 1 }], 5000, '', 'نقدي', 0)
    expect(sale.fiscalYearId).toBe(year.id)
    await s.setFiscalYearStatus(year.id, 'locked')
    await expect(s.addExpense({ category: 'نقل', note: 'blocked', amount: 1000 })).rejects.toThrow('ليست مفتوحة')
    await expect(s.completeSale([{ productId: product.id, qty: 1 }], 5000, '', 'نقدي', 0)).rejects.toThrow('ليست مفتوحة')
  })
  it('rejects overlapping fiscal years and keeps final closure irreversible', async () => {
    const s = useAppStore.getState(), year = s.fiscalYears[0]
    await expect(s.addFiscalYear('متداخلة', year.startDate, year.endDate)).rejects.toThrow('تتداخل')
    await s.markBackup()
    const next = await s.closeFiscalYear(year.id)
    expect(next.startDate).toBe('2027-01-01')
    expect(useAppStore.getState().fiscalYears.find(y => y.id === year.id)?.closingSummary).toBeTruthy()
    await expect(s.setFiscalYearStatus(year.id, 'open')).rejects.toThrow('لا يمكن إعادة فتحها')
  })
  it('hashes passwords and requires login after logout', async () => {
    expect(saved).not.toContain('test-only-123')
    const s = useAppStore.getState(); s.logout()
    expect(useAppStore.getState().sessionId).toBeNull()
    await expect(s.updateBusiness({ name: 'x' })).rejects.toThrow()
    await expect(s.login('admin', 'wrong')).rejects.toThrow()
    await s.login('admin', 'test-only-123')
    expect(useAppStore.getState().sessionId).toBeTruthy()
    expect(JSON.parse(saved).state.sessionId).toBeUndefined()
  })
  it('limits sales staff to completing sales only', async () => {
    const { product, customer, supplier } = await seed(), s = useAppStore.getState()
    await s.completeSale([{ productId: product.id, qty: 1 }], 0, customer.id, 'نقدي', 0)
    await s.addUser('Cashier', 'cash', 'cash-test-123', 'cashier')
    s.logout(); await s.login('cash', 'cash-test-123')
    await expect(s.updateBusiness({ name: 'bad' })).rejects.toThrow()
    await expect(s.completePurchase(supplier.id, [{ productId: product.id, qty: 1, cost: 10 }], 10, '2026-09-12', '')).rejects.toThrow()
    await expect(s.addCustomer({ name: 'Hidden customer', phone: '', city: '' })).rejects.toThrow()
    await expect(s.recordPayment('customer', customer.id, 1000, '')).rejects.toThrow()
    expect(() => s.backup()).toThrow()
    await expect(s.completeSale([{ productId: product.id, qty: 1 }], 5000, '', 'نقدي', 0)).resolves.toBeTruthy()
  })
  it('rejects null business and malformed rows without replacing existing data', async () => {
    await seed(); const s = useAppStore.getState(), backup = JSON.parse(s.backup()), before = saved
    backup.data.business = null
    await expect(s.restoreBackup(JSON.stringify(backup))).rejects.toThrow()
    backup.data.business = business; backup.data.products[0].price = 'wrong'
    await expect(s.restoreBackup(JSON.stringify(backup))).rejects.toThrow()
    expect(saved).toBe(before)
  })
  it('round trips business backups without exporting or replacing credentials', async () => {
    await seed(); const s = useAppStore.getState(), user = s.users[0], backup = s.backup()
    expect(backup).not.toContain(user.hash)
    await s.updateBusiness({ name: 'Changed' }); await s.restoreBackup(backup)
    expect(useAppStore.getState().business.name).toBe('Test Store')
    expect(useAppStore.getState().users[0].hash).toBe(user.hash)
    expect(useAppStore.getState().products).toHaveLength(1)
  })
  it('accepts valid old backups without inventing dates or invoice details', () => {
    const data = { ...structuredClone(emptyData), business, users: undefined, purchases: undefined, movements: undefined, payments: undefined, sales: [{ id: 'old', customer: 'Old', total: 1000, paid: 0, date: 'أمس', status: 'آجلة', cashier: 'Old', items: 1 }] }
    const restored = parseBackup(JSON.stringify({ format: 'Dukkan Backup', version: 1, data }))
    expect(restored.sales[0].date).toBe('أمس')
    expect(restored.sales[0].lines).toBeUndefined()
  })
})

describe('batch and expiry inventory', () => {
  async function seedBatchProduct() {
    const s = useAppStore.getState()
    await s.addProduct({ name: 'Milk', category: 'Food', unit: 'Bottle', cost: 1000, price: 2000, wholesalePrice: 1500, stock: 0, minStock: 2, trackInventory: true, trackBatches: true, trackExpiry: true, expiryWarningDays: 30, status: 'active' })
    await s.addSupplier({ name: 'Dairy', phone: '', city: '' })
    return { product: useAppStore.getState().products[0], supplier: useAppStore.getState().suppliers[0] }
  }

  it('creates multiple purchase batches and keeps their quantities and costs', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 5, cost: 1100, lotNumber: 'LOT-1', expiryDate: '2099-01-10' }], 0, '2026-09-12', '')
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 8, cost: 1300, lotNumber: 'LOT-2', expiryDate: '2099-02-10' }], 0, '2026-09-13', '')
    expect(useAppStore.getState().products[0].stock).toBe(13)
    expect(useAppStore.getState().batches.map(b => [b.lotNumber, b.quantity, b.unitCost])).toEqual([['LOT-1', 5, 1100], ['LOT-2', 8, 1300]])
    expect(useAppStore.getState().movements.every(m => Boolean(m.batchId))).toBe(true)
  })

  it('keeps identical lot numbers from separate receipts traceable to their suppliers', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.addSupplier({ name: 'Second Dairy', phone: '', city: '' })
    const secondSupplier = useAppStore.getState().suppliers.find(x => x.id !== supplier.id)!
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 2, cost: 1000, lotNumber: 'SHARED', expiryDate: '2099-01-01' }], 0, '2026-09-12', '')
    await s.completePurchase(secondSupplier.id, [{ productId: product.id, qty: 3, cost: 1200, lotNumber: 'SHARED', expiryDate: '2099-01-01' }], 0, '2026-09-13', '')
    expect(useAppStore.getState().batches).toHaveLength(2)
    expect(new Set(useAppStore.getState().batches.map(b => b.supplierId))).toEqual(new Set([supplier.id, secondSupplier.id]))
    const secondBatch = useAppStore.getState().batches.find(b => b.supplierId === secondSupplier.id)!
    await s.returnBatchToSupplier(secondBatch.id, 1, 'مرتجع استلام')
    expect(useAppStore.getState().supplierReturns[0].supplierId).toBe(secondSupplier.id)
  })

  it('uses FEFO across batches and records the actual batch-level cost', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 3, cost: 1200, lotNumber: 'LATE', expiryDate: '2099-03-01' }], 0, '2026-09-12', '')
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 2, cost: 900, lotNumber: 'EARLY', expiryDate: '2099-01-01' }], 0, '2026-09-12', '')
    const sale = await s.completeSale([{ productId: product.id, qty: 4 }], 8000, '', 'نقدي', 0)
    expect(sale.lines?.[0].batchAllocations?.map(a => [a.lotNumber, a.quantity, a.unitCost])).toEqual([['EARLY', 2, 900], ['LATE', 2, 1200]])
    expect(useAppStore.getState().batches.map(b => [b.lotNumber, b.quantity])).toEqual([['LATE', 1], ['EARLY', 0]])
  })

  it('prevents expired stock from being sold and includes batches in backups', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 2, cost: 1000, lotNumber: 'OLD', expiryDate: '2000-01-01' }], 0, '2026-09-12', '')
    await expect(s.completeSale([{ productId: product.id, qty: 1 }], 2000, '', 'نقدي', 0)).rejects.toThrow('الكمية الصالحة للبيع غير كافية')
    const backup = JSON.parse(s.backup())
    expect(backup.version).toBe(6)
    expect(backup.data.batches[0]).toMatchObject({ lotNumber: 'OLD', quantity: 2, unitCost: 1000 })
    const restored = parseBackup(JSON.stringify(backup))
    expect(restored.batches).toHaveLength(1)
  })

  it('disposes expired stock with historical cost, movement and audit records', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 5, cost: 1250, lotNumber: 'EXPIRED', expiryDate: '2000-01-01' }], 0, '2026-09-12', '')
    const batch = useAppStore.getState().batches[0]
    await s.disposeBatchStock(batch.id, 2, 'expired', 'انتهاء الصلاحية')
    expect(useAppStore.getState().products[0].stock).toBe(3)
    expect(useAppStore.getState().batches[0].quantity).toBe(3)
    expect(useAppStore.getState().inventoryLosses[0]).toMatchObject({ quantity: 2, unitCost: 1250, totalCost: 2500, kind: 'expired' })
    expect(useAppStore.getState().movements[0]).toMatchObject({ amount: -2, batchId: batch.id, type: 'expired_disposal' })
    expect(useAppStore.getState().auditEvents[0]).toMatchObject({ action: 'expired_disposal', entityId: batch.id, reason: 'انتهاء الصلاحية' })
    const restored = parseBackup(s.backup())
    expect(restored.inventoryLosses[0].totalCost).toBe(2500)
    expect(restored.auditEvents[0].reference).toBe(restored.inventoryLosses[0].id)
  })

  it('returns a batch to its supplier and updates stock and payable atomically', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 5, cost: 1000, lotNumber: 'RETURN', expiryDate: '2099-01-01' }], 0, '2026-09-12', '')
    const batch = useAppStore.getState().batches[0]
    await s.returnBatchToSupplier(batch.id, 2, 'قرب انتهاء الصلاحية')
    expect(useAppStore.getState().products[0].stock).toBe(3)
    expect(useAppStore.getState().suppliers[0]).toMatchObject({ balance: 3000, purchases: 5000 })
    expect(useAppStore.getState().supplierReturns[0]).toMatchObject({ quantity: 2, unitCost: 1000, total: 2000, supplierId: supplier.id })
    expect(useAppStore.getState().auditEvents[0].action).toBe('supplier_return')
  })

  it('restricts batch operations to admins and validates batch adjustments', async () => {
    const { product, supplier } = await seedBatchProduct(), s = useAppStore.getState()
    await s.completePurchase(supplier.id, [{ productId: product.id, qty: 2, cost: 1000, lotNumber: 'CONTROLLED', expiryDate: '2099-01-01' }], 0, '2026-09-12', '')
    const batch = useAppStore.getState().batches[0]
    await expect(s.adjustBatchStock(batch.id, -3, 'خطأ')).rejects.toThrow()
    await s.adjustBatchStock(batch.id, 1, 'جرد فعلي')
    expect(useAppStore.getState().batches[0].quantity).toBe(3)
    await s.addUser('Cashier', 'batch-cash', 'cash-test-123', 'cashier')
    s.logout(); await s.login('batch-cash', 'cash-test-123')
    await expect(s.disposeBatchStock(batch.id, 1, 'damaged', 'تالف')).rejects.toThrow('ليست لديك صلاحية')
    expect(useAppStore.getState().batches[0].quantity).toBe(3)
  })
})
