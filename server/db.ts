import mysql, { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";

const dsn = process.env.DATABASE_URL;
if (!dsn) throw new Error("DATABASE_URL is unavailable; the managed database capability must be enabled.");

export const db = mysql.createPool(dsn);

export async function ensureSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS ulak_projects (
    id CHAR(36) NOT NULL PRIMARY KEY,
    owner_hash CHAR(64) NOT NULL,
    name VARCHAR(180) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    source_kind VARCHAR(32) NOT NULL,
    source_url TEXT NULL,
    archive_key VARCHAR(512) NOT NULL,
    manifest_json JSON NOT NULL,
    local_report_json JSON NOT NULL,
    proactive_audit_json JSON NULL,
    ai_report_json LONGTEXT NULL,
    research_json JSON NULL,
    ai_consent_at DATETIME NULL,
    research_consent_at DATETIME NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ready',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_ulak_owner_updated (owner_hash, updated_at),
    INDEX idx_ulak_project_owner (id, owner_hash)
  )`);
  try { await db.query("ALTER TABLE ulak_projects ADD COLUMN proactive_audit_json JSON NULL"); } catch { /* mevcut projelerde kolon zaten olabilir */ }

  await db.query(`CREATE TABLE IF NOT EXISTS ulak_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    owner_hash CHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ulak_message_project (project_id, owner_hash, id)
  )`);
}

export interface ProjectRow extends RowDataPacket {
  id: string;
  owner_hash: string;
  name: string;
  source_name: string;
  source_kind: string;
  source_url: string | null;
  archive_key: string;
  manifest_json: unknown;
  local_report_json: unknown;
  proactive_audit_json: unknown;
  ai_report_json: string | null;
  research_json: unknown;
  ai_consent_at: Date | string | null;
  research_consent_at: Date | string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

export function decodeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

export async function getProject(id: string, ownerHash: string) {
  const [rows] = await db.execute<ProjectRow[]>(
    "SELECT * FROM ulak_projects WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL LIMIT 1",
    [id, ownerHash],
  );
  return rows[0] ?? null;
}

export async function listProjects(ownerHash: string) {
  const [rows] = await db.execute<ProjectRow[]>(
    "SELECT id, name, source_name, source_kind, source_url, manifest_json, local_report_json, proactive_audit_json, ai_report_json, research_json, ai_consent_at, research_consent_at, status, created_at, updated_at FROM ulak_projects WHERE owner_hash = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50",
    [ownerHash],
  );
  return rows;
}

export async function insertProject(values: {
  id: string; ownerHash: string; name: string; sourceName: string; sourceKind: string;
  sourceUrl: string | null; archiveKey: string; manifest: unknown; localReport: unknown; proactiveAudit: unknown;
}) {
  await db.execute<ResultSetHeader>(
    `INSERT INTO ulak_projects (id, owner_hash, name, source_name, source_kind, source_url, archive_key, manifest_json, local_report_json, proactive_audit_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`,
    [values.id, values.ownerHash, values.name, values.sourceName, values.sourceKind, values.sourceUrl, values.archiveKey, JSON.stringify(values.manifest), JSON.stringify(values.localReport), JSON.stringify(values.proactiveAudit)],
  );
}

export async function updateProjectAnalysis(id: string, ownerHash: string, report: unknown, consentAt: Date) {
  await db.execute<ResultSetHeader>(
    "UPDATE ulak_projects SET ai_report_json = ?, ai_consent_at = ?, status = 'ready' WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(report), consentAt, id, ownerHash],
  );
}

export async function updateProjectResearch(id: string, ownerHash: string, report: unknown, consentAt: Date) {
  await db.execute<ResultSetHeader>(
    "UPDATE ulak_projects SET research_json = CAST(? AS JSON), research_consent_at = ?, status = 'ready' WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(report), consentAt, id, ownerHash],
  );
}

export async function updateProjectProactiveAudit(id: string, ownerHash: string, audit: unknown) {
  await db.execute<ResultSetHeader>(
    "UPDATE ulak_projects SET proactive_audit_json = CAST(? AS JSON), status = 'ready' WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(audit), id, ownerHash],
  );
}

export async function addMessage(projectId: string, ownerHash: string, role: "user" | "assistant", content: string) {
  await db.execute<ResultSetHeader>(
    "INSERT INTO ulak_messages (project_id, owner_hash, role, content) VALUES (?, ?, ?, ?)",
    [projectId, ownerHash, role, content],
  );
}

export async function getMessages(projectId: string, ownerHash: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT role, content, created_at FROM ulak_messages WHERE project_id = ? AND owner_hash = ? ORDER BY id ASC LIMIT 40",
    [projectId, ownerHash],
  );
  return rows;
}

export async function softDeleteProject(id: string, ownerHash: string) {
  const [result] = await db.execute<ResultSetHeader>(
    "UPDATE ulak_projects SET deleted_at = NOW() WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [id, ownerHash],
  );
  return result.affectedRows > 0;
}
