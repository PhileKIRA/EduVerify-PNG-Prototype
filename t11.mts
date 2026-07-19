(globalThis as any).sessionStorage = { _m:{} as any, getItem(k:string){return this._m[k]??null}, setItem(k:string,v:string){this._m[k]=v}, removeItem(k:string){delete this._m[k]} };
main();
async function main() {
  const { sevisAuth } = await import("./src/application/sevisAuth");
  (sevisAuth as any).cfg = { apiBase: "http://localhost:3001/api" };
  const sess: any = await sevisAuth.initiateAuth();
  console.log("frontend initiate -> live session:", sess.mode === "live" && sess.qrCode.includes("<svg") && !sess.sessionId.startsWith("local-") ? "✓" : "FAIL");
  let st: any = await sevisAuth.checkStatus(sess.sessionId);
  console.log("frontend poll (pre-scan):", st.authenticated === false ? "✓" : "FAIL");
  // staging wallet completes the scan
  await fetch("http://127.0.0.1:4500/wallet-scan", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ state: sess.state, sub: "PNG-STAGE-5150", name: "Wallet Citizen", email: "wc@stage.pg" }) });
  st = await sevisAuth.checkStatus(sess.sessionId);
  console.log("frontend poll (post-scan):", st.authenticated === true ? "✓" : "FAIL");
  const who: any = await sevisAuth.getUser(sess.sessionId); // includes CSRF state check
  console.log("frontend identity (CSRF-checked, normalized):", who.id === "PNG-STAGE-5150" && who.role === "student" && who.name === "Wallet Citizen" && who.live === true ? "✓ signs in to student portal" : "FAIL " + JSON.stringify(who));
}
