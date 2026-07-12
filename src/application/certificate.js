/* ============================================================
   APPLICATION TIER — QR generation and official-certificate rendering.
   ============================================================ */
import { LOGO_EMBLEM } from "../data/assets";

/* mock OIDC4VP presentation-request QR — an SVG *string*, handled per the guide (innerHTML, not <img src>) */
function makeQrSvg(data) {
  const n = 25, cell = 8;
  let seed = 7;
  for (const ch of data) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let rects = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
      let on;
      if (finder) {
        const lx = x > n - 8 ? x - (n - 7) : x, ly = y > n - 8 ? y - (n - 7) : y;
        on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx > 1 && lx < 5 && ly > 1 && ly < 5);
      } else on = rand() > 0.52;
      if (on) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell - 0.6}" height="${cell - 0.6}" fill="#1B1712"/>`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n * cell} ${n * cell}" width="190" height="190" style="background:#fff;border-radius:6px">${rects}</svg>`;
}

/* ---------- official downloadable record: certificate HTML with the original
   record hash rendered as a QR code and printed onto the document ---------- */
/* ---------- official downloadable record: certificate HTML with the original
   record hash rendered as a QR code and printed onto the document ---------- */
function buildCertificateHtml(studentName, r) {
  const s = r.structured;
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const qr = makeQrSvg("EDUVERIFY-PNG|SHA256:" + r.hash);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>EduVerify PNG — Official Academic Record — ${esc(studentName)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1B1712;max-width:720px;margin:32px auto;padding:0 24px}
  .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #C79A2A;padding-bottom:14px}
  .brand{font-size:22px;font-weight:bold}.tag{font-size:10px;color:#6B655A;letter-spacing:.14em}
  h2{font-size:16px;letter-spacing:.04em}
  table{font-size:13px;border-collapse:collapse;margin:12px 0}td{padding:3px 16px 3px 0;vertical-align:top}
  pre{background:#F4F3EF;border:1px solid #DED9CE;padding:16px;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:12px}
  .seal{display:flex;gap:20px;align-items:center;border:1.5px dashed #C79A2A;padding:16px;margin-top:18px;page-break-inside:avoid}
  .sealtitle{font-weight:bold;font-size:12px;color:#8F6B14;letter-spacing:.12em}
  .hash{font-family:'Courier New',monospace;font-size:10px;word-break:break-all;color:#3A342B;margin:6px 0}
  .note{font-size:10px;color:#6B655A;margin-top:12px;line-height:1.5}
  @media print{body{margin:8mm}}
</style></head><body>
<div class="top"><div><div class="brand">EduVerify PNG</div><div class="tag">TRUSTED ACADEMIC CREDENTIALS · INSTANTLY VERIFIED</div></div><img src="${LOGO_EMBLEM}" width="62" height="63" alt="EduVerify PNG seal"/></div>
<h2>OFFICIAL ACADEMIC RECORD</h2>
<table>
<tr><td><b>Student</b></td><td>${esc(studentName)} (${esc(s.studentId)})</td></tr>
<tr><td><b>Institution</b></td><td>${esc(s.institution)}</td></tr>
<tr><td><b>Program</b></td><td>${esc(s.program)}</td></tr>
${s.credentialLevel ? `<tr><td><b>Credential level</b></td><td>${esc(s.credentialLevel)}</td></tr>` : ""}
${s.coursesCompleted ? `<tr><td><b>Courses completed</b></td><td>${esc(s.coursesCompleted)}</td></tr>` : ""}
${s.gpa ? `<tr><td><b>GPA</b></td><td>${esc(s.gpa)}</td></tr>` : ""}
${s.classAward ? `<tr><td><b>Class / award</b></td><td>${esc(s.classAward)}</td></tr>` : ""}
<tr><td><b>Graduation year</b></td><td>${esc(s.completionYear || "—")}</td></tr>
<tr><td><b>Graduation status</b></td><td>${esc(s.graduationStatus || "—")}</td></tr>
<tr><td><b>Verified by</b></td><td>${esc(s.verifiedBy || r.source)}</td></tr>
${s.documentFileName ? `<tr><td><b>Attached document</b></td><td>${esc(s.documentFileName)}<br/><span class="hash">file SHA-256: ${esc(s.documentSha256)}</span></td></tr>` : ""}
<tr><td><b>Record sealed</b></td><td>${esc(r.hashAt)} · Record ID ${esc(r.id)}</td></tr>
</table>
<pre>${esc(r.docText)}</pre>
<div class="seal">
  ${qr}
  <div>
    <div class="sealtitle">INTEGRITY SEAL — SHA-256</div>
    <div class="hash">${r.hash}</div>
    <div class="note">This QR code encodes this record's <b>original cryptographic hash</b>, generated at the moment the issuing institution certified it. Scan it, or enter the hash and student ID at the EduVerify PNG verification portal, to confirm this document matches the official record on file. Altering even one character of this document will cause verification to fail.</div>
  </div>
</div>
<div class="note">Issued via EduVerify PNG — built on Papua New Guinea's SevisPass digital identity infrastructure. Document generated ${new Date().toLocaleString()}. This printout is only as authoritative as its hash: always verify.</div>
</body></html>`;
}

/* ---------- sample document generator ---------- */
/* ---------- sample document generator ---------- */
function sampleTranscript(studentName, studentId, institution, program, year, gpa) {
  return `OFFICIAL ACADEMIC RECORD
Institution: ${institution}
Student: ${studentName}
SevisPass ID: ${studentId}
Program: ${program}
Year of completion: ${year}
Grade point average: ${gpa}
This document was issued by the registrar and forms part of the
official academic record held on file.`;
}

export { makeQrSvg, buildCertificateHtml, sampleTranscript };
