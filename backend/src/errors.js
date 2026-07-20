class AppError extends Error {
  constructor(code, message, { status = 500, details, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ConfigurationError extends AppError {
  constructor(message, details) {
    super("CONFIGURATION_ERROR", message, { status: 500, details });
  }
}

class ValidationError extends AppError {
  constructor(code, message, details) {
    super(code || "VALIDATION_ERROR", message, { status: 400, details });
  }
}

class AuthenticationError extends AppError {
  constructor(code, message, { status = 401, details, cause } = {}) {
    super(code || "AUTHENTICATION_FAILED", message, { status, details, cause });
  }
}

class ExternalServiceError extends AppError {
  constructor(code, message, { status = 502, details, cause } = {}) {
    super(code || "EXTERNAL_SERVICE_ERROR", message, { status, details, cause });
  }
}

class SsoOriginError extends ExternalServiceError {
  constructor(origin, callbackUrl) {
    super(
      "SSO_ORIGIN_NOT_ALLOWED",
      "The configured SSO request origin is not registered with SevisPass.",
      { status: 502, details: { origin, callbackUrl } }
    );
  }
}

class SsoCredentialError extends ExternalServiceError {
  constructor() {
    super("SSO_CREDENTIALS_REJECTED", "SevisPass rejected the configured client credentials.", { status: 502 });
  }
}

class SsoCallbackError extends AuthenticationError {
  constructor(code, message) {
    super(code || "SSO_CALLBACK_INVALID", message || "The SevisPass callback could not be validated.", { status: 400 });
  }
}

class TokenVerificationError extends AuthenticationError {
  constructor(code, message, cause) {
    super(code || "TOKEN_VERIFICATION_FAILED", message || "The identity token could not be verified.", { status: 401, cause });
  }
}

module.exports = {
  AppError,
  ConfigurationError,
  ValidationError,
  AuthenticationError,
  ExternalServiceError,
  SsoOriginError,
  SsoCredentialError,
  SsoCallbackError,
  TokenVerificationError,
};
