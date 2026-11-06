import path from "node:path";
import ts from "typescript";

/**
 * Kaynak okuma katmanları — ARASTIRMA_YONTEMI.md §4.3–§4.6.
 *
 * Buradaki yardımcılar yalnızca ölçüm üretir; yorum üretmez. Bir sembol listesi
 * "proje şunu yapıyor" demez, "bu dosyada şu isimler var" der. Yorum rapora aittir.
 */

export type SymbolKind = "function" | "class" | "method" | "type" | "constant";

export interface SymbolEntry {
  file: string;
  name: string;
  kind: SymbolKind;
  line: number;
  /** Python'da `_` öneki, TS'te `export` yokluğu ile belirlenir. */
  exported: boolean;
}

export interface SymbolFile {
  file: string;
  bytes: number;
  count: number;
  symbols: SymbolEntry[];
}

export interface SymbolInventory {
  total: number;
  files: SymbolFile[];
  /** Sembol sayısı en yüksek dosyalar — §4.3 "en büyük dosya genelde projenin asıl fikridir". */
  hotspots: SymbolFile[];
}

export interface TestInventory {
  count: number;
  files: string[];
  frameworks: string[];
  /** "Yok" demek de kanıt ister: hangi örüntülerin arandığı kayda geçer. */
  searchedPatterns: string[];
}

export interface SizeHotspot {
  path: string;
  bytes: number;
}

export interface WrapperInfo {
  /** Tüm öğeleri saran tek kök klasör (varsa). */
  root: string | null;
  /** Kök klasörün içinde aynı adlı bir klasör daha var mı (çift iç içe ZIP). */
  doubleNested: boolean;
  /** Kök klasör adı kaç kez tekrarlanıyor. */
  depth: number;
}

export interface ManifestNote {
  file: string;
  line: number;
  text: string;
}

export interface AbsenceEvidence {
  id: string;
  claim: string;
  searches: string[];
}

type TextFile = { path: string; content: string };

const TS_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/i;
const PY_EXTENSIONS = /\.pyi?$/i;

function scriptKind(file: string) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.ts$/i.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isExported(node: ts.Node) {
  const modifiers = (node as { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers;
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function extractTypeScriptSymbols(file: TextFile): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  let source: ts.SourceFile;
  try {
    source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind(file.path));
  } catch {
    return symbols;
  }
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const push = (name: string, kind: SymbolKind, node: ts.Node, exported: boolean) => {
    if (!name || name.length > 120) return;
    symbols.push({ file: file.path, name, kind, line: lineOf(node), exported });
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      push(node.name.text, "function", node, isExported(node));
    } else if (ts.isClassDeclaration(node) && node.name) {
      push(node.name.text, "class", node, isExported(node));
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) push(member.name.text, "method", member, isExported(node));
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      push(node.name.text, "type", node, isExported(node));
    } else if (ts.isTypeAliasDeclaration(node)) {
      push(node.name.text, "type", node, isExported(node));
    } else if (ts.isEnumDeclaration(node)) {
      push(node.name.text, "type", node, isExported(node));
    } else if (ts.isVariableStatement(node)) {
      const exported = isExported(node);
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer;
        const callable = initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
        push(declaration.name.text, callable ? "function" : "constant", declaration, exported);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return symbols;
}

/**
 * Python için tam AST yerine girinti farkındalıklı satır taraması kullanılır:
 * `ast` modülü Node'da yok, regex ise `def`/`class` başlıkları için yeterince güvenilir.
 */
function extractPythonSymbols(file: TextFile): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];
  const lines = file.content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fn = line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (fn) {
      symbols.push({ file: file.path, name: fn[2], kind: fn[1].length === 0 ? "function" : "method", line: index + 1, exported: !fn[2].startsWith("_") });
      continue;
    }
    const cls = line.match(/^(\s*)class\s+([A-Za-z_]\w*)/);
    if (cls) symbols.push({ file: file.path, name: cls[2], kind: "class", line: index + 1, exported: !cls[2].startsWith("_") });
  }
  return symbols;
}

export function extractSymbols(files: TextFile[], manifestBytes: Map<string, number>): SymbolInventory {
  const perFile: SymbolFile[] = [];
  for (const file of files) {
    const symbols = TS_EXTENSIONS.test(file.path)
      ? extractTypeScriptSymbols(file)
      : PY_EXTENSIONS.test(file.path)
        ? extractPythonSymbols(file)
        : [];
    if (!symbols.length) continue;
    perFile.push({ file: file.path, bytes: manifestBytes.get(file.path) ?? file.content.length, count: symbols.length, symbols: symbols.slice(0, 60) });
  }
  perFile.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  return {
    total: perFile.reduce((sum, entry) => sum + entry.count, 0),
    files: perFile.slice(0, 40),
    hotspots: [...perFile].sort((a, b) => b.bytes - a.bytes).slice(0, 8),
  };
}

const TEST_FILE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "test_*.py / *_test.py", pattern: /(^|\/)test_[^/]*\.py$|(^|\/)[^/]*_test\.py$/i },
  { label: "*.test.ts(x) / *.spec.ts(x)", pattern: /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i },
  { label: "*_test.go", pattern: /_test\.go$/i },
  { label: "*Test.java / *Tests.cs", pattern: /(Test|Tests)\.(java|cs|kt)$/ },
  { label: "tests/ spec/ __tests__/ src/test/ e2e/", pattern: /(^|\/)(tests?|specs?|__tests__|e2e|testdata)(\/|$)/i },
  { label: "pytest.ini / vitest.config / jest.config / conftest.py", pattern: /(^|\/)(pytest\.ini|tox\.ini|conftest\.py|vitest\.config\.[^/]+|jest\.config\.[^/]+|phpunit\.xml)$/i },
];

