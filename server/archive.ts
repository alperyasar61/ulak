import { mkdtemp, mkdir, readFile, rm, stat, lstat, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import type { DependencyRef } from "./research.js";
import { buildProactiveAudit, type ProactiveAudit } from "./proactive.js";

const require = createRequire(import.meta.url);
const seven = require("7zip-min") as {
  list(file: string): Promise<Array<{ name: string; size?: string | number; attr?: string }>>;
  unpackSome(file: string, names: string[], destination: string): Promise<string>;
};

const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ADVERTISED_BYTES = 350 * 1024 * 1024;
const MAX_EXTRACT_FILES = 260;
const MAX_EXTRACT_BYTES = 18 * 1024 * 1024;
const MAX_TEXT_PER_FILE = 400 * 1024;
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", "target", "coverage", "__pycache__", ".venv", "venv", "site-packages", ".next", "out"]);
const TEXT_EXTENSIONS = new Set([".py", ".pyi", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".rst", ".txt", ".toml", ".yaml", ".yml", ".sh", ".html", ".css", ".scss", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".sql", ".dockerfile", ".xml", ".ini", ".cfg", ".conf", ".lock", ".gradle", ".vue", ".svelte"]);
const SECRET_FILENAMES = new Set([".env", ".env.local", ".env.production", "id_rsa", "id_ed25519", "credentials.json", "secrets.json"]);

export interface ManifestEntry { path: string; bytes: number; language: string; }
export interface LocalFinding { id: string; area: string; severity: "high" | "medium" | "low"; title: string; detail: string; evidence: string[]; confidence: "medium" | "low"; }
export interface LocalReport {
  projectPurpose: string;
  summary: string;
  stack: Array<{ name: string; confidence: "high" | "medium" }>;
  fileCount: number;
  analyzedFiles: number;
  totalBytes: number;
  modules: Array<{ name: string; files: number }>;
  entryPoints: string[];
  dependencies: DependencyRef[];
  relationships: Array<{ from: string; to: string; type: string }>;
  findings: LocalFinding[];
  secretFileCount: number;
  analyzedAt: string;
}
export interface AnalysisBundle { manifest: ManifestEntry[]; report: LocalReport; proactiveAudit: ProactiveAudit; aiContext: string; }

function normalizedEntry(rawName: string) {
  const converted = rawName.replace(/\\/g, "/");
  if (!converted || converted.includes("\0") || converted.startsWith("/") || /^[a-zA-Z]:/.test(converted) || converted.startsWith("//")) return null;
  const segments = converted.split("/");
  if (segments.some((part) => part === "..")) return null;
  const normalized = path.posix.normalize(converted).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function advertisedBytes(value?: string | number) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/^\s*(\d+(?:\.\d+)?)\s*(B|KB|KIB|MB|MIB|GB|GIB)?\s*$/i);
    if (!match) return 0;
    const unit = (match[2] ?? "B").toUpperCase();
    const multiplier = unit === "KB" || unit === "KIB" ? 1024 : unit === "MB" || unit === "MIB" ? 1024 ** 2 : unit === "GB" || unit === "GIB" ? 1024 ** 3 : 1;
    return Math.floor(Number(match[1]) * multiplier);
  }
  return 0;
}

function shouldSkip(filePath: string) {
  const segments = filePath.split("/");
  return segments.some((segment) => SKIP_DIRS.has(segment.toLowerCase())) || segments.some((segment) => SECRET_FILENAMES.has(segment.toLowerCase()));
}

