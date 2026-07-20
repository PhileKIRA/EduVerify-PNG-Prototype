const {
  ExternalServiceError,
  SsoOriginError,
  SsoCredentialError,
} = require("../errors");

async function readSafeBody(response) {
  const text = await response.text();
  if (!text) return { text: "", json: null };
  try {
    return { text: text.slice(0, 1000), json: JSON.parse(text) };
  } catch {
    return { text: text.slice(0, 1000), json: null };
  }
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
}

/**
 * SevisPass staging deployments have returned more than one status shape over
 * time. Normalize the response once at the service boundary so the rest of the
 * application does not depend on one spelling such as `authenticated: true`.
 */
function normalizeSessionStatus(payload) {
  const root = firstObject(payload) || {};
  const data = firstObject(root.data, root.result, root.session, root.authentication, root.auth) || {};
  const merged = { ...root, ...data };

  const rawStatus = String(
    merged.status ?? merged.state ?? merged.authenticationStatus ?? merged.authStatus ?? ""
  ).trim().toLowerCase();

  const authenticatedStatuses = new Set([
    "authenticated", "authorised", "authorized", "approved", "complete",
    "completed", "verified", "success", "succeeded", "logged_in", "logged-in",
  ]);
  const deniedStatuses = new Set([
    "denied", "rejected", "cancelled", "canceled", "failed", "error",
  ]);
  const expiredStatuses = new Set(["expired", "timeout", "timed_out", "timed-out"]);

  const explicitAuthenticated = [
    merged.authenticated,
    merged.isAuthenticated,
    merged.is_authenticated,
    merged.verified,
    merged.isVerified,
    merged.completed,
    merged.isCompleted,
    merged.approved,
    merged.authorized,
    merged.authorised,
  ].some((value) => value === true || value === 1 || String(value).toLowerCase() === "true");

  const user = firstObject(
    merged.user,
    merged.identity,
    merged.profile,
    merged.claims,
    data.user,
    data.identity,
    data.profile,
    data.claims
  );

  // `hasRedirect` alone is not enough: it can simply mean a redirect URL was
  // generated. It is accepted only when identity data is also present.
  const authenticated = explicitAuthenticated || authenticatedStatuses.has(rawStatus) || Boolean(merged.hasRedirect && user);
  const expired = expiredStatuses.has(rawStatus) || merged.expired === true;
  const denied = deniedStatuses.has(rawStatus) || merged.denied === true || merged.rejected === true;

  return {
    authenticated,
    status: authenticated ? "authenticated" : expired ? "expired" : denied ? "denied" : (rawStatus || "pending"),
    expired,
    denied,
    user,
    sessionId: merged.sessionId || merged.session_id || null,
  };
}

function createSevisPassService({ config, fetchImpl = global.fetch, logger }) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");

  function headers({ json = false } = {}) {
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      Origin: config.ssoRequestOrigin,
      "X-Client-ID": config.clientId,
      "X-Client-Secret": config.clientSecret,
    };
  }

  async function requestJson(url, options, action) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const body = await readSafeBody(response);
      if (!response.ok) {
        const message = String(body.json?.message || body.json?.error || body.text || "").toLowerCase();
        if (response.status === 403 && message.includes("origin") && (message.includes("allow") || message.includes("forbidden"))) {
          throw new SsoOriginError(config.ssoRequestOrigin, config.callbackUrl);
        }
        if ([401, 403].includes(response.status) && (message.includes("client") || message.includes("credential") || message.includes("unauthor"))) {
          throw new SsoCredentialError();
        }
        if (response.status === 429) {
          throw new ExternalServiceError("SSO_RATE_LIMITED", `SevisPass rate-limited the ${action} request.`, { status: 503 });
        }
        const code = action === "authorization" ? "SSO_AUTHORIZE_FAILED" : action === "status" ? "SSO_STATUS_FAILED" : "SSO_USER_FAILED";
        throw new ExternalServiceError(
          code,
          `SevisPass ${action} failed with HTTP ${response.status}.`,
          { status: 502, details: { upstreamStatus: response.status } }
        );
      }
      if (!body.json || typeof body.json !== "object") {
        throw new ExternalServiceError("SSO_INVALID_RESPONSE", `SevisPass returned an invalid ${action} response.`);
      }
      return body.json;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new ExternalServiceError("SSO_TIMEOUT", `SevisPass did not respond to the ${action} request before timeout.`, { status: 504, cause: error });
      }
      if (error.code) throw error;
      throw new ExternalServiceError("SSO_NETWORK_ERROR", "The backend could not connect to SevisPass.", { status: 502, cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function initiateAuthorization({ state, nonce }) {
    const data = await requestJson(config.authorizeUrl, {
      method: "POST",
      headers: headers({ json: true }),
      body: JSON.stringify({
        callback_url: config.callbackUrl,
        state,
        nonce,
      }),
    }, "authorization");
    logger?.info("[sso] authorization request accepted", {
      upstreamStatus: 200,
      origin: config.ssoRequestOrigin,
      upstreamSession: data.sessionId || data.session_id ? "received" : "missing",
    });
    return data;
  }

  async function getSessionStatus(sessionId) {
    if (!sessionId) throw new TypeError("SevisPass sessionId is required.");
    const url = `${config.ssoServerUrl}/api/session/status?session=${encodeURIComponent(sessionId)}`;
    const payload = await requestJson(url, { method: "GET", headers: headers() }, "status");
    return normalizeSessionStatus(payload);
  }

  async function getUser(sessionId) {
    if (!sessionId) throw new TypeError("SevisPass sessionId is required.");
    const url = `${config.ssoServerUrl}/api/user?session=${encodeURIComponent(sessionId)}`;
    return requestJson(url, { method: "GET", headers: headers() }, "user");
  }

  return { initiateAuthorization, getSessionStatus, getUser };
}

module.exports = { createSevisPassService, readSafeBody, normalizeSessionStatus };
