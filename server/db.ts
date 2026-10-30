import path from "node:path";
import { mkdir } from "node:fs/promises";
import mysql, { type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { DatabaseSync } from "node:sqlite";
import { storageRoot } from "./storage.js";

interface Driver {
  dialect: "mysql" | "sqlite";
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<number>;
}

function mysqlDriver(dsn: string): Driver {
  const pool = mysql.createPool(dsn);
  return {
    dialect: "mysql",
    async all<T>(sql: string, params: unknown[] = []) {
      const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
      return rows as unknown as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const [result] = await pool.execute<ResultSetHeader>(sql, params);
      return result.affectedRows ?? 0;
    },
  };
}

function sqliteDriver(file: string): Driver {
  let database: DatabaseSync | null = null;
  const open = async () => {
    if (database) return database;
    await mkdir(path.dirname(file), { recursive: true });
    database = new DatabaseSync(file);
    database.exec("PRAGMA journal_mode = WAL");
    return database;
  };
  const normalize = (params: unknown[]) => params.map((value) => (value === undefined ? null : value)) as never[];
  return {
    dialect: "sqlite",
    async all<T>(sql: string, params: unknown[] = []) {
      const db = await open();
      return db.prepare(sql).all(...normalize(params)) as unknown as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const db = await open();
      const result = db.prepare(sql).run(...normalize(params));
      return Number(result.changes ?? 0);
    },
  };
}

/**
 * `DATABASE_URL` varsa MySQL, yoksa yerel SQLite kullanılır.
 * Böylece ULAK, yönetilen bir veritabanı olmadan da çalışabilir.
 */
function createDriver(): Driver {
  const dsn = process.env.DATABASE_URL?.trim();
  if (dsn) return mysqlDriver(dsn);
  const file = process.env.ULAK_DB_FILE?.trim() || path.join(storageRoot(), "ulak.db");
  return sqliteDriver(file);
}

const driver = createDriver();

const MYSQL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ulak_projects (
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
    INDEX idx_ulak_owner_updated (owner_hash, updated_at)
  )`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_audit_json JSON NULL`,
  `CREATE TABLE IF NOT EXISTS ulak_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    owner_hash CHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ulak_message_project (project_id, owner_hash, id)
  )`,
];

const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ulak_projects (
    id TEXT NOT NULL PRIMARY KEY,
    owner_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_url TEXT NULL,
    archive_key TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    local_report_json TEXT NOT NULL,
    proactive_audit_json TEXT NULL,
    ai_report_json TEXT NULL,
    research_json TEXT NULL,
    ai_consent_at TEXT NULL,
    research_consent_at TEXT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_owner_updated ON ulak_projects (owner_hash, updated_at)`,
  `CREATE TABLE IF NOT EXISTS ulak_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    owner_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_message_project ON ulak_messages (project_id, owner_hash, id)`,
];

export async function ensureSchema() {
  const statements = driver.dialect === "mysql" ? MYSQL_SCHEMA : SQLITE_SCHEMA;
  for (const statement of statements) {
    try {
      await driver.run(statement);
    } catch (error) {
      // MySQL'de mevcut kurulumlarda kolon zaten bulunabilir; diğer hatalar yükseltilir.
      const message = error instanceof Error ? error.message : "";
      if (!/duplicate column|already exists/i.test(message)) throw error;
    }
  }
}

export async function pingDatabase() {
  await driver.all("SELECT 1 AS ok");
}

export interface ProjectRow {
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
  ai_consent_at: string | null;
  research_consent_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function decodeJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

const PROJECT_COLUMNS = "id, owner_hash, name, source_name, source_kind, source_url, archive_key, manifest_json, local_report_json, proactive_audit_json, ai_report_json, research_json, ai_consent_at, research_consent_at, status, created_at, updated_at, deleted_at";

export async function getProject(id: string, ownerHash: string) {
  const rows = await driver.all<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM ulak_projects WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL LIMIT 1`,
    [id, ownerHash],
  );
  return rows[0] ?? null;
}

export async function listProjects(ownerHash: string) {
  return driver.all<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM ulak_projects WHERE owner_hash = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50`,
    [ownerHash],
  );
}

export async function insertProject(values: {
  id: string; ownerHash: string; name: string; sourceName: string; sourceKind: string;
  sourceUrl: string | null; archiveKey: string; manifest: unknown; localReport: unknown; proactiveAudit: unknown;
}) {
  await driver.run(
    `INSERT INTO ulak_projects (id, owner_hash, name, source_name, source_kind, source_url, archive_key, manifest_json, local_report_json, proactive_audit_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      values.id, values.ownerHash, values.name, values.sourceName, values.sourceKind, values.sourceUrl,
      values.archiveKey, JSON.stringify(values.manifest), JSON.stringify(values.localReport), JSON.stringify(values.proactiveAudit),
    ],
  );
}

export async function updateProjectAnalysis(id: string, ownerHash: string, report: unknown, consentAt: Date) {
  await driver.run(
    "UPDATE ulak_projects SET ai_report_json = ?, ai_consent_at = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(report), consentAt.toISOString(), id, ownerHash],
  );
}

export async function updateProjectResearch(id: string, ownerHash: string, report: unknown, consentAt: Date) {
  await driver.run(
    "UPDATE ulak_projects SET research_json = ?, research_consent_at = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(report), consentAt.toISOString(), id, ownerHash],
  );
}

export async function updateProjectProactiveAudit(id: string, ownerHash: string, audit: unknown) {
  await driver.run(
    "UPDATE ulak_projects SET proactive_audit_json = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(audit), id, ownerHash],
  );
}

export async function addMessage(projectId: string, ownerHash: string, role: "user" | "assistant", content: string) {
  await driver.run(
    "INSERT INTO ulak_messages (project_id, owner_hash, role, content) VALUES (?, ?, ?, ?)",
    [projectId, ownerHash, role, content],
  );
}

export async function getMessages(projectId: string, ownerHash: string) {
  return driver.all<{ role: string; content: string; created_at: string }>(
    "SELECT role, content, created_at FROM ulak_messages WHERE project_id = ? AND owner_hash = ? ORDER BY id ASC LIMIT 40",
    [projectId, ownerHash],
  );
}

export async function softDeleteProject(id: string, ownerHash: string) {
  const affected = await driver.run(
    "UPDATE ulak_projects SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [id, ownerHash],
  );
  return affected > 0;
}

export function databaseKind() {
  return driver.dialect;
}
