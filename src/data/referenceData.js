/* ============================================================
   DATA TIER — static reference/lookup data (dropdown option sets)
   ============================================================ */
const CREDENTIAL_LEVELS = ["Grade 10 Certificate", "Grade 12 Certificate", "TVET / Technical Certificate", "College Diploma", "University Degree", "Postgraduate Degree", "Other Certificate"];
const INSTITUTION_KINDS = ["Secondary School", "High School", "National School of Excellence", "TVET / Technical College", "Teachers' College", "Nursing & Health College", "Business College", "University"];

const DOCUMENT_TYPES = ["Full Academic Transcript", "Certificate / Testamur", "Statement of Results", "Grade 10 Certificate", "Grade 12 Certificate", "Diploma / Award Certificate", "Other academic record"];

const GRADE_COURSE_OPTIONS = ["Grade 8", "Grade 10", "Grade 12", "TVET / Technical Certificate", "Certificate Course", "Diploma", "Bachelor's Degree", "Honours Degree", "Master's Degree", "Doctorate (PhD)"];

/* Year dropdowns: 1980 through the current year plus a few future years
   (for programmes still in progress), newest first. */
const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear();
  const ys = [];
  for (let y = current + 6; y >= 1980; y--) ys.push(String(y));
  return ys;
})();

export { CREDENTIAL_LEVELS, INSTITUTION_KINDS, DOCUMENT_TYPES, GRADE_COURSE_OPTIONS, YEAR_OPTIONS };
