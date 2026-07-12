/* ============================================================
   APPLICATION TIER — verification business logic: extracting
   standardized academic data out of a raw certificate/transcript
   document so it can be hashed and compared against a sealed record.
   ============================================================ */
import { normText } from "./textUtils";

function extractAcademicData(raw) {
  let text = String(raw).replace(/\r\n/g, "\n");
  if (text.includes("<pre>")) {
    const inner = text.split("<pre>")[1].split("</pre>")[0].replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    text = inner + "\n" + text; // prefer the sealed certificate body; the HTML summary table remains as backup
  }
  const pick = (labels) => {
    for (const lb of labels) {
      const m = text.match(new RegExp(lb + "(?:\\s*:\\s*|<\\/b><\\/td><td>)([^<\\n]+)", "i"));
      if (m) return m[1].trim();
    }
    return "";
  };
  const idRaw = pick(["SevisPass ID", "Student ID"]) || (text.match(/SP-\d{3,}/i) || [""])[0];
  const idM = String(idRaw).match(/SP-\d{3,}/i);
  const yearRaw = pick(["Year of completion", "Completion year", "Graduation year"]);
  const yearM = String(yearRaw).match(/(19|20)\d{2}/);
  return {
    studentId: idM ? idM[0].toUpperCase() : "",
    institution: normText(pick(["Institution"])),
    program: normText(pick(["Program", "Programme", "Qualification"])),
    graduationYear: yearM ? yearM[0] : normText(yearRaw),
    gpa: normText(pick(["Grade point average", "GPA"])),
  };
}

export { extractAcademicData };
