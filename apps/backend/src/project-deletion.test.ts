import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("permanentlyDeleteProject", () => {
  let directory = "";
  let database: typeof import("./db.js");
  const previousDatabaseFile = process.env.ULAK_DB_FILE;
  const previousDataDir = process.env.ULAK_DATA_DIR;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "ulak-project-delete-"));
    process.env.ULAK_DB_FILE = path.join(directory, "test.db");
    process.env.ULAK_DATA_DIR = directory;
    database = await import("./db.js");
    await database.ensureSchema();
  });

  afterAll(async () => {
    if (database) await database.closeDatabase();
    if (previousDatabaseFile === undefined) delete process.env.ULAK_DB_FILE;
    else process.env.ULAK_DB_FILE = previousDatabaseFile;
    if (previousDataDir === undefined) delete process.env.ULAK_DATA_DIR;
    else process.env.ULAK_DATA_DIR = previousDataDir;
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("removes project data while preserving shared learning", async () => {
    const id = randomUUID();
    const ownerHash = "owner";
    await database.insertProject({
      id,
      ownerHash,
      name: "Disposable project",
      sourceName: "project.zip",
      sourceKind: "archive",
      sourceUrl: null,
      archiveKey: `ulak/${id}/source.zip`,
      manifest: [],
      localReport: {},
      proactiveAudit: {},
    });
    await database.addMessage(id, ownerHash, "user", "project-specific conversation");
    await database.upsertFindingState(id, ownerHash, "finding", "resolved", "project-specific note");
    await database.insertAuditLog({ ownerHash, eventType: "project_creation", projectId: id, details: {}, ipAddress: null });
    await database.recordSecurityLearning([{
      id: "possible-hardcoded-secret",
      area: "credentials",
      severity: "high",
      title: "Test finding",
      detail: "Generic test",
      evidence: [],
      confidence: "medium",
    }]);

    expect(await database.permanentlyDeleteProject(id, ownerHash)).toBe(true);
    expect(await database.getProject(id, ownerHash)).toBeNull();
    expect(await database.getMessages(id, ownerHash)).toEqual([]);
    expect(await database.listFindingStates(id, ownerHash)).toEqual({});
    expect(await database.getSecurityLearningNotes()).toContainEqual(expect.objectContaining({
      id: "possible-hardcoded-secret",
      scansSeen: 1,
    }));
  });

  it("removes API workspace credentials and transient API audit records", async () => {
    const id = randomUUID();
    const ownerHash = "owner";
    await database.createApiWorkspace(id, ownerHash, { name: "Disposable API", category: "Türkiye" });
    await database.insertAuditLog({ ownerHash, eventType: "api_collection_import", projectId: null, details: {}, ipAddress: null });
    await database.insertAuditLog({ ownerHash, eventType: "api_request", projectId: null, details: {}, ipAddress: null });

    expect(await database.deleteApiWorkspace(id, ownerHash)).toBe(true);
    expect(await database.getPublicApiWorkspace(id, ownerHash)).toBeNull();
    expect(await database.deleteApiWorkspace(id, ownerHash)).toBe(false);
    expect(await database.getSecurityLearningNotes()).toContainEqual(expect.objectContaining({
      id: "possible-hardcoded-secret",
      scansSeen: 1,
    }));
  });

  it("deduplicates explicitly accepted general notes without linking them to a project", async () => {
    const note = {
      category: "testing",
      title: "Girdi sınırlarını her katmanda doğrula",
      recommendation: "Kullanıcı girdisini güven sınırlarını aşmadan önce doğrula ve beklenmeyen biçimleri reddet.",
    };
    const first = await database.addSharedKnowledgeNote(note, ["Örnek Uygulama"]);
    const repeated = await database.addSharedKnowledgeNote(note, ["Başka Uygulama"]);

    expect(first.filter((item) => item.source === "shared")).toHaveLength(1);
    expect(repeated.filter((item) => item.source === "shared")).toHaveLength(1);
    expect(repeated.find((item) => item.source === "shared")).toMatchObject({
      title: note.title,
      recommendation: note.recommendation,
      contributions: 2,
    });
    expect(JSON.stringify(repeated)).not.toContain("Örnek Uygulama");
    expect(JSON.stringify(repeated)).not.toContain("Başka Uygulama");
  });

  it("clears both built-in and user-contributed learning notes", async () => {
    await database.clearSecurityLearningNotes();
    expect(await database.getSecurityLearningNotes()).toEqual([]);
  });
});
