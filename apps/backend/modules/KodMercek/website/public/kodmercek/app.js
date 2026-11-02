const builtInRules = [
  { id: "SEC-001", severity: "critical", title: "SQL sorgusu dış girdiyi doğrudan alıyor", pattern: /SELECT[\s\S]{0,160}(\+|\$\{|`)/i, detail: "Kullanıcı girdisi parametrelenmeden sorguya ekleniyor. Parametreli sorgu veya sorgu oluşturucu kullanın.", category: "Enjeksiyon" },
  { id: "SEC-002", severity: "critical", title: "Güvensiz HTML doğrudan DOM'a yazılıyor", pattern: /dangerouslySetInnerHTML|innerHTML\s*=/, detail: "Güvenilmeyen içerik HTML olarak işlenebilir. İçeriği temizleyin veya metin düğümü kullanın.", category: "XSS" },
  { id: "SEC-003", severity: "high", title: "Dinamik kod çalıştırılıyor", pattern: /\beval\s*\(/, detail: "eval saldırı yüzeyini ve hata ayıklamayı zorlaştırır. Açık bir ayrıştırma yolu tercih edin.", category: "Güvenlik" },
  { id: "SEC-004", severity: "high", title: "Kimlik bilgisi istemci depolamasına yazılıyor", pattern: /localStorage\.setItem\s*\(\s*["'](?:token|session|auth|user)/i, detail: "Oturum verisini localStorage'a koymak XSS sonrası kalıcı erişim riskini artırır. HttpOnly cookie düşünün.", category: "Oturum" },
  { id: "QLT-001", severity: "medium", title: "Belirsiz tip kullanımı", pattern: /\bany\b|as any/, detail: "Tip sınırını gevşetiyor. Beklenen veri şeklini tanımlamak hataları daha erken yakalar.", category: "Tip güvenliği" },
  { id: "QLT-002", severity: "medium", title: "Yayın kodunda hata ayıklama izi", pattern: /console\.(log|debug|info)\s*\(/, detail: "Kullanıcı verisi veya iç ayrıntılar günlüklere sızabilir. Yapılandırılmış logger ve seviye filtresi kullanın.", category: "Bakım" },
  { id: "QLT-003", severity: "medium", title: "Tamamlanmamış bakım notu", pattern: /TODO|FIXME|HACK/, detail: "Bu not teknik borç veya ertelenmiş güvenlik kararına işaret ediyor. Yayın öncesi sahip atayın.", category: "Teknik borç" },
  { id: "QLT-004", severity: "low", title: "Girdi sınırı yeterince açık değil", pattern: /unknown[^{\n]*\n[\s\S]{0,100}return\s+value\s+as/, detail: "Dışarıdan gelen değer doğrulanmadan iç tipe dönüştürülüyor. Şema doğrulaması ekleyin.", category: "Doğrulama" },
];
const getCustomRules = () => { try { return JSON.parse(localStorage.getItem("kodmercek-custom-rules") || "[]").map((rule) => ({ ...rule, pattern: new RegExp(rule.source, rule.flags || "i") })); } catch { return []; } };

const sampleFiles = [
  { name: "src", type: "folder" },
  { name: "auth.ts", type: "file", size: "4.8 KB", content: `import { db } from "./database";\n\nexport async function login(email: string, password: string) {\n  const query = "SELECT * FROM users WHERE email = '" + email + "'";\n  const user = await db.raw(query);\n\n  if (user && user.password === password) {\n    localStorage.setItem("session", user.id);\n    return { ok: true, user };\n  }\n\n  console.log("Login failed", email);\n  return { ok: false };\n}` },
  { name: "dashboard.tsx", type: "file", size: "8.2 KB", content: `import React, { useEffect, useState } from "react";\n\nexport function Dashboard({ html }: { html: string }) {\n  const [items, setItems] = useState<any[]>([]);\n\n  useEffect(() => {\n    fetch("/api/items").then((response) => response.json()).then(setItems);\n  }, []);\n\n  return <section>\n    <h1 dangerouslySetInnerHTML={{ __html: html }} />\n    <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>\n  </section>;\n}` },
  { name: "config.json", type: "file", size: "1.1 KB", content: `{\n  "apiUrl": "https://api.example.com",\n  "debug": true,\n  "retryCount": 3\n}` },
  { name: "utils.ts", type: "file", size: "2.3 KB", content: `export function parseInput(value: unknown) {\n  // TODO: tighten this boundary before release\n  return value as any;\n}\n\nexport function runExpression(expression: string) {\n  return eval(expression);\n}` },
  { name: "README.md", type: "file", size: "3.0 KB", content: `# Örnek proje\n\nBu proje KodMercek'in yerel inceleme örneğidir.\n\n## Kurulum\n\nnpm install\nnpm run dev` },
  { name: "package.json", type: "file", size: "0.8 KB", content: `{"name":"ornek-proje","scripts":{"dev":"vite","test":"vitest"}}` },
];

const previousFiles = sampleFiles.map((file) => ({ ...file, content: file.content?.replace("console.log(\"Login failed\", email);", "logger.warn(\"Login failed\");") }));
const state = { mode: "review", files: [...sampleFiles], activeFile: "auth.ts", findings: [], filter: "all", lastRun: false };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
const fileTypeColor = (name) => /tsx|jsx/.test(name) ? "#b999e8" : /json|md/.test(name) ? "#e7b66b" : /css|html/.test(name) ? "#73b9d0" : "#86c59a";
const lineOf = (content, index) => content.slice(0, index).split("\n").length;

function analyzeFile(file) {
  const findings = [];
  const rules = [...builtInRules, ...getCustomRules()];
  rules.forEach((rule) => { const match = file.content.match(rule.pattern); if (match) findings.push({ ...rule, file: file.name, line: lineOf(file.content, match.index ?? 0) }); });
  return findings;
}

function runAnalysis() {
  state.findings = state.files.filter((file) => file.type === "file" && file.content).flatMap(analyzeFile);
  state.lastRun = true;
  renderAll();
  $("notice").innerHTML = '<span class="notice-icon">✓</span><span><strong>İnceleme tamamlandı:</strong> Dosyalar yalnızca bu tarayıcıda tarandı. Sonuçlar kanıt satırlarıyla eşleştirildi.</span><button class="notice-close" aria-label="Bildirimi kapat">×</button>';
  $("notice").querySelector(".notice-close").addEventListener("click", () => $("notice").remove());
}

function structuralStats(file) {
  const source = file.content;
  return [
    ["Fonksiyon", (source.match(/\b(function|def)\s+\w+|=>\s*[^{]*\{/g) || []).length],
    ["İçe aktarma", (source.match(/\b(import|require\s*\()/g) || []).length],
    ["Koşul", (source.match(/\b(if|else if|switch|case|while|for)\b/g) || []).length],
    ["Asenkron", (source.match(/\b(async|await|Promise)\b/g) || []).length],
    ["Yorum", (source.match(/\/\/|\/\*|#\s/g) || []).length],
  ];
}
function renderAst() {
  const files = state.files.filter((file) => file.type === "file" && file.content);
  const totals = ["Fonksiyon", "İçe aktarma", "Koşul", "Asenkron", "Yorum"].map((label) => [label, files.reduce((sum, file) => sum + (structuralStats(file).find(([key]) => key === label)?.[1] || 0), 0)]);
  $("astGrid").innerHTML = totals.map(([label, value]) => `<div class="ast-stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
}
function renderDiff() {
  const current = new Map(state.files.filter((file) => file.type === "file").map((file) => [file.name, file]));
  const old = new Map(previousFiles.filter((file) => file.type === "file").map((file) => [file.name, file]));
  let added = 0, removed = 0, filesChanged = 0, rows = [];
  [...new Set([...old.keys(), ...current.keys()])].forEach((name) => {
    const before = old.get(name)?.content?.split("\n") || [];
    const after = current.get(name)?.content?.split("\n") || [];
    if (before.join("\n") === after.join("\n")) return;
    filesChanged++;
    rows.push(`<div class="diff-line context"><strong>${name}</strong></div>`);
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i++) {
      if (before[i] === after[i]) rows.push(`<div class="diff-line context"><span class="diff-prefix"> </span>${escapeHtml(after[i] || "")}</div>`);
      else { if (before[i] !== undefined) { removed++; rows.push(`<div class="diff-line removed"><span class="diff-prefix">−</span>${escapeHtml(before[i])}</div>`); } if (after[i] !== undefined) { added++; rows.push(`<div class="diff-line added"><span class="diff-prefix">+</span>${escapeHtml(after[i])}</div>`); } }
    }
  });
  $("diffView").innerHTML = rows.length ? rows.join("") : '<div class="empty-state"><strong>Değişiklik bulunamadı.</strong>Yüklenen dosyalar önceki çalışma ağacıyla aynı.</div>';
  $("diffSummary").textContent = `+${added} −${removed}`; $("diffFiles").textContent = `${filesChanged} dosya değişti`;
}
function setMode(mode) {
  state.mode = mode; document.querySelectorAll(".tool-button[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("diffPanel").classList.toggle("hidden", mode !== "diff"); $("astPanel").classList.toggle("hidden", mode !== "ast");
  document.querySelector(".analysis-grid").classList.toggle("hidden", mode !== "review");
  if (mode === "diff") renderDiff(); if (mode === "ast") renderAst();
}
function reportHtml() {
  const date = new Date().toLocaleString("tr-TR");
  const findings = state.findings.map((f) => `<article><h3>${f.severity.toUpperCase()} · ${escapeHtml(f.title)}</h3><p>${escapeHtml(f.detail)}</p><small>${escapeHtml(f.file)}:${f.line} · ${escapeHtml(f.category)}</small></article>`).join("");
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><title>KodMercek raporu</title><style>body{font:14px system-ui;max-width:900px;margin:40px auto;color:#20252b}h1{border-bottom:3px solid #f3b74d;padding-bottom:12px}article{border:1px solid #ddd;border-left:5px solid #f3b74d;padding:12px;margin:12px 0}small{color:#687078}h3{font-size:14px}</style><h1>KodMercek inceleme raporu</h1><p>Oluşturulma: ${date} · ${state.files.length} dosya · ${state.findings.length} bulgu</p>${findings || "<p>Bulgu yok.</p>"}</html>`;
}
function downloadReport() { const blob = new Blob([reportHtml()], { type: "text/html;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `kodmercek-rapor-${new Date().toISOString().slice(0,10)}.html`; link.click(); URL.revokeObjectURL(link.href); }
function renderSavedRules() { const rules = JSON.parse(localStorage.getItem("kodmercek-custom-rules") || "[]"); $("savedRules").innerHTML = rules.length ? rules.map((r) => `<div class="saved-rule"><strong>${escapeHtml(r.title)}</strong> · ${r.severity} · <code>${escapeHtml(r.source)}</code></div>`).join("") : '<div class="saved-rule">Henüz özel kural eklenmedi.</div>'; }

function renderTree() {
  $("fileTree").innerHTML = state.files.map((file) => file.type === "folder" ? `<div class="file-item folder"><span class="file-icon">▾</span><span class="file-name">${file.name}</span></div>` : `<button class="file-item ${file.name === state.activeFile ? "active" : ""}" data-file="${file.name}"><span class="file-icon" style="color:${fileTypeColor(file.name)}">${file.name.split(".").pop().toUpperCase()}</span><span class="file-name">${file.name}</span><span class="file-size">${file.size ?? "—"}</span></button>`).join("");
  $("fileTree").querySelectorAll("[data-file]").forEach((item) => item.addEventListener("click", () => { state.activeFile = item.dataset.file; renderAll(); }));
}

function syntaxHighlight(line) {
  let html = escapeHtml(line);
  html = html.replace(/(\/\/.*$|#.*$)/g, '<span class="comment">$1</span>');
  html = html.replace(/(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`)/g, '<span class="str">$1</span>');
  html = html.replace(/\b(import|from|export|async|function|return|const|let|if|new|true|false|await|as)\b/g, '<span class="kw">$1</span>');
  html = html.replace(/\b(console|fetch|eval|localStorage|dangerouslySetInnerHTML)\b/g, '<span class="fn">$1</span>');
  html = html.replace(/\b(eval|dangerouslySetInnerHTML|innerHTML)\b/g, '<span class="danger">$1</span>');
  return html || " ";
}

function renderCode() {
  const file = state.files.find((item) => item.name === state.activeFile) ?? state.files.find((item) => item.type === "file");
  if (!file) return;
  const lines = file.content.split("\n");
  const flagged = new Set(state.findings.filter((f) => f.file === file.name).map((f) => f.line));
  $("lineGutter").innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join("");
  $("codeView").innerHTML = lines.map((line, index) => `<span class="code-line ${flagged.has(index + 1) ? "flagged" : ""}" data-line="${index + 1}">${syntaxHighlight(line)}</span>`).join("");
  $("tabs").innerHTML = state.files.filter((item) => item.type === "file").slice(0, 4).map((item) => `<button class="tab ${item.name === state.activeFile ? "active" : ""}" data-tab="${item.name}"><span class="tab-dot" style="background:${fileTypeColor(item.name)}"></span>${item.name}</button>`).join("");
  $("tabs").querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => { state.activeFile = tab.dataset.tab; renderAll(); }));
  $("selectionInfo").textContent = `Satır 1–${lines.length}`;
}

function renderFindings() {
  const filtered = state.findings.filter((finding) => state.filter === "all" || finding.severity === state.filter);
  $("findingsList").innerHTML = filtered.length ? filtered.map((finding, index) => `<article class="finding ${finding.severity}" data-finding-file="${finding.file}" data-finding-line="${finding.line}"><span class="severity ${finding.severity}"></span><div class="finding-body"><div class="finding-top"><span class="finding-title">${finding.title}</span><span class="finding-badge">${finding.severity === "critical" ? "KRİTİK" : finding.severity === "high" ? "YÜKSEK" : finding.severity === "medium" ? "ORTA" : "DÜŞÜK"}</span></div><p class="finding-description">${finding.detail}</p><span class="finding-meta"><strong>${finding.file}</strong> : ${finding.line} · ${finding.category}</span></div></article>`).join("") : '<div class="empty-state"><strong>Bu seviyede bulgu yok.</strong>Filtreyi değiştirerek diğer sonuçları görün.</div>';
  $("findingsList").querySelectorAll("[data-finding-file]").forEach((item) => item.addEventListener("click", () => { state.activeFile = item.dataset.findingFile; renderAll(); requestAnimationFrame(() => $("codeView").querySelector(`[data-line="${item.dataset.findingLine}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })); }));
}

function renderMetrics() {
  const counts = Object.fromEntries(["critical", "high", "medium", "low"].map((level) => [level, state.findings.filter((f) => f.severity === level).length]));
  $("metricTotal").textContent = String(state.findings.length).padStart(2, "0");
  $("metricCritical").textContent = String(counts.critical + counts.high).padStart(2, "0");
  $("metricScore").innerHTML = `${Math.max(42, 100 - counts.critical * 16 - counts.high * 9 - counts.medium * 3)}<span>/100</span>`;
  $("metricFiles").textContent = String(state.files.filter((f) => f.type === "file").length).padStart(2, "0");
  $("metricLines").textContent = state.files.filter((f) => f.type === "file").reduce((total, f) => total + f.content.split("\n").length, 0);
  $("findingCount").textContent = String(state.findings.length).padStart(2, "0");
  [["allCount", state.findings.length], ["criticalCount", counts.critical], ["highCount", counts.high], ["mediumCount", counts.medium]].forEach(([id, value]) => $(id).textContent = value);
}
function renderAll() { renderTree(); renderCode(); renderMetrics(); renderFindings(); }

$("analyzeButton").addEventListener("click", runAnalysis);
$("fileInput").addEventListener("change", async (event) => { const uploaded = await Promise.all([...event.target.files].map(async (file) => ({ name: file.name, type: "file", size: `${(file.size / 1024).toFixed(1)} KB`, content: await file.text() }))); if (uploaded.length) { state.files = uploaded; state.activeFile = uploaded[0].name; $("projectName").textContent = "yüklenen-proje"; $("projectMeta").textContent = `${uploaded.length} dosya · yerel`; runAnalysis(); } });
$("newProject").addEventListener("click", () => { state.files = [...sampleFiles]; state.activeFile = "auth.ts"; $("projectName").textContent = "örnek-proje"; $("projectMeta").textContent = "6 dosya · yerel"; runAnalysis(); });
$("copyButton").addEventListener("click", async () => { const file = state.files.find((item) => item.name === state.activeFile); if (file) { await navigator.clipboard?.writeText(file.content); $("copyButton").textContent = "Kopyalandı"; setTimeout(() => $("copyButton").textContent = "Kodu kopyala", 1500); } });
$("helpButton").addEventListener("click", () => $("helpDialog").showModal()); $("dialogOk").addEventListener("click", () => $("helpDialog").close()); $("helpDialog").querySelector(".dialog-close").addEventListener("click", () => $("helpDialog").close()); $("notice").querySelector(".notice-close").addEventListener("click", () => $("notice").remove());
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.filter = button.dataset.filter; renderFindings(); }));
document.querySelectorAll(".tool-button[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("htmlExport").addEventListener("click", downloadReport); $("pdfExport").addEventListener("click", () => window.print());
$("rulesButton").addEventListener("click", () => { renderSavedRules(); $("rulesDialog").showModal(); }); $("rulesDialog").querySelector(".dialog-close").addEventListener("click", () => $("rulesDialog").close());
$("saveRule").addEventListener("click", () => { const title = $("ruleTitle").value.trim(), source = $("rulePattern").value.trim(), severity = $("ruleSeverity").value, detail = $("ruleDetail").value.trim() || "Bu desen proje kuralı olarak işaretlendi."; if (!title || !source) return; try { new RegExp(source); } catch { alert("Geçerli bir regex girin."); return; } const rules = JSON.parse(localStorage.getItem("kodmercek-custom-rules") || "[]"); rules.push({ id: `CUSTOM-${Date.now()}`, title, source, severity, detail, category: "Özel kural" }); localStorage.setItem("kodmercek-custom-rules", JSON.stringify(rules)); $("ruleTitle").value = ""; $("rulePattern").value = ""; $("ruleDetail").value = ""; renderSavedRules(); runAnalysis(); });
$("clearRules").addEventListener("click", () => { localStorage.removeItem("kodmercek-custom-rules"); renderSavedRules(); runAnalysis(); });
runAnalysis();
