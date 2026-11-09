import type { Business, Purchase, Sale } from '../types'
import { displayDate } from './data'
import { currencyDefinition, formatMoney } from './money'

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const label = (ar: string, en: string) => `<span class="ar">${escape(ar)}</span><small lang="en" dir="ltr">${escape(en)}</small>`
const translations: Record<string, string> = { 'نقدي': 'Cash', 'بطاقة': 'Card', 'تحويل': 'Bank transfer', 'صك': 'Cheque', 'قطعة': 'Piece', 'كرتونة': 'Carton', 'كيس': 'Bag', 'كيلو': 'kg', 'لتر': 'Litre', 'علبة': 'Box', 'غير مسجلة': 'Not recorded' }

export function invoiceHtml(business: Business, invoice: Sale | Purchase) {
  const purchase = 'supplier' in invoice
  const discount = 'discount' in invoice ? invoice.discount || 0 : 0
  const currency = currencyDefinition(business.currency)
  const amount = (value: number) => { const formatted = formatMoney(value, false, currency.code); return `<bdi>${escape(formatted.slice(0, formatted.length - currency.symbol.length).trim())}</bdi> <span class="currency">${escape(currency.symbol)} <small lang="en">${currency.code}</small></span>` }
  // Display the full identifier, separate from the shop name, to preserve uniqueness.
  const field = (ar: string, en: string, value: string) => `<div class="field">${label(ar, en)}<div class="value">${escape(value || '—')}</div></div>`
  const totalRow = (ar: string, en: string, value: number, cls = '') => `<div class="total-row ${cls}"><div>${label(ar, en)}</div><strong>${amount(value)}</strong></div>`
  const logo = /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(business.logo) ? `<img class="logo" src="${escape(business.logo)}" alt="${escape(business.name)}" />` : ''
  const rows = (invoice.lines || []).map((line, index) => {
    const price = purchase ? line.cost : line.price
    return `<tr><td>${index + 1}</td><td class="item">${escape(line.name)}</td><td>${escape(line.qty)}</td><td>${label(line.unit, translations[line.unit] || '')}</td><td>${amount(price)}</td><td>${amount(price * line.qty)}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Invoice ${escape(invoice.id)}</title><style>
    @page{size:A4;margin:14mm}
    *{box-sizing:border-box}body{margin:0;font:14px/1.6 Tahoma,Arial,sans-serif;color:#172b40;background:white}
    small{display:block;font:10px/1.5 Arial,sans-serif;color:#687583;font-weight:400;text-align:inherit}.ar{display:block;font-size:14px;font-weight:600}
    header{display:flex;justify-content:space-between;gap:24px;padding-bottom:20px;border-bottom:3px solid #243e57}
    .shop{display:flex;align-items:center;gap:15px;min-width:0}.logo{width:76px;height:76px;object-fit:contain}h1{font-size:24px;margin:0 0 5px;overflow-wrap:anywhere}h2{font-size:22px;margin:0}.document-type{flex-shrink:0;text-align:left}.document-type small{font-size:12px}
    .contact{margin:4px 0;color:#35495c}.contact small{display:inline;margin-inline-start:7px}.invoice-id{margin:14px 0;padding:9px 12px;background:#f3f5f7;border:1px solid #dce2e8}.invoice-id bdi{font:11px/1.6 Arial,sans-serif;overflow-wrap:anywhere;display:block}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;margin:20px 0}.field{border-bottom:1px solid #e3e7eb;padding-bottom:8px}.value{margin-top:4px;overflow-wrap:anywhere}.field,.invoice-id,.signature{text-align:right}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px}thead{display:table-header-group}th{background:#f0f3f6;text-align:right;border-bottom:2px solid #9eabb8;padding:10px 7px}td{padding:12px 7px;border-bottom:1px solid #dce2e8;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}td .ar{font-weight:400}td bdi{white-space:nowrap;font-size:12px}.currency{font-size:10px;white-space:nowrap}.currency small{display:inline;font-size:9px}
    .summary{width:58%;margin:22px 0 0 auto;break-inside:avoid}.total-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 10px;border-bottom:1px solid #dce2e8}.total-row strong{white-space:nowrap;font-size:15px}.grand{background:#edf2f6;border-top:2px solid #243e57}.grand .ar,.grand strong{font-size:17px}
    .note{font-size:12px;color:#596a7a;margin-top:12px}.footer{margin-top:34px;break-inside:avoid}.signatures{display:flex;justify-content:space-between;gap:50px;margin-bottom:30px}.signature{width:42%;padding-top:32px}.signature-line{border-top:1px solid #91a0ae;padding-top:8px}.thanks{text-align:center;border-top:1px solid #dce2e8;padding-top:18px}.thanks .ar{font-size:19px}.thanks small{font-size:11px}
    @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body>
    <header><div class="shop">${logo}<div><h1>${escape(business.name)}</h1><p class="contact">${escape(business.address)}</p><p class="contact"><span>الهاتف</span><small lang="en">Phone</small> <bdi>${escape(business.phone)}</bdi></p>${business.taxNumber ? `<p class="contact">الرقم الضريبي <small lang="en">Tax ID</small> <bdi>${escape(business.taxNumber)}</bdi></p>` : ''}</div></div><div class="document-type"><h2>${purchase ? 'فاتورة شراء' : 'فاتورة بيع'}</h2><small lang="en">${purchase ? 'PURCHASE INVOICE' : 'SALES INVOICE'}</small></div></header>
    <div class="invoice-id">${label('رقم الفاتورة', 'Invoice number')}<bdi>${escape(invoice.id)}</bdi></div>
    <section class="details">${field('التاريخ', 'Date', displayDate(invoice.date))}${field(purchase ? 'المورد' : 'العميل', purchase ? 'Supplier' : 'Customer', purchase ? invoice.supplier : invoice.customer)}${!purchase ? `<div class="field">${label('طريقة الدفع', 'Payment method')}<div class="value">${label(invoice.method || 'غير مسجلة', translations[invoice.method || 'غير مسجلة'] || '')}</div></div>${field('البائع', 'Cashier', invoice.cashier)}` : ''}</section>
    <table><colgroup><col style="width:5%"><col style="width:29%"><col style="width:10%"><col style="width:12%"><col style="width:22%"><col style="width:22%"></colgroup><thead><tr>${[['م', 'No.'], ['الصنف', 'Item'], ['الكمية', 'Qty'], ['الوحدة', 'Unit'], ['السعر', 'Unit price'], ['الإجمالي', 'Amount']].map(([ar,en]) => `<th>${label(ar,en)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="6">${label('تفاصيل الأصناف غير متوفرة لهذه الفاتورة القديمة', 'Item details are unavailable for this legacy invoice')}</td></tr>`}</tbody></table>
    <section class="summary">${totalRow('المجموع قبل الخصم', 'Subtotal', invoice.total + discount)}${totalRow('الخصم', 'Discount', discount)}${totalRow('الصافي', 'Total', invoice.total, 'grand')}${totalRow('المدفوع عند البيع', 'Paid at issue', invoice.paid)}${totalRow('المتبقي عند البيع', 'Balance at issue', Math.max(0, invoice.total - invoice.paid))}${invoice.paid > invoice.total ? totalRow('الباقي للعميل', 'Change', invoice.paid - invoice.total) : ''}</section>
    <footer class="footer"><div class="signatures"><div class="signature"><div class="signature-line">${label('توقيع البائع', 'Seller signature')}</div></div><div class="signature"><div class="signature-line">${label('توقيع المستلم', 'Recipient signature')}</div></div></div><div class="thanks">${label('شكرا لإختيــــــــاركم لنا...', 'Thank you for choosing us!')}</div></footer>
  </body></html>`
}

export async function printInvoice(business: Business, invoice: Sale | Purchase) {
  const frame = document.createElement('iframe')
  frame.title = 'طباعة الفاتورة / Print invoice'
  frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;left:0;border:0'
  document.body.append(frame)
  const doc = frame.contentDocument!, win = frame.contentWindow!
  doc.open(); doc.write(invoiceHtml(business, invoice)); doc.close()
  await Promise.all(Array.from(doc.images).map(img => img.decode().catch(() => undefined)))
  await doc.fonts.ready
  win.addEventListener('afterprint', () => frame.remove(), { once: true })
  win.requestAnimationFrame(() => { win.focus(); win.print() })
}
