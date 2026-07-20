const { sanitize, createLogger } = require("../../src/logger");

describe("safe logging", () => {
  it("redacts nested secrets, tokens, authorization and cookies", () => {
    const value = sanitize({
      clientSecret: "secret-value",
      nested: { accessToken: "token-value", safe: "visible", cookie: "sid=123" },
    });
    expect(value.clientSecret).toBe("[REDACTED]");
    expect(value.nested.accessToken).toBe("[REDACTED]");
    expect(value.nested.cookie).toBe("[REDACTED]");
    expect(value.nested.safe).toBe("visible");
  });

  it("handles arrays and circular structures", () => {
    const object = { items: [{ password: "x" }] };
    object.self = object;
    const sanitized = sanitize(object);
    expect(sanitized.items[0].password).toBe("[REDACTED]");
    expect(sanitized.self).toBe("[Circular]");
  });

  it("passes only sanitized metadata to the output", () => {
    const output = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const logger = createLogger(output);
    logger.info("message", { clientSecret: "never-log-me", origin: "http://localhost:5173" });
    expect(output.log).toHaveBeenCalledWith("message", { clientSecret: "[REDACTED]", origin: "http://localhost:5173" });
  });
});
