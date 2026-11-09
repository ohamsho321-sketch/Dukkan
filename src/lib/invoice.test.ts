import { describe, expect, it } from 'vitest'
import { invoiceHtml } from './invoice'
import { emptyData } from './data'
import type { Sale } from '../types'

const sale: Sale = { id: 'SAL-example', customer: 'أحمد', total: 790000, paid: 390000, status: 'جزئية', date: '2026-09-14T09:00:00', cashier: 'طارق', items: 20, discount: 10000, method: 'نقدي', lines: [{ productId: 'rice', name: 'رز بسمتي', unit: 'كيس', qty: 20, price: 40000, cost: 30000 }] }
describe('invoice printing', () => {
  it('keeps contact details outside the item table and displays correct discounted and credit amounts', () => {
    const html = invoiceHtml({ ...emptyData.business, name: 'متجر', phone: '0912345678', currency: 'LYD' }, sale)
    const table = html.slice(html.indexOf('<table>'), html.indexOf('</table>'))
    expect(table).toContain('رز بسمتي')
    expect(table).not.toContain('0912345678')
    for (const amount of ['800.000', '10.000', '790.000', '390.000', '400.000']) expect(html).toContain(amount)
    expect(html).toContain('Seller signature')
    expect(html).toContain('شكرا لإختيــــــــاركم لنا...')
  })
  it('escapes user input and handles legacy invoices without fabricating line details', () => {
    const html = invoiceHtml({ ...emptyData.business, name: '<script>alert(1)</script>', logo: 'javascript:alert(1)' }, { ...sale, lines: undefined })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('src="javascript:')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Item details are unavailable')
  })
})
