-- ============================================================================
--  EduVerify PNG — DATA TIER (MySQL / MariaDB, ships with XAMPP)
--  Academic credential verification system.
--
--  The whole point of this tier: uploaded documents are stored INSIDE the
--  database as a LONGBLOB (table `documents`), not just referenced on disk.
--  Every certified record is sealed with a SHA-256 hash so any later change to
--  the stored bytes is detectable.
--
--  Import:  mysql -u root < schema.sql
--       or: phpMyAdmin ▸ Import ▸ schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS eduverify_png
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eduverify_png;

-- Drop in dependency order so the script is re-runnable.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS checks;
DROP TABLE IF EXISTS tokens;
DROP TABLE IF EXISTS records;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS personas;
DROP TABLE IF EXISTS institutions;
DROP TABLE IF EXISTS events;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
--  institutions — accredited PNG schools / colleges / universities
-- ----------------------------------------------------------------------------
CREATE TABLE institutions (
  id              VARCHAR(64)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  kind            VARCHAR(120) NOT NULL DEFAULT 'University',
  country         VARCHAR(80)  NOT NULL DEFAULT 'PNG',
  is_png          TINYINT(1)   NOT NULL DEFAULT 1,
  accreditation_no VARCHAR(80) NOT NULL DEFAULT '',
  status          ENUM('approved','pending','rejected') NOT NULL DEFAULT 'pending',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inst_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  personas — SevisPass digital identities (students, institution staff, admin)
-- ----------------------------------------------------------------------------
CREATE TABLE personas (
  id          VARCHAR(32)  NOT NULL,          -- e.g. SP-1001
  role        ENUM('student','institution','admin') NOT NULL,
  name        VARCHAR(160) NOT NULL,
  sub         VARCHAR(255) NOT NULL DEFAULT '',
  tier        VARCHAR(40)  NOT NULL DEFAULT '',
  inst_id     VARCHAR(64)  NULL,              -- for institution staff
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_persona_role (role),
  CONSTRAINT fk_persona_inst FOREIGN KEY (inst_id)
    REFERENCES institutions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  profiles — student-managed contact details (1:1 with a student persona)
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
  persona_id  VARCHAR(32)  NOT NULL,
  email       VARCHAR(190) NOT NULL DEFAULT '',
  phone       VARCHAR(60)  NOT NULL DEFAULT '',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (persona_id),
  CONSTRAINT fk_profile_persona FOREIGN KEY (persona_id)
    REFERENCES personas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  entries — a claimed qualification / enrollment moving through the workflow
-- ----------------------------------------------------------------------------
CREATE TABLE entries (
  id                VARCHAR(40)  NOT NULL,
  student_id        VARCHAR(32)  NOT NULL,
  institution_id    VARCHAR(64)  NULL,        -- null for overseas claims
  institution_name  VARCHAR(255) NOT NULL,
  country           VARCHAR(80)  NOT NULL DEFAULT '',
  type              ENUM('png','overseas') NOT NULL DEFAULT 'png',
  level             VARCHAR(120) NOT NULL DEFAULT '',
  program           VARCHAR(255) NOT NULL DEFAULT '',
  years             VARCHAR(60)  NOT NULL DEFAULT '',
  status            ENUM('pending_institution_verification','png_verified',
                         'awaiting_upload','pending_admin_review',
                         'certified','rejected','locked') NOT NULL
                    DEFAULT 'pending_institution_verification',
  enrollment        VARCHAR(120) NOT NULL DEFAULT '',
  request_note      TEXT         NULL,
  reject_reason     VARCHAR(255) NULL,
  pending_doc       MEDIUMTEXT   NULL,        -- overseas doc text awaiting admin review
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_entry_student (student_id),
  KEY idx_entry_inst (institution_id),
  KEY idx_entry_status (status),
  CONSTRAINT fk_entry_student FOREIGN KEY (student_id)
    REFERENCES personas(id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_inst FOREIGN KEY (institution_id)
    REFERENCES institutions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  documents — THE UPLOADED FILE BYTES LIVE HERE, IN THE DATABASE.
--  `content` is a LONGBLOB (up to 4 GB) holding the raw uploaded file.
--  `sha256` is the fingerprint of those exact bytes.
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  filename     VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   BIGINT       NOT NULL DEFAULT 0,
  sha256       CHAR(64)     NOT NULL,
  content      LONGBLOB     NOT NULL,          -- <-- the file itself, stored in the DB
  uploaded_by  VARCHAR(160) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_doc_sha (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  records — a certified academic record, cryptographically sealed
--   record_hash = SHA256( canonical_json(structured) + SHA256(doc_text) )
--   data_hash   = SHA256( canonical_json(core_academic_fields) )
-- ----------------------------------------------------------------------------
CREATE TABLE records (
  id                     VARCHAR(40) NOT NULL,
  entry_id               VARCHAR(40) NULL,
  issuing_institution_id VARCHAR(64) NULL,     -- 'ADMIN' for overseas approvals
  structured             JSON        NOT NULL, -- the structured academic data
  doc_text               MEDIUMTEXT  NULL,
  document_id            BIGINT      NULL,     -- FK to the uploaded file blob
  record_hash            CHAR(64)    NOT NULL,
  data_hash              CHAR(64)    NOT NULL,
  source                 VARCHAR(190) NOT NULL DEFAULT '',
  type                   VARCHAR(40)  NOT NULL DEFAULT 'png_official',
  sealed_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rec_entry (entry_id),
  KEY idx_rec_hash (record_hash),
  KEY idx_rec_data_hash (data_hash),
  CONSTRAINT fk_rec_entry FOREIGN KEY (entry_id)
    REFERENCES entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_rec_document FOREIGN KEY (document_id)
    REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- link a document back to its record (added after both may exist)
ALTER TABLE documents
  ADD COLUMN record_id VARCHAR(40) NULL AFTER id,
  ADD KEY idx_doc_record (record_id);

-- ----------------------------------------------------------------------------
--  tokens — short-lived QR share tokens for a record
-- ----------------------------------------------------------------------------
CREATE TABLE tokens (
  token       VARCHAR(80) NOT NULL,
  record_id   VARCHAR(40) NOT NULL,
  expires_at  BIGINT      NOT NULL,            -- epoch milliseconds
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_token_record (record_id),
  CONSTRAINT fk_token_record FOREIGN KEY (record_id)
    REFERENCES records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  checks — every verification a verifier runs (audit of results)
-- ----------------------------------------------------------------------------
CREATE TABLE checks (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  checked_by  VARCHAR(160) NOT NULL DEFAULT '',
  method      VARCHAR(40)  NOT NULL DEFAULT '',   -- qr_scan | file_upload
  result      VARCHAR(40)  NOT NULL DEFAULT '',   -- verified | failed
  record_id   VARCHAR(40)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_check_record (record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  sessions — SevisPass SSO (OIDC4VP) authentication sessions
--  Mirrors the /api/auth/third-party/authorize → callback → status → user flow
--  from the SevisPass Developer Integration Guide, simulated for the prototype.
-- ----------------------------------------------------------------------------
CREATE TABLE sessions (
  session_id    VARCHAR(64)  NOT NULL,
  state         VARCHAR(120) NOT NULL DEFAULT '',
  nonce         VARCHAR(120) NOT NULL DEFAULT '',
  client_id     VARCHAR(120) NOT NULL DEFAULT '',
  role_hint     VARCHAR(20)  NOT NULL DEFAULT '',
  persona_id    VARCHAR(32)  NULL,
  authenticated TINYINT(1)   NOT NULL DEFAULT 0,
  access_token  VARCHAR(120) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id),
  KEY idx_sess_persona (persona_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  verification_requests — CONSENT-BASED verification.
--  An employer/verifier asks to see a student's credential; the student must
--  approve before any verified information is released. This is the system's
--  headline privacy feature in the concept document.
-- ----------------------------------------------------------------------------
CREATE TABLE verification_requests (
  id            VARCHAR(40)  NOT NULL,
  organization  VARCHAR(190) NOT NULL DEFAULT '',
  requested_by  VARCHAR(160) NOT NULL DEFAULT '',
  student_id    VARCHAR(32)  NOT NULL,
  record_id     VARCHAR(40)  NULL,
  status        ENUM('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
  fields        VARCHAR(255) NOT NULL DEFAULT 'name,institution,award,graduationStatus',
  result_json   MEDIUMTEXT   NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_vr_student (student_id),
  KEY idx_vr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  events — human-readable platform audit log
-- ----------------------------------------------------------------------------
CREATE TABLE events (
  id          BIGINT     NOT NULL AUTO_INCREMENT,
  message     TEXT       NOT NULL,
  created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Convenience view: records with their document metadata (no blob bytes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_records AS
SELECT r.id, r.entry_id, r.issuing_institution_id, r.structured, r.doc_text,
       r.record_hash, r.data_hash, r.source, r.type, r.sealed_at,
       d.id AS document_id, d.filename, d.mime_type, d.size_bytes, d.sha256
FROM records r
LEFT JOIN documents d ON d.id = r.document_id;
