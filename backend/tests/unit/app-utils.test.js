const { buildFragmentRedirect, parseCookies, sessionCookieOptions } = require("../../src/app");
const { makeConfig } = require("../helpers/context");

describe("application helpers", () => {
  it("appends parameters to a clean fragment and an existing fragment query", () => {
    expect(buildFragmentRedirect("http://localhost:5173/#/auth/complete", { session: "a b" }))
      .toBe("http://localhost:5173/#/auth/complete?session=a+b");
    expect(buildFragmentRedirect("http://localhost:5173/#/login?source=sso", { error: "STATE_INVALID" }))
      .toBe("http://localhost:5173/#/login?source=sso&error=STATE_INVALID");
  });

  it("parses normal, empty and flag-like cookies", () => {
    expect(parseCookies("a=1; eduverify_session=abc%20123; flag")).toEqual({ a: "1", eduverify_session: "abc 123", flag: "" });
    expect(parseCookies()).toEqual({});
  });

  it("builds environment-appropriate cookie options", () => {
    const options = sessionCookieOptions(makeConfig({ config: { cookieSecure: true, appSessionMinutes: 60 } }));
    expect(options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3_600_000 });
  });
});
