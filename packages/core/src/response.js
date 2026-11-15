const crypto = require('crypto')
const { isAppError } = require('./errors')

function newRequestId() {
  return crypto.randomUUID()
}

function okBody(data, requestId) {
  return { success: true, data: data === undefined ? null : data, error: null, requestId }
}

// Error internal (non-AppError) tidak pernah membocorkan pesan/stack ke client.
function errorBody(err, requestId) {
  if (isAppError(err)) {
    return {
      status: err.status,
      body: {
        success: false,
        data: null,
        error: { code: err.code, message: err.message, details: err.details },
        requestId
      }
    }
  }
  return {
    status: 500,
    body: {
      success: false,
      data: null,
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server', details: null },
      requestId
    }
  }
}

module.exports = { newRequestId, okBody, errorBody }
