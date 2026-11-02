export interface DependencyRef { name: string; version: string; ecosystem: "npm" | "PyPI" | "crates.io" | "Go"; }
export interface SourceCard { id: string; provider: string; title: string; url: string; summary: string; publishedAt?: string; score?: number; }
export interface ResearchResult { sources: SourceCard[]; errors: string[]; researchedAt: string; queries: string[]; }

const REQUEST_TIMEOUT = 12_000;
const MAX_QUERIES = 4;
const MAX_DEPENDENCIES = 30;

async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return body;
}

function safeQuery(value: string) {
  return value.replace(/[\u0000-\u001f<>"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function buildResearchQueries(report: Record<string, any>, dependencies: DependencyRef[]) {
  const stack = (Array.isArray(report.stack) ? report.stack : []).slice(0, 3).map((item: any) => safeQuery(String(item?.name ?? item))).filter(Boolean);
  const firstDeps = dependencies.slice(0, 3).map((dep) => safeQuery(dep.name)).filter(Boolean);
  const projectTitle = safeQuery(String(report.projectPurpose ?? report.summary ?? "software project"));
  const queries = [
    [...stack, "secure architecture best practices"].filter(Boolean).join(" "),
    [...firstDeps, "maintenance alternatives"].filter(Boolean).join(" "),
    `${projectTitle} open source implementation patterns`,
  ].map(safeQuery);
  return [...new Set(queries)].filter((query) => query.length > 3).slice(0, MAX_QUERIES);
}

function pinnedVersion(value: string) {
  const match = value.match(/(?:^|[^\d])([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-+][0-9A-Za-z.-]+)?)(?:$|[^\d])/);
  return match?.[1] ?? "";
}

function cleanTitle(value: unknown, max: number) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeHttpsUrl(value: unknown, allowedHost: string) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && (url.hostname === allowedHost || url.hostname.endsWith(`.${allowedHost}`)) ? url.toString() : "";
  } catch { return ""; }
}

async function searchStackExchange(query: string): Promise<SourceCard[]> {
  const url = new URL("https://api.stackexchange.com/2.3/search/advanced");
  url.search = new URLSearchParams({ site: "stackoverflow", q: query, sort: "relevance", pagesize: "5", page: "1", filter: "default" }).toString();
  const data = await jsonRequest(url.toString());
  return (Array.isArray(data.items) ? data.items : []).slice(0, 5).map((item: any) => ({
    id: `se-${item.question_id}`, provider: "Stack Overflow", title: cleanTitle(item.title, 180),
    url: safeHttpsUrl(item.link, "stackoverflow.com"),
    summary: `${item.score ?? 0} puan · ${item.answer_count ?? 0} yanıt${item.is_answered ? " · kabul edilmiş yanıt var" : ""}`,
    ...(item.last_activity_date ? { publishedAt: new Date(item.last_activity_date * 1000).toISOString() } : {}),
    score: Number(item.score ?? 0),
  })).filter((item: SourceCard) => item.url);
}

async function searchGitHub(query: string): Promise<SourceCard[]> {
  const url = new URL("https://api.github.com/search/repositories");
  url.search = new URLSearchParams({ q: query, sort: "stars", order: "desc", per_page: "4" }).toString();
  const data = await jsonRequest(url.toString(), { headers: { Accept: "application/vnd.github+json", "User-Agent": "ULAK-Project-Research" } });
  return (Array.isArray(data.items) ? data.items : []).slice(0, 4).map((item: any) => ({
    id: `gh-${item.id}`, provider: "GitHub", title: cleanTitle(item.full_name, 180),
    url: safeHttpsUrl(item.html_url, "github.com"),
    summary: `${cleanTitle(item.description ?? "Açıklama eklenmemiş", 240)} · ★ ${Number(item.stargazers_count ?? 0).toLocaleString("tr-TR")} · ${item.language ?? "dil belirtilmemiş"}`,
    publishedAt: item.updated_at, score: Number(item.stargazers_count ?? 0),
  })).filter((item: SourceCard) => item.url);
}

