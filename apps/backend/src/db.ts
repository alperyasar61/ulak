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
    proactive_audit_previous_json JSON NULL,
    proactive_diff_json JSON NULL,
    ai_report_json LONGTEXT NULL,
    research_json JSON NULL,
    reconstruction_json LONGTEXT NULL,
    ai_consent_at DATETIME NULL,
    research_consent_at DATETIME NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ready',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_ulak_owner_updated (owner_hash, updated_at)
  )`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_audit_json JSON NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_audit_previous_json JSON NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_diff_json JSON NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN reconstruction_json LONGTEXT NULL`,
  `CREATE TABLE IF NOT EXISTS ulak_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    owner_hash CHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ulak_message_project (project_id, owner_hash, id)
  )`,
  `CREATE TABLE IF NOT EXISTS ulak_finding_states (
    project_id CHAR(36) NOT NULL,
    owner_hash CHAR(64) NOT NULL,
    finding_id VARCHAR(180) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    note TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, finding_id),
    INDEX idx_ulak_finding_owner (owner_hash, project_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ulak_audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    owner_hash CHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    project_id CHAR(36) NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    INDEX idx_ulak_audit_owner (owner_hash, timestamp)
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
    proactive_audit_previous_json TEXT NULL,
    proactive_diff_json TEXT NULL,
    ai_report_json TEXT NULL,
    research_json TEXT NULL,
    reconstruction_json TEXT NULL,
    ai_consent_at TEXT NULL,
    research_consent_at TEXT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_owner_updated ON ulak_projects (owner_hash, updated_at)`,
  // Eski SQLite dosyalarında eksik kolonlar için (CREATE TABLE IF NOT EXISTS mevcut tabloyu değiştirmez).
  `ALTER TABLE ulak_projects ADD COLUMN proactive_audit_json TEXT NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_audit_previous_json TEXT NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN proactive_diff_json TEXT NULL`,
  `ALTER TABLE ulak_projects ADD COLUMN reconstruction_json TEXT NULL`,
  `CREATE TABLE IF NOT EXISTS ulak_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    owner_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_message_project ON ulak_messages (project_id, owner_hash, id)`,
  `CREATE TABLE IF NOT EXISTS ulak_finding_states (
    project_id TEXT NOT NULL,
    owner_hash TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    note TEXT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, finding_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_finding_owner ON ulak_finding_states (owner_hash, project_id)`,
  `CREATE TABLE IF NOT EXISTS ulak_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    owner_hash TEXT NOT NULL,
    event_type TEXT NOT NULL,
    project_id TEXT NULL,
    details TEXT NULL,
    ip_address TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_audit_owner ON ulak_audit_logs (owner_hash, timestamp)`,
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
  proactive_audit_previous_json: unknown;
  proactive_diff_json: unknown;
  ai_report_json: string | null;
  research_json: unknown;
  reconstruction_json: string | null;
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

const PROJECT_COLUMNS = "id, owner_hash, name, source_name, source_kind, source_url, archive_key, manifest_json, local_report_json, proactive_audit_json, proactive_audit_previous_json, proactive_diff_json, ai_report_json, research_json, reconstruction_json, ai_consent_at, research_consent_at, status, created_at, updated_at, deleted_at";

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

/**
 * Tek kullanıcılı yerel kurulumda eski oturum jetonlarıyla oluşturulmuş tüm
 * kayıtları tek bir sahip altında toplar; böylece kenar çubuğu boş kalmaz.
 */
export async function adoptAllOwners(ownerHash: string) {
  const tables = ["ulak_projects", "ulak_messages", "ulak_finding_states", "ulak_audit_logs"];
  for (const table of tables) {
    await driver.run(`UPDATE ${table} SET owner_hash = ? WHERE owner_hash <> ?`, [ownerHash, ownerHash]);
  }
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

export async function updateProjectReconstruction(id: string, ownerHash: string, blueprint: unknown) {
  await driver.run(
    "UPDATE ulak_projects SET reconstruction_json = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(blueprint), id, ownerHash],
  );
}

export async function updateProjectProactiveAudit(
  id: string,
  ownerHash: string,
  audit: unknown,
  previous: unknown,
  diff: unknown,
) {
  await driver.run(
    `UPDATE ulak_projects
       SET proactive_audit_json = ?, proactive_audit_previous_json = ?, proactive_diff_json = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL`,
    [
      JSON.stringify(audit),
      previous ? JSON.stringify(previous) : null,
      diff ? JSON.stringify(diff) : null,
      id,
      ownerHash,
    ],
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

export async function listFindingStates(projectId: string, ownerHash: string) {
  const rows = await driver.all<{ finding_id: string; status: string; note: string | null; updated_at: string | Date }>(
    "SELECT finding_id, status, note, updated_at FROM ulak_finding_states WHERE project_id = ? AND owner_hash = ? ORDER BY updated_at DESC",
    [projectId, ownerHash],
  );
  return Object.fromEntries(
    rows.map((row) => [row.finding_id, { status: row.status, note: row.note ?? "", updatedAt: row.updated_at }]),
  );
}

export async function upsertFindingState(
  projectId: string,
  ownerHash: string,
  findingId: string,
  status: string,
  note: string,
) {
  const upsert = driver.dialect === "mysql"
    ? `INSERT INTO ulak_finding_states (project_id, owner_hash, finding_id, status, note) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE owner_hash = VALUES(owner_hash), status = VALUES(status), note = VALUES(note), updated_at = CURRENT_TIMESTAMP`
    : `INSERT INTO ulak_finding_states (project_id, owner_hash, finding_id, status, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, finding_id) DO UPDATE SET owner_hash = excluded.owner_hash, status = excluded.status, note = excluded.note, updated_at = CURRENT_TIMESTAMP`;
  await driver.run(upsert, [projectId, ownerHash, findingId, status, note]);
  return listFindingStates(projectId, ownerHash);
}

export async function insertAuditLog(values: {
  ownerHash: string;
  eventType: string;
  projectId: string | null;
  details: unknown;
  ipAddress: string | null;
}) {
  await driver.run(
    `INSERT INTO ulak_audit_logs (owner_hash, event_type, project_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      values.ownerHash,
      values.eventType,
      values.projectId,
      JSON.stringify(values.details),
      values.ipAddress,
    ],
  );
}

export function databaseKind() {
  return driver.dialect;
}
