import type { LocalReport } from "./archive.js";
import type { AuditDiff, ProactiveAudit } from "./proactive.js";

function severityToSarif(value: "high" | "medium" | "low") {
  return value === "high" ? "error" : value === "medium" ? "warning" : "note";
}

export function renderJson(project: { name: string; sourceName: string }, report: LocalReport, audit: ProactiveAudit | null, diff: AuditDiff | null) {
  return JSON.stringify({ schemaVersion: "ulak.phase1.v1", project, localReport: report, proactiveAudit: audit, proactiveDiff: diff }, null, 2);
}

export function renderMarkdown(project: { name: string; sourceName: string }, report: LocalReport, audit: ProactiveAudit | null, diff: AuditDiff | null) {
  const lines = [`# ULAK güvenlik ve statik analiz raporu`, ``, `- Proje: **${project.name}**`, `- Kaynak: \`${project.sourceName}\``, `- İncelenen dosya: ${report.analyzedFiles}`, `- Bağımlılık: ${report.dependencies.length}`, ``];
  if (audit) {
    lines.push(`## Proaktif denetim: ${audit.grade} (${audit.score}/100)`, ``, audit.summary, ``);
    if (diff) lines.push(`### Baseline farkı`, ``, `Skor değişimi: **${diff.scoreDelta >= 0 ? "+" : ""}${diff.scoreDelta}** (${diff.previousScore} → ${diff.currentScore})`, ``, ...diff.regressed.map((item) => `- Regresyon: ${item}`), ...diff.improved.map((item) => `- İyileşme: ${item}`), ...diff.newChecks.map((item) => `- Yeni kontrol: ${item}`), ``);
    lines.push(`### Kontroller`, ``);
    for (const check of audit.checks) {
      lines.push(`#### ${check.title}`, `- Durum: **${check.status}**`, `- Özet: ${check.summary}`, `- Neden önemli: ${check.why}`, `- Sonraki adım: ${check.nextStep}`, check.evidence.length ? `- Kanıt: ${check.evidence.join(", ")}` : "- Kanıt: Arşivde görünür dosya izi yok.", ``);
    }
  }
  lines.push(`## SBOM özeti`, ``, `| Paket | Sürüm | Ekosistem | PURL |`, `|---|---|---|---|`, ...(report.sbom ?? []).map((item) => `| ${item.name} | ${item.version || "belirsiz"} | ${item.ecosystem} | \`${item.purl}\` |`));
  return lines.join("\n");
}

export function renderSarif(audit: ProactiveAudit | null) {
  const checks = audit?.checks ?? [];
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "ULAK", informationUri: "https://ulak-fhpoogpe.manus.space", version: "phase1" } },
      results: checks.filter((check) => check.status !== "pass").map((check) => ({
        ruleId: `ulak/${check.id}`,
        level: severityToSarif(check.severity),
        message: { text: `${check.title}: ${check.summary} Sonraki adım: ${check.nextStep}` },
        properties: { status: check.status, basis: check.basis, evidence: check.evidence },
      })),
      rules: checks.map((check) => ({ id: `ulak/${check.id}`, shortDescription: { text: check.title }, help: { text: `${check.why} ${check.nextStep}` } })),
    }],
  }, null, 2);
}
