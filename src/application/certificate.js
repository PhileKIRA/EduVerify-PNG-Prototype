/* ============================================================
   APPLICATION TIER — QR generation & certificate document builder.

   [Minor #10 fix] makeQrSvg() previously produced a QR-*looking* grid of
   random pixels — it was never actually scannable. This version uses the
   `qrcode-generator` library (see package.json) to emit a real, decodable
   QR code as an SVG string, while keeping the exact same function
   signature so callers (sevisAuth.js, this file) don't need to change.
   ============================================================ */

import qrcode from "qrcode-generator";
const LOGO_EMBLEM = "/logo-emblem.webp";

/* real, scannable QR code as an SVG string (per the guide: handled via
   innerHTML, not <img src>) */
function makeQrSvg(data) {
  const qr = qrcode(0, "M"); // type 0 = auto-detect smallest version, M = ~15% error correction
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cell = 6;
  const size = count * cell;
  let rects = "";
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) {
        rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#1B1712"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="190" height="190" style="background:#fff;border-radius:6px">${rects}</svg>`;
}

/* ---------- official downloadable record: certificate HTML with the original
   record hash rendered as a QR code and printed onto the document ---------- */
async function buildCertificateHtml(studentName, r) {
  const s = r.structured;
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const qr = makeQrSvg("EDUVERIFY-PNG|SHA256:" + r.hash);
  const logoBase64 = await fetch(LOGO_EMBLEM)
  .then(res => res.blob())
  .then(blob => new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  }));
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
<div class="top"><div><div class="brand">EduVerify PNG</div><div class="tag">TRUSTED ACADEMIC CREDENTIALS · INSTANTLY VERIFIED</div></div><div style="
width:62px;
height:62px;
border:3px solid #C79A2A;
border-radius:50%;
display:flex;
align-items:center;
justify-content:center;
font-weight:bold;
color:#C79A2A;
font-size:14px;">
EV PNG
</div>
</div>
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

/* ---------- seed data ---------- */

export { makeQrSvg, buildCertificateHtml, sampleTranscript };
