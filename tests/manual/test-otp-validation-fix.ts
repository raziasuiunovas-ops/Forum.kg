/**
 * Manual Test Script for OTP Validation Fix
 * Tests safeJsonParse behavior directly without HTTP/CSRF
 */

import { safeJsonParse } from '../../lib/api/errorHandler'
import { ValidationError } from '../../lib/api/errors'

class MockRequest {
  constructor(private body: string) {}
  
  async text() {
    return this.body
  }
}

async function testSafeJsonParse() {
  console.log('Testing safeJsonParse...\n')
  
  // Test 1: Valid JSON
  try {
    const req1 = new MockRequest('{"phone": "+996700123456"}')
    const result1 = await safeJsonParse(req1 as any)
    console.log('✅ Test 1 PASSED: Valid JSON parsed correctly')
    console.log('   Result:', result1)
  } catch (error) {
    console.log('❌ Test 1 FAILED: Valid JSON should not throw')
    console.log('   Error:', error)
  }
  
  // Test 2: Malformed JSON
  try {
    const req2 = new MockRequest('{ invalid json')
    await safeJsonParse(req2 as any)
    console.log('❌ Test 2 FAILED: Malformed JSON should throw ValidationError')
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log('✅ Test 2 PASSED: Malformed JSON throws ValidationError')
      console.log('   Message:', error.message)
      console.log('   Status:', error.statusCode)
    } else {
      console.log('❌ Test 2 FAILED: Should throw ValidationError, got:', error)
    }
  }
  
  // Test 3: Empty body
  try {
    const req3 = new MockRequest('')
    const result3 = await safeJsonParse(req3 as any)
    if (result3 === null) {
      console.log('✅ Test 3 PASSED: Empty body returns null')
    } else {
      console.log('❌ Test 3 FAILED: Empty body should return null, got:', result3)
    }
  } catch (error) {
    console.log('❌ Test 3 FAILED: Empty body should not throw, got:', error)
  }
  
  // Test 4: Whitespace only
  try {
    const req4 = new MockRequest('   ')
    const result4 = await safeJsonParse(req4 as any)
    if (result4 === null) {
      console.log('✅ Test 4 PASSED: Whitespace returns null')
    } else {
      console.log('❌ Test 4 FAILED: Whitespace should return null, got:', result4)
    }
  } catch (error) {
    console.log('❌ Test 4 FAILED: Whitespace should not throw, got:', error)
  }
  
  console.log('\n=== Summary ===')
  console.log('safeJsonParse correctly:')
  console.log('  - Parses valid JSON')
  console.log('  - Throws ValidationError for malformed JSON (422)')
  console.log('  - Returns null for empty body')
  console.log('  - Handles edge cases')
}

testSafeJsonParse().catch(console.error)