async function queryOSV(dependencies: DependencyRef[]): Promise<SourceCard[]> {
  const packageQueries = dependencies.slice(0, MAX_DEPENDENCIES).map((dependency) => {
    const version = pinnedVersion(dependency.version);
    if (!version) return null;
    const ecosystem = dependency.ecosystem === "npm" ? "npm" : dependency.ecosystem === "PyPI" ? "PyPI" : dependency.ecosystem === "Go" ? "Go" : "crates.io";
    return { package: { name: dependency.name, ecosystem }, version };
  }).filter(Boolean);
  if (!packageQueries.length) return [];
  const data = await jsonRequest("https://api.osv.dev/v1/querybatch", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: packageQueries }),
  });
  const sources: SourceCard[] = [];
  const results = Array.isArray(data.results) ? data.results : [];
  for (let index = 0; index < results.length; index++) {
    for (const vulnerability of (results[index]?.vulns ?? []).slice(0, 4)) {
      sources.push({
        id: `osv-${vulnerability.id}`, provider: "OSV.dev",
        title: `${vulnerability.id}: ${cleanTitle(vulnerability.summary ?? "Bilinen güvenlik açığı", 140)}`,
        url: `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`,
        summary: `${dependencies[index]?.name ?? "Bağımlılık"}@${pinnedVersion(dependencies[index]?.version ?? "") || "sürüm"} · ${cleanTitle(vulnerability.details ?? "Sürüm eşleşmesi doğrulanmalı", 280)}`,
        publishedAt: vulnerability.modified ?? vulnerability.published,
      });
    }
  }
  return sources.slice(0, 30);
}

async function packageMetadata(dependency: DependencyRef): Promise<SourceCard | null> {
  const encoded = dependency.name.split("/").map(encodeURIComponent).join("/");
  if (dependency.ecosystem === "npm") {
    const data = await jsonRequest(`https://registry.npmjs.org/${encoded}`);
    const latest = String(data["dist-tags"]?.latest ?? "");
    if (!latest) return null;
    return { id: `npm-${dependency.name}`, provider: "npm Registry", title: `${dependency.name} — en güncel kayıtlı sürüm ${latest}`, url: `https://www.npmjs.com/package/${dependency.name}`, summary: `Projede belirtilen sürüm: ${dependency.version || "sürüm bilinmiyor"}. Bu kayıt tek başına uyumluluk garantisi değildir.`, publishedAt: data.time?.[latest] };
  }
  if (dependency.ecosystem === "PyPI") {
    const data = await jsonRequest(`https://pypi.org/pypi/${encodeURIComponent(dependency.name)}/json`);
    const latest = String(data.info?.version ?? "");
    if (!latest) return null;
    return { id: `pypi-${dependency.name}`, provider: "PyPI", title: `${dependency.name} — en güncel kayıtlı sürüm ${latest}`, url: `https://pypi.org/project/${encodeURIComponent(dependency.name)}/`, summary: `Projede belirtilen sürüm: ${dependency.version || "sürüm bilinmiyor"}. Uyumlu yükseltme için sürüm notları gözden geçirilmeli.`, publishedAt: data.urls?.[0]?.upload_time_iso_8601 };
  }
  return null;
}

export async function performResearch(queries: string[], dependencies: DependencyRef[]): Promise<ResearchResult> {
  const safeQueries = [...new Set(queries.map(safeQuery).filter((query) => query.length >= 4))].slice(0, MAX_QUERIES);
  const errors: string[] = [];
  const taskGroups: Array<{ label: string; run: () => Promise<SourceCard[] | SourceCard | null> }> = [
    ...safeQueries.slice(0, 3).map((query) => ({ label: "Stack Overflow", run: () => searchStackExchange(query) })),
    ...safeQueries.slice(0, 2).map((query) => ({ label: "GitHub", run: () => searchGitHub(query) })),
    ...(dependencies.length ? [{ label: "OSV.dev", run: () => queryOSV(dependencies) }] : []),
    ...dependencies.slice(0, 8).map((dependency) => ({ label: dependency.ecosystem === "npm" ? "npm Registry" : dependency.ecosystem === "PyPI" ? "PyPI" : "Paket kaydı", run: () => packageMetadata(dependency) })),
  ];
  const settled = await Promise.allSettled(taskGroups.map((task) => task.run()));
  const sources: SourceCard[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (Array.isArray(result.value)) sources.push(...result.value);
      else if (result.value) sources.push(result.value);
    } else errors.push(`${taskGroups[index].label}: ${result.reason instanceof Error ? result.reason.message.slice(0, 120) : "istek başarısız"}`);
  });
  const seen = new Set<string>();
  const unique = sources.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 60);
  return { sources: unique, errors, researchedAt: new Date().toISOString(), queries: safeQueries };
}
