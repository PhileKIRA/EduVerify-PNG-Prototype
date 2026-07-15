/* ============================================================
   [Minor #14 fix] The original prototype had zero tests for the
   record-sealing/verification logic — the one piece of the app where a bug
   silently breaks the core "did this document match the official record"
   guarantee. These cover canonicalize(), coreAcademicData(), and
   computeRecordHash() from src/application/crypto.js.
   ============================================================ */
import { describe, it, expect } from "vitest";
import { canonicalize, coreAcademicData, computeRecordHash, normText, sha256Hex } from "../src/application/crypto.js";

describe("canonicalize", () => {
  it("produces the same string regardless of key order", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("preserves array order (arrays are not re-sorted)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("nests objects and arrays correctly", () => {
    expect(canonicalize({ x: [1, { z: 1, y: 2 }] })).toBe('{"x":[1,{"y":2,"z":1}]}');
  });
});

describe("normText", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normText("  University   OF   Papua ")).toBe("university of papua");
  });

  it("treats null/undefined as empty string", () => {
    expect(normText(null)).toBe("");
    expect(normText(undefined)).toBe("");
  });
});

describe("coreAcademicData", () => {
  it("normalizes the fields that matter for verification", () => {
    const out = coreAcademicData({
      studentId: " sp-1002 ",
      institution: "  PNG University of Technology ",
      program: "BEng Civil Engineering",
      completionYear: "Graduated in 2023",
      gpa: "3.8",
    });
    expect(out).toEqual({
      studentId: "SP-1002",
      institution: "png university of technology",
      program: "beng civil engineering",
      graduationYear: "2023",
      gpa: "3.8",
    });
  });

  it("two records with the same academic facts but different formatting normalize identically", () => {
    const a = coreAcademicData({ studentId: "SP-1002", institution: "PNG University of Technology", program: "BEng Civil Engineering", completionYear: "2023", gpa: "3.8" });
    const b = coreAcademicData({ studentId: "sp-1002", institution: "  png   university of technology", program: "beng civil engineering", completionYear: "Class of 2023", gpa: "3.8" });
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

describe("computeRecordHash", () => {
  it("is deterministic for identical inputs", async () => {
    const structured = { studentId: "SP-1002", institution: "PNG University of Technology" };
    const h1 = await computeRecordHash(structured, "transcript text");
    const h2 = await computeRecordHash(structured, "transcript text");
    expect(h1).toBe(h2);
  });

  it("changes if a single character of the document text changes", async () => {
    const structured = { studentId: "SP-1002" };
    const h1 = await computeRecordHash(structured, "GPA: 3.8");
    const h2 = await computeRecordHash(structured, "GPA: 3.9");
    expect(h1).not.toBe(h2);
  });

  it("changes if the structured data changes but the document text doesn't", async () => {
    const h1 = await computeRecordHash({ gpa: "3.8" }, "same doc text");
    const h2 = await computeRecordHash({ gpa: "3.9" }, "same doc text");
    expect(h1).not.toBe(h2);
  });

  it("returns a 64-character lowercase hex SHA-256 digest", async () => {
    const h = await computeRecordHash({ a: 1 }, "doc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256Hex", () => {
  it("matches a known SHA-256 test vector", async () => {
    // SHA-256("abc")
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
