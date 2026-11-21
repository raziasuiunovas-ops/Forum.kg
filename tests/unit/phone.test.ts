import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  arePhonesEqual,
  extractCountryCode,
  formatPhoneForDisplay,
  getMobileOperator,
  isValidKyrgyzstanPhone,
  normalizePhone,
} from '../../lib/utils/phone'

test('validates Kyrgyzstan E.164 numbers', () => {
  assert.equal(isValidKyrgyzstanPhone('+996555123456'), true)
  assert.equal(isValidKyrgyzstanPhone('+995555123456'), false)
  assert.equal(isValidKyrgyzstanPhone('+99655512345'), false)
  assert.equal(isValidKyrgyzstanPhone('+99655512345x'), false)
})

test('normalizes supported local and international input formats', () => {
  const expected = '+996555123456'

  assert.equal(normalizePhone(expected), expected)
  assert.equal(normalizePhone('996 555 123 456'), expected)
  assert.equal(normalizePhone('0555-123-456'), expected)
  assert.equal(normalizePhone('555 123 456'), expected)
})

test('returns null for unsupported phone formats', () => {
  assert.equal(normalizePhone('12345'), null)
  assert.equal(normalizePhone('+7 555 123 456'), null)
  assert.equal(normalizePhone('++996555123456'), null)
})

test('formats valid numbers and leaves invalid values unchanged', () => {
  assert.equal(formatPhoneForDisplay('+996555123456'), '+996 555 12 34 56')
  assert.equal(formatPhoneForDisplay('not a phone'), 'not a phone')
})

test('compares phone numbers after normalization', () => {
  assert.equal(arePhonesEqual('+996555123456', '0555 123 456'), true)
  assert.equal(arePhonesEqual('+996555123456', '+996700123456'), false)
  assert.equal(arePhonesEqual('invalid', '+996555123456'), false)
})

test('extracts international calling code and maps known operators', () => {
  assert.equal(extractCountryCode('+996555123456'), '996')
  assert.equal(extractCountryCode('0555123456'), null)
  assert.equal(getMobileOperator('+996555123456'), 'MegaCom')
  assert.equal(getMobileOperator('+996700123456'), 'Beeline')
  assert.equal(getMobileOperator('+996999123456'), 'Unknown')
})
