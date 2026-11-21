const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const integrationRoot = path.join(projectRoot, 'tests', 'integration')
const healthTestPath = path.join(
  projectRoot,
  'app',
  'api',
  'v1',
  'health',
  '__tests__',
  'health.test.ts'
)

function findTestFiles(directory) {
  if (!fs.existsSync(directory)) return []

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return findTestFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [entryPath] : []
  })
}

function compiledPath(sourcePath) {
  const relativePath = path.relative(projectRoot, sourcePath).replace(/\.ts$/, '.js')
  return path.join(projectRoot, '.test-dist', relativePath)
}

function runTests(testSources, env, loadTsconfigAliases = false) {
  const testFiles = testSources.map(compiledPath)
  const runnerArgs = []
  if (loadTsconfigAliases) {
    runnerArgs.push('--require', path.join(__dirname, 'register-test-path-alias.cjs'))
  }
  runnerArgs.push('--test', ...testFiles)

  const result = spawnSync(process.execPath, runnerArgs, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error('Could not start the integration test runner.')
    return 1
  }

  return result.status === null ? 1 : result.status
}

function validateLocalTestDatabaseUrl(rawUrl) {
  if (!rawUrl) return 'TEST_DATABASE_URL is required for database integration tests.'

  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return 'TEST_DATABASE_URL is not a valid URL. Its value was not printed.'
  }

  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1'])
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  let databaseName

  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, '')).toLowerCase()
  } catch {
    return 'TEST_DATABASE_URL contains an invalid database name. Its value was not printed.'
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    return 'TEST_DATABASE_URL must use the PostgreSQL protocol. Its value was not printed.'
  }

  if (!allowedHosts.has(host) || !databaseName.endsWith('_test')) {
    return 'Database integration tests are restricted to localhost databases whose name ends in _test. URL was not printed.'
  }

  return null
}

const allTests = [
  ...findTestFiles(integrationRoot),
  ...(fs.existsSync(healthTestPath) ? [healthTestPath] : []),
].sort()
const databaseTests = allTests.filter((sourcePath) => {
  const relativePath = path.relative(integrationRoot, sourcePath)
  return relativePath.split(path.sep)[0] === 'database'
})
const apiTests = allTests.filter((sourcePath) => !databaseTests.includes(sourcePath))

if (allTests.length === 0) {
  console.log('No integration tests are configured; skipped without connecting to a database.')
  process.exit(0)
}

const compiler = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc')
const compile = spawnSync(process.execPath, [compiler, '--project', path.join(projectRoot, 'tsconfig.test.json')], {
  cwd: projectRoot,
  stdio: 'inherit',
})

if (compile.error) {
  console.error('Could not start the TypeScript compiler for integration tests.')
  process.exit(1)
}

if (compile.status !== 0) process.exit(compile.status || 1)

let exitCode = 0

if (apiTests.length > 0) {
  const isolatedApiEnv = { ...process.env, NODE_ENV: 'test' }
  for (const name of ['DATABASE_URL', 'DIRECT_URL', 'TEST_DATABASE_URL', 'SHADOW_DATABASE_URL']) {
    isolatedApiEnv[name] = ''
  }

  exitCode = runTests(apiTests, isolatedApiEnv, true) || exitCode
}

if (databaseTests.length > 0) {
  const urlError = validateLocalTestDatabaseUrl(process.env.TEST_DATABASE_URL)

  if (urlError) {
    if (process.env.TEST_DATABASE_URL) {
      console.error(urlError)
      exitCode = 1
    } else {
      console.log('Database integration tests skipped: set TEST_DATABASE_URL to a dedicated localhost database ending in _test.')
    }
  } else {
    const databaseTestEnv = {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DIRECT_URL: process.env.TEST_DATABASE_URL,
    }

    exitCode = runTests(databaseTests, databaseTestEnv, true) || exitCode
  }
}

process.exit(exitCode)
