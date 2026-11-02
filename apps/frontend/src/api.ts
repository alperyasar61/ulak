import type { ChatMessage, EvrenKeyStatus, ModelChoice, Project, Reconstruction, Research } from "./types";

const SESSION_KEY = "ulak-private-session-v1";

function storedToken() {
  try { return localStorage.getItem(SESSION_KEY) ?? ""; } catch { return ""; }
}

export function sessionToken() {
  return storedToken();
}

async function ensureToken() {
  let token = storedToken();
  const response = await fetch("/api/session", { headers: token ? { "x-ulak-session": token } : {}, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== "string") throw new Error("ULAK oturumu başlatılamadı.");
  if (token !== data.token) {
    token = data.token;
    try { localStorage.setItem(SESSION_KEY, token); } catch { /* storage may be disabled */ }
  }
  return token;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await ensureToken();
  const headers = new Headers(init.headers);
  headers.set("x-ulak-session", token);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `İstek başarısız oldu (${response.status}).`);
  return data as T;
}

export const api = {
  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  getModels: () => request<{ models: ModelChoice[] }>("/api/models"),
  getEvrenStatus: () => request<EvrenKeyStatus>("/api/evren/status"),
  saveEvrenKey: (apiKey: string) => request<EvrenKeyStatus>("/api/evren/key", { method: "PUT", body: JSON.stringify({ apiKey }) }),
  testEvrenKey: () => request<{ ok: boolean; modelCount: number; status: EvrenKeyStatus }>("/api/evren/test", { method: "POST" }),
  clearEvrenKey: () => request<EvrenKeyStatus>("/api/evren/key", { method: "DELETE" }),
  createProject: (form: FormData) => request<{ project: Project }>("/api/projects", { method: "POST", body: form }),
  analyzeWithAI: (projectId: string, model: string) => request<{ aiReport: Project["aiReport"] }>(`/api/projects/${projectId}/ai`, { method: "POST", body: JSON.stringify({ consent: true, model }) }),
  runResearch: (projectId: string, queries: string[]) => request<{ research: Research }>(`/api/projects/${projectId}/research`, { method: "POST", body: JSON.stringify({ consent: true, queries }) }),
  runProactiveAudit: (projectId: string) => request<{ proactiveAudit: Project["proactiveAudit"]; proactiveDiff: Project["proactiveDiff"] }>(`/api/projects/${projectId}/proactive-audit`, { method: "POST" }),
  getMessages: (projectId: string) => request<{ messages: ChatMessage[] }>(`/api/projects/${projectId}/messages`),
  ask: (projectId: string, question: string, model: string) => request<{ answer: string }>(`/api/projects/${projectId}/chat`, { method: "POST", body: JSON.stringify({ consent: true, question, model }) }),
  deleteProject: (projectId: string) => request<{ ok: boolean; warning: string }>(`/api/projects/${projectId}`, { method: "DELETE" }),
  getFindingStates: (projectId: string) => request<{ findingStates: Project["findingStates"] }>(`/api/projects/${projectId}/finding-states`),
  updateFindingState: (projectId: string, findingId: string, status: string, note: string) => request<{ findingStates: Project["findingStates"] }>(`/api/projects/${projectId}/findings/${encodeURIComponent(findingId)}/state`, { method: "PUT", body: JSON.stringify({ status, note }) }),
  deepAnalyze: (projectId: string, filePath: string) => request<{ analysis: string }>(`/api/projects/${projectId}/deep-analyze`, { method: "POST", body: JSON.stringify({ filePath }) }),
  reconstruct: (projectId: string, model?: string) => request<{ reconstruction: Reconstruction }>(`/api/projects/${projectId}/reconstruct`, { method: "POST", body: JSON.stringify(model ? { consent: true, model } : {}) }),
};
