export type Product = {
  id: string
  name: string
  sku: string
  barcode?: string
  category: string
  unit: string
  cost: number
  price: number
  wholesalePrice: number
  stock: number
  minStock: number
  trackInventory: boolean
  trackBatches: boolean
  trackExpiry: boolean
  expiryWarningDays: number
  status: 'active' | 'inactive'
}

export type InventoryBatch = {
  id: string
  productId: string
  lotNumber: string
  quantity: number
  productionDate?: string
  expiryDate?: string
  unitCost: number
  supplierId: string
  purchaseId: string
  createdAt: string
}

export type BatchAllocation = {
  batchId: string
  lotNumber: string
  quantity: number
  unitCost: number
  expiryDate?: string
}

export type InventoryLoss = {
  id: string
  productId: string
  batchId: string
  lotNumber: string
  quantity: number
  unitCost: number
  totalCost: number
  expiryDate?: string
  kind: 'expired' | 'damaged'
  reason: string
  userId: string
  userName: string
  date: string
}

export type SupplierReturn = {
  id: string
  productId: string
  batchId: string
  supplierId: string
  purchaseId: string
  quantity: number
  unitCost: number
  total: number
  reason: string
  userId: string
  userName: string
  date: string
}

export type AuditEvent = {
  id: string
  action: 'batch_adjustment' | 'expired_disposal' | 'damaged_disposal' | 'supplier_return'
  entityType: 'batch'
  entityId: string
  reference: string
  reason: string
  userId: string
  userName: string
  date: string
}

export type Customer = { id: string; name: string; phone: string; city: string; balance: number; purchases: number; lastPurchase: string }
export type Supplier = { id: string; name: string; phone: string; city: string; balance: number; purchases: number; lastPurchase: string }
export type SaleLine = { productId: string; name: string; unit: string; qty: number; price: number; cost: number; batchAllocations?: BatchAllocation[] }
export type Sale = { id: string; customer: string; customerId?: string; total: number; paid: number; status: 'مدفوعة' | 'آجلة' | 'جزئية'; date: string; cashier: string; items: number; lines?: SaleLine[]; method?: string; discount?: number; fiscalYearId?: string }
export type SaleReturnLine = SaleLine
export type SaleReturn = { id: string; saleId: string; customerId?: string; total: number; creditApplied: number; cashRefund: number; lines: SaleReturnLine[]; reason: string; userId: string; userName: string; date: string; fiscalYearId?: string }
export type Purchase = { id: string; supplierId: string; supplier: string; date: string; total: number; paid: number; lines: SaleLine[]; note: string; fiscalYearId?: string }
export type StockMovement = { id: string; productId: string; name: string; amount: number; date: string; reason: string; balance: number; batchId?: string; type?: 'sale' | 'sale_return' | 'purchase' | 'adjustment' | 'expired_disposal' | 'damaged_disposal' | 'supplier_return' }
export type Payment = { id: string; partyId: string; kind: 'customer' | 'supplier'; amount: number; date: string; note: string; fiscalYearId?: string }
export type AppUser = { id: string; name: string; username: string; salt: string; hash: string; role: 'admin' | 'cashier'; active: boolean }
export type FiscalYearSummary = { sales: number; costOfGoods: number; expenses: number; inventoryLosses: number; estimatedProfit: number; inventoryValue: number; receivables: number; payables: number }
export type FiscalYear = { id: string; name: string; startDate: string; endDate: string; status: 'open' | 'locked' | 'closed'; createdAt: string; closedAt?: string; closingSummary?: FiscalYearSummary }
export type Expense = { id: string; category: string; note: string; amount: number; date: string; fiscalYearId?: string }

export type Business = {
  name: string
  type: string
  phone: string
  address: string
  taxNumber: string
  logo: string
  primaryColor: string
  currency: string
}