function isTextCandidate(filePath: string) {
  const name = path.posix.basename(filePath).toLowerCase();
  if (SECRET_FILENAMES.has(name) || name.startsWith(".env")) return false;
  if (["dockerfile", "makefile", "license", "copying", "readme", "requirements.txt", "go.mod", "go.sum", "cargo.lock", "poetry.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "composer.lock"].includes(name)) return true;
  return TEXT_EXTENSIONS.has(path.posix.extname(name));
}

function languageFor(filePath: string) {
  const name = path.posix.basename(filePath).toLowerCase();
  const ext = path.posix.extname(name);
  if ([".py", ".pyi"].includes(ext)) return "Python";
  if ([".ts", ".tsx"].includes(ext)) return "TypeScript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "JavaScript";
  if (ext === ".go" || name === "go.mod") return "Go";
  if (ext === ".rs" || name === "cargo.toml") return "Rust";
  if ([".java", ".kt"].includes(ext)) return "JVM";
  if ([".c", ".h", ".cpp", ".hpp"].includes(ext)) return "C/C++";
  if (ext === ".cs") return "C#";
  if ([".md", ".rst", ".txt"].includes(ext) || name.startsWith("readme")) return "Docs";
  if ([".toml", ".yaml", ".yml", ".json", ".ini", ".cfg", ".conf", ".lock"].includes(ext)) return "Config";
  return "Other";
}

function parseDependencies(files: Array<{ path: string; content: string }>): DependencyRef[] {
  const result = new Map<string, DependencyRef>();
  const add = (name: string, version: string, ecosystem: DependencyRef["ecosystem"]) => {
    const safeName = name.trim().replace(/["'\s]/g, "");
    if (!safeName || safeName.length > 180) return;
    const key = `${ecosystem}:${safeName.toLowerCase()}`;
    if (!result.has(key)) result.set(key, { name: safeName, version: version.trim().slice(0, 60), ecosystem });
  };

  for (const file of files) {
    const base = path.posix.basename(file.path).toLowerCase();
    if (base === "package.json") {
      try {
        const manifest = JSON.parse(file.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) add(name, version, "npm");
      } catch { /* malformed manifests remain visible as ordinary project files */ }
    }
    if (base === "requirements.txt" || base === "requirements-dev.txt") {
      for (const line of file.content.split(/\r?\n/)) {
        const match = line.trim().match(/^([A-Za-z0-9_.-]+)\s*(?:(?:==|===|~=|>=|<=|>|<)\s*([^\s;,[\]]+))?/);
        if (match && !line.trim().startsWith("#")) add(match[1], match[2] ?? "", "PyPI");
      }
    }
    if (base === "pyproject.toml") {
      const lines = file.content.split(/\r?\n/);
      let insideDeps = false;
      for (const line of lines) {
        if (/^\s*\[.*\]\s*$/.test(line)) insideDeps = /^\s*\[project\]\s*$/.test(line) || /^\s*\[project\.dependencies\]\s*$/.test(line);
        if (insideDeps) {
          const match = line.match(/^[\s"'-]*([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:[<=>~!]+\s*([\d.\w*-]+))?/);
          if (match && !["dependencies", "optional-dependencies"].includes(match[1])) add(match[1], match[2] ?? "", "PyPI");
        }
        const arrayItem = line.match(/^\s*"([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:[<=>~!]+\s*([\d.\w*-]+))?"/);
        if (arrayItem && file.content.includes("dependencies = [")) add(arrayItem[1], arrayItem[2] ?? "", "PyPI");
      }
    }
    if (base === "cargo.toml") {
      for (const line of file.content.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*["']([^"']+)["']/);
        if (match) add(match[1], match[2], "crates.io");
      }
    }
    if (base === "go.mod") {
      for (const line of file.content.split(/\r?\n/)) {
        const match = line.trim().match(/^([\w.\-/]+)\s+(v\d[^\s]*)/);
        if (match) add(match[1], match[2], "Go");
      }
    }
  }
  return [...result.values()].slice(0, 120);
}

function redactForModel(value: string) {
  return value
    .replace(/((?:api[_-]?key|secret|token|password|passwd|authorization)\s*[=:]\s*)(["']?)[^\s"'`,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{25,})\b/g, "[REDACTED]");
}

function buildPurpose(files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    if (path.posix.basename(file.path).toLowerCase() === "package.json") {
      try {
        const manifest = JSON.parse(file.content) as { description?: string; name?: string };
        if (manifest.description) return manifest.description.slice(0, 300);
        if (manifest.name) return `${manifest.name} adlı Node.js projesi`;
      } catch { /* continue */ }
    }
  }
  const readme = files.find((file) => /^readme(?:\.|$)/i.test(path.posix.basename(file.path)));
  if (readme) {
    const lines = readme.content.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).filter((line) => line && !line.startsWith("[!["));
    return lines.slice(0, 3).join(" — ").slice(0, 300) || "README içinde proje amacı bulunamadı";
  }
  return "Proje amacı analiz edilecek açıklayıcı bir README veya paket tanımı bulunamadı.";
}

function collectRelationships(files: Array<{ path: string; content: string }>) {
  const pathSet = new Set(files.map((file) => file.path));
  const edges: Array<{ from: string; to: string; type: string }> = [];
  const limit = 80;
  for (const file of files) {
    if (edges.length >= limit) break;
    const references = new Set<string>();
    for (const match of file.content.matchAll(/(?:from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\))/g)) {
      const ref = match[1] ?? match[2] ?? match[3];
      if (ref?.startsWith(".")) references.add(path.posix.normalize(path.posix.join(path.posix.dirname(file.path), ref)));
    }
    for (const reference of references) {
      const target = [...pathSet].find((candidate) => candidate === reference || candidate.startsWith(`${reference}.`) || candidate.startsWith(`${reference}/`));
      if (target && target !== file.path) edges.push({ from: file.path, to: target, type: "import" });
      if (edges.length >= limit) break;
    }
    const pythonImports = file.content.matchAll(/^\s*from\s+([\w.]+)\s+import\s+/gm);
    for (const match of pythonImports) {
      const target = [...pathSet].find((candidate) => candidate.endsWith(`${match[1].replace(/\./g, "/")}.py`));
      if (target && target !== file.path) edges.push({ from: file.path, to: target, type: "import" });
      if (edges.length >= limit) break;
    }
  }
  return edges;
}

function findStaticSignals(files: Array<{ path: string; content: string }>, archiveNames: string[]): LocalFinding[] {
  const findings: LocalFinding[] = [];
  const secretFiles = archiveNames.filter((name) => SECRET_FILENAMES.has(path.posix.basename(name).toLowerCase()) || path.posix.basename(name).toLowerCase().startsWith(".env"));
  if (secretFiles.length) findings.push({ id: "secret-files", area: "Güvenlik", severity: "high", title: "Arşivde sır içerebilecek dosyalar bulundu", detail: "Bu dosyalar AI bağlamına alınmadı. İçerikleri dışarı çıkarılmadan ayrıca kontrol edilmeli; gerekirse anahtarlar döndürülmeli.", evidence: secretFiles.slice(0, 5).map((name) => `${name} (içerik okunmadı)`), confidence: "medium" });

  const secretPattern = /(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd|private[_-]?key)\s*[=:]\s*["'][^"']{8,}["']|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{25,})\b/i;
  const secretEvidence: string[] = [];
  const shellEvidence: string[] = [];
  const todoEvidence: string[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (secretPattern.test(line) && secretEvidence.length < 6) secretEvidence.push(`${file.path}:${index + 1} (olası sır değeri maskelendi)`);
      if (/(?:subprocess\.(?:run|Popen|call)\s*\([^\n]*shell\s*=\s*True|\beval\s*\(|\bexec\s*\()/i.test(line) && shellEvidence.length < 6) shellEvidence.push(`${file.path}:${index + 1}`);
      if (/\b(?:TODO|FIXME|HACK)\b/.test(line) && todoEvidence.length < 6) todoEvidence.push(`${file.path}:${index + 1}`);
    });
  }
  if (secretEvidence.length) findings.push({ id: "possible-hardcoded-secret", area: "Güvenlik", severity: "high", title: "Kaynakta sır olabilecek değer eşleşmeleri var", detail: "İçerik otomatik olarak maskelendi; bu örüntü yanlış pozitif olabilir. Gerçek anahtar ise depodan kaldırıp yenileyin.", evidence: secretEvidence, confidence: "low" });
  if (shellEvidence.length) findings.push({ id: "dynamic-execution", area: "Güvenlik", severity: "medium", title: "Dinamik kod veya shell çalıştırma kullanımları var", detail: "Bu kullanım tek başına açık değildir; kullanıcı girdisinin akışını ve sandbox sınırlarını manuel incelemek gerekir.", evidence: shellEvidence, confidence: "low" });
  if (todoEvidence.length) findings.push({ id: "unfinished-markers", area: "Bakım", severity: "low", title: "Tamamlanmamış iş işaretleri bulundu", detail: "TODO/FIXME/HACK işaretleri bakım yükünü veya bilerek ertelenmiş işleri gösterebilir.", evidence: todoEvidence, confidence: "medium" });

  const allNames = archiveNames.map((name) => path.posix.basename(name).toLowerCase());
  if (!allNames.some((name) => name.startsWith("readme"))) findings.push({ id: "missing-readme", area: "Dokümantasyon", severity: "low", title: "README dosyası görünmüyor", detail: "Kurulum, amaç ve temel çalışma akışını açıklayan bir README yeni katkı sağlayanların projeyi anlamasını kolaylaştırır.", evidence: [], confidence: "medium" });
  if (!archiveNames.some((name) => /(^|\/)(tests?|specs?)(\/|\.)/i.test(name) || /(^|\/)(pytest\.ini|vitest\.config\.|jest\.config\.)/i.test(name))) findings.push({ id: "test-structure-not-found", area: "Kalite", severity: "medium", title: "Test yapısı bulunamadı", detail: "Arşiv envanterinde belirgin test klasörü veya test yapılandırması görülmedi; testler farklı adlandırılmış olabilir.", evidence: [], confidence: "low" });
  if (!allNames.some((name) => ["license", "license.md", "license.txt", "copying"].includes(name))) findings.push({ id: "license-not-found", area: "Yönetişim", severity: "low", title: "Lisans dosyası görünmüyor", detail: "Dağıtım ve yeniden kullanım koşullarını doğrulamak için proje lisansı kontrol edilmeli.", evidence: [], confidence: "low" });
  return findings;
}

export async function analyzeArchive(bytes: Buffer, originalName: string): Promise<AnalysisBundle> {
  if (!/\.(7z|zip|tar|tgz|tar\.gz)$/i.test(originalName)) throw new Error(".7z, .zip, .tar veya .tar.gz arşivi yükleyin.");
  const work = await mkdtemp(path.join(tmpdir(), "ulak-"));
  const archivePath = path.join(work, "source" + (path.extname(originalName) || ".archive"));
  const output = path.join(work, "extracted");
  await mkdir(output, { recursive: true });
  try {
    await writeFile(archivePath, bytes, { flag: "wx" });
    const listed = await seven.list(archivePath);
    if (!Array.isArray(listed) || listed.length === 0) throw new Error("Arşiv boş veya okunamıyor.");
    if (listed.length > MAX_ARCHIVE_ENTRIES) throw new Error("Arşivde 5.000’den fazla öğe var; daha küçük bir kaynak yükleyin.");
    const entries = listed.map((entry) => {
      const safePath = normalizedEntry(entry.name);
      const attr = String(entry.attr ?? "");
      if (!safePath) throw new Error("Arşivde güvenli olmayan veya üst dizine çıkan bir yol var; ayıklama iptal edildi.");
      if (/[Ll]/.test(attr)) throw new Error("Arşivde sembolik bağlantı olabilecek bir öğe var; güvenlik için ayıklama iptal edildi.");
      return { raw: entry.name, path: safePath, bytes: advertisedBytes(entry.size), attr };
    });
    const advertisedTotal = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    if (advertisedTotal > MAX_ADVERTISED_BYTES) throw new Error("Arşivin bildirilen açılmış boyutu 350 MB sınırını aşıyor.");

    const archiveNames = entries.map((entry) => entry.path);
    const candidateEntries = entries.filter((entry) => isTextCandidate(entry.path) && !shouldSkip(entry.path) && !entry.attr.toUpperCase().includes("D") && entry.bytes <= MAX_TEXT_PER_FILE);
    candidateEntries.sort((a, b) => {
      const rank = (p: string) => /(^|\/)(readme|package\.json|pyproject\.toml|requirements[^/]*\.txt|cargo\.toml|go\.mod|dockerfile)$/i.test(p) ? 0 : /(^|\/)(src|app|configs?|docs)(\/|$)/i.test(p) ? 1 : 2;
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
    });
    const selected: typeof candidateEntries = [];
    let selectedBytes = 0;
    const used = new Set<string>();
    for (const entry of candidateEntries) {
      if (selected.length >= MAX_EXTRACT_FILES || selectedBytes + entry.bytes > MAX_EXTRACT_BYTES) continue;
      if (used.has(entry.raw)) continue;
      selected.push(entry);
      selectedBytes += entry.bytes;
      used.add(entry.raw);
    }
    if (selected.length) await seven.unpackSome(archivePath, selected.map((entry) => entry.raw), output);

    const textFiles: Array<{ path: string; content: string }> = [];
    for (const entry of selected) {
      const target = path.resolve(output, ...entry.path.split("/"));
      if (!target.startsWith(`${output}${path.sep}`)) throw new Error("Arşiv çıkarma yolu çalışma alanının dışına çıktı.");
      try {
        const info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_TEXT_PER_FILE) continue;
        const buffer = await readFile(target);
        if (buffer.includes(0)) continue;
        textFiles.push({ path: entry.path, content: buffer.toString("utf8").slice(0, MAX_TEXT_PER_FILE) });
      } catch {
        // Some archivers preserve a wrapper directory; an unextracted candidate is omitted rather than guessed.
      }
    }

    const dependencies = parseDependencies(textFiles);
    const stack = new Map<string, "high" | "medium">();
    const has = (name: string) => textFiles.some((file) => file.path.toLowerCase().endsWith(name.toLowerCase()));
    if (has("pyproject.toml") || has("requirements.txt") || archiveNames.some((name) => name.endsWith(".py"))) stack.set("Python", "high");
    if (has("package.json") || archiveNames.some((name) => /\.(ts|tsx|js|jsx|mjs)$/.test(name))) stack.set("JavaScript / TypeScript", has("package.json") ? "high" : "medium");
    if (has("go.mod") || archiveNames.some((name) => name.endsWith(".go"))) stack.set("Go", has("go.mod") ? "high" : "medium");
    if (has("cargo.toml") || archiveNames.some((name) => name.endsWith(".rs"))) stack.set("Rust", has("cargo.toml") ? "high" : "medium");
    if (has("dockerfile") || archiveNames.some((name) => /(^|\/)dockerfile/i.test(name))) stack.set("Docker", "medium");
    if (has("pyproject.toml") || has("package.json") || has("go.mod") || has("cargo.toml")) stack.set("Dependency manifest", "high");

    const fileCounts = new Map<string, number>();
    for (const entry of entries) {
      const parts = entry.path.split("/");
      if (parts.length > 1) fileCounts.set(parts[0], (fileCounts.get(parts[0]) ?? 0) + 1);
    }
    const modules = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, files: count }));
    const entryPoints = archiveNames.filter((name) => /(^|\/)(main\.py|__main__\.py|app\.py|server\.(?:ts|js)|index\.(?:ts|js|tsx|jsx)|manage\.py|cli\.py)$/i.test(name)).slice(0, 14);
    const purpose = buildPurpose(textFiles);
    const findings = findStaticSignals(textFiles, archiveNames);
    const relationships = collectRelationships(textFiles);
    const proactiveAudit = buildProactiveAudit({
      archiveNames,
      textFiles,
      dependencies,
      secretFileCount: archiveNames.filter((name) => SECRET_FILENAMES.has(path.posix.basename(name).toLowerCase()) || path.posix.basename(name).toLowerCase().startsWith(".env")).length,
      hasDynamicExecution: findings.some((finding) => finding.id === "dynamic-execution"),
    });
    const report: LocalReport = {
      projectPurpose: purpose,
      summary: `${purpose} Arşivde ${entries.length.toLocaleString("tr-TR")} öğe bulundu; ${textFiles.length.toLocaleString("tr-TR")} metin dosyası statik olarak incelendi. Kod çalıştırılmadı.`,
      stack: [...stack.entries()].map(([name, confidence]) => ({ name, confidence })),
      fileCount: entries.length,
      analyzedFiles: textFiles.length,
      totalBytes: advertisedTotal,
      modules,
      entryPoints,
      dependencies,
      relationships,
      findings,
      secretFileCount: archiveNames.filter((name) => SECRET_FILENAMES.has(path.posix.basename(name).toLowerCase()) || path.posix.basename(name).toLowerCase().startsWith(".env")).length,
      analyzedAt: new Date().toISOString(),
    };

    const excerptCandidates = [...textFiles].sort((a, b) => {
      const rank = (p: string) => /readme|pyproject|package\.json|requirements|dockerfile|config/i.test(p) ? 0 : 1;
      return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path);
    });
    const contextBlocks: string[] = [];
    let chars = 0;
    for (const file of excerptCandidates) {
      if (contextBlocks.length >= 36 || chars >= 55_000) break;
      const safeContent = redactForModel(file.content).slice(0, 5_500);
      const block = `FILE: ${file.path}\n\`\`\`\n${safeContent}\n\`\`\``;
      if (chars + block.length > 55_000) break;
      contextBlocks.push(block);
      chars += block.length;
    }
    const aiContext = JSON.stringify({ report, files: contextBlocks }, null, 2);
    return { manifest: entries.filter((entry) => !entry.attr.toUpperCase().includes("D")).map((entry) => ({ path: entry.path, bytes: entry.bytes, language: languageFor(entry.path) })), report, proactiveAudit, aiContext };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
