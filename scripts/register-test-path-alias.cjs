const path = require('node:path')
const Module = require('node:module')

const compiledRoot = path.resolve(__dirname, '..', '.test-dist')
const resolveFilename = Module._resolveFilename

Module._resolveFilename = function (request, parent, isMain, options) {
  const resolvedRequest = request.startsWith('@/')
    ? path.join(compiledRoot, request.slice(2))
    : request

  return resolveFilename.call(this, resolvedRequest, parent, isMain, options)
}
