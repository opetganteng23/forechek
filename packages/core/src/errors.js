// Kode error aplikasi dan pemetaan ke status HTTP (MTS Bagian 23.1).
const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  QUOTA_EXCEEDED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_RATE_LIMITED: 503,
  REQUEST_IN_PROGRESS: 409,
  INTERNAL_ERROR: 500
}

class AppError extends Error {
  constructor(code, message, { details = null, status } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = ERROR_STATUS[code] ? code : 'INTERNAL_ERROR'
    this.status = status || ERROR_STATUS[this.code]
    this.details = details
  }
}

function isAppError(err) {
  return err instanceof AppError
}

module.exports = { AppError, isAppError, ERROR_STATUS }
