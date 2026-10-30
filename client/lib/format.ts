import type { Project } from "../types";

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDate(value?: string | null) {
  if (!value) return "henüz yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function severityLabel(value: string) {
  return value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
}

function safeQuery(value: string) {
  return value
    .replace(/[\u0000-\u001f<>"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/** İstemcide önerilen araştırma sorguları; sunucu aynı kuralları yeniden uygular. */
export function buildQueries(project: Project) {
  const report = project.localReport;
  const stack = report.stack.slice(0, 3).map((item) => item.name);
  const dependencies = report.dependencies.slice(0, 3).map((item) => item.name);
  const purpose = report.projectPurpose || report.summary || "software project";
  const candidates = [
    [...stack, "secure architecture best practices"].filter(Boolean).join(" "),
    [...dependencies, "maintenance alternatives"].filter(Boolean).join(" "),
    `${purpose} open source implementation patterns`,
  ];
  return [...new Set(candidates.map(safeQuery).filter((query) => query.length > 3))].slice(0, 4);
}

export function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Kaynak"; }
}
