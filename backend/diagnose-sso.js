#!/usr/bin/env node
require("dotenv").config();
const crypto = require("crypto");
const { loadConfig, safeConfigSummary } = require("./src/config");

const EXIT = { OK: 0, CONFIG: 1, NETWORK: 2, CREDENTIALS: 3, ORIGIN: 4, CALLBACK: 5, UNEXPECTED: 6 };

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function safeText(text) {
  return String(text || "").replace(/\s+/g, " ").slice(0, 500);
}

function safeJsonSummary(value) {
  if (!value || typeof value !== "object") return null;
  const copy = { ...value };
  for (const key of ["qrCode", "qr_code", "accessToken", "access_token", "vp_token", "id_token", "token"]) {
    if (copy[key] !== undefined) copy[key] = `[redacted ${key}]`;
  }
  if (copy.user && typeof copy.user === "object") {
    copy.user = { keys: Object.keys(copy.user), sub: copy.user.sub ? "present" : "missing" };
  }
  return copy;
}

async function probe(label, url, options = {}) {
  try {
    const response = await fetch(url, options);
    const raw = await response.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch {}
    const text = safeText(raw);
    const cors = {
      allowOrigin: response.headers.get("access-control-allow-origin") || "(not returned)",
      allowCredentials: response.headers.get("access-control-allow-credentials") || "(not returned)",
      allowMethods: response.headers.get("access-control-allow-methods") || "(not returned)",
    };
    console.log(`\n[${label}]`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`CORS allow-origin: ${cors.allowOrigin}`);
    console.log(`CORS allow-credentials: ${cors.allowCredentials}`);
    console.log(`CORS allow-methods: ${cors.allowMethods}`);
    if (json) {
      console.log(`JSON keys: ${Object.keys(json).join(", ") || "(none)"}`);
      console.log(`Body summary: ${JSON.stringify(safeJsonSummary(json))}`);
    } else {
      console.log(`Body: ${text || "(empty)"}`);
    }
    return { response, text, json, cors };
  } catch (error) {
    console.log(`\n[${label}]`);
    console.log(`Network error: ${error.message}`);
    return { networkError: error };
  }
}

function classify(result) {
  if (result.networkError) return EXIT.NETWORK;
  const status = result.response.status;
  const body = result.text.toLowerCase();
  if (status >= 200 && status < 300) return EXIT.OK;
  if (body.includes("origin") && (body.includes("allow") || body.includes("forbidden"))) return EXIT.ORIGIN;
  if (body.includes("callback") || body.includes("redirect_uri") || body.includes("redirect uri")) return EXIT.CALLBACK;
  if ([401, 403].includes(status) && (body.includes("credential") || body.includes("client") || body.includes("unauthor"))) return EXIT.CREDENTIALS;
  return EXIT.UNEXPECTED;
}

(async () => {
  let config;
  try {
    const env = { ...process.env };
    const originOverride = argValue("origin");
    if (originOverride) env.SSO_REQUEST_ORIGIN = originOverride;
    config = loadConfig(env);
  } catch (error) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(EXIT.CONFIG);
  }

  const summary = safeConfigSummary(config);
  console.log("=== EduVerify PNG SevisPass Diagnostic ===\n");
  console.log(`SSO server:          ${summary.ssoServer}`);
  console.log(`Client ID:           ${summary.clientId}`);
  console.log(`Client secret:       ${config.clientSecret ? "configured" : "missing"}`);
  console.log(`Callback URL:        ${summary.callback}`);
  console.log(`Outgoing Origin:     ${summary.requestOrigin}`);
  console.log(`JWKS URL:            ${summary.jwks}`);

  const discovery = await probe("OIDC discovery", `${config.ssoServerUrl}/.well-known/openid-configuration`);
  const jwks = await probe("JWKS", config.jwksUri);

  const body = { callback_url: config.callbackUrl, state: `diag-${crypto.randomUUID()}`, nonce: `diag-${crypto.randomUUID()}` };
  const commonHeaders = { "Content-Type": "application/json", Accept: "application/json", Origin: config.ssoRequestOrigin };
  const credentialHeaders = { ...commonHeaders, "X-Client-ID": config.clientId, "X-Client-Secret": config.clientSecret };

  const headerResult = await probe("Authorize: header credentials", config.authorizeUrl, {
    method: "POST", headers: credentialHeaders, body: JSON.stringify(body),
  });

  await probe("Authorize: body credentials (diagnostic only)", config.authorizeUrl, {
    method: "POST", headers: commonHeaders,
    body: JSON.stringify({ ...body, client_id: config.clientId, client_secret: config.clientSecret }),
  });

  const upstreamSessionId = headerResult.json?.sessionId || headerResult.json?.session_id;
  if (upstreamSessionId) {
    console.log("\nUpstream session ID: received (value hidden)");
    await probe(
      "Session status (newly created; normally pending)",
      `${config.ssoServerUrl}/api/session/status?session=${encodeURIComponent(upstreamSessionId)}`,
      { method: "GET", headers: { Accept: "application/json", Origin: config.ssoRequestOrigin, "X-Client-ID": config.clientId, "X-Client-Secret": config.clientSecret } }
    );
  } else if (headerResult.response?.ok) {
    console.log("\nWarning: authorize succeeded but no sessionId/session_id was returned. QR completion polling cannot work without it.");
  }

  const outcome = classify(headerResult);
  console.log("\n=== Diagnostic Verdict ===");
  if (outcome === EXIT.OK) {
    console.log("The documented header-credential authorize request was accepted.");
    console.log("The backend will store the returned SevisPass session ID and poll /api/session/status until the wallet completes authentication.");
  } else if (outcome === EXIT.ORIGIN) {
    console.log("The SevisPass server rejected the Origin header.");
    console.log("\nConfirm that this exact origin is registered for the client:");
    console.log(config.ssoRequestOrigin);
    console.log("\nOrigin values are exact. Scheme, hostname and port must match, with no path or trailing slash.");
    console.log("The callback URL is configured separately:");
    console.log(config.callbackUrl);
  } else if (outcome === EXIT.CALLBACK) {
    console.log("SevisPass rejected the callback URL. Confirm that the exact callback is covered by the client's registered callback pattern.");
    console.log(config.callbackUrl);
  } else if (outcome === EXIT.CREDENTIALS) {
    console.log("SevisPass rejected the client ID or client secret. Verify the staging credentials without printing or sharing the secret.");
  } else if (outcome === EXIT.NETWORK) {
    console.log("The SSO could not be reached from this machine. Check DNS, firewall, proxy and internet connectivity.");
  } else {
    console.log("SevisPass returned an unexpected response. Share this redacted diagnostic output with the SevisPass administrator.");
  }

  if (discovery.networkError || jwks.networkError) {
    console.log("\nAt least one supporting endpoint had a network error. The authorize verdict above remains the primary result.");
  }
  process.exit(outcome);
})();
