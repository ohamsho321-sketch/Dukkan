import { beforeEach, describe, expect, it } from 'vitest'
import { formatMoney, parseMoney, setActiveCurrency } from './money'

describe('multi-currency money utilities', () => {
  beforeEach(() => setActiveCurrency('USD'))

  it('stores every currency in fixed thousandths without converting records', () => {
    expect(parseMoney('12.50')).toBe(12500)
    expect(parseMoney('5,250')).toBe(5250000)
    expect(parseMoney('١٢٫٥٠')).toBe(12500)
    expect(parseMoney('125000', 'LBP')).toBe(125000000)
    expect(parseMoney('12.500', 'LYD')).toBe(12500)
  })

  it('uses the correct display precision and symbol', () => {
    expect(formatMoney(12500)).toBe('12.50 $')
    expect(formatMoney(12500, false, 'SAR')).toBe('12.50 ر.س')
    expect(formatMoney(125000000, false, 'LBP')).toBe('125,000 ل.ل')
    expect(formatMoney(12500, false, 'LYD')).toBe('12.500 د.ل')
  })

  it('rejects invalid amounts and excess decimal places', () => {
    expect(() => parseMoney('not a number')).toThrow('InvalidAmount')
    expect(() => parseMoney('1.001')).toThrow('InvalidAmount')
    expect(() => parseMoney('1.1', 'LBP')).toThrow('InvalidAmount')
    expect(() => parseMoney(-1)).toThrow()
    expect(() => parseMoney(Infinity)).toThrow()
    expect(() => parseMoney(NaN)).toThrow()
  })
})
