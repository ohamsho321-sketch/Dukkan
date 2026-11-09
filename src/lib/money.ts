export const MONEY_SCALE = 1000

export type CurrencyCode = 'USD' | 'LBP' | 'SAR' | 'LYD'
export type CurrencyDefinition = { code: CurrencyCode; label: string; symbol: string; decimals: number }

export const CURRENCIES: Record<CurrencyCode, CurrencyDefinition> = {
  USD: { code: 'USD', label: 'الدولار الأميركي', symbol: '$', decimals: 2 },
  LBP: { code: 'LBP', label: 'الليرة اللبنانية', symbol: 'ل.ل', decimals: 0 },
  SAR: { code: 'SAR', label: 'الريال السعودي', symbol: 'ر.س', decimals: 2 },
  LYD: { code: 'LYD', label: 'الدينار الليبي (بيانات قديمة)', symbol: 'د.ل', decimals: 3 },
}

let activeCurrency: CurrencyCode = 'USD'

export function normalizeCurrency(value?: string): CurrencyCode {
  if (value && value in CURRENCIES) return value as CurrencyCode
  if (value === 'الدينار الليبي') return 'LYD'
  if (value === 'الدولار الأميركي' || value === 'الدولار الأمريكي') return 'USD'
  if (value === 'الليرة اللبنانية') return 'LBP'
  if (value === 'الريال السعودي') return 'SAR'
  return 'USD'
}

export function setActiveCurrency(value?: string) { activeCurrency = normalizeCurrency(value) }
export function currencyDefinition(value?: string) { return CURRENCIES[normalizeCurrency(value || activeCurrency)] }

// Amounts are always stored in fixed 1/1000 units. Changing the display currency never
// rewrites, converts or rounds existing records; it only changes validated input and display.
export function parseMoney(value: string | number, currency?: string): number {
  const definition = currencyDefinition(currency)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * MONEY_SCALE))) throw new Error('أدخل مبلغاً صحيحاً غير سالب')
    const minor = Math.round(value * MONEY_SCALE)
    if (minor % 10 ** (3 - definition.decimals) !== 0) throw new Error('InvalidAmount')
    return minor
  }
  const normalized = value
    .replace(/[٬,\s]/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace('٫', '.')
  const amount = Number(normalized)
  const pattern = definition.decimals ? new RegExp(`^\\d+(\\.\\d{0,${definition.decimals}})?$`) : /^\d+$/
  if (!normalized || !pattern.test(normalized) || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * MONEY_SCALE))) throw new Error('InvalidAmount')
  return Math.round(amount * MONEY_SCALE)
}

export function formatMoney(minor: number, compact = false, currency?: string): string {
  const definition = currencyDefinition(currency)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: definition.decimals,
    maximumFractionDigits: definition.decimals,
    notation: compact ? 'compact' : 'standard'
  }).format(minor / MONEY_SCALE) + ' ' + definition.symbol
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-LB').format(value)
}