const FRAMEWORK_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "vitest", pattern: /\bvitest\b/i },
  { name: "jest", pattern: /\bjest\b/i },
  { name: "mocha", pattern: /\bmocha\b/i },
  { name: "pytest", pattern: /\bpytest\b/i },
  { name: "unittest", pattern: /^\s*import\s+unittest\b/m },
  { name: "go test", pattern: /_test\.go$/i },
  { name: "JUnit", pattern: /\borg\.junit\b/ },
  { name: "Playwright", pattern: /\bplaywright\b/i },
  { name: "Cypress", pattern: /\bcypress\b/i },
];

export function countTests(archiveNames: string[], files: TextFile[]): TestInventory {
  const matched = new Set<string>();
  for (const name of archiveNames) {
    if (TEST_FILE_PATTERNS.some((entry) => entry.pattern.test(name))) matched.add(name);
  }
  const frameworks = new Set<string>();
  for (const file of files) {
    for (const signature of FRAMEWORK_SIGNATURES) {
      if (signature.pattern.test(file.content) || signature.pattern.test(file.path)) frameworks.add(signature.name);
    }
  }
  return {
    count: matched.size,
    files: [...matched].sort().slice(0, 40),
    frameworks: [...frameworks].sort(),
    searchedPatterns: TEST_FILE_PATTERNS.map((entry) => entry.label),
  };
}

/**
 * §4.3 / tuzak #10: boyut yanıltıcıdır. 413 MB'lık deponun 180 MB'ı tek bir
 * gömülü çalıştırılabilir dosya olabilir. Büyük dosyalar ayrıca listelenir.
 */
export function findSizeHotspots(entries: Array<{ path: string; bytes: number }>, thresholdBytes = 20 * 1024 * 1024): SizeHotspot[] {
  return entries
    .filter((entry) => entry.bytes >= thresholdBytes)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map((entry) => ({ path: entry.path, bytes: entry.bytes }));
}

/**
 * Tuzak #1: `Expand-Archive foo-main.zip` → `foo-main/foo-main/...`.
 * "Veri yok" ile "betiğim yanlış yere baktı" ayırt edilemez; bu yüzden sarmalayıcı
 * klasör ölçülür ve raporlanır.
 */
export function detectWrapper(archiveNames: string[]): WrapperInfo {
  const files = archiveNames.filter((name) => name.includes("/"));
  if (!files.length) return { root: null, doubleNested: false, depth: 0 };
  const roots = new Set(files.map((name) => name.split("/")[0]));
  if (roots.size !== 1) return { root: null, doubleNested: false, depth: 0 };
  const root = [...roots][0];
  let depth = 0;
  for (const name of files) {
    const segments = name.split("/");
    let repeats = 0;
    while (segments[repeats] === root) repeats += 1;
    depth = Math.max(depth, repeats);
  }
  return { root, doubleNested: depth >= 2, depth };
}

const MANIFEST_FILES = /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|setup\.py|setup\.cfg|package\.json|cargo\.toml|go\.mod|environment\.ya?ml|pipfile)$/i;
const REASON_HINT = /\b(why|because|pin|pinned|conflict|exclude|excluded|noqa|no-deps|do not|don't|avoid|broken|incompatible|gerekli|çünkü|sakın|kullanma|sürüm|uyumsuz)\b/i;

/**
 * §4.1: manifestteki **yorumları** oku. Bir bağımlılığın neden yok sayıldığını
 * açıklayan 8 satırlık yorum, 200 satırlık bağımlılık listesinden daha değerlidir.
 */
export function extractManifestNotes(files: TextFile[]): ManifestNote[] {
  const notes: ManifestNote[] = [];
  for (const file of files) {
    if (!MANIFEST_FILES.test(file.path)) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (notes.length >= 24) return;
      const trimmed = line.trim();
      const comment = trimmed.match(/^(?:#|\/\/)\s*(.+)$/)?.[1]?.trim();
      if (!comment || comment.length < 20) return;
      if (!REASON_HINT.test(comment)) return;
      notes.push({ file: file.path, line: index + 1, text: comment.slice(0, 200) });
    });
  }
  return notes;
}

/**
 * §5: "yok" demek de kanıt ister. Her olumsuz bulgu, hangi aramaların
 * yapıldığını taşır; aksi halde "bulunamadı" ile "aramadım" aynı görünür.
 */
export function buildAbsenceEvidence(archiveNames: string[], tests: TestInventory, licenseFile: string | null): AbsenceEvidence[] {
  const evidence: AbsenceEvidence[] = [];
  if (!archiveNames.some((name) => /(^|\/)readme(\.|$)/i.test(name))) {
    evidence.push({
      id: "missing-readme",
      claim: "README dosyası yok",
      searches: ["dosya adı: readme, readme.md, readme.txt, readme.rst", `${archiveNames.length} arşiv öğesinin tamamı tarandı`],
    });
  }
  if (tests.count === 0) {
    evidence.push({
      id: "test-structure-not-found",
      claim: "Test dosyası yok",
      searches: tests.searchedPatterns,
    });
  }
  if (!licenseFile) {
    evidence.push({
      id: "license-not-found",
      claim: "Lisans dosyası yok",
      searches: ["dosya adı: license, licence, copying, copyright (+ .md/.txt/.rst)", `${archiveNames.length} arşiv öğesinin tamamı tarandı`],
    });
  }
  return evidence;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function basenameOf(filePath: string) {
  return path.posix.basename(filePath);
}
