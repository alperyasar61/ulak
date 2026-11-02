import path from "node:path";
import { mkdir } from "node:fs/promises";
import mysql, { type ExecuteValues, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { DatabaseSync } from "node:sqlite";
import { storageRoot } from "./storage.js";
import { securityLearningIds, securityLearningRules, sharedKnowledgeId, validateSharedKnowledgeInput, type SecurityLearningNote, type SharedKnowledgeCategory } from "./learning.js";
import type { LocalFinding, LocalReport } from "./archive.js";
import { assertPersistentMachineSecret, encryptLocal, decryptLocal } from "./security.js";
import { normalizeApiWorkspace, type ApiWorkspace } from "./api-workspaces.js";

interface SqlStatement {
  sql: string;
  params?: unknown[];
}

interface Driver {
  dialect: "mysql" | "sqlite";
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<number>;
  transaction(statements: SqlStatement[]): Promise<number[]>;
  close(): Promise<void>;
}

function mysqlParameters(params: unknown[]): ExecuteValues[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return value;
    if (value instanceof Date || value instanceof Uint8Array) return value;
    throw new TypeError("MySQL parametresi desteklenmeyen bir türde.");
  });
}

function mysqlDriver(dsn: string): Driver {
  const pool = mysql.createPool(dsn);
  return {
    dialect: "mysql",
    async all<T>(sql: string, params: unknown[] = []) {
      const [rows] = await pool.execute<RowDataPacket[]>(sql, mysqlParameters(params));
      return rows as unknown as T[];
    },
    async run(sql: string, params: unknown[] = []) {
      const [result] = await pool.execute<ResultSetHeader>(sql, mysqlParameters(params));
      return result.affectedRows ?? 0;
    },
    async transaction(statements: SqlStatement[]) {
      const connection = await pool.getConnection();
      const changes: number[] = [];
      try {
        await connection.beginTransaction();
        for (const statement of statements) {
          const [result] = await connection.execute<ResultSetHeader>(statement.sql, mysqlParameters(statement.params ?? []));
          changes.push(result.affectedRows ?? 0);
        }
        await connection.commit();
        return changes;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      await pool.end();
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
    database.exec("PRAGMA secure_delete = ON");
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
    async transaction(statements: SqlStatement[]) {
      const db = await open();
      db.exec("BEGIN IMMEDIATE");
      try {
        const changes = statements.map(({ sql, params = [] }) => {
          const result = db.prepare(sql).run(...normalize(params));
          return Number(result.changes ?? 0);
        });
        db.exec("COMMIT");
        return changes;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      database?.close();
      database = null;
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
  `CREATE TABLE IF NOT EXISTS ulak_security_learning (
    finding_id VARCHAR(100) NOT NULL PRIMARY KEY,
    scans_seen INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ulak_shared_knowledge (
    note_id CHAR(64) NOT NULL PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    title VARCHAR(100) NOT NULL,
    recommendation VARCHAR(600) NOT NULL,
    contributions INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE ulak_security_learning ADD COLUMN scans_seen INT UNSIGNED NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS ulak_api_workspaces (
    id CHAR(36) NOT NULL PRIMARY KEY,
    owner_hash CHAR(64) NOT NULL,
    name VARCHAR(180) NOT NULL,
    config_json LONGTEXT NOT NULL,
    secrets_encrypted LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ulak_api_workspace_owner (owner_hash, updated_at)
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
  `CREATE TABLE IF NOT EXISTS ulak_security_learning (
    finding_id TEXT NOT NULL PRIMARY KEY,
    scans_seen INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ulak_shared_knowledge (
    note_id TEXT NOT NULL PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    contributions INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `ALTER TABLE ulak_security_learning ADD COLUMN scans_seen INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS ulak_api_workspaces (
    id TEXT NOT NULL PRIMARY KEY,
    owner_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    secrets_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ulak_api_workspace_owner ON ulak_api_workspaces (owner_hash, updated_at)`,
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
  const learningColumns = driver.dialect === "mysql"
    ? await driver.all<{ Field: string }>("SHOW COLUMNS FROM ulak_security_learning")
    : await driver.all<{ name: string }>("PRAGMA table_info(ulak_security_learning)");
  const columnNames = new Set(learningColumns.map((column) =>
    "Field" in column ? column.Field : column.name,
  ));
  if (columnNames.has("projects_seen") && columnNames.has("scans_seen")) {
    await driver.run("UPDATE ulak_security_learning SET scans_seen = projects_seen WHERE scans_seen = 0 AND projects_seen > 0");
  }
}

export async function pingDatabase() {
  await driver.all("SELECT 1 AS ok");
}

export async function closeDatabase() {
  await driver.close();
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
  const tables = ["ulak_projects", "ulak_messages", "ulak_finding_states", "ulak_audit_logs", "ulak_api_workspaces"];
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

export async function updateProjectLocalReport(id: string, ownerHash: string, report: LocalReport) {
  await driver.run(
    "UPDATE ulak_projects SET local_report_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ? AND deleted_at IS NULL",
    [JSON.stringify(report), id, ownerHash],
  );
}

export async function recordSecurityLearning(findings: LocalFinding[]) {
  const ids = securityLearningIds(findings);
  for (const id of ids) {
    if (driver.dialect === "mysql") {
      await driver.run(
        `INSERT INTO ulak_security_learning (finding_id, scans_seen) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE scans_seen = scans_seen + 1`,
        [id],
      );
    } else {
      await driver.run(
        `INSERT INTO ulak_security_learning (finding_id, scans_seen) VALUES (?, 1)
         ON CONFLICT(finding_id) DO UPDATE SET scans_seen = scans_seen + 1, updated_at = datetime('now')`,
        [id],
      );
    }
  }
  return getSecurityLearningNotes();
}

export async function getSecurityLearningNotes(): Promise<SecurityLearningNote[]> {
  const rows = await driver.all<{ finding_id: string; scans_seen: number }>(
    "SELECT finding_id, scans_seen FROM ulak_security_learning ORDER BY scans_seen DESC, finding_id ASC",
  );
  const rules = securityLearningRules();
  const builtIn = rows.flatMap((row) => {
    const rule = rules[row.finding_id];
    return rule ? [{ ...rule, scansSeen: Number(row.scans_seen), source: "builtin" as const }] : [];
  });
  const shared = await driver.all<{
    note_id: string;
    category: SharedKnowledgeCategory;
    title: string;
    recommendation: string;
    contributions: number;
  }>(
    "SELECT note_id, category, title, recommendation, contributions FROM ulak_shared_knowledge ORDER BY contributions DESC, title ASC LIMIT 200",
  );
  return [
    ...builtIn,
    ...shared.map((note) => ({
      id: `shared-${note.note_id}`,
      title: note.title,
      recommendation: note.recommendation,
      scansSeen: 0,
      source: "shared" as const,
      category: note.category,
      contributions: Number(note.contributions),
    })),
  ];
}

export async function addSharedKnowledgeNote(input: unknown, forbiddenTerms: string[] = []) {
  const note = validateSharedKnowledgeInput(input, forbiddenTerms);
  const id = sharedKnowledgeId(note);
  if (driver.dialect === "mysql") {
    await driver.run(
      `INSERT INTO ulak_shared_knowledge (note_id, category, title, recommendation, contributions)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE contributions = contributions + 1`,
      [id, note.category, note.title, note.recommendation],
    );
  } else {
    await driver.run(
      `INSERT INTO ulak_shared_knowledge (note_id, category, title, recommendation, contributions)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(note_id) DO UPDATE SET contributions = contributions + 1, updated_at = datetime('now')`,
      [id, note.category, note.title, note.recommendation],
    );
  }
  return getSecurityLearningNotes();
}

export async function clearSecurityLearningNotes() {
  await driver.transaction([
    { sql: "DELETE FROM ulak_security_learning" },
    { sql: "DELETE FROM ulak_shared_knowledge" },
  ]);
}

interface ApiWorkspaceRow {
  id: string;
  owner_hash: string;
  name: string;
  config_json: unknown;
  secrets_encrypted: string;
  created_at: string;
  updated_at: string;
}

function decodeWorkspaceConfig(value: unknown) {
  const config = decodeJson<unknown>(value, null);
  if (!config) throw new Error("Kayıtlı API çalışma alanı okunamadı.");
  return normalizeApiWorkspace(config);
}

function workspaceSecrets(row: ApiWorkspaceRow) {
  assertPersistentMachineSecret();
  const decrypted = decryptLocal(row.secrets_encrypted);
  if (decrypted === null) throw new Error("API kimlik bilgileri bu makinede çözülemedi; servis anahtarını kontrol edin.");
  const value = JSON.parse(decrypted) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Şifreli API kimlik bilgisi biçimi geçersiz.");
  return value as Record<string, string>;
}

function cleanWorkspaceConfig(config: ReturnType<typeof normalizeApiWorkspace>) {
  return {
    ...config,
    proxyUrl: "",
    variables: config.variables.map((variable) => variable.isSecret ? { ...variable, value: "" } : variable),
    requests: config.requests.map((request) => ({
      ...request,
      assertions: request.assertions.map((assertion) => assertion.isSecret ? { ...assertion, expected: "" } : assertion),
    })),
  };
}

function protectRequestBodies(config: ReturnType<typeof normalizeApiWorkspace>) {
  const existingKeys = new Set(config.variables.map((variable) => variable.key));
  for (const request of config.requests) {
    request.url = request.url.replace(/([?&])([^=&#]+)=([^&#]*)/g, (match, separator: string, rawKey: string, rawValue: string) => {
      let key = rawKey;
      let value = rawValue;
      try { key = decodeURIComponent(rawKey); } catch { /* Leave malformed query components unchanged. */ }
      try { value = decodeURIComponent(rawValue); } catch { /* Leave malformed query components unchanged. */ }
      if (!/(?:token|secret|password|passwd|api[_-]?key|authorization|client[_-]?secret|credential)/i.test(key) || !value || looksLikeVariable(value)) return match;
      const base = `ulak_${request.id.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40)}_${key.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40)}`;
      let variableKey = base;
      let suffix = 2;
      while (existingKeys.has(variableKey)) variableKey = `${base}_${suffix++}`;
      existingKeys.add(variableKey);
      config.variables.push({ key: variableKey, value, isSecret: true });
      return `${separator}${rawKey}={{${variableKey}}}`;
    });
    if (!request.body) continue;
    try {
      const body: unknown = JSON.parse(request.body);
      const protect = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(protect);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value).map(([key, child]) => {
          if (/(?:token|secret|password|passwd|api[_-]?key|authorization|client[_-]?secret|credential)/i.test(key) && typeof child === "string" && child && !/^\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\}$/.test(child)) {
            const base = `ulak_${request.id.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40)}_${key.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40)}`;
            let variableKey = base;
            let suffix = 2;
            while (existingKeys.has(variableKey)) variableKey = `${base}_${suffix++}`;
            existingKeys.add(variableKey);
            config.variables.push({ key: variableKey, value: child, isSecret: true });
            return [key, `{{${variableKey}}}`];
          }
          return [key, protect(child)];
        }));
      };
      request.body = JSON.stringify(protect(body), null, 2);
    } catch {
      // Non-JSON request bodies remain editable; secrets should be supplied as encrypted variables.
    }
  }
}

function looksLikeVariable(value: string) {
  return /^\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\}$/.test(value);
}

function protectAuthSecrets(config: ReturnType<typeof normalizeApiWorkspace>, secrets: Record<string, string>) {
  const active = new Set<string>();
  const protect = (auth: typeof config.auth | typeof config.requests[number]["auth"], scope: string) => {
    const secretFields = auth.type === "bearer" ? ["token"]
      : auth.type === "basic" ? ["username", "password"]
        : auth.type === "api-key" ? ["value"]
          : [];
    for (const field of secretFields) {
      const key = `auth:${scope}:${field}`;
      const value = auth.type === "bearer" ? auth.token
        : auth.type === "basic" ? field === "username" ? auth.username : auth.password
          : auth.type === "api-key" ? auth.value
            : "";
      if (value) {
        if (!looksLikeVariable(value)) secrets[key] = value;
        else delete secrets[key];
      }
      if (!looksLikeVariable(value)) active.add(key);
      if (auth.type === "bearer" && field === "token") auth.token = "";
      if (auth.type === "basic" && field === "username") auth.username = "";
      if (auth.type === "basic" && field === "password") auth.password = "";
      if (auth.type === "api-key" && field === "value") auth.value = "";
    }
  };
  protect(config.auth, "workspace");
  for (const request of config.requests) {
    protect(request.auth, request.id);
    request.headers.forEach((header, index) => {
      if (!header.key || !/(?:authorization|token|secret|password|api[_-]?key|credential)/i.test(header.key)) return;
      const key = `header:${request.id}:${index}`;
      if (header.value) {
        if (!looksLikeVariable(header.value)) secrets[key] = header.value;
        else delete secrets[key];
      }
      if (!looksLikeVariable(header.value)) active.add(key);
      header.value = "";
    });
  }
  for (const key of Object.keys(secrets)) {
    if (key.startsWith("auth:") || key.startsWith("header:")) {
      if (!active.has(key)) delete secrets[key];
    }
  }
}

function restoreAuthSecrets(config: ReturnType<typeof normalizeApiWorkspace>, secrets: Record<string, string>) {
  const restore = (auth: typeof config.auth | typeof config.requests[number]["auth"], scope: string) => {
    if (auth.type === "bearer" && !auth.token) auth.token = secrets[`auth:${scope}:token`] ?? "";
    if (auth.type === "basic") {
      if (!auth.username) auth.username = secrets[`auth:${scope}:username`] ?? "";
      if (!auth.password) auth.password = secrets[`auth:${scope}:password`] ?? "";
    }
    if (auth.type === "api-key" && !auth.value) auth.value = secrets[`auth:${scope}:value`] ?? "";
  };
  restore(config.auth, "workspace");
  for (const request of config.requests) {
    restore(request.auth, request.id);
    request.headers.forEach((header, index) => {
      if (!header.value && header.key && /(?:authorization|token|secret|password|api[_-]?key|credential)/i.test(header.key)) {
        header.value = secrets[`header:${request.id}:${index}`] ?? "";
      }
    });
  }
}

function publicApiWorkspace(row: ApiWorkspaceRow): ApiWorkspace {
  const config = cleanWorkspaceConfig(decodeWorkspaceConfig(row.config_json));
  return { ...config, id: row.id, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

async function getApiWorkspaceRow(id: string, ownerHash: string) {
  const rows = await driver.all<ApiWorkspaceRow>(
    "SELECT id, owner_hash, name, config_json, secrets_encrypted, created_at, updated_at FROM ulak_api_workspaces WHERE id = ? AND owner_hash = ? LIMIT 1",
    [id, ownerHash],
  );
  return rows[0] ?? null;
}

export async function listApiWorkspaces(ownerHash: string) {
  const rows = await driver.all<ApiWorkspaceRow>(
    "SELECT id, owner_hash, name, config_json, secrets_encrypted, created_at, updated_at FROM ulak_api_workspaces WHERE owner_hash = ? ORDER BY updated_at DESC LIMIT 100",
    [ownerHash],
  );
  return rows.map(publicApiWorkspace);
}

export async function getPublicApiWorkspace(id: string, ownerHash: string): Promise<ApiWorkspace | null> {
  const row = await getApiWorkspaceRow(id, ownerHash);
  return row ? publicApiWorkspace(row) : null;
}

export async function getApiWorkspace(id: string, ownerHash: string): Promise<ApiWorkspace | null> {
  const row = await getApiWorkspaceRow(id, ownerHash);
  if (!row) return null;
  const config = decodeWorkspaceConfig(row.config_json);
  const secrets = workspaceSecrets(row);
  config.variables = config.variables.map((variable) => variable.isSecret
    ? { ...variable, value: secrets[variable.key] ?? "" }
    : variable);
  config.requests = config.requests.map((request) => ({
    ...request,
    assertions: request.assertions.map((assertion) => assertion.isSecret
      ? { ...assertion, expected: secrets[`assertion:${request.id}:${assertion.id}`] ?? "" }
      : assertion),
  }));
  config.proxyUrl = secrets["proxy:url"] ?? "";
  config.proxyUrlConfigured = Boolean(config.proxyUrl);
  restoreAuthSecrets(config, secrets);
  return { ...config, id: row.id, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function splitWorkspaceSecrets(config: ReturnType<typeof normalizeApiWorkspace>, existing: Record<string, string> = {}) {
  const secrets = { ...existing };
  if (config.proxyUrl) secrets["proxy:url"] = config.proxyUrl;
  else if (!config.proxyUrlConfigured) delete secrets["proxy:url"];
  if (config.proxyEnabled && !secrets["proxy:url"]) {
    throw new Error("Proxy kullanımını açtınız ancak kayıtlı bir proxy adresi yok. Sağlayıcı adresini girip kaydedin.");
  }
  config.proxyUrl = "";
  config.proxyUrlConfigured = Boolean(secrets["proxy:url"]);
  const activeAssertionKeys = new Set<string>();
  for (const request of config.requests) {
    for (const assertion of request.assertions) {
      const key = `assertion:${request.id}:${assertion.id}`;
      if (assertion.isSecret) {
        if (assertion.expected) secrets[key] = assertion.expected;
        if (secrets[key]) activeAssertionKeys.add(key);
        assertion.expected = "";
      } else {
        delete secrets[key];
      }
    }
  }
  protectRequestBodies(config);
  for (const variable of config.variables) {
    if (!variable.isSecret) continue;
    if (variable.value) secrets[variable.key] = variable.value;
    variable.value = "";
  }
  protectAuthSecrets(config, secrets);
  const activeSecretKeys = new Set(config.variables.filter((variable) => variable.isSecret).map((variable) => variable.key));
  for (const key of Object.keys(secrets)) {
    if (key.startsWith("assertion:") && !activeAssertionKeys.has(key)) delete secrets[key];
    else if (key !== "proxy:url" && !key.startsWith("auth:") && !key.startsWith("header:") && !key.startsWith("assertion:") && !activeSecretKeys.has(key)) delete secrets[key];
  }
  return secrets;
}

export async function createApiWorkspace(id: string, ownerHash: string, input: unknown) {
  assertPersistentMachineSecret();
  const config = normalizeApiWorkspace(input);
  const secrets = splitWorkspaceSecrets(config);
  const safeConfig = cleanWorkspaceConfig(config);
  await driver.run(
    "INSERT INTO ulak_api_workspaces (id, owner_hash, name, config_json, secrets_encrypted) VALUES (?, ?, ?, ?, ?)",
    [id, ownerHash, config.name, JSON.stringify(safeConfig), encryptLocal(JSON.stringify(secrets))],
  );
  const row = await getApiWorkspaceRow(id, ownerHash);
  if (!row) throw new Error("API çalışma alanı kaydedildi ancak tekrar okunamadı.");
  return publicApiWorkspace(row);
}

export async function updateApiWorkspace(id: string, ownerHash: string, input: unknown) {
  const row = await getApiWorkspaceRow(id, ownerHash);
  if (!row) return null;
  assertPersistentMachineSecret();
  const config = normalizeApiWorkspace(input);
  const secrets = splitWorkspaceSecrets(config, workspaceSecrets(row));
  const safeConfig = cleanWorkspaceConfig(config);
  await driver.run(
    "UPDATE ulak_api_workspaces SET name = ?, config_json = ?, secrets_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_hash = ?",
    [config.name, JSON.stringify(safeConfig), encryptLocal(JSON.stringify(secrets)), id, ownerHash],
  );
  const updated = await getApiWorkspaceRow(id, ownerHash);
  return updated ? publicApiWorkspace(updated) : null;
}

export async function deleteApiWorkspace(id: string, ownerHash: string) {
  const changes = await driver.transaction([
    {
      sql: "DELETE FROM ulak_audit_logs WHERE owner_hash = ? AND event_type IN ('api_request', 'api_collection_import') AND EXISTS (SELECT 1 FROM ulak_api_workspaces WHERE id = ? AND owner_hash = ?)",
      params: [ownerHash, id, ownerHash],
    },
    { sql: "DELETE FROM ulak_api_workspaces WHERE id = ? AND owner_hash = ?", params: [id, ownerHash] },
  ]);
  return (changes[1] ?? 0) > 0;
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

export async function permanentlyDeleteProject(id: string, ownerHash: string) {
  const changes = await driver.transaction([
    { sql: "DELETE FROM ulak_messages WHERE project_id = ? AND owner_hash = ?", params: [id, ownerHash] },
    { sql: "DELETE FROM ulak_finding_states WHERE project_id = ? AND owner_hash = ?", params: [id, ownerHash] },
    { sql: "DELETE FROM ulak_audit_logs WHERE project_id = ? AND owner_hash = ?", params: [id, ownerHash] },
    { sql: "DELETE FROM ulak_projects WHERE id = ? AND owner_hash = ?", params: [id, ownerHash] },
  ]);
  return (changes.at(-1) ?? 0) > 0;
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
