/* ============================================================
   DATA TIER — repository / data-access layer.

   This is the single place the rest of the app goes to for its initial
   dataset. In this Phase 1 prototype the "database" is just in-memory
   arrays built here and handed to the presentation tier's useState calls;
   swapping this file for one that calls a real API/DB is the intended
   upgrade path — nothing above this layer needs to change.
   ============================================================ */
import { computeRecordHash } from "../application/crypto";
import { sampleTranscript } from "../application/certificate";
import { now } from "../application/utils";

/* seed: lifelong portfolios — Philemon carries records from Grade 10 through
   his university degree; David's certified record unlocks the overseas gate */
export async function seedRegistry() {
  const mk = async (recId, entry, x) => {
    const structured = {
      studentId: entry.studentId,
      institution: entry.institutionName,
      program: entry.program,
      completionYear: x.year,
      gpa: x.gpa,
      classAward: x.award,
      graduationStatus: "Graduated",
      verifiedBy: entry.institutionName,
      credentialLevel: entry.level,
    };
    const docText = sampleTranscript(x.student, entry.studentId, entry.institutionName, entry.program, x.year, x.gpa);
    const hash = await computeRecordHash(structured, docText);
    return { id: recId, entryId: entry.id, issuingInstitutionId: entry.institutionId, structured, docText, hash, hashAt: now(), source: "PNG institution — official record", type: "png_official" };
  };

  const e1 = { id: "e1", studentId: "SP-1001", institutionId: "inst-upng", institutionName: "University of Papua New Guinea", type: "png", level: "University Degree", program: "BSc Computer Science", years: "2020–2023", status: "pending_institution_verification" };
  const e2 = { id: "e2", studentId: "SP-1002", institutionId: "inst-unitech", institutionName: "PNG University of Technology", type: "png", level: "University Degree", program: "BEng Civil Engineering", years: "2019–2023", status: "certified", enrollment: "Graduated" };
  const e3 = { id: "e3", studentId: "SP-1002", institutionId: null, institutionName: "University of Queensland", country: "Australia", type: "overseas", level: "Postgraduate Degree", program: "MEng Structural Engineering", years: "2024–2025", status: "awaiting_upload" };
  const e4 = { id: "e4", studentId: "SP-1003", institutionId: "inst-dwu", institutionName: "Divine Word University", type: "png", level: "University Degree", program: "Bachelor of Information Systems", years: "2021–2025", status: "certified", enrollment: "Graduated" };
  const e5 = { id: "e5", studentId: "SP-1003", institutionId: "inst-passam", institutionName: "Passam National High School", type: "png", level: "Grade 10 Certificate", program: "Grade 10 Certificate", years: "2016", status: "certified", enrollment: "Graduated" };
  const e6 = { id: "e6", studentId: "SP-1003", institutionId: "inst-sogeri", institutionName: "Sogeri National School of Excellence", type: "png", level: "Grade 12 Certificate", program: "Grade 12 Certificate", years: "2018", status: "certified", enrollment: "Graduated" };
  const e7 = { id: "e7", studentId: "SP-1003", institutionId: "inst-mtc", institutionName: "Madang Technical College", type: "png", level: "College Diploma", program: "Diploma in Information Technology", years: "2019–2020", status: "certified", enrollment: "Graduated" };

  const r1 = await mk("r1", e2, { student: "David Namah", year: "2023", gpa: "3.6", award: "Second Class Honours (Division I)" });
  const r2 = await mk("r2", e4, { student: "Philemon Kira", year: "2025", gpa: "3.8", award: "Credit" });
  const r3 = await mk("r3", e5, { student: "Philemon Kira", year: "2016", gpa: "B", award: "Upper Pass" });
  const r4 = await mk("r4", e6, { student: "Philemon Kira", year: "2018", gpa: "A", award: "Distinction" });
  const r5 = await mk("r5", e7, { student: "Philemon Kira", year: "2020", gpa: "3.5", award: "Merit" });

  return {
    entries: [e1, e2, e3, e4, e5, e6, e7],
    records: [r1, r2, r3, r4, r5],
    events: [{ t: now(), text: "EduVerify PNG registry initialised — 5 records sealed across secondary, TVET/college, and university levels." }],
  };
}
