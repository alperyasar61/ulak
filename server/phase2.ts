import ts from "typescript";

export interface ApiSurface { method: string; path: string; file: string; authLikely: boolean; }
export interface PrivacySignal { category: string; file: string; evidence: string; }
export interface Phase2Analysis { findings: Array<{ id: string; area: string; severity: "high" | "medium" | "low"; title: string; detail: string; evidence: string[]; confidence: "medium" | "low" }>; apiSurface: ApiSurface[]; privacySignals: PrivacySignal[]; }

type TextFile = { path: string; content: string };

function scriptKind(file: string) {
  return /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : /\.jsx?$/.test(file) ? ts.ScriptKind.JSX : ts.ScriptKind.Unknown;
}

function analyzeTypeScript(file: TextFile) {
  const findings: Phase2Analysis["findings"] = [];
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, scriptKind(file.path));
  let hasRequestInput = false;
  let hasDangerousSink = false;
  const evidence: string[] = [];
  const visit = (node: ts.Node) => {
    const text = node.getText(source);
    if (/(?:req|request|ctx)\.(?:body|query|params|headers)|searchParams|get\(/i.test(text)) hasRequestInput = true;
    if (ts.isCallExpression(node) && /\b(?:eval|exec|execSync|spawn|spawnSync)\b/.test(text)) { hasDangerousSink = true; evidence.push(`${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} (dinamik çağrı)`); }
    if (ts.isNewExpression(node) && /\bFunction\b/.test(text)) { hasDangerousSink = true; evidence.push(`${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} (Function oluşturma)`); }
    if (ts.isPropertyAccessExpression(node) && /(?:innerHTML|outerHTML|dangerouslySetInnerHTML|insertAdjacentHTML)$/.test(node.name.text)) { hasDangerousSink = true; evidence.push(`${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} (HTML sink)`); }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (hasRequestInput && hasDangerousSink) findings.push({ id: "tainted-input-sink", area: "SAST", severity: "high", title: "Kullanıcı girdisi tehlikeli sink’e yakın görünüyor", detail: "AST tabanlı ilk taramada request/query/body girdisi ile dinamik çalıştırma veya HTML sink’i aynı dosyada bulundu. Bu bir veri akışı kanıtı değildir; kaynak-sink zinciri manuel doğrulanmalıdır.", evidence: evidence.slice(0, 6), confidence: "low" });
  return findings;
}

export function analyzePhase2(files: TextFile[]): Phase2Analysis {
  const findings: Phase2Analysis["findings"] = [];
  const apiSurface: ApiSurface[] = [];
  const privacySignals: PrivacySignal[] = [];
  const sensitiveRouteWithoutAuth: string[] = [];
  const piiPattern = /(?:email|e-mail|telefon|phone|mobile|address|adres|tckn|tc[_-]?no|ssn|health|medical|saglik|doğum|birth|dateOfBirth)/i;

  for (const file of files) {
    if (/\.(tsx?|jsx?)$/.test(file.path)) findings.push(...analyzeTypeScript(file));
    const authLikely = /(?:requireAuth|isAuthenticated|authenticate|authorization|bearer|jwt|session|middleware|currentUser)/i.test(file.content);
    for (const match of file.content.matchAll(/(?:app|router|server)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]|@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi)) {
      const method = (match[1] ?? match[3] ?? "get").toUpperCase();
      const routePath = match[2] ?? match[4] ?? "unknown";
      apiSurface.push({ method, path: routePath, file: file.path, authLikely });
      if (!authLikely && /(?:admin|user|account|project|upload|private|billing|message)/i.test(routePath)) sensitiveRouteWithoutAuth.push(`${file.path}: ${method} ${routePath}`);
    }
    if (piiPattern.test(file.content)) {
      const line = file.content.split(/\r?\n/).find((candidate) => piiPattern.test(candidate));
      privacySignals.push({ category: "PII anahtar/saklama sinyali", file: file.path, evidence: line ? `${file.path}:${file.content.slice(0, file.content.indexOf(line)).split(/\r?\n/).length} (alan adı maskelendi)` : `${file.path} (alan adı maskelendi)` });
    }
    if (/(?:console\.(?:log|error|warn)|logger\.(?:info|error|warn)|print\s*\()/i.test(file.content) && piiPattern.test(file.content)) privacySignals.push({ category: "Loglarda PII riski", file: file.path, evidence: `${file.path} (log ve hassas alan sinyali; değer gösterilmedi)` });
  }
  if (sensitiveRouteWithoutAuth.length) findings.push({ id: "api-auth-review", area: "API Yetkilendirme", severity: "medium", title: "Hassas API route’ları için yetkilendirme incelemesi gerekli", detail: "Route ve authentication örüntüsü aynı dosyada birlikte görülmedi. Statik analiz middleware’in gerçekten uygulandığını kanıtlamaz.", evidence: sensitiveRouteWithoutAuth.slice(0, 8), confidence: "low" });
  if (privacySignals.length) findings.push({ id: "pii-data-signal", area: "Gizlilik", severity: "medium", title: "Kişisel veri veya hassas alan sinyali bulundu", detail: "Alan adları ve log bağlamı PII saklama/aktarımı ihtimalini gösteriyor. Ham değerler rapora alınmadı; retention, maskeleme ve erişim kontrolü ayrıca doğrulanmalı.", evidence: privacySignals.slice(0, 8).map((signal) => signal.evidence), confidence: "low" });
  return { findings: findings.slice(0, 40), apiSurface: apiSurface.slice(0, 120), privacySignals: privacySignals.slice(0, 80) };
}
