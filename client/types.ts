export interface ManifestEntry { path: string; bytes: number; language: string; }
export interface DependencyRef { name: string; version: string; ecosystem: "npm" | "PyPI" | "crates.io" | "Go"; }
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
export interface AiFinding { id: string; title: string; area: string; severity: "high" | "medium" | "low"; detail: string; impact: string; effort: string; confidence: "high" | "medium" | "low"; evidence: string[]; steps: string[]; }
export interface AiReport { summary: string; architecture: Array<{ name: string; detail: string; evidence: string[] }>; findings: AiFinding[]; roadmap: AiFinding[]; questions: string[]; model: string; generatedAt: string; }
export interface SourceCard { id: string; provider: string; title: string; url: string; summary: string; publishedAt?: string; score?: number; }
export interface Research { sources: SourceCard[]; errors: string[]; researchedAt: string; queries: string[]; }
export type AuditStatus = "pass" | "watch" | "risk";
export interface ProactiveCheck { id: string; category: string; title: string; status: AuditStatus; severity: "high" | "medium" | "low"; summary: string; why: string; evidence: string[]; nextStep: string; basis: string; }
export interface ProactiveAudit { score: number; grade: "A" | "B" | "C" | "D"; summary: string; checkedAt: string; checks: ProactiveCheck[]; externalResearchPending: boolean; }
export interface Project {
  id: string;
  name: string;
  sourceName: string;
  sourceKind: "archive" | "github";
  sourceUrl: string | null;
  manifest: ManifestEntry[];
  localReport: LocalReport;
  aiReport: AiReport | null;
  research: Research | null;
  proactiveAudit: ProactiveAudit | null;
  aiConsentAt: string | null;
  researchConsentAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
export interface ModelChoice { id: string; name: string; description: string; cost: string; provider: string; }
export interface ChatMessage { role: "user" | "assistant"; content: string; created_at?: string; }
