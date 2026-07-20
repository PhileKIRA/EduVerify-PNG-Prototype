const REDACT_KEYS = /secret|token|authorization|cookie|password|credential/i;

function sanitize(value, seen = new WeakSet()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = REDACT_KEYS.test(key) ? "[REDACTED]" : sanitize(item, seen);
  }
  return output;
}

function createLogger(base = console) {
  const write = (method, message, meta) => {
    if (meta === undefined) return base[method](message);
    return base[method](message, sanitize(meta));
  };
  return {
    info: (message, meta) => write("log", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    debug: (message, meta) => write("debug" in base ? "debug" : "log", message, meta),
  };
}

module.exports = { createLogger, sanitize };
