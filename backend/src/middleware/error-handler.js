const { AppError } = require("../errors");

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: `No route matches ${req.method} ${req.path}.` },
  });
}

function errorHandler(logger, nodeEnv = "development") {
  return (error, _req, res, _next) => {
    let normalized = error;
    if (error?.type === "entity.parse.failed") {
      normalized = new AppError("INVALID_JSON", "The request body is not valid JSON.", { status: 400 });
    } else if (error?.type === "entity.too.large") {
      normalized = new AppError("REQUEST_TOO_LARGE", "The request body exceeds the permitted size.", { status: 413 });
    } else if (!(error instanceof AppError)) {
      normalized = new AppError("INTERNAL_SERVER_ERROR", "An unexpected server error occurred.", { status: 500, cause: error });
    }

    logger?.error("[error] request failed", {
      code: normalized.code,
      message: normalized.message,
      stack: nodeEnv === "production" ? undefined : normalized.stack,
    });

    const payload = {
      success: false,
      error: { code: normalized.code, message: normalized.message },
    };
    if (normalized.details && nodeEnv !== "production") payload.error.details = normalized.details;
    res.status(normalized.status || 500).json(payload);
  };
}

module.exports = { notFoundHandler, errorHandler };
