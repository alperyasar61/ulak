export interface ManifestEntry { path: string; bytes: number; language: string; }
export interface DependencyRef { name: string; version: string; ecosystem: "npm" | "PyPI" | "crates.io" | "Go"; }
export interface SbomComponent { name: string; version: string; ecosystem: DependencyRef["ecosystem"]; purl: string; scope: "direct"; osvQueryReady: boolean; }
export interface ApiSurface { method: string; path: string; file: string; authLikely: boolean; }
export interface PrivacySignal { category: string; file: string; evidence: string; }
export interface LocalFinding { id: string; area: string; severity: "high" | "medium" | "low"; title: string; detail: string; evidence: string[]; confidence: "medium" | "low"; }
export type LicenseClass = "A" | "B" | "C" | "D" | "E";
export interface LicenseInfo {
  detected: string | null;
  class: LicenseClass;
  file: string | null;
  evidence: string[];
  readmeClaim: string | null;
  readmeClaimClass: LicenseClass | null;
  mismatch: boolean;
  reason: string;
}
export type SymbolKind = "function" | "class" | "method" | "type" | "constant";
export interface SymbolEntry { file: string; name: string; kind: SymbolKind; line: number; exported: boolean; }
export interface SymbolFile { file: string; bytes: number; count: number; symbols: SymbolEntry[]; }
export interface SymbolInventory { total: number; files: SymbolFile[]; hotspots: SymbolFile[]; }
export interface TestInventory { count: number; files: string[]; frameworks: string[]; searchedPatterns: string[]; }
export interface SizeHotspot { path: string; bytes: number; }
export interface WrapperInfo { root: string | null; doubleNested: boolean; depth: number; }
export interface ManifestNote { file: string; line: number; text: string; }
export interface AbsenceEvidence { id: string; claim: string; searches: string[]; }
export type ChecklistStatus = "pass" | "fail" | "unknown";
export interface ChecklistItem { id: number; group: string; title: string; status: ChecklistStatus; evidence: string[]; }
export interface TrapHit { id: number; title: string; symptom: string; fix: string; detectable: boolean; detected: boolean; evidence: string[]; }
export interface SecurityLearningNote {
  id: string;
  title: string;
  recommendation: string;
  scansSeen: number;
  source?: "builtin" | "shared";
  category?: "security" | "architecture" | "testing" | "performance" | "other";
  contributions?: number;
}
export type SharedKnowledgeCategory = NonNullable<SecurityLearningNote["category"]>;
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
  sbom: SbomComponent[];
  relationships: Array<{ from: string; to: string; type: string }>;
  apiSurface: ApiSurface[];
  privacySignals: PrivacySignal[];
  findings: LocalFinding[];
  license?: LicenseInfo;
  symbols?: SymbolInventory;
  tests?: TestInventory;
  sizeHotspots?: SizeHotspot[];
  wrapper?: WrapperInfo;
  manifestNotes?: ManifestNote[];
  absenceEvidence?: AbsenceEvidence[];
  checklist?: ChecklistItem[];
  traps?: TrapHit[];
  learningNotes?: SecurityLearningNote[];
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
export interface AuditDiff { scoreDelta: number; previousScore: number; currentScore: number; previousGrade: ProactiveAudit["grade"]; currentGrade: ProactiveAudit["grade"]; regressed: string[]; improved: string[]; newChecks: string[]; }
export type FindingStateStatus = "open" | "triage" | "accepted" | "resolved";
export interface FindingState { status: FindingStateStatus; note: string; updatedAt: string; }
export interface ReconstructionComponent { name: string; role: string; files: number; sample: string[]; }
export interface ReconstructionLayer { id: "presentation" | "application" | "domain" | "data" | "platform" | "quality"; name: string; purpose: string; components: ReconstructionComponent[]; }
export interface ReconstructionStep { order: number; title: string; detail: string; outputs: string[]; verify: string; risk: string; }
export interface ReconstructionAlternative { topic: string; observed: string; safer: string; why: string; effort: "low" | "medium" | "high"; }
export interface Reconstruction {
  generatedAt: string;
  target: { name: string; fileCount: number; analyzedFiles: number; stack: string[] };
  summary: string;
  layers: ReconstructionLayer[];
  dataFlow: Array<{ from: string; to: string; type: string }>;
  steps: ReconstructionStep[];
  alternatives: ReconstructionAlternative[];
  guardrails: string[];
  unknowns: string[];
  aiPrompt: string;
}
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
  reconstruction: Reconstruction | null;
  proactiveAudit: ProactiveAudit | null;
  proactiveDiff: AuditDiff | null;
  findingStates: Record<string, FindingState>;
  aiConsentAt: string | null;
  researchConsentAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type ApiAuth =
  | { type: "none" | "inherit" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "api-key"; key: string; value: string; in: "header" | "query" };
export interface ApiVariable { key: string; value: string; isSecret: boolean; }
export interface ApiHeader { key: string; value: string; enabled: boolean; }
export interface ApiAssertion {
  id: string;
  name: string;
  target: "status" | "json" | "header" | "body";
  operator: "equals" | "contains" | "exists";
  path: string;
  expected: string;
  isSecret: boolean;
  enabled: boolean;
}
export interface ApiSavedRequest {
  id: string;
  name: string;
  folder: string;
  method: ApiMethod;
  url: string;
  headers: ApiHeader[];
  body: string;
  auth: ApiAuth;
  assertions: ApiAssertion[];
  captureTokenPath: string;
  captureTokenVariable: string;
}
export interface ApiWorkspace {
  id: string;
  name: string;
  category: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyUrlConfigured: boolean;
  variables: ApiVariable[];
  auth: ApiAuth;
  requests: ApiSavedRequest[];
  createdAt: string;
  updatedAt: string;
}
export interface ApiResponse {
  status: number;
  statusText: string;
  ok: boolean;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  isJson: boolean;
  capturedVariable: string | null;
  assertions: Array<{ id: string; name: string; passed: boolean; message: string }>;
}
export interface ModelChoice { id: string; name: string; description: string; cost: string; provider: string; }
export interface EvrenKeyStatus { configured: boolean; source: "memory" | "env" | null; removable: boolean; verified?: boolean; modelCount?: number; checkedAt?: string; lastError?: string; }
export interface ChatMessage { role: "user" | "assistant"; content: string; created_at?: string; }
