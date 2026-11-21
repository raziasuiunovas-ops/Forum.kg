/**
 * Test validateBody with strict mode
 * Verifies that strict mode works correctly for ZodObject
 * and gracefully handles other schema types
 */

import { z } from 'zod'
import { validateBody } from '../lib/api/errorHandler'

// Mock Request class
class MockRequest {
  private bodyText: string

  constructor(body: any) {
    this.bodyText = JSON.stringify(body)
  }

  async text() {
    return this.bodyText
  }

  async json() {
    return JSON.parse(this.bodyText)
  }
}

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL'
  details: string
}

const results: TestResult[] = []

// Test 1: ZodObject with strict mode should reject unknown fields
async function testStrictModeRejectsUnknown() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  })

  const request = new MockRequest({
    name: 'John',
    age: 30,
    unknownField: 'should be rejected',
  }) as any

  try {
    await validateBody(request, schema, { strict: true })
    results.push({
      test: 'Strict mode rejects unknown fields',
      status: 'FAIL',
      details: 'Expected validation error, but validation passed',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const hasUnrecognizedKey = error.issues.some(
        issue => issue.code === 'unrecognized_keys'
      )
      results.push({
        test: 'Strict mode rejects unknown fields',
        status: hasUnrecognizedKey ? 'PASS' : 'FAIL',
        details: hasUnrecognizedKey
          ? 'Unknown field rejected as expected'
          : `Got ZodError but wrong code: ${JSON.stringify(error.issues)}`,
      })
    } else {
      results.push({
        test: 'Strict mode rejects unknown fields',
        status: 'FAIL',
        details: `Wrong error type: ${error}`,
      })
    }
  }
}

// Test 2: ZodObject without strict mode should allow unknown fields
async function testNonStrictModeAllowsUnknown() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  })

  const request = new MockRequest({
    name: 'John',
    age: 30,
    unknownField: 'should be allowed',
  }) as any

  try {
    const result = await validateBody(request, schema, { strict: false })
    results.push({
      test: 'Non-strict mode allows unknown fields',
      status: 'PASS',
      details: `Validation passed, returned: ${JSON.stringify(result)}`,
    })
  } catch (error) {
    results.push({
      test: 'Non-strict mode allows unknown fields',
      status: 'FAIL',
      details: `Unexpected error: ${error}`,
    })
  }
}

// Test 3: ZodObject default (no options) should allow unknown fields
async function testDefaultModeAllowsUnknown() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  })

  const request = new MockRequest({
    name: 'John',
    age: 30,
    unknownField: 'should be allowed',
  }) as any

  try {
    const result = await validateBody(request, schema)
    results.push({
      test: 'Default mode allows unknown fields',
      status: 'PASS',
      details: `Validation passed, returned: ${JSON.stringify(result)}`,
    })
  } catch (error) {
    results.push({
      test: 'Default mode allows unknown fields',
      status: 'FAIL',
      details: `Unexpected error: ${error}`,
    })
  }
}

// Test 4: ZodString should work (no strict method)
async function testZodStringSchema() {
  const schema = z.string().min(1).max(100)

  const request = new MockRequest('Hello World') as any

  try {
    const result = await validateBody(request, schema, { strict: true })
    results.push({
      test: 'ZodString works with strict option',
      status: 'PASS',
      details: `Validation passed for non-object schema: "${result}"`,
    })
  } catch (error) {
    results.push({
      test: 'ZodString works with strict option',
      status: 'FAIL',
      details: `Unexpected error: ${error}`,
    })
  }
}

// Test 5: ZodArray should work (no strict method)
async function testZodArraySchema() {
  const schema = z.array(z.string())

  const request = new MockRequest(['item1', 'item2', 'item3']) as any

  try {
    const result = await validateBody(request, schema, { strict: true })
    results.push({
      test: 'ZodArray works with strict option',
      status: 'PASS',
      details: `Validation passed for array schema: ${JSON.stringify(result)}`,
    })
  } catch (error) {
    results.push({
      test: 'ZodArray works with strict option',
      status: 'FAIL',
      details: `Unexpected error: ${error}`,
    })
  }
}

// Test 6: Valid ZodObject data should pass in strict mode
async function testValidDataPassesStrictMode() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  })

  const request = new MockRequest({
    name: 'John',
    age: 30,
  }) as any

  try {
    const result = await validateBody(request, schema, { strict: true })
    results.push({
      test: 'Valid data passes strict mode',
      status: 'PASS',
      details: `Validation passed: ${JSON.stringify(result)}`,
    })
  } catch (error) {
    results.push({
      test: 'Valid data passes strict mode',
      status: 'FAIL',
      details: `Unexpected error: ${error}`,
    })
  }
}

// Test 7: Invalid data should fail regardless of strict mode
async function testInvalidDataFails() {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  })

  const request = new MockRequest({
    name: 'John',
    age: 'not a number', // Invalid type
  }) as any

  try {
    await validateBody(request, schema, { strict: true })
    results.push({
      test: 'Invalid data fails validation',
      status: 'FAIL',
      details: 'Expected validation error for invalid data',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      results.push({
        test: 'Invalid data fails validation',
        status: 'PASS',
        details: 'Invalid data rejected as expected',
      })
    } else {
      results.push({
        test: 'Invalid data fails validation',
        status: 'FAIL',
        details: `Wrong error type: ${error}`,
      })
    }
  }
}

// Test 8: Check that strict() is actually called on ZodObject
async function testStrictMethodActuallyCalled() {
  const schema = z.object({
    name: z.string(),
  })

  const request1 = new MockRequest({
    name: 'John',
    extra: 'field',
  }) as any

  const request2 = new MockRequest({
    name: 'John',
    extra: 'field',
  }) as any

  let strictRejected = false
  let nonStrictPassed = false

  try {
    await validateBody(request1, schema, { strict: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      strictRejected = error.issues.some(i => i.code === 'unrecognized_keys')
    }
  }

  try {
    await validateBody(request2, schema, { strict: false })
    nonStrictPassed = true
  } catch (error) {
    nonStrictPassed = false
  }

  if (strictRejected && nonStrictPassed) {
    results.push({
      test: 'Strict method actually changes behavior',
      status: 'PASS',
      details: 'strict:true rejects, strict:false allows - strict() is being called',
    })
  } else {
    results.push({
      test: 'Strict method actually changes behavior',
      status: 'FAIL',
      details: `strictRejected=${strictRejected}, nonStrictPassed=${nonStrictPassed}`,
    })
  }
}

async function runTests() {
  console.log('🧪 Testing validateBody with strict mode\n')
  console.log('=' .repeat(60))

  await testStrictModeRejectsUnknown()
  await testNonStrictModeAllowsUnknown()
  await testDefaultModeAllowsUnknown()
  await testZodStringSchema()
  await testZodArraySchema()
  await testValidDataPassesStrictMode()
  await testInvalidDataFails()
  await testStrictMethodActuallyCalled()

  console.log('\n' + '='.repeat(60))
  console.log('TEST RESULTS')
  console.log('='.repeat(60) + '\n')

  results.forEach((result, index) => {
    const icon = result.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} Test ${index + 1}: ${result.test}`)
    console.log(`   ${result.details}\n`)
  })

  const passedCount = results.filter(r => r.status === 'PASS').length
  const totalCount = results.length

  console.log('='.repeat(60))
  console.log(`SUMMARY: ${passedCount}/${totalCount} tests passed`)
  console.log('='.repeat(60))

  if (passedCount === totalCount) {
    console.log('\n🎉 All tests PASSED!')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests FAILED!')
    process.exit(1)
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
