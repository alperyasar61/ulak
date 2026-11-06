import { useEffect, useMemo, useRef, useState, type FormEvent, type DragEvent } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, BookOpenCheck, Boxes, Check, ChevronRight, Download,
  CircleHelp, Clock3, CloudUpload, Code2, Cpu, Database, ExternalLink, FileArchive, FileCode2,
  FileText, FolderKanban, Github, Globe2, KeyRound, Layers3, LoaderCircle, LockKeyhole, MessageSquare,
  Network, PlugZap, Radar, Search, Send, ShieldAlert, ShieldCheck, Sparkles, Trash2, TriangleAlert,
  Upload, WandSparkles, X,
} from "lucide-react";
import { api, sessionToken } from "./api";
import { ApiWorkspacePanel } from "./ApiWorkspacePanel";
import { buildApiWorkspaceMarkdown, buildProjectScreenMarkdown, downloadMarkdown, markdownFilename } from "./markdown-export";
import type { AiFinding, ApiResponse, ApiWorkspace, ChatMessage, EvrenKeyStatus, FindingStateStatus, ModelChoice, Project, SharedKnowledgeCategory } from "./types";

type Tab = "overview" | "architecture" | "findings" | "proactive" | "research" | "roadmap" | "conversation" | "privacy" | "reverse";
type LearningContext = { kind: "project" | "api"; id: string };

const navigation: Array<{ id: Tab; label: string; icon: any }> = [
  { id: "overview", label: "Genel bakış", icon: Activity },
  { id: "architecture", label: "Proje haritası", icon: Network },
  { id: "findings", label: "Bulgular", icon: ShieldAlert },
  { id: "proactive", label: "Proaktif Denetim", icon: Radar },
  { id: "research", label: "Canlı araştırma", icon: Globe2 },
  { id: "roadmap", label: "Yol haritası", icon: Layers3 },
  { id: "conversation", label: "Takip sohbeti", icon: MessageSquare },
  { id: "reverse", label: "İşleyiş Tetkiki", icon: Cpu },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1000) return bytes + " B";
  if (bytes < 1000000) return (bytes / 1000).toFixed(1) + " KB";
  return (bytes / 1000000).toFixed(1) + " MB";
}

function formatDate(value?: string | null) {
  if (!value) return "henüz yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatClock(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function severityLabel(value: string) {
  return value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
}

function buildQueries(project: Project) {
  const report = project.localReport;
  const stack = report.stack.slice(0, 3).map((item) => item.name);
  const deps = report.dependencies.slice(0, 3).map((item) => item.name);
  const purpose = report.projectPurpose || report.summary || "software project";
  const rawQueries = [
    stack.concat("secure architecture best practices").filter(Boolean).join(" "),
    deps.concat("maintenance alternatives").filter(Boolean).join(" "),
    purpose + " open source implementation patterns",
  ];
  return [...new Set(rawQueries.map((q) => q.replace(/[\u0000-\u001f<>"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)).filter((q) => q.length > 3))].slice(0, 4);
}

function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Kaynak"; }
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [apiWorkspaces, setApiWorkspaces] = useState<ApiWorkspace[]>([]);
  const [activeId, setActiveId] = useState("");
  const [activeApiWorkspaceId, setActiveApiWorkspaceId] = useState("");
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [evrenStatus, setEvrenStatus] = useState<EvrenKeyStatus>({ configured: false, source: null, removable: false });
  const [evrenOpen, setEvrenOpen] = useState(false);
  const [evrenKeyInput, setEvrenKeyInput] = useState("");
  const [evrenBusy, setEvrenBusy] = useState(false);
  const [evrenError, setEvrenError] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [booting, setBooting] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [creationKind, setCreationKind] = useState<"code" | "api">("code");
  const [projectUploadError, setProjectUploadError] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [knowledgeContext, setKnowledgeContext] = useState<LearningContext | null>(null);
  const [knowledgeCategory, setKnowledgeCategory] = useState<SharedKnowledgeCategory>("architecture");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeRecommendation, setKnowledgeRecommendation] = useState("");
  const [knowledgeConsent, setKnowledgeConsent] = useState(false);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [postmanFile, setPostmanFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState<"upload" | "ai" | "research" | "audit" | "chat" | "delete" | "deep" | "dossier" | "reconstruct" | "" >("");
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState<"info" | "error">("info");
  const notify = (message: string, kind: "info" | "error" = "info") => { setToastKind(kind); setToast(message); };
  function promptForSharedLearning(context: LearningContext) {
    const key = `${context.kind}:${context.id}`;
    if (promptedKnowledgeContexts.current.has(key)) return;
    promptedKnowledgeContexts.current.add(key);
    setKnowledgeContext(context);
    setKnowledgeCategory(context.kind === "api" ? "testing" : "architecture");
    setKnowledgeTitle("");
    setKnowledgeRecommendation("");
    setKnowledgeConsent(false);
    setKnowledgeError("");
  }
  async function submitSharedLearningNote(event: FormEvent) {
    event.preventDefault();
    if (!knowledgeContext || !knowledgeConsent) return;
    setKnowledgeBusy(true);
    setKnowledgeError("");
    try {
      const context = knowledgeContext.kind === "project"
        ? { projectId: knowledgeContext.id }
        : { workspaceId: knowledgeContext.id };
      const result = await api.addSharedLearningNote(context, {
        category: knowledgeCategory,
        title: knowledgeTitle,
        recommendation: knowledgeRecommendation,
      });
      setProjects((current) => current.map((item) => ({
        ...item,
        localReport: { ...item.localReport, learningNotes: result.learningNotes },
      })));
      setKnowledgeContext(null);
      notify("Genel öğrenme notu yalnızca bu ULAK kurulumunun yerel veritabanına kaydedildi.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Öğrenme notu kaydedilemedi.";
      setKnowledgeError(message);
      notify(message, "error");
    } finally {
      setKnowledgeBusy(false);
    }
  }
  const [aiConsent, setAiConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [queries, setQueries] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const postmanInputRef = useRef<HTMLInputElement>(null);
  const promptedKnowledgeContexts = useRef(new Set<string>());

  const project = projects.find((item) => item.id === activeId) ?? null;
  const apiWorkspace = apiWorkspaces.find((item) => item.id === activeApiWorkspaceId) ?? null;
  const localReport = project?.localReport ?? null;

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.listProjects(), api.listApiWorkspaces(), api.getModels(), api.getEvrenStatus()]).then(([projectResult, apiWorkspaceResult, modelResult, evrenResult]) => {
      if (!mounted) return;
      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value.projects);
        if (projectResult.value.projects.length) setActiveId(projectResult.value.projects[0].id);
      } else setLoadError(projectResult.reason instanceof Error ? projectResult.reason.message : "ULAK servisine bağlanılamadı.");
      if (apiWorkspaceResult.status === "fulfilled") setApiWorkspaces(apiWorkspaceResult.value.workspaces);
      if (modelResult.status === "fulfilled") {
        setModels(modelResult.value.models);
        const preferred = modelResult.value.models.find((model) => /gpt-6-luna/i.test(model.id)) ?? modelResult.value.models[0];
        if (preferred) setSelectedModel(preferred.id);
      } else {
        setModelsError(modelResult.reason instanceof Error ? modelResult.reason.message : "Model listesi alınamadı.");
      }
      if (evrenResult.status === "fulfilled") setEvrenStatus(evrenResult.value);
      setBooting(false);
    });
    return () => { mounted = false; };
  }, []);

  /** Anahtar eklendikten/silindikten sonra model listesini tazeler. */
  async function refreshModels() {
    try {
      const result = await api.getModels();
      setModels(result.models);
      setModelsError("");
      setSelectedModel((current) => (result.models.some((model) => model.id === current) ? current : result.models[0]?.id ?? ""));
    } catch (error) {
      setModels([]);
      setSelectedModel("");
      setModelsError(error instanceof Error ? error.message : "Model listesi alınamadı.");
    }
  }

  async function saveEvrenKey(event: FormEvent) {
    event.preventDefault();
    const value = evrenKeyInput.trim();
    if (!value) { setEvrenError("Anahtar boş olamaz."); return; }
    setEvrenBusy(true);
    setEvrenError("");
    try {
      const status = await api.saveEvrenKey(value);
      setEvrenStatus(status);
      setEvrenKeyInput("");
      await refreshModels();
      setEvrenOpen(false);
      notify(`EVREN bağlantısı doğrulandı · ${status.modelCount ?? 0} model hazır. Anahtar yalnızca bellekte, diske yazılmadı.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Anahtar doğrulanamadı.";
      setEvrenError(message);
      notify(`EVREN anahtarı doğrulanamadı: ${message}`, "error");
    } finally { setEvrenBusy(false); }
  }

  async function testEvrenKey() {
    setEvrenBusy(true);
    setEvrenError("");
    try {
      const result = await api.testEvrenKey();
      setEvrenStatus(result.status);
      await refreshModels();
      notify(`EVREN bağlantısı çalışıyor · ${result.modelCount} model listelendi.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "EVREN bağlantısı kurulamadı.";
      setEvrenError(message);
      notify(`EVREN bağlantısı kurulamadı: ${message}`, "error");
    } finally { setEvrenBusy(false); }
  }

  async function removeEvrenKey() {
    if (!window.confirm("EVREN anahtarını bellekten silmek istiyor musunuz? AI özellikleri anahtar yeniden girilene kadar kapanır.")) return;
    setEvrenBusy(true);
    setEvrenError("");
    try {
      const status = await api.clearEvrenKey();
      setEvrenStatus(status);
      setEvrenKeyInput("");
      await refreshModels();
      notify("EVREN anahtarı bellekten silindi. AI özellikleri anahtar yeniden girilene kadar kapalı.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Anahtar silinemedi.";
      setEvrenError(message);
      notify(`EVREN anahtarı silinemedi: ${message}`, "error");
    } finally { setEvrenBusy(false); }
  }

  useEffect(() => {
    if (!project) {
      setQueries([]);
      setChatMessages([]);
      return;
    }
    setQueries(buildQueries(project));
    setAiConsent(false);
    setResearchConsent(false);
    api.getMessages(project.id).then((result) => setChatMessages(result.messages)).catch(() => setChatMessages([]));
    api.getFindingStates(project.id).then((result) => setProjects((current) => current.map((item) => item.id === project.id ? { ...item, findingStates: result.findingStates } : item))).catch(() => undefined);
  }, [activeId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), toastKind === "error" ? 9000 : 5000);
    return () => window.clearTimeout(timer);
  }, [toast, toastKind]);

  const selectedModelInfo = useMemo(() => models.find((model) => model.id === selectedModel) ?? null, [models, selectedModel]);

  function upsertProject(next: Project) {
    setProjects((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setActiveId(next.id);
  }

  async function clearSecurityLearningNotes() {
    if (!window.confirm("Bu ULAK kurulumundaki tüm anonimleştirilmiş öğrenme notları silinsin mi?")) return;
    try {
      await api.clearSecurityLearningNotes();
      setProjects((current) => current.map((item) => ({
        ...item,
        localReport: { ...item.localReport, learningNotes: [] },
      })));
      notify("Anonimleştirilmiş öğrenme notları silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Notlar silinemedi.", "error");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const candidate = event.dataTransfer.files?.[0];
    if (candidate) chooseFile(candidate);
  }

  function openCreationDialog(kind: "code" | "api") {
    setCreationKind(kind);
    setProjectUploadError("");
    setUploadFile(null);
    setRepoUrl("");
    setProjectName("");
    setServiceCategory("");
    setPostmanFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (postmanInputRef.current) postmanInputRef.current.value = "";
    setUploadOpen(true);
  }

  function changeCreationKind(kind: "code" | "api") {
    if (kind === creationKind) return;
    setCreationKind(kind);
    setProjectUploadError("");
    setUploadFile(null);
    setRepoUrl("");
    setProjectName("");
    setServiceCategory("");
    setPostmanFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (postmanInputRef.current) postmanInputRef.current.value = "";
  }

  function chooseFile(file: File) {
    setProjectUploadError("");
    if (!/\.(7z|zip|tar|tgz|tar\.gz)$/i.test(file.name)) {
      notify(".7z, .zip, .tar veya .tar.gz arşivi seçin.", "error");
      return;
    }
    setUploadFile(file);
    setRepoUrl("");
    if (!projectName) setProjectName(file.name.replace(/\.(tar\.gz|7z|zip|tgz)$/i, "").replace(/[._-]+/g, " "));
  }

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    if (creationKind === "api") {
      if (!projectName.trim() && !postmanFile) {
        notify("API çalışma alanına bir ad verin veya Postman koleksiyonu seçin.", "error");
        return;
      }
      setBusy("upload");
      try {
        let result: { workspace: ApiWorkspace };
        if (postmanFile) {
          if (postmanFile.size > 1_000_000) throw new Error("Postman koleksiyon dosyası 1 MB sınırını aşıyor.");
          const collection = JSON.parse(await postmanFile.text()) as unknown;
          result = await api.importPostmanCollection(projectName.trim(), serviceCategory.trim(), collection);
        } else {
          result = await api.createApiWorkspace({
            name: projectName.trim(),
            category: serviceCategory.trim(),
            proxyEnabled: false,
            proxyUrl: "",
            proxyUrlConfigured: false,
            variables: [],
            auth: { type: "none" },
            requests: [],
          });
        }
        setApiWorkspaces((current) => [result.workspace, ...current.filter((item) => item.id !== result.workspace.id)]);
        setActiveId("");
        setActiveApiWorkspaceId(result.workspace.id);
        setApiResponse(null);
        setProjectName("");
        setServiceCategory("");
        setPostmanFile(null);
        setUploadOpen(false);
        setToast(postmanFile ? `${result.workspace.requests.length} Postman isteği içe aktarıldı.` : "API çalışma alanı oluşturuldu; şimdi istek ekleyebilirsiniz.");
        if (postmanInputRef.current) postmanInputRef.current.value = "";
      } catch (error) {
        notify(error instanceof Error ? error.message : "API çalışma alanı oluşturulamadı.", "error");
      } finally { setBusy(""); }
      return;
    }
    if (!uploadFile && !repoUrl.trim()) {
      notify("Devam etmek için arşiv seçin veya herkese açık depo bağlantısı yazın.", "error");
      return;
    }
    setBusy("upload");
    setProjectUploadError("");
    setLoadError("");
    try {
      const form = new FormData();
      if (uploadFile) form.set("archive", uploadFile);
      if (repoUrl.trim()) form.set("sourceUrl", repoUrl.trim());
      if (projectName.trim()) form.set("projectName", projectName.trim());
      const result = await api.createProject(form);
      upsertProject(result.project);
      setActiveApiWorkspaceId("");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setRepoUrl("");
      setProjectName("");
      setUploadOpen(false);
      setTab("overview");
      promptForSharedLearning({ kind: "project", id: result.project.id });
      setToast("Proje yerel olarak haritalandı. AI ve canlı araştırma ayrı onay bekliyor.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Proje incelenemedi.";
      setProjectUploadError(message);
      notify(message, "error");
    } finally { setBusy(""); }
  }

  function workspacePayload(workspace: ApiWorkspace) {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = workspace;
    return payload;
  }

  async function saveApiWorkspace() {
    if (!apiWorkspace) return;
    setApiBusy(true);
    try {
      const result = await api.saveApiWorkspace(apiWorkspace.id, workspacePayload(apiWorkspace));
      setApiWorkspaces((current) => current.map((item) => item.id === result.workspace.id ? result.workspace : item));
      notify("API çalışma alanı kaydedildi. Gizli değerler şifreli saklanır.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "API çalışma alanı kaydedilemedi.", "error");
    } finally { setApiBusy(false); }
  }

  async function sendApiRequest(requestId: string) {
    if (!apiWorkspace) return;
    setApiBusy(true);
    setApiResponse(null);
    try {
      await api.saveApiWorkspace(apiWorkspace.id, workspacePayload(apiWorkspace));
      const result = await api.sendApiRequest(apiWorkspace.id, requestId);
      setApiResponse(result.result);
      promptForSharedLearning({ kind: "api", id: apiWorkspace.id });
      if (result.result.capturedVariable) {
        setApiWorkspaces((current) => current.map((item) => item.id !== apiWorkspace.id ? item : {
          ...item,
          variables: item.variables.some((variable) => variable.key === result.result.capturedVariable)
            ? item.variables.map((variable) => variable.key === result.result.capturedVariable ? { ...variable, value: "", isSecret: true } : variable)
            : [...item.variables, { key: result.result.capturedVariable!, value: "", isSecret: true }],
        }));
        notify(`Yanıt alındı; ${result.result.status} · ${result.result.capturedVariable} tokenı şifreli kaydedildi.`);
      } else {
        notify(`Yanıt alındı; HTTP ${result.result.status} · ${result.result.durationMs} ms.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "API isteği gönderilemedi.", "error");
    } finally { setApiBusy(false); }
  }

  async function removeApiWorkspace() {
    if (!apiWorkspace || !window.confirm(`“${apiWorkspace.name}” çalışma alanı, istekleri, şifreli sırları ve API işlem kayıtları kalıcı silinsin mi? Yerel öğrenme notları korunur.`)) return;
    try {
      await api.deleteApiWorkspace(apiWorkspace.id);
      const remaining = apiWorkspaces.filter((item) => item.id !== apiWorkspace.id);
      setApiWorkspaces(remaining);
      setActiveApiWorkspaceId("");
      setActiveId(projects[0]?.id ?? "");
      setApiResponse(null);
      notify("API çalışma alanı ve şifreli tokenları silindi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "API çalışma alanı silinemedi.", "error");
    }
  }

  async function exportApiWorkspace() {
    if (!apiWorkspace) return;
    try {
      const response = await fetch(`/api/api-workspaces/${apiWorkspace.id}/export`, { headers: { "x-ulak-session": sessionToken() }, cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : `Postman dışa aktarılamadı (${response.status}).`);
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${apiWorkspace.name.replace(/[^A-Za-z0-9._-]+/g, "-")}.postman_collection.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      notify("Gizli tokenları içermeyen Postman koleksiyonu indirildi.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Postman dışa aktarılamadı.", "error");
    }
  }

  function exportApiWorkspaceMarkdown() {
    if (!apiWorkspace) return;
    downloadMarkdown(
      markdownFilename(apiWorkspace.name, "api-ai-baglam"),
      buildApiWorkspaceMarkdown(apiWorkspace, apiResponse),
    );
    notify("Sırlar ve yanıt gövdesi dışarıda bırakılarak AI bağlamı indirildi.");
  }

  function exportCurrentScreen() {
    if (!project) return;
    downloadMarkdown(
      markdownFilename(project.name, tab),
      buildProjectScreenMarkdown(project, tab, chatMessages),
    );
    notify(`${navigation.find((item) => item.id === tab)?.label ?? "Gizlilik"} ekranı Markdown olarak indirildi.`);
  }

  async function runAI() {
    if (!project || !selectedModel || !aiConsent) return;
    setBusy("ai");
    try {
      const result = await api.analyzeWithAI(project.id, selectedModel);
      const next = { ...project, aiReport: result.aiReport, aiConsentAt: new Date().toISOString() } as Project;
      upsertProject(next);
      setAiConsent(false);
      setTab("findings");
      setToast("AI raporu hazır. Kaynak içerik yalnız onaylı LLM analizinde kullanıldı.");
    } catch (error) { setToast(error instanceof Error ? error.message : "AI analizi başarısız oldu."); }
    finally { setBusy(""); }
  }

  async function runResearch() {
    if (!project || !researchConsent) return;
    const trimmed = queries.map((query) => query.trim()).filter(Boolean);
    if (!trimmed.length) { setToast("En az bir araştırma sorgusu girin."); return; }
    setBusy("research");
    try {
      const result = await api.runResearch(project.id, trimmed);
      const next = { ...project, research: result.research, researchConsentAt: new Date().toISOString() } as Project;
      upsertProject(next);
      setResearchConsent(false);
      setTab("research");
      setToast(result.research.sources.length ? result.research.sources.length + " kaynak bulundu; kısmi servis hataları varsa ayrıca gösteriliyor." : "Araştırma tamamlandı; kullanılabilir kaynak bulunamadı.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Canlı araştırma başarısız oldu."); }
    finally { setBusy(""); }
  }

  async function runAudit() {
    if (!project) return;
    setBusy("audit");
    try {
      const result = await api.runProactiveAudit(project.id);
      upsertProject({ ...project, proactiveAudit: result.proactiveAudit, proactiveDiff: result.proactiveDiff });
      setToast("Proaktif denetim yenilendi; yeni sinyaller ve kanıtlar hazır.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Proaktif denetim yenilenemedi."); }
    finally { setBusy(""); }
  }

  async function updateFindingState(findingId: string, status: FindingStateStatus, note: string) {
    if (!project) return;
    try {
      const result = await api.updateFindingState(project.id, findingId, status, note);
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, findingStates: result.findingStates } : item));
    } catch (error) { setToast(error instanceof Error ? error.message : "Bulgu durumu kaydedilemedi."); }
  }

  async function sendQuestion(event: FormEvent) {
    event.preventDefault();
    if (!project || !question.trim() || !selectedModel || !aiConsent) return;
    const ask = question.trim();
    setQuestion("");
    setChatMessages((current) => [...current, { role: "user", content: ask }]);
    setBusy("chat");
    try {
      const response = await api.ask(project.id, ask, selectedModel);
      setChatMessages((current) => [...current, { role: "assistant", content: response.answer }]);
      setAiConsent(false);
    } catch (error) {
      setChatMessages((current) => [...current, { role: "assistant", content: "Yanıt alınamadı: " + (error instanceof Error ? error.message : "geçici bir hata oluştu") }]);
    } finally { setBusy(""); }
  }

  async function removeProject() {
    if (!project || !window.confirm("Bu projenin kaydı, yüklenen arşivi ve projeye bağlı inceleme verileri kalıcı olarak silinsin mi? Genel güvenlik öğrenme notları korunur.")) return;
    setBusy("delete");
    try {
      const result = await api.deleteProject(project.id);
      const remaining = projects.filter((item) => item.id !== project.id);
      setProjects(remaining);
      setActiveId(remaining[0]?.id ?? "");
      setToast(result.warning);
    } catch (error) { setToast(error instanceof Error ? error.message : "Kayıt kaldırılamadı."); }
    finally { setBusy(""); }
  }

  async function downloadDossier() {
    if (!project) return;
    setBusy("dossier");
    try {
      const response = await fetch(`/api/projects/${project.id}/dossier`, { headers: { "x-ulak-session": sessionToken() }, cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : `Döküm alınamadı (${response.status}).`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = match?.[1] ?? `ulak-dokum-${project.id}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setToast("Döküm raporu indirildi.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Döküm raporu indirilemedi."); }
    finally { setBusy(""); }
  }

  function setQuery(index: number, value: string) {
    setQueries((current) => current.map((query, i) => i === index ? value : query));
  }

  async function runDeepAnalyze(filePath: string) {
    if (!project) return "";
    setBusy("deep");
    try {
      const result = await api.deepAnalyze(project.id, filePath);
      setToast("Derin analiz başarıyla tamamlandı.");
      return result.analysis;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Derin analiz başarısız oldu.");
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function runReconstruct(useAi: boolean) {
    if (!project) return;
    if (useAi && !selectedModel) { setToast("AI destekli plan için önce bir model seçin."); return; }
    setBusy("reconstruct");
    try {
      const result = await api.reconstruct(project.id, useAi ? selectedModel : undefined);
      upsertProject({ ...project, reconstruction: result.reconstruction });
      setToast(useAi ? "Yeniden inşa planı AI ile zenginleştirildi." : "Yeniden inşa planı yerel olarak üretildi.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Yeniden inşa planı üretilemedi."); }
    finally { setBusy(""); }
  }

  if (booting) {
    return <div className="boot-screen"><div className="boot-mark"><img src="/logo-mark.png" alt="" /><span>ULAK</span></div><div className="boot-spinner" /><p>Proje alanın hazırlanıyor…</p></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/logo-mark.png" alt="" /></div>
          <div><div className="brand-name">ULAK<span>↗</span></div><div className="brand-subtitle">PROJE İSTİHBARATI</div></div>
        </div>
        <div className="workspace-label"><span>ÇALIŞMA ALANI</span><span className="live-pip" /> ÖZEL</div>
        <button className="new-project-button" onClick={() => openCreationDialog("code")}><CloudUpload size={16} /> Yeni proje ekle <span>+</span></button>
        <div className="sidebar-section-title">PROJELER <span>{projects.length.toString().padStart(2, "0")}</span></div>
        <div className="project-list">
          {projects.length ? projects.map((item) => (
            <button key={item.id} className={"project-nav-item " + (activeId === item.id && !activeApiWorkspaceId ? "active" : "")} onClick={() => { setActiveId(item.id); setActiveApiWorkspaceId(""); setApiResponse(null); setTab("overview"); }}>
              <span className="project-nav-icon">{item.sourceKind === "github" ? <Github size={16} /> : <FileArchive size={16} />}</span>
              <span className="project-nav-copy"><strong>{item.name}</strong><small>{item.localReport.stack[0]?.name ?? "Proje analizi"}</small></span>
              <ChevronRight size={14} className="project-nav-chevron" />
            </button>
          )) : <div className="sidebar-empty">Henüz proje yok.<br />İlk arşivi ekleyin.</div>}
        </div>
        <div className="sidebar-section-title">API TEST ALANLARI <span>{apiWorkspaces.length.toString().padStart(2, "0")}</span></div>
        <div className="project-list">
          {apiWorkspaces.length ? apiWorkspaces.map((item) => (
            <button key={item.id} className={"project-nav-item " + (activeApiWorkspaceId === item.id ? "active" : "")} onClick={() => { setActiveId(""); setActiveApiWorkspaceId(item.id); setApiResponse(null); }}>
              <span className="project-nav-icon"><PlugZap size={16} /></span>
              <span className="project-nav-copy"><strong>{item.name}</strong><small>{item.category || "API servisi"} · {item.requests.length} istek</small></span>
              <ChevronRight size={14} className="project-nav-chevron" />
            </button>
          )) : <div className="sidebar-empty">Henüz API alanı yok.</div>}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-mini"><ShieldCheck size={16} /><div><strong>Önce mahremiyet</strong><small>AI ve araştırma kapalı başlar.</small></div></div>
          <button className={"side-link " + (tab === "privacy" ? "selected" : "")} onClick={() => setTab("privacy")}><LockKeyhole size={16} /> Veri ve gizlilik</button>
          <div className="sidebar-version"><span>ULAK / 0.1</span><span>ÖNİZLEME</span></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>ULAK</span><span className="crumb-slash">/</span><span>{apiWorkspace ? "API test alanı" : tab === "overview" ? "Çalışma masası" : navigation.find((item) => item.id === tab)?.label ?? "Veri ve gizlilik"}</span></div>
          <div className="topbar-right"><span className="local-only"><span /> İŞLEMLER KONTROLLÜ</span><button className={"evren-button " + (evrenStatus.configured ? "connected" : "")} onClick={() => { setEvrenOpen(true); setEvrenError(""); }}><Cpu size={15} /><span>EVREN</span><i className={"evren-dot " + (evrenStatus.configured ? "on" : "off")} /></button><button className="help-button" onClick={() => setHowOpen(true)}><CircleHelp size={17} /><span>Nasıl çalışır?</span></button><div className="avatar">U</div></div>
        </header>

        {loadError && <div className="system-alert"><TriangleAlert size={17} /><span>{loadError} API ve veritabanı hizmetlerini kontrol edin.</span><button onClick={() => window.location.reload()}>Yenile</button></div>}
        {modelsError && <div className="system-alert"><TriangleAlert size={17} /><span>AI özellikleri devre dışı: {modelsError}</span><button onClick={() => { setEvrenOpen(true); setEvrenError(""); }}>EVREN anahtarı ekle</button></div>}

        <div className={"evren-bar " + (evrenStatus.verified ? "is-ok" : evrenStatus.configured ? "is-warn" : "is-off")}>
          <span className="evren-dot" />
          <strong>EVREN</strong>
          <span className="evren-bar-text">
            {evrenStatus.verified
              ? `Bağlantı doğrulandı · ${evrenStatus.modelCount ?? models.length} model hazır${evrenStatus.checkedAt ? ` · ${formatClock(evrenStatus.checkedAt)}` : ""}`
              : evrenStatus.configured
                ? `Anahtar bellekte ama henüz doğrulanmadı${evrenStatus.lastError ? ` · ${evrenStatus.lastError}` : ""}`
                : "Anahtar tanımlı değil · AI analizi ve sohbet kapalı"}
          </span>
          <button type="button" className="evren-bar-button" onClick={() => { setEvrenOpen(true); setEvrenError(""); }}>
            {evrenStatus.configured ? "Anahtarı yönet" : "Anahtar ekle"}
          </button>
        </div>

        {!project && apiWorkspace ? (
          <ApiWorkspacePanel
            workspace={apiWorkspace}
            response={apiResponse}
            busy={apiBusy}
            onChange={(next) => setApiWorkspaces((current) => current.map((item) => item.id === next.id ? next : item))}
            onSave={saveApiWorkspace}
            onSend={sendApiRequest}
            onDelete={removeApiWorkspace}
            onExport={exportApiWorkspace}
            onExportMarkdown={exportApiWorkspaceMarkdown}
          />
        ) : !project ? (
          <section className="empty-state-wrap">
            <div className="empty-orbit"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-dot orbit-dot-one" /><div className="orbit-dot orbit-dot-two" /><div className="orbit-core"><img src="/logo-mark.png" alt="" /></div></div>
            <div className="empty-eyebrow"><span className="signal-line" /> KODU ÖNCE ANLAR. SONRA ARAŞTIRIR.</div>
            <h1>Tanımadığın bir kod tabanını<br /><em>yarım saatte</em> anla.</h1>
            <p className="empty-description">ULAK bir arşivi ya da GitHub deposunu alır; ne işe yaradığını, hangi teknolojilerle yazıldığını, nereden başlayacağını ve nerede risk olduğunu tek ekranda gösterir. AI ve canlı araştırma yalnızca sen açıkça başlattığında devreye girer.</p>
            <button className="primary-button empty-cta" onClick={() => openCreationDialog("code")}><CloudUpload size={18} /> Yeni proje ekle <ArrowRight size={16} /></button>
            <button className="empty-secondary" onClick={() => setHowOpen(true)}><CircleHelp size={15} /> Neler yapabilirim?</button>
            <div className="empty-trust"><span><ShieldCheck size={14} /> Kodun çalıştırılmaz</span><span><LockKeyhole size={14} /> AI aktarımı izne bağlı</span><span><Globe2 size={14} /> Kaynaklar bağlantılı</span></div>
            <div className="empty-how"><div><span>01</span><strong>İçeriği anlar</strong><small>Dosya ağacı · teknoloji · bileşenler</small></div><ArrowRight size={16} /><div><span>02</span><strong>İzinle derinleşir</strong><small>AI sentezi · güncel kaynaklar</small></div><ArrowRight size={16} /><div><span>03</span><strong>Yol önerir</strong><small>Kanıt · etki · uygulanabilirlik</small></div></div>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div className="heading-copy"><div className="eyebrow"><span className="signal-line" /> PROJE İNCELEME MASASI</div><h1>{project.name}<span className="heading-period">.</span></h1><p>{project.sourceKind === "github" ? <><Github size={13} /> {project.sourceUrl}</> : <><FileArchive size={13} /> {project.sourceName}</>} <span className="heading-divider">·</span> Yerel envanter {formatDate(project.localReport.analyzedAt)}</p></div>
              <div className="heading-actions"><button className="quiet-button" onClick={exportCurrentScreen}><Download size={15} /> Bu ekranı .md indir</button><button className="quiet-button" onClick={downloadDossier} disabled={busy === "dossier"}><FileText size={15} /> {busy === "dossier" ? "Hazırlanıyor…" : "Tüm döküm"}</button><button className="quiet-button" onClick={removeProject} disabled={busy === "delete"}><Trash2 size={15} /> Kaydı kaldır</button><button className="primary-button small" onClick={() => openCreationDialog("code")}><CloudUpload size={15} /> Proje ekle</button></div>
            </section>

            <div className="section-tabs">
              {navigation.map(({ id, label, icon: Icon }) => <button key={id} data-tab={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15} /> {label}{id === "research" && project.research?.sources?.length ? <span className="tab-count">{project.research.sources.length}</span> : null}</button>)}
              <button className={"privacy-tab " + (tab === "privacy" ? "active" : "")} onClick={() => setTab("privacy")}><LockKeyhole size={15} /> Gizlilik</button>
            </div>

            {tab === "overview" && localReport && <Overview project={project} onTab={setTab} onRunResearch={() => setTab("research")} />}
            {tab === "architecture" && localReport && <Architecture project={project} />}
            {tab === "findings" && localReport && <Findings project={project} onRunAI={runAI} onUpdateState={updateFindingState} onClearLearningNotes={clearSecurityLearningNotes} busy={busy === "ai"} consent={aiConsent} setConsent={setAiConsent} models={models} selectedModel={selectedModel} setSelectedModel={setSelectedModel} modelInfo={selectedModelInfo} evrenStatus={evrenStatus} modelsError={modelsError} onOpenEvren={() => { setEvrenOpen(true); setEvrenError(""); }} />}
            {tab === "proactive" && <ProactivePanel project={project} onRun={runAudit} busy={busy === "audit"} onToast={setToast} />}
            {tab === "research" && <ResearchPanel project={project} queries={queries} setQuery={setQuery} onRun={runResearch} busy={busy === "research"} consent={researchConsent} setConsent={setResearchConsent} />}
            {tab === "roadmap" && <Roadmap project={project} onRunAI={() => setTab("findings")} evrenStatus={evrenStatus} onOpenEvren={() => { setEvrenOpen(true); setEvrenError(""); }} />}
            {tab === "conversation" && <Conversation project={project} messages={chatMessages} question={question} setQuestion={setQuestion} onSend={sendQuestion} busy={busy === "chat"} consent={aiConsent} setConsent={setAiConsent} selectedModel={selectedModel} modelInfo={selectedModelInfo} />}
            {tab === "reverse" && <ReverseEngineeringDesk project={project} busy={busy === "deep"} onAnalyze={runDeepAnalyze} onReconstruct={runReconstruct} reconstructing={busy === "reconstruct"} modelReady={Boolean(selectedModel)} />}
            {tab === "privacy" && <Privacy project={project} />}
          </>
        )}
      </main>

      {uploadOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "upload") setUploadOpen(false); }}>
        <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
          <div className="modal-top"><div className="modal-symbol"><FolderKanban size={20} /></div><button className="icon-button" onClick={() => setUploadOpen(false)} disabled={busy === "upload"} aria-label="Kapat"><X size={18} /></button></div>
          <div className="eyebrow"><span className="signal-line" /> YENİ ÇALIŞMA ALANI</div>
          <div className="creation-kind-picker">
            <button type="button" className={creationKind === "code" ? "selected" : ""} onClick={() => changeCreationKind("code")}><FileArchive size={17} /><span><strong>Kod projesi incele</strong><small>Arşiv veya GitHub deposu</small></span></button>
            <button type="button" className={creationKind === "api" ? "selected" : ""} onClick={() => changeCreationKind("api")}><PlugZap size={17} /><span><strong>API / webservis test et</strong><small>Postman koleksiyonu veya istekler</small></span></button>
          </div>
          <h2 id="upload-title">{creationKind === "api" ? <>Servisleri <em>bir arada</em> test et.</> : <>İlk önce <em>dosyaları</em> tanıyalım.</>}</h2>
          <p className="modal-description">{creationKind === "api"
            ? "Ülke veya servis adını kendin belirle. Koleksiyon ve tokenlar bu çalışma alanında ayrı tutulur; yalnızca Gönder’e bastığın tek istek çalışır."
            : "Arşiv sunucuya güvenli inceleme için yüklenir ve proje alanında saklanır. Kod çalıştırılmaz. AI veya araştırmaya henüz gönderilmez."}</p>
          {creationKind === "code" && projectUploadError && <div className="project-upload-error" role="alert"><TriangleAlert size={16} /><span>{projectUploadError}</span></div>}
          <form onSubmit={submitProject}>
            <label className="field-label">{creationKind === "api" ? "ÇALIŞMA ALANI ADI" : "PROJE ADI"} <span>{creationKind === "api" ? "Zorunlu" : "İsteğe bağlı"}</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder={creationKind === "api" ? "Örn. Ödeme entegrasyonu" : "Örn. Benim Projem"} maxLength={180} /></label>
            {creationKind === "api" ? <>
              <label className="field-label">SERVİS GRUBU / ETİKET <span>İsteğe bağlı</span><input value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} placeholder="Örn. Türkiye" maxLength={100} /></label>
              <input ref={postmanInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => setPostmanFile(event.target.files?.[0] ?? null)} />
              <button type="button" className={"postman-import-picker " + (postmanFile ? "has-file" : "")} onClick={() => postmanInputRef.current?.click()}>
                <FileText size={20} /><span><strong>{postmanFile?.name ?? "Postman Collection JSON içe aktar"}</strong><small>{postmanFile ? `${formatBytes(postmanFile.size)} · Koleksiyon ayrıştırılacak` : "v2.1 koleksiyonu seç; istekler düzenlenebilir alanlara dönüşsün."}</small></span><Upload size={16} />
              </button>
              {postmanFile && <button type="button" className="inline-clear" onClick={() => { setPostmanFile(null); if (postmanInputRef.current) postmanInputRef.current.value = ""; }}>Koleksiyonu kaldır</button>}
              <div className="data-transfer-note"><ShieldCheck size={17} /><p><strong>Güvenli kullanım:</strong> Postman scriptleri çalıştırılmaz. İstek, yalnız siz Gönder’e bastığınızda seçtiğiniz servise gider; tokenlar şifreli saklanır ve koleksiyon dışa aktarımında çıkarılır.</p></div>
              <button type="submit" className="primary-button modal-submit" disabled={busy === "upload" || (!projectName.trim() && !postmanFile)}>{busy === "upload" ? <><LoaderCircle size={17} className="spin" /> Koleksiyon hazırlanıyor…</> : <>{postmanFile ? "Koleksiyonu içe aktar" : "API alanı oluştur"} <ArrowRight size={16} /></>}</button>
            </> : <>
              <div className={"drop-zone " + (isDragging ? "dragging " : "") + (uploadFile ? "has-file" : "")} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}>
                <input ref={fileInputRef} type="file" accept=".7z,.zip,.tar,.tgz,.gz" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseFile(file); }} />
                <div className="drop-icon">{uploadFile ? <FileArchive size={20} /> : <CloudUpload size={20} />}</div>
                {uploadFile ? <><strong>{uploadFile.name}</strong><span>{formatBytes(uploadFile.size)} · Arşiv seçildi <button type="button" className="inline-clear" onClick={(event) => { event.stopPropagation(); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>Kaldır</button></span></> : <><strong>Arşivi buraya bırak</strong><span>veya <u>bilgisayarından seç</u></span></>}
              </div>
              <div className="separator-label"><span></span> YA DA HERKESE AÇIK DEPO <span></span></div>
              <label className="field-label">GITHUB ADRESİ <input value={repoUrl} onChange={(event) => { setRepoUrl(event.target.value); if (event.target.value) { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; } }} placeholder="https://github.com/owner/repository" autoComplete="url" /></label>
              <div className="data-transfer-note"><ShieldCheck size={17} /><p><strong>Desteklenen giriş:</strong> ZIP, 7z, TAR, TGZ arşivi veya herkese açık GitHub depo adresi. Kod ULAK’ta çalıştırılmaz.</p></div>
              <button type="submit" className="primary-button modal-submit" disabled={busy === "upload" || (!uploadFile && !repoUrl.trim())}>{busy === "upload" ? <><LoaderCircle size={17} className="spin" /> Dosyalar haritalanıyor…</> : <>Yerel incelemeyi başlat <ArrowRight size={16} /></>}</button>
            </>}
          </form>
        </div>
      </div>}

      {knowledgeContext && <div className="modal-backdrop" role="presentation">
        <div className="upload-modal learning-modal" role="dialog" aria-modal="true" aria-labelledby="learning-title">
          <div className="modal-top">
            <div className="modal-symbol"><BookOpenCheck size={20} /></div>
            <button className="icon-button" onClick={() => setKnowledgeContext(null)} disabled={knowledgeBusy} aria-label="Şimdi değil"><X size={18} /></button>
          </div>
          <div className="eyebrow"><span className="signal-line" /> İSTEĞE BAĞLI · YEREL ÖĞRENME</div>
          <h2 id="learning-title">Yerel bilgi birikimini <em>geliştirelim mi?</em></h2>
          <p className="modal-description">{knowledgeContext.kind === "api" ? "API isteği tamamlandı." : "Yerel proje incelemesi tamamlandı."} Başka projelerde de işe yarayabilecek, projeden bağımsız genel bir analiz dersi eklemek ister misiniz? Bu tamamen isteğe bağlıdır; not yalnızca bu ULAK kurulumunun yerel veritabanına yazılır ve başka hiçbir yere aktarılmaz.</p>
          <div className="data-transfer-note"><ShieldCheck size={17} /><p><strong>Yalnızca yerel kayıt.</strong> Not bu kurulumun veritabanında kalır; hiçbir dış servise, sunucuya veya üçüncü tarafa iletilmez. Kişisel veri, müşteri/çalışan bilgisi, proje adı veya kodu, dosya yolu, bulgu kanıtı, servis adresi, token ve API bilgisi yazmayın. Notlar otomatik güvenlik kontrollerinden geçer; şüpheli içerik reddedilir. “Şimdi değil” seçerseniz hiçbir not eklenmez.</p></div>
          <form onSubmit={submitSharedLearningNote}>
            <label className="field-label">GENEL KONU
              <select value={knowledgeCategory} onChange={(event) => setKnowledgeCategory(event.target.value as SharedKnowledgeCategory)}>
                <option value="security">Güvenlik</option>
                <option value="architecture">Mimari ve yapı</option>
                <option value="testing">Test ve kalite</option>
                <option value="performance">Performans</option>
                <option value="other">Diğer genel ders</option>
              </select>
            </label>
            <label className="field-label">GENEL NOT BAŞLIĞI
              <input value={knowledgeTitle} onChange={(event) => setKnowledgeTitle(event.target.value)} maxLength={100} placeholder="Örn. Girdi sınırlarını katmanlar arasında doğrula" />
            </label>
            <label className="field-label">BAŞKA PROJELERDE DE İŞE YARAYACAK ÖNERİ
              <textarea value={knowledgeRecommendation} onChange={(event) => setKnowledgeRecommendation(event.target.value)} maxLength={600} rows={4} placeholder="Projeye özel ayrıntı vermeden, genel olarak neye dikkat edilmeli?" />
            </label>
            <label className="learning-consent"><input type="checkbox" checked={knowledgeConsent} onChange={(event) => setKnowledgeConsent(event.target.checked)} /><span>Yalnızca bu genel notun bu ULAK kurulumunun yerel veritabanına kaydedilmesini onaylıyorum. Not hiçbir dış servise gönderilmez ve yalnızca bu kurulumda görünür.</span></label>
            {knowledgeError && <div className="project-upload-error" role="alert"><TriangleAlert size={16} /><span>{knowledgeError}</span></div>}
            <div className="learning-actions">
              <button type="button" className="quiet-button" onClick={() => setKnowledgeContext(null)} disabled={knowledgeBusy}>Şimdi değil</button>
              <button type="submit" className="primary-button" disabled={knowledgeBusy || !knowledgeConsent || knowledgeTitle.trim().length < 8 || knowledgeRecommendation.trim().length < 20}>
                {knowledgeBusy ? <><LoaderCircle size={16} className="spin" /> Güvenli kontroller…</> : <><Check size={16} /> Genel notu yerel kaydet</>}
              </button>
            </div>
          </form>
        </div>
      </div>}

      {evrenOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !evrenBusy) setEvrenOpen(false); }}>
        <div className="upload-modal evren-modal" role="dialog" aria-modal="true" aria-labelledby="evren-title">
          <div className="modal-top"><div className="modal-symbol"><Cpu size={20} /></div><button className="icon-button" onClick={() => setEvrenOpen(false)} disabled={evrenBusy} aria-label="Kapat"><X size={18} /></button></div>
          <div className="eyebrow"><span className="signal-line" /> EVREN LLM GATEWAY</div>
          <h2 id="evren-title">Modeli <em>sen</em> seç.</h2>
          <p className="modal-description">Anahtar yalnızca sunucu belleğinde tutulur. Diske, veritabanına, günlüklere veya analiz edilen projeye yazılmaz; alt süreçlere aktarılmaz. Sunucu yeniden başladığında kendiliğinden silinir.</p>

          <div className={"evren-state " + (evrenStatus.configured ? "on" : "off")}>
            <span className="evren-state-dot" />
            <div>
              <strong>{evrenStatus.configured ? (evrenStatus.verified ? "Bağlantı doğrulandı" : "Anahtar bellekte · henüz denenmedi") : "Anahtar tanımlı değil"}</strong>
              <small>{evrenStatus.configured
                ? (evrenStatus.source === "env" ? "Kaynak: .env dosyası · arayüzden silinebilir" : "Kaynak: bu oturumun belleği · diske yazılmadı")
                : "AI analizi ve takip sohbeti anahtar girilene kadar kapalı."}</small>
              {evrenStatus.configured && typeof evrenStatus.modelCount === "number" && <small>{evrenStatus.modelCount} sohbet modeli erişilebilir.</small>}
            </div>
          </div>

          <form onSubmit={saveEvrenKey}>
            <label className="field-label">EVREN API ANAHTARI
              <input
                type="password"
                value={evrenKeyInput}
                onChange={(event) => setEvrenKeyInput(event.target.value)}
                placeholder={evrenStatus.configured ? "•••••••• (değiştirmek için yeni anahtar girin)" : "Anahtarınızı buraya yapıştırın"}
                autoComplete="off"
                spellCheck={false}
                maxLength={512}
              />
            </label>
            {evrenError && <div className="evren-error"><TriangleAlert size={14} /><span>{evrenError}</span></div>}
            <div className="evren-actions">
              <button type="submit" className="primary-button" disabled={evrenBusy || !evrenKeyInput.trim()}>
                {evrenBusy ? <><LoaderCircle size={16} className="spin" /> Doğrulanıyor…</> : <><Check size={16} /> Anahtarı doğrula ve al</>}
              </button>
              <button type="button" className="quiet-button" onClick={testEvrenKey} disabled={evrenBusy || !evrenStatus.configured}>
                <PlugZap size={15} /> Bağlantıyı test et
              </button>
              <button type="button" className="quiet-button" onClick={removeEvrenKey} disabled={evrenBusy || !evrenStatus.removable}>
                <Trash2 size={15} /> Anahtarı sil
              </button>
            </div>
          </form>

          <div className="evren-models">
            <div className="evren-models-head">
              <span>EVREN MODELLERİ</span>
              <span>{models.length ? models.length + " model" : "liste yok"}</span>
            </div>
            {models.length ? (
              <div className="evren-model-list">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={"evren-model-row " + (selectedModel === model.id ? "selected" : "")}
                    onClick={() => setSelectedModel(model.id)}
                  >
                    <span className="evren-model-check">{selectedModel === model.id ? <Check size={12} /> : null}</span>
                    <span className="evren-model-copy"><strong>{model.name}</strong><small>{model.description || model.provider}</small></span>
                    <span className={"cost-dot cost-" + (model.cost ?? "medium")} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="evren-models-empty">{modelsError || "Anahtar girildiğinde EVREN hesabındaki sohbet modelleri burada listelenir."}</p>
            )}
          </div>

          <div className="data-transfer-note"><ShieldCheck size={17} /><p><strong>Anahtar nereye gitmiyor?</strong> Yüklediğin arşive, AI prompt'una, rapora, denetim günlüğüne ve objdump/rizin alt süreçlerine aktarılmaz. Yalnızca EVREN isteklerinin Authorization başlığında kullanılır.</p></div>
        </div>
      </div>}

      {howOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHowOpen(false); }}>
        <div className="upload-modal how-modal" role="dialog" aria-modal="true" aria-labelledby="how-title">
          <div className="modal-top"><div className="modal-symbol"><BookOpenCheck size={20} /></div><button className="icon-button" onClick={() => setHowOpen(false)} aria-label="Kapat"><X size={18} /></button></div>
          <HowItWorks project={project} evrenStatus={evrenStatus} onGo={(next) => { setHowOpen(false); setTab(next); }} onUpload={() => { setHowOpen(false); openCreationDialog("code"); }} />
        </div>
      </div>}

      {toast && <div className={"toast" + (toastKind === "error" ? " toast-error" : "")} role="status"><span className="toast-dot" />{toast}<button onClick={() => setToast("")} aria-label="Bildirimi kapat"><X size={14} /></button></div>}
    </div>
  );
}

function Metric({ label, value, note, icon: Icon, tone = "mint" }: { label: string; value: string | number; note: string; icon: typeof Activity; tone?: "mint" | "amber" | "blue" }) {
  return <div className={"metric-card tone-" + tone}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function Overview({ project, onTab, onRunResearch }: { project: Project; onTab: (tab: Tab) => void; onRunResearch: () => void }) {
  const local = project.localReport;
  const totalFindings = local.findings.length + (project.aiReport?.findings.length ?? 0);
  return (
    <div className="page-content">
      <div className="overview-banner">
        <div className="banner-left">
          <div className="banner-icon"><Radar size={20} /></div>
          <div>
            <span className="banner-kicker">ULAK ÖZETİ <span className="dot-sep">·</span> YEREL ANALİZ TAMAMLANDI</span>
            <p>{local.summary}</p>
          </div>
        </div>
        <div className="banner-right">
          <span className="status-check"><Check size={13} /></span> Kod çalıştırılmadı
        </div>
      </div>
      <div className="metrics-row">
        <Metric label="ARŞİVDEKİ ÖĞE" value={local.fileCount.toLocaleString("tr-TR")} note={local.analyzedFiles + " metin dosyası incelendi"} icon={FileCode2} />
        <Metric label="TEKNOLOJİLER" value={local.stack.length} note={local.stack.map((item) => item.name).slice(0, 2).join(" · ") || "Belirgin imza bulunamadı"} icon={Code2} tone="blue" />
        <Metric label="BAĞIMLILIK" value={local.dependencies.length} note="Paket manifestlerinden çıkarıldı" icon={Boxes} tone="amber" />
        <Metric label="İNCELEME İŞARETİ" value={totalFindings} note={local.findings.length + " yerel · " + (project.aiReport?.findings.length ?? 0) + " AI"} icon={ShieldAlert} />
      </div>
      <div className="overview-grid">
        <section className="panel purpose-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">PROJEYİ NASIL ANLADIK</span>
              <h2>İlk okuma</h2>
            </div>
            <span className="subtle-chip"><span className="green-dot" /> Statik inceleme</span>
          </div>
          <p className="purpose-text">{local.projectPurpose}</p>
          <div className="stack-chips">
            {local.stack.length ? local.stack.map((item) => (
              <span key={item.name} className="stack-chip">
                <span className="stack-dot" />{item.name}
                <small>{item.confidence === "high" ? "doğrudan" : "tahmin"}</small>
              </span>
            )) : <span className="muted-text">Teknoloji yığınına dair henüz güçlü işaret bulunamadı.</span>}
          </div>
          <div className="purpose-footer">
            <span><Clock3 size={14} /> İnceleme: {formatDate(local.analyzedAt)}</span>
            <span><Database size={14} /> {formatBytes(local.totalBytes)} açılmış içerik</span>
          </div>
        </section>
        <section className="panel next-step-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">BİR SONRAKİ ADIM</span>
              <h2>İzni sen verirsin</h2>
            </div>
            <div className="compass-badge"><ArrowDownRight size={18} /></div>
          </div>
          <div className="next-step-list">
            <button onClick={() => onTab("findings")}>
              <span className="step-icon ai"><Sparkles size={16} /></span>
              <span><strong>AI ile mimariyi derinleştir</strong><small>Kaynak parçaları modele onayla aktarılır.</small></span>
              <ChevronRight size={15} />
            </button>
            <button onClick={onRunResearch}>
              <span className="step-icon web"><Globe2 size={16} /></span>
              <span><strong>Güncel kaynakları araştır</strong><small>Arama sorgularını önce inceleyebilirsin.</small></span>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="consent-footnote"><LockKeyhole size={13} /> Hiçbir ek aktarım otomatik başlamaz.</div>
        </section>
        <section className="panel modules-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">KOD TABANI</span>
              <h2>Öne çıkan klasörler</h2>
            </div>
            <button className="text-button" onClick={() => onTab("architecture")}>Haritayı aç <ArrowRight size={13} /></button>
          </div>
          <div className="module-list">
            {local.modules.length ? local.modules.slice(0, 5).map((module, index) => (
              <div key={module.name} className={"module-row"}>
                <div className={"folder-glyph glyph-" + (index % 4)}><FolderKanban size={15} /></div>
                <span className="module-name">{module.name}/</span>
                <span className="module-bar"><i style={{ width: (Math.max(12, Math.min(100, module.files / Math.max(1, local.fileCount) * 220))) + "%" }} /></span>
                <span className="module-count">{module.files}</span>
              </div>
            )) : <div className="muted-text">Klasör dağılımı çıkarılamadı.</div>}
          </div>
        </section>
        <section className="panel pulse-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">KAYNAK DURUMU</span>
              <h2>Kanıt bağlantıları</h2>
            </div>
            <span className="status-live">CANLI</span>
          </div>
          {project.research ? (
            <>
              <div className="pulse-number">{project.research.sources.length}<small> kaynak</small></div>
              <p>Son araştırma {formatDate(project.research.researchedAt)} tarihinde çalıştırıldı.</p>
              <button className="text-button" onClick={() => onTab("research")}>Kaynaklara git <ArrowRight size={13} /></button>
            </>
          ) : (
            <>
              <div className="source-orbit"><span /><span /><span /><Globe2 size={17} /></div>
              <p>Henüz araştırma yapılmadı. Kaynakları sorgulamadan önce gönderilecek kelimeleri görebilirsin.</p>
              <button className="text-button" onClick={onRunResearch}>Sorguları incele <ArrowRight size={13} /></button>
            </>
          )}
        </section>
      </div>
      <section className="panel phase2-strip">
        <div>
          <span className="panel-overline">FAZ 2 · DERİN STATİK SİNYALLER</span>
          <strong>{local.apiSurface?.length ?? 0} API route · {local.privacySignals?.length ?? 0} gizlilik sinyali</strong>
          <small>AST tabanlı JS/TS sink kontrolü ve route/auth incelemesi bulgular sekmesine eklendi.</small>
        </div>
        <div className="phase2-count"><b>{local.findings.filter((finding) => finding.area === "SAST").length}</b><span>SAST</span></div>
        <div className="phase2-count"><b>{local.findings.filter((finding) => finding.area === "API Yetkilendirme").length}</b><span>API</span></div>
        <div className="phase2-count"><b>{local.findings.filter((finding) => finding.area === "Gizlilik").length}</b><span>PII</span></div>
      </section>
      <div className="bottom-note">
        <span className="note-mark"><ShieldCheck size={14} /></span>
        <span><strong>ULAK kesin hüküm vermez.</strong> Otomatik taramadaki işaretler doğrulanması gereken ipuçlarıdır. AI ve araştırma raporları da olası hata içerebilir.</span>
        <button onClick={() => onTab("privacy")}>Veri akışını gör <ArrowRight size={13} /></button>
      </div>
    </div>
  );
}

function Architecture({ project }: { project: Project }) {
  const report = project.localReport;
  const languages = new Map<string, number>();
  project.manifest.forEach((entry) => languages.set(entry.language, (languages.get(entry.language) ?? 0) + 1));
  const sortedLanguages = [...languages.entries()].sort((a, b) => b[1] - a[1]).filter(([name]) => name !== "Other");

  return (
    <div className="page-content">
      <PageIntro eyebrow="SİSTEM HARİTASI" title="Yapı, bileşen ve giriş noktaları." copy="Bu harita arşiv envanteri ile seçilmiş metin dosyalarından çıkarıldı. Bağlantılar statik import eşleşmeleridir; çalışma zamanı çağrı grafiği değildir." />
      <div className="architecture-grid">
        <section className="panel architecture-main">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">İÇERİK GÖRÜNÜMÜ</span>
              <h2>Modül topolojisi</h2>
            </div>
            <span className="subtle-chip">{report.modules.length} üst klasör</span>
          </div>
          <div className="topology-canvas">
            <div className="topology-core">
              <div className="core-icon"><img src="/logo-mark.png" alt="" /></div>
              <strong>{project.name}</strong>
              <small>{report.fileCount} öğe · {report.stack.map((item) => item.name).slice(0, 2).join(" / ") || "dil tespiti sınırlı"}</small>
            </div>
            <div className="topology-wires"><i /><i /><i /><i /></div>
            <div className="topology-nodes">
              {report.modules.length ? report.modules.slice(0, 4).map((module, index) => (
                <div key={module.name} className={"topology-node node-" + index}>
                  <FolderKanban size={15} />
                  <strong>{module.name}/</strong>
                  <small>{module.files} dosya</small>
                </div>
              )) : <div className="topology-node"><FileText size={15} /><strong>Klasör verisi yok</strong></div>}
            </div>
            <div className="topology-caption">
              <span className="legend-dot" /> Proje içindeki en üst seviye klasörler <span className="legend-line" /> Statik dosya ilişkisi
            </div>
          </div>
          <div className="relationships-heading">
            <span>ÇIKARILAN DOSYA İLİŞKİLERİ</span>
            <span>{report.relationships.length} bağlantı</span>
          </div>
          {report.relationships.length ? (
            <div className="relationship-list">
              {report.relationships.slice(0, 10).map((edge, index) => (
                <div key={edge.from + "-" + edge.to + "-" + index} className="relationship-row">
                  <code>{edge.from}</code>
                  <ArrowRight size={13} />
                  <code>{edge.to}</code>
                  <span>{edge.type}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <Network size={17} />
              <span>Yerel import eşleşmesi bulunamadı. Dinamik yüklemeler bu statik taramada görülmeyebilir.</span>
            </div>
          )}
        </section>
        <div className="architecture-side">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="panel-overline">TEKNOLOJİ DAĞILIMI</span>
                <h2>Dosya türleri</h2>
              </div>
            </div>
            {sortedLanguages.length ? (
              <div className="language-list">
                {sortedLanguages.slice(0, 7).map(([name, count], index) => (
                  <div className={"language-row"} key={name}>
                    <span className={"language-swatch swatch-" + (index % 5)} />
                    <span>{name}</span>
                    <strong>{count}</strong>
                    <div className="language-track">
                      <i style={{ width: (Math.max(5, count / Math.max(1, sortedLanguages[0][1]) * 100)) + "%" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted-text">Dosya türü verisi yetersiz.</p>}
          </section>
          <section className="panel entry-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-overline">BAŞLANGIÇ NOKTALARI</span>
                <h2>Olası entry point’ler</h2>
              </div>
            </div>
            {report.entryPoints.length ? report.entryPoints.map((entry) => (
              <div key={entry} className="entry-row">
                <span><Code2 size={14} /></span>
                <code>{entry}</code>
                <span className="entry-tag">aday</span>
              </div>
            )) : <div className="empty-inline"><FileCode2 size={16} /> Standart giriş dosyası adı tespit edilmedi.</div>}
          </section>
        </div>
      </div>
      <section className="panel dependencies-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">MANIFESTLERDEN</span>
            <h2>Bağımlılık envanteri</h2>
          </div>
          <span className="subtle-chip">{report.dependencies.length} kayıt</span>
        </div>
        {report.dependencies.length ? (
          <div className="dependencies-table">
            <div className="dependency-table-head">
              <span>PAKET</span>
              <span>EKOSİSTEM</span>
              <span>ARŞİVDEKİ SÜRÜM</span>
            </div>
            {report.dependencies.slice(0, 20).map((dep) => (
              <div key={dep.ecosystem + "-" + dep.name} className="dependency-row">
                <strong>{dep.name}</strong>
                <span>{dep.ecosystem}</span>
                <code>{dep.version || "belirtilmemiş"}</code>
              </div>
            ))}
          </div>
        ) : <p className="muted-text">Desteklenen manifest dosyalarında bağımlılık kaydı bulunamadı.</p>}
      </section>
      <InspectionLayers report={report} />
    </div>
  );
}

const LICENSE_CLASS_LABEL: Record<string, string> = {
  A: "Kısıt yok",
  B: "Copyleft — yalnızca alt süreç",
  C: "Ticari kısıtlı",
  D: "Atıf zorunlu",
  E: "Doğrulanamadı",
};

/**
 * §4 okuma katmanlarının arayüz karşılığı: lisans, sembol, test, boyut ve
 * yokluk kanıtı. Her blok ölçüm gösterir; yorumu kullanıcı yapar.
 */
function InspectionLayers({ report }: { report: Project["localReport"] }) {
  const license = report.license;
  const symbols = report.symbols;
  const tests = report.tests;
  const hotspots = report.sizeHotspots ?? [];
  const wrapper = report.wrapper;
  const notes = report.manifestNotes ?? [];
  const absence = report.absenceEvidence ?? [];
  const hasAny = Boolean(license || symbols || tests || hotspots.length || wrapper?.root || notes.length || absence.length);
  if (!hasAny) return null;

  return (
    <section className="panel inspection-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-overline">OKUMA KATMANLARI</span>
          <h2>Lisans, sembol, test ve kanıt</h2>
        </div>
        <span className="subtle-chip">6 katman</span>
      </div>

      {license ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>LİSANS</span>
            <span className={"license-badge license-" + license.class}>{license.class} · {LICENSE_CLASS_LABEL[license.class]}</span>
          </div>
          <p className="muted-text">
            {license.detected ? <><strong>{license.detected}</strong> — {license.reason}</> : license.reason}
            {license.file ? <> · kaynak: <code>{license.file}</code></> : null}
          </p>
          {license.mismatch ? (
            <div className="inspection-warning">
              <TriangleAlert size={14} />
              <span>README “{license.readmeClaim}” diyor, LICENSE dosyası “{license.detected}” içeriyor. Yeniden kullanım kararı LICENSE dosyasına göre verilmelidir.</span>
            </div>
          ) : null}
          {license.evidence.length ? (
            <ul className="inspection-evidence">
              {license.evidence.map((line, index) => <li key={index}><code>{line}</code></li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {symbols ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>SEMBOL ENVANTERİ</span>
            <span className="subtle-chip">{symbols.total} sembol · {symbols.files.length} dosya</span>
          </div>
          <p className="muted-text">Sembol listesi algoritmanın özetidir; gövdeyi okumadan niyeti gösterir. En büyük dosya genelde projenin asıl fikridir.</p>
          {symbols.hotspots.length ? (
            <div className="symbol-list">
              {symbols.hotspots.map((entry) => (
                <div key={entry.file} className="symbol-row">
                  <code>{entry.file}</code>
                  <span>{entry.count} sembol</span>
                  <span>{formatBytes(entry.bytes)}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted-text">Desteklenen dilde sembol çıkarılamadı.</p>}
        </div>
      ) : null}

      {tests ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>TEST ENVANTERİ</span>
            <span className="subtle-chip">{tests.count} test dosyası</span>
          </div>
          <p className="muted-text">
            {tests.count ? <>Çerçeve: {tests.frameworks.length ? tests.frameworks.join(", ") : "tespit edilemedi"}.</> : "Altı adlandırma örüntüsü ve test klasörü kuralı tarandı, eşleşme yok."}
          </p>
          {tests.files.length ? (
            <ul className="inspection-evidence">
              {tests.files.slice(0, 8).map((file) => <li key={file}><code>{file}</code></li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {hotspots.length || wrapper?.root ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>BOYUT VE SARMALAYICI</span>
            {wrapper?.doubleNested ? <span className="license-badge license-C">çift iç içe</span> : null}
          </div>
          {wrapper?.root ? (
            <p className="muted-text">
              Tüm öğeler <code>{wrapper.root}/</code> altında{wrapper.doubleNested ? ` ve bu klasör ${wrapper.depth} kez tekrarlanıyor — çift iç içe ZIP açılmış olabilir.` : "."}
            </p>
          ) : null}
          {hotspots.length ? (
            <div className="symbol-list">
              {hotspots.map((item) => (
                <div key={item.path} className="symbol-row">
                  <code>{item.path}</code>
                  <span>{formatBytes(item.bytes)}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted-text">Eşik üstü büyük dosya yok; boyut dağılımı normal.</p>}
        </div>
      ) : null}

      {notes.length ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>MANİFEST GEREKÇELERİ</span>
            <span className="subtle-chip">{notes.length} not</span>
          </div>
          <p className="muted-text">Bir paketin neden dışlandığını açıklayan yorum, 200 satırlık bağımlılık listesinden daha değerlidir.</p>
          <ul className="inspection-evidence">
            {notes.map((note) => <li key={note.file + note.line}><code>{note.file}:{note.line}</code> — {note.text}</li>)}
          </ul>
        </div>
      ) : null}

      {absence.length ? (
        <div className="inspection-block">
          <div className="inspection-head">
            <span>YOKLUK KANITLARI</span>
            <span className="subtle-chip">{absence.length} iddia</span>
          </div>
          <p className="muted-text">“Yok” demek de kanıt ister: her olumsuz bulgu hangi aramaların yapıldığını taşır.</p>
          <div className="symbol-list">
            {absence.map((item) => (
              <div key={item.id} className="absence-row">
                <strong>{item.claim}</strong>
                <span>{item.searches.join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Findings({ project, onRunAI, onUpdateState, onClearLearningNotes, busy, consent, setConsent, models, selectedModel, setSelectedModel, modelInfo, evrenStatus, modelsError, onOpenEvren }: { project: Project; onRunAI: () => void; onUpdateState: (findingId: string, status: FindingStateStatus, note: string) => void; onClearLearningNotes: () => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void; models: ModelChoice[]; selectedModel: string; setSelectedModel: (id: string) => void; modelInfo: ModelChoice | null; evrenStatus: EvrenKeyStatus | null; modelsError: string; onOpenEvren: () => void }) {
  const localFindings = project.localReport.findings;
  const aiFindings = project.aiReport?.findings ?? [];
  const learningNotes = project.localReport.learningNotes ?? [];
  return (
    <div className="page-content">
      <PageIntro eyebrow="BULGULAR" title="Her işaretin arkında kanıt." copy="Önce yerel kural taraması. Daha geniş mimari yorum için, seçtiğin proje bağlamı onayınla seçili AI modeline gönderilir." />
      <section className="panel local-findings-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">ULAK INSTANCE · ANONİMLEŞTİRİLMİŞ</span>
            <h2>Önceki proje taramalarından notlar</h2>
          </div>
          {learningNotes.length ? <button className="quiet-button" onClick={onClearLearningNotes}><Trash2 size={14} /> Notları sil</button> : null}
        </div>
        <p className="muted-text">Bu ULAK kurulumunda önceki incelemelerdeki genel güvenlik kuralları ve açık rızayla eklenen proje dışı notlar gösterilir. Notlar yalnızca bu kurulumun yerel veritabanında tutulur; başka bir kuruluma, sunucuya veya üçüncü tarafa aktarılmaz. Kişisel veri, müşteri bilgisi, proje adı, kaynak kodu, dosya yolu, servis bilgisi ve sır öğrenme notuna kaydedilmez. Yeni notlar başka projelerde bağlam olarak gösterilir; otomatik kural veya kod değişikliği başlatmaz.</p>
        {learningNotes.length ? (
          <div className="finding-stack">
            {learningNotes.map((note) => (
              <article key={note.id} className="finding-card">
                <div className="finding-main">
                  <div className="finding-title-row"><span className="finding-area">{note.source === "shared" ? `Onaylı yerel not · ${note.contributions ?? 1} kez eklendi` : `Önceki incelemelerde görüldü · ${note.scansSeen} tarama`}</span></div>
                  <h3>{note.title}</h3>
                  <p>{note.recommendation}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted-text">Henüz öğrenme notu yok. Yeni bir genel not yalnızca inceleme sonunda açıkça onay verirseniz bu kurulumun yerel veritabanına kaydedilir.</p>}
      </section>
      <section className="ai-consent-card">
        <div className="ai-consent-symbol"><WandSparkles size={19} /></div>
        <div className="ai-consent-copy">
          <span className="panel-overline">İSTEĞE BAĞLI · AI DERİN İNCELEME</span>
          <h2>Bağlamı sentezleyelim mi?</h2>
          <p>AI’ye kaynak kodunun bir kısmı, proje özeti ve dosya manifesti gönderilir. Bilinen sırlar maskelenir. AI bu içeriği araştırma sağlayıcılarına göndermez.</p>
          <div className="ai-model-row">
            <label className="model-select-label">
              MODEL
              <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!models.length}>
                <option value="">Model seçin…</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.cost} maliyet</option>)}
              </select>
            </label>
            <span className="model-cost"><span className={"cost-dot cost-" + (modelInfo?.cost ?? "medium")} /> İşlem maliyeti: {modelInfo?.cost ?? "belirsiz"}</span>
          </div>
          <div className={"evren-inline-status " + (evrenStatus?.verified ? "is-ok" : evrenStatus?.configured ? "is-warn" : "is-off")}>
            <span className="evren-dot" />
            <span>
              {evrenStatus?.verified
                ? `EVREN bağlantısı doğrulandı · ${evrenStatus.modelCount ?? models.length} model hazır`
                : evrenStatus?.configured
                  ? "EVREN anahtarı bellekte ama henüz doğrulanmadı"
                  : "EVREN anahtarı tanımlı değil · AI incelemesi için anahtar gerekli"}
            </span>
            <button type="button" className="ghost-button evren-inline-button" onClick={onOpenEvren}>
              <KeyRound size={13} /> {evrenStatus?.configured ? "Anahtarı yönet" : "Anahtar ekle"}
            </button>
          </div>
          {modelsError ? <p className="evren-inline-error">{modelsError}</p> : null}
        </div>
        <div className="ai-consent-action">
          <button className="primary-button" onClick={onRunAI} disabled={!consent || busy || !selectedModel}>
            {busy ? <><LoaderCircle size={16} className="spin" /> İnceleniyor…</> : <><Sparkles size={16} /> Onayla ve analiz et</>}
          </button>
          <label className="consent-checkbox">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Bu AI isteği için dosya bağlamını paylaşmayı onaylıyorum.</span>
          </label>
        </div>
      </section>
      {aiFindings.length ? (
        <section className="panel ai-result-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">AI RAPORU</span>
              <h2>{aiFindings.length} analiz bulgusu</h2>
            </div>
            <span className="subtle-chip"><Sparkles size={13} /> {project.aiReport?.model}</span>
          </div>
          <p className="ai-summary">{project.aiReport?.summary}</p>
          <div className="finding-stack">
            {aiFindings.map((finding) => <FindingCard key={finding.id} finding={finding} ai />)}
          </div>
        </section>
      ) : null}
      <section className="panel local-findings-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">KURAL TABANLI · YEREL</span>
            <h2>{localFindings.length} inceleme işareti</h2>
          </div>
          <span className="subtle-chip"><ShieldCheck size={13} /> Kaynak dışarı gönderilmedi</span>
        </div>
        {localFindings.length ? (
          <div className="finding-stack">
            {localFindings.map((finding) => <FindingCard key={finding.id} finding={finding} state={project.findingStates?.[finding.id]} onUpdateState={onUpdateState} />)}
          </div>
        ) : (
          <div className="success-empty">
            <ShieldCheck size={19} />
            <span>Yaygın kural örüntülerinde otomatik işaret bulunmadı. Bu, kodun güvenli olduğunu kanıtlamaz.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function FindingCard({ finding, ai = false, state, onUpdateState }: { finding: AiFinding | Project["localReport"]["findings"][number]; ai?: boolean; state?: Project["findingStates"][string]; onUpdateState?: (findingId: string, status: FindingStateStatus, note: string) => void }) {
  return (
    <article className={"finding-card severity-" + finding.severity}>
      <div className="finding-severity"><span></span>{severityLabel(finding.severity)}</div>
      <div className="finding-main">
        <div className="finding-title-row">
          <span className="finding-area">{finding.area}</span>
          {ai && <span className="ai-tag"><Sparkles size={11} /> AI sentezi</span>}
        </div>
        <h3>{finding.title}</h3>
        <p>{finding.detail}</p>
        {"impact" in finding && finding.impact && <p className="finding-impact"><strong>Etki:</strong> {finding.impact}</p>}
        {"steps" in finding && finding.steps.length ? (
          <ol className="finding-steps">
            {finding.steps.map((step, index) => <li key={index + "-" + step}>{step}</li>)}
          </ol>
        ) : null}
        {finding.evidence.length ? (
          <div className="evidence-list">
            <span>KANIT</span>
            {finding.evidence.map((item) => <code key={item}>{item}</code>)}
          </div>
        ) : (
          <div className="no-evidence-note">Envanter düzeyinde bir sinyal; dosya içi kanıt yok.</div>
        )}
        {onUpdateState && (
          <div className="finding-triage">
            <label>
              Durum
              <select value={state?.status ?? "open"} onChange={(event) => onUpdateState(finding.id, event.target.value as FindingStateStatus, state?.note ?? "")}>
                <option value="open">Açık</option>
                <option value="triage">İnceleniyor</option>
                <option value="accepted">Kabul edildi</option>
                <option value="resolved">Çözüldü</option>
              </select>
            </label>
            <input defaultValue={state?.note ?? ""} placeholder="Ekip notu…" maxLength={2000} onBlur={(event) => onUpdateState(finding.id, state?.status ?? "open", event.target.value)} />
          </div>
        )}
      </div>
      <div className="finding-confidence">Güven <strong>{finding.confidence === "high" ? "yüksek" : finding.confidence === "medium" ? "orta" : "düşük"}</strong></div>
    </article>
  );
}

function ResearchPanel({ project, queries, setQuery, onRun, busy, consent, setConsent }: { project: Project; queries: string[]; setQuery: (index: number, value: string) => void; onRun: () => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void }) {
  const research = project.research;
  return (
    <div className="page-content">
      <PageIntro eyebrow="CANLI ARAŞTIRMA" title="Koddan çıkan ipucu. İnternetten kanıt." copy="Paket adı ve sürüm bilgileri güvenlik kayıtlarıyla eşleştirilir. Teknik sorgular ayrı gösterilir; istersen düzenle, sonra başlat." />
      <section className="research-callout">
        <div className="research-sources-strip">
          <span>ARAŞTIRMA UÇLARI</span>
          <b>GitHub</b><b>OSV.dev</b><b>Stack Overflow</b><b>npm / PyPI</b>
        </div>
        <p>Bu adımda gönderilenler: aşağıdaki sorgular ile projeden çıkartılmış paket adları ve sürüm aralıkları. Kaynak dosyalarının ham içeriği araştırma sağlayıcılarına gönderilmez.</p>
      </section>
      <section className="panel query-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">GÖNDERİLECEK SORGULAR</span>
            <h2>Önce kelimelere bak.</h2>
          </div>
          <span className="subtle-chip"><Search size={13} /> {queries.length} sorgu</span>
        </div>
        <div className="query-list">
          {queries.map((query, index) => (
            <label key={index} className="query-field">
              <span>0{index + 1}</span>
              <input value={query} maxLength={180} onChange={(event) => setQuery(index, event.target.value)} aria-label={"Araştırma sorgusu " + (index + 1)} />
              <button type="button" aria-label="Sorguyu temizle" onClick={() => setQuery(index, "")}><X size={14} /></button>
            </label>
          ))}
        </div>
        <div className="research-consent-row">
          <label className="consent-checkbox">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Bu sorguları ve paket ad/sürümlerini herkese açık internet API’lerine göndermeyi onaylıyorum.</span>
          </label>
          <button className="primary-button" onClick={onRun} disabled={!consent || busy || !queries.some((query) => query.trim())}>
            {busy ? <><LoaderCircle size={16} className="spin" /> Kaynaklar taranıyor…</> : <><Radar size={16} /> Araştırmayı başlat</>}
          </button>
        </div>
      </section>
      {research ? (
        <section className="research-results">
          <div className="results-heading">
            <div>
              <span className="panel-overline">KAYNAKLI SONUÇLAR · {formatDate(research.researchedAt)}</span>
              <h2>{research.sources.length ? research.sources.length + " kaynak bulundu" : "Eşleşen kaynak bulunamadı"}</h2>
            </div>
            <span className="subtle-chip">{research.queries.length} onaylı sorgu</span>
          </div>
          <div className="searched-query-chips">
            {research.queries.map((query, index) => <span key={query + "-" + index}><Search size={12} /> {query}</span>)}
          </div>
          {research.errors.length > 0 && (
            <div className="partial-warning">
              <TriangleAlert size={15} />
              <div>
                <strong>Bazı kaynaklar yanıt vermedi.</strong>
                <small>{research.errors.join(" · ")}</small>
              </div>
            </div>
          )}
          {research.sources.length ? (
            <div className="source-grid">
              {research.sources.map((source) => (
                <article className="source-card" key={source.id}>
                  <div className="source-meta">
                    <span className="source-provider">
                      <span className="source-icon">{source.provider.includes("GitHub") ? <Github size={13} /> : source.provider.includes("OSV") ? <ShieldCheck size={13} /> : <BookOpenCheck size={13} />}</span>
                      {source.provider}
                    </span>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={sourceHost(source.url) + " kaynağını aç"}><ExternalLink size={14} /></a>
                  </div>
                  <a className="source-title" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <p>{source.summary}</p>
                  <div className="source-footer">
                    <span>{sourceHost(source.url)}</span>
                    {source.publishedAt && <time>{formatDate(source.publishedAt)}</time>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-inline">
              <Globe2 size={18} />
              <span>Bu sorgularla kaynak döndürülmedi. Sorguları düzenleyip yeniden deneyin; bu durum araştırma tamamlanmadığı anlamına gelebilir.</span>
            </div>
          )}
        </section>
      ) : (
        <div className="research-empty">
          <div className="research-empty-icon"><Globe2 size={20} /></div>
          <strong>Henüz canlı araştırma yok.</strong>
          <p>Sorguları gözden geçirip onayladığında kaynaklar ve güncel güvenlik raporları burada listelenir.</p>
        </div>
      )}
    </div>
  );
}

function ProactivePanel({ project, onRun, busy, onToast }: { project: Project; onRun: () => void; busy: boolean; onToast: (message: string) => void }) {
  const audit = project.proactiveAudit;
  const downloadReport = async (format: string) => {
    const url = format === "ci-template" ? "/api/projects/" + project.id + "/ci-template" : "/api/projects/" + project.id + "/export/" + format;
    try {
      const response = await fetch(url, { headers: { "x-ulak-session": sessionToken() }, cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : `Rapor indirilemedi (${response.status}).`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = match?.[1] ?? `ulak-${project.id}.${format === "ci-template" ? "yml" : format === "markdown" ? "md" : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Rapor indirilemedi.");
    }
  };
  const statusLabel = (status: string) => status === "pass" ? "Güçlü sinyal" : status === "risk" ? "Öncelikli doğrulama" : "İzleme alanı";
  const statusIcon = (status: string) => status === "pass" ? <Check size={15} /> : status === "risk" ? <TriangleAlert size={15} /> : <Clock3 size={15} />;
  return (
    <div className="page-content">
      <PageIntro eyebrow="PROAKTİF DENETİM" title="Sen sormadan önce görünen riskler." copy="Bu katman arşivi çalıştırmadan, dış servise veri göndermeden ve AI beklemeden proje sağlığına dair erken sinyaller üretir. Her sinyal kanıt, sınır ve uygulanabilir sonraki adımla birlikte gelir." />
      {!audit ? (
        <div className="audit-empty">
          <div className="audit-empty-mark"><Radar size={23} /></div>
          <h2>Denetim henüz hazır değil.</h2>
          <p>Arşiv yüklenirken otomatik üretilir. Yenile düğmesiyle güvenli statik kontrolü tekrar çalıştırabilirsin.</p>
          <button className="primary-button" onClick={onRun} disabled={busy}>
            {busy ? <><LoaderCircle size={16} className="spin" /> Denetleniyor…</> : <><Radar size={16} /> Denetimi başlat</>}
          </button>
        </div>
      ) : (
        <>
          <section className="audit-hero">
            <div className={"audit-score grade-" + audit.grade}>
              <strong>{audit.score}</strong>
              <span>/100</span>
              <small>yol gösterici sinyal</small>
            </div>
            <div className="audit-hero-copy">
              <span className="panel-overline">KOD ÇALIŞTIRILMADAN · {formatDate(audit.checkedAt)}</span>
              <h2>Proje hazırlık seviyesi: <b>{audit.grade}</b></h2>
              <p>{audit.summary}</p>
              <div className="audit-legend">
                <span><i className="audit-dot dot-pass" /> {audit.checks.filter((check) => check.status === "pass").length} güçlü</span>
                <span><i className="audit-dot dot-watch" /> {audit.checks.filter((check) => check.status === "watch").length} izleme</span>
                <span><i className="audit-dot dot-risk" /> {audit.checks.filter((check) => check.status === "risk").length} öncelikli</span>
              </div>
            </div>
            <div className="audit-hero-action">
              <button className="quiet-button" onClick={onRun} disabled={busy}>
                {busy ? <><LoaderCircle size={15} className="spin" /> Yenileniyor</> : <><Radar size={15} /> Denetimi yenile</>}
              </button>
              <div className="audit-export-actions">
                <button className="text-button" onClick={() => downloadReport("sarif")}><Download size={13} /> SARIF</button>
                <button className="text-button" onClick={() => downloadReport("markdown")}><Download size={13} /> Markdown</button>
                <button className="text-button" onClick={() => downloadReport("json")}><Download size={13} /> JSON</button>
                <button className="text-button" onClick={() => downloadReport("ci-template")}><Download size={13} /> CI şablonu</button>
              </div>
              <small>Yerel bulgular · dış aktarım için kullanıcı eylemi</small>
            </div>
          </section>
          <div className="audit-notice">
            <ShieldCheck size={16} />
            <span><strong>Bu bir güvenlik sertifikası değildir.</strong> Statik işaretler doğrulanması gereken ipuçlarıdır. Paket güncelliği ve OSV sonuçları için canlı araştırma ayrıca onaylanır.</span>
            <button className="text-button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>Yöntemi gör <ArrowDownRight size={13} /></button>
          </div>
          {project.proactiveDiff && (
            <div className={"audit-diff " + (project.proactiveDiff.scoreDelta < 0 ? "is-worse" : "is-better")}>
              <strong>Baseline farkı</strong>
              <span>Skor {project.proactiveDiff.scoreDelta >= 0 ? "+" : ""}{project.proactiveDiff.scoreDelta} puan değişti.</span>
              {project.proactiveDiff.regressed.length > 0 && <span>{project.proactiveDiff.regressed.length} regresyon</span>}
              {project.proactiveDiff.improved.length > 0 && <span>{project.proactiveDiff.improved.length} iyileşme</span>}
            </div>
          )}
          <div className="audit-data-strip">
            <div>
              <span className="panel-overline">SBOM</span>
              <strong>{(project.localReport.sbom ?? []).length} doğrudan bileşen</strong>
              <small>OSV sorgusu için {(project.localReport.sbom ?? []).filter((item) => item.osvQueryReady).length} sürüm hazır</small>
            </div>
            <div>
              <span className="panel-overline">ÇIKTI</span>
              <strong>SARIF · JSON · Markdown</strong>
              <small>Kanıtlar maskelenmiş olarak dışa aktarılır</small>
            </div>
            <div>
              <span className="panel-overline">SINIR</span>
              <strong>Çalıştırmadan inceleme</strong>
              <small>Dinamik sonuçlar iddia edilmez</small>
            </div>
          </div>
          <section className="audit-grid">
            {audit.checks.map((check) => (
              <article className={"audit-card audit-" + check.status} key={check.id}>
                <div className="audit-card-top">
                  <span className="audit-category">{check.category}</span>
                  <span className={"audit-status status-" + check.status}>{statusIcon(check.status)} {statusLabel(check.status)}</span>
                </div>
                <h3>{check.title}</h3>
                <p className="audit-summary">{check.summary}</p>
                <p className="audit-why"><strong>Neden önemli:</strong> {check.why}</p>
                {check.evidence.length ? (
                  <div className="audit-evidence">
                    <span>KANIT</span>
                    {check.evidence.map((item) => <code key={item}>{item}</code>)}
                  </div>
                ) : (
                  <div className="audit-no-evidence">Arşivde bu kontrolü destekleyen dosya izi bulunmadı.</div>
                )}
                <div className="audit-next">
                  <span>SONRAKİ ADIM</span>
                  <p>{check.nextStep}</p>
                </div>
                <div className="audit-basis">Dayanak: {check.basis}</div>
              </article>
            ))}
          </section>
          <section className="audit-method panel">
            <div>
              <span className="panel-overline">KAPSAM VE SINIR</span>
              <h2>ULAK’ın proaktif bakışı</h2>
              <p>Kontroller, arşiv envanteri ve seçilmiş metin dosyalarındaki güvenli örüntülerle sınırlıdır. OpenSSF Scorecard, SLSA ve OWASP ASVS gibi çerçevelerden ilham alır; bu standartların tam tarayıcısı olduğunu iddia etmez.</p>
            </div>
            <div className="audit-method-badges">
              <span>Statik</span><span>Kanıtlı</span><span>Onay kontrollü</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const BINARY_EXTENSIONS = [
  ".exe", ".dll", ".sys", ".so", ".dylib", ".bin", ".elf", ".ko", ".o", ".obj", ".a", ".lib",
  ".node", ".wasm", ".class", ".jar", ".dex", ".apk", ".pyc", ".pyd", ".dmp", ".efi", ".out",
];

function isBinaryPath(filePath: string) {
  const lower = filePath.toLowerCase();
  return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** objdump/rizin çıktısından gösterilebilir üç gerçeği çıkarır; uydurma metrik üretmez. */
function summarizeAnalysis(text: string) {
  const format = /file format (\S+)/i.exec(text)?.[1] ?? "bilinmiyor";
  const architecture = /architecture:\s*([^,\n]+)/i.exec(text)?.[1]?.trim() ?? "bilinmiyor";
  const importSection = text.split("--- RIZIN (ii) ---")[1] ?? "";
  const imports = importSection
    .split("\n")
    .filter((line) => /^\s*\d+\s+0x[0-9a-f]+/i.test(line)).length;
  return { format, architecture, imports: imports ? String(imports) : "0" };
}

function ReverseEngineeringDesk({ project, busy, onAnalyze, onReconstruct, reconstructing, modelReady }: { project: Project; busy: boolean; onAnalyze: (path: string) => Promise<string>; onReconstruct: (useAi: boolean) => void; reconstructing: boolean; modelReady: boolean }) {
  const [analysis, setAnalysis] = useState<{ path: string; result: string } | null>(null);
  const [manualPath, setManualPath] = useState("");

  const handleAnalyze = async (path: string) => {
    try {
      const result = await onAnalyze(path);
      setAnalysis({ path, result });
    } catch (e) {
      // Handled in runDeepAnalyze toast
    }
  };

  const binaries = project.manifest.filter((entry) => isBinaryPath(entry.path));
  const sourceOnly = binaries.length === 0;
  const analysisFacts = analysis ? summarizeAnalysis(analysis.result) : { format: "—", architecture: "—", imports: "—" };
  const plan = project.reconstruction;

  return (
    <div className="page-content">
      <PageIntro eyebrow="İŞLEYİŞ TETKİKİ" title="İşleyiş tetkiki: kodu oku, kendin nasıl yapacağını gör." copy="ULAK projeyi katmanlarına ayırır, kanıt gösterir ve sıfırdan kendin yazsan hangi sırayla ilerleyeceğini adım adım anlatır. Derlenmiş dosyalar için KodMercek motoru ayrıca devreye girer." />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">YENİDEN İNŞA PLANI</span>
            <h2>Bu projeyi kendim nasıl yazarım?</h2>
          </div>
          <div className="reconstruct-actions">
            <button className="primary-button small" onClick={() => onReconstruct(false)} disabled={reconstructing}>
              <span>{reconstructing ? "Plan üretiliyor..." : plan ? "Planı yenile" : "Planı üret"}</span>
              <ArrowRight size={14} />
            </button>
            <button className="quiet-button" onClick={() => onReconstruct(true)} disabled={reconstructing || !modelReady} title={modelReady ? "Seçili modelle zenginleştir" : "Önce bir AI modeli seçin"}>
              <Sparkles size={14} /> AI ile derinleştir
            </button>
          </div>
        </div>
        <p className="panel-note">
          Plan statik okumaya dayanır: kod çalıştırılmaz, hiçbir dosya dışarı gönderilmez. AI ile derinleştirme yalnızca
          açık onayla ve seçtiğiniz modelle yapılır.
        </p>

        {plan ? (
          <div className="reconstruct-body">
            <div className="reconstruct-summary">
              <p>{plan.summary}</p>
              <div className="reconstruct-facts">
                <div><span>Hedef</span><strong>{plan.target.name}</strong></div>
                <div><span>Okunan dosya</span><strong>{plan.target.analyzedFiles} / {plan.target.fileCount}</strong></div>
                <div><span>Yığın</span><strong>{plan.target.stack.join(", ") || "belirlenemedi"}</strong></div>
                <div><span>Üretim</span><strong>{new Date(plan.generatedAt).toLocaleString("tr-TR")}</strong></div>
              </div>
            </div>

            <div className="reconstruct-grid">
              <div className="reconstruct-column">
                <h3 className="reconstruct-heading">Katmanlar ve bileşenler</h3>
                {plan.layers.map((layer) => (
                  <article className="layer-card" key={layer.id}>
                    <div className="layer-head">
                      <strong>{layer.name}</strong>
                      <span>{layer.components.reduce((total, item) => total + item.files, 0)} dosya</span>
                    </div>
                    <p>{layer.purpose}</p>
                    <ul className="layer-components">
                      {layer.components.map((component) => (
                        <li key={component.name}>
                          <div>
                            <code>{component.name}</code>
                            <small>{component.role} · {component.files} dosya</small>
                          </div>
                          <div className="layer-samples">
                            {component.sample.map((file) => <span key={file}>{file}</span>)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              <div className="reconstruct-column">
                <h3 className="reconstruct-heading">Sıfırdan inşa sırası</h3>
                <ol className="build-steps">
                  {plan.steps.map((step) => (
                    <li key={step.order}>
                      <div className="build-step-index">{String(step.order).padStart(2, "0")}</div>
                      <div className="build-step-main">
                        <h4>{step.title}</h4>
                        <p>{step.detail}</p>
                        {step.outputs.length > 0 && (
                          <div className="build-step-outputs">
                            {step.outputs.map((output) => <span key={output}>{output}</span>)}
                          </div>
                        )}
                        <div className="build-step-meta">
                          {step.verify && <div><span>DOĞRULAMA</span><p>{step.verify}</p></div>}
                          {step.risk && <div><span>RİSK</span><p>{step.risk}</p></div>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {plan.alternatives.length > 0 && (
              <div className="reconstruct-section">
                <h3 className="reconstruct-heading">Daha güvenli yollar</h3>
                <div className="alternative-grid">
                  {plan.alternatives.map((item) => (
                    <article className="alternative-card" key={item.topic}>
                      <div className="alternative-head">
                        <strong>{item.topic}</strong>
                        <span className={"effort-chip effort-" + item.effort}>{item.effort === "low" ? "düşük efor" : item.effort === "high" ? "yüksek efor" : "orta efor"}</span>
                      </div>
                      <p className="alternative-observed"><span>GÖZLENEN</span>{item.observed}</p>
                      <p className="alternative-safer"><span>ÖNERİ</span>{item.safer}</p>
                      <p className="alternative-why"><span>NEDEN</span>{item.why}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {plan.dataFlow.length > 0 && (
              <div className="reconstruct-section">
                <h3 className="reconstruct-heading">Veri akışı</h3>
                <div className="flow-list">
                  {plan.dataFlow.slice(0, 24).map((edge, index) => (
                    <div className="flow-row" key={index + "-" + edge.from + "-" + edge.to}>
                      <code>{edge.from}</code>
                      <span className="flow-arrow">→</span>
                      <code>{edge.to}</code>
                      <span className="flow-type">{edge.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="reconstruct-grid">
              <div className="reconstruct-column">
                <h3 className="reconstruct-heading">Sınırlar ve bilinmeyenler</h3>
                <ul className="plain-list">
                  {plan.unknowns.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="reconstruct-column">
                <h3 className="reconstruct-heading">Güvenli çalışma kuralları</h3>
                <ul className="plain-list">
                  {plan.guardrails.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-inline">
            <Sparkles size={18} />
            <span>
              Henüz plan üretilmedi. <strong>Planı üret</strong> düğmesi projeyi katmanlarına ayırır, inşa sırasını ve
              daha güvenli alternatifleri çıkarır. Model seçtiyseniz <strong>AI ile derinleştir</strong> aynı iskeleti
              modele yorumlatır.
            </span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">HEDEF BELİRLE</span>
            <h2>Saptanmış binary dosyaları</h2>
          </div>
          <span className="subtle-chip">{binaries.length} aday</span>
        </div>
        {binaries.length ? (
          <div className="binary-list">
            {binaries.map((bin) => (
              <div key={bin.path} className="binary-row">
                <div className="binary-info">
                  <div className="binary-icon"><Cpu size={16} /></div>
                  <div>
                    <strong>{bin.path}</strong>
                    <small>{formatBytes(bin.bytes)} · İkilik hedef</small>
                  </div>
                </div>
                <button className="primary-button small" onClick={() => handleAnalyze(bin.path)} disabled={busy}>
                  <span>{busy ? "Analiz ediliyor..." : "Derin Analiz Et"}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            <FileArchive size={18} />
            <span>
              Bu proje <strong>yalnızca kaynak kodu</strong> içeriyor: {project.manifest.length} dosyanın hiçbiri
              derlenmiş ikilik dosya değil (.exe, .dll, .so, .node, .wasm vb.). Derin analiz yalnızca derlenmiş
              hedeflerde çalışır; kaynak düzeyindeki inceleme için yukarıdaki yeniden inşa planı yeterlidir.
            </span>
          </div>
        )}
        <div className="manual-target">
          <label className="model-select-label">
            ELLE HEDEF YOLU
            <input
              type="text"
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
              placeholder="ör. dist/app.exe veya build/module.node"
              spellCheck={false}
            />
          </label>
          <button
            className="quiet-button"
            onClick={() => handleAnalyze(manualPath.trim())}
            disabled={busy || !manualPath.trim()}
          >
            <Cpu size={14} /> Yolu analiz et
          </button>
        </div>
        {sourceOnly && (
          <p className="panel-note">
            Kaynak düzeyinde yapısal inceleme için yukarıdaki yeniden inşa planını kullanın; derlenmiş dosya gerektirmez.
          </p>
        )}
      </section>
      {analysis && (
        <section className="panel reverse-result-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">ANALİZ SONUCU</span>
              <h2>Detaylı İnceleme: {analysis.path}</h2>
            </div>
            <button className="text-button" onClick={() => setAnalysis(null)}>
              Kapat <X size={13} />
            </button>
          </div>
          <div className="reverse-output-wrap">
            <div className="reverse-header">
              <div className="rev-metric"><span>Dosya biçimi</span><strong>{analysisFacts.format}</strong></div>
              <div className="rev-metric"><span>Mimari</span><strong>{analysisFacts.architecture}</strong></div>
              <div className="rev-metric"><span>İçe aktarılan sembol</span><strong>{analysisFacts.imports}</strong></div>
            </div>
            <div className="reverse-content">
              <pre>{analysis.result}</pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Roadmap({ project, onRunAI, evrenStatus, onOpenEvren }: { project: Project; onRunAI: () => void; evrenStatus: EvrenKeyStatus | null; onOpenEvren: () => void }) {
  const steps = project.aiReport?.roadmap ?? [];
  const hasReport = Boolean(project.aiReport);
  const keyReady = Boolean(evrenStatus?.configured);
  return (
    <div className="page-content">
      <PageIntro eyebrow="ÖNERİLEN SIRALAMA" title="Bulgudan, uygulanabilir adıma." copy="Öneriler kanıt ve beklenen etkiye dayanmalı. AI raporu yoksa önce derin analizi başlatın; canlı araştırmayı tamamladıysanız kaynaklarını da karar verirken kullanın." />
      {steps.length ? (
        <div className="roadmap-list">
          {steps.map((step, index) => (
            <article className="roadmap-card" key={step.id}>
              <div className="roadmap-index">{String(index + 1).padStart(2, "0")}<span></span></div>
              <div className="roadmap-card-main">
                <div className="roadmap-meta">
                  <span>{step.area}</span>
                  <span className={"severity-text severity-text-" + step.severity}>{severityLabel(step.severity)} öncelik</span>
                </div>
                <h2>{step.title}</h2>
                <p>{step.detail}</p>
                {step.steps.length > 0 && (
                  <ol className="roadmap-steps">
                    {step.steps.map((item, i) => <li key={i + "-" + item}>{item}</li>)}
                  </ol>
                )}
                {step.evidence.length > 0 && (
                  <div className="evidence-list">
                    <span>KANIT</span>
                    {step.evidence.map((item) => <code key={item}>{item}</code>)}
                  </div>
                )}
                <div className="roadmap-side">
                  <span className="impact-mark"><ArrowDownRight size={15} /></span>
                  <span>ETKİ</span>
                  <strong>{step.impact || "İncelenmeli"}</strong>
                  <small>Efor: {step.effort || "belirtilmemiş"}</small>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="roadmap-empty">
          <div className="roadmap-empty-mark"><Layers3 size={22} /></div>
          <h2>{hasReport ? "Bu raporda yol haritası adımı yok." : "Bu proje için henüz AI analizi çalıştırılmadı."}</h2>
          <p>
            {hasReport
              ? "AI raporu üretildi ancak kanıtı yeterli bulunan bir sıralama adımı dönmedi. Bulgular sekmesinden analizi yeni bir modelle tekrar çalıştırabilirsiniz."
              : keyReady
                ? "EVREN anahtarınız hazır. Bulgular sekmesinde bir model seçip onay verdiğinizde yol haritası bu proje için üretilir."
                : "Yol haritası AI analizinden üretilir. Önce EVREN anahtarını ekleyin, ardından Bulgular sekmesinde analizi onaylayın."}
          </p>
          {keyReady ? (
            <button className="primary-button" onClick={onRunAI}><Sparkles size={16} /> Bulgular sekmesinde analizi başlat</button>
          ) : (
            <button className="primary-button" onClick={onOpenEvren}><KeyRound size={16} /> EVREN anahtarı ekle</button>
          )}
        </div>
      )}
    </div>
  );
}

function Conversation({ project, messages, question, setQuestion, onSend, busy, consent, setConsent, selectedModel, modelInfo }: { project: Project; messages: ChatMessage[]; question: string; setQuestion: (value: string) => void; onSend: (event: FormEvent) => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void; selectedModel: string; modelInfo: ModelChoice | null }) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);
  if (!project.aiReport) return (
    <div className="page-content">
      <PageIntro eyebrow="TAKİP SOHBETİ" title="Rapora soru sor." copy="ULAK kayıtlı analiz özetini kullanır; ham arşiv içeriği takip sorusuna eklenmez." />
      <div className="roadmap-empty">
        <div className="roadmap-empty-mark"><MessageSquare size={22} /></div>
        <h2>Önce AI raporu gerekli.</h2>
        <p>Rapor hazır olduktan sonra bulgulara ve önerilere ilişkin takip soruları sorabilirsin.</p>
        <button className="primary-button" onClick={() => document.querySelector<HTMLButtonElement>("[data-tab='findings']")?.click()}><Sparkles size={16} /> Bulgulara git</button>
      </div>
    </div>
  );
  return (
    <div className="page-content">
      <PageIntro eyebrow="RAPOR HAKKINDA" title="Takıldığın yeri sor." copy="Yanıtlar kayıtlı rapor özetine dayanır. Her soru, sen onayladığında seçili modele iletilir." />
      <section className="chat-shell">
        <div className="chat-topline">
          <span className="chat-ai-icon"><Sparkles size={15} /></span>
          <div><strong>ULAK yardımcı</strong><small>{project.name} rapor bağlamı · {modelInfo?.name ?? selectedModel}</small></div>
          <span className="chat-cost">{modelInfo?.cost ?? "belirsiz"} maliyet</span>
        </div>
        <div className="chat-history">
          {messages.length ? messages.map((message, index) => (
            <div className={"chat-message " + message.role} key={message.role + "-" + index}>
              <span className="message-avatar">{message.role === "assistant" ? <img src="/logo-mark.png" alt="" /> : "S"}</span>
              <div><span className="message-role">{message.role === "assistant" ? "ULAK" : "SEN"}</span><p>{message.content}</p></div>
            </div>
          )) : (
            <div className="chat-welcome">
              <div className="chat-welcome-mark"><MessageSquare size={18} /></div>
              <strong>Raporun hakkında merak ettiğini sor.</strong>
              <p>Örnek: “Bu önerinin hangi dosyayla ilişkisi var?”</p>
              <div className="suggestion-chips">
                {["En önemli risk hangisi?", "İlk önce neyi düzeltmeliyim?"].map((item) => (
                  <button key={item} onClick={() => setQuestion(item)}>{item} <ArrowRight size={12} /></button>
                ))}
              </div>
            </div>
          )}
          {busy && <div className="chat-thinking"><LoaderCircle size={15} className="spin" /> Rapor bağlamı yanıtlanıyor…</div>}
          <div ref={chatEndRef} />
        </div>
        <form className="chat-compose" onSubmit={onSend}>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Rapor hakkında bir soru yaz…" maxLength={2000} rows={2} />
          <div className="chat-compose-bottom">
            <label className="consent-checkbox">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Bu soruyu seçili AI modeline göndermeyi onaylıyorum.</span>
            </label>
            <button className="send-button" type="submit" disabled={!question.trim() || !consent || busy || !selectedModel} aria-label="Soruyu gönder"><Send size={16} /></button>
          </div>
        </form>
        <div className="chat-retention">
          <LockKeyhole size={12} /> Sorular ve yanıtlar gizlidir, yalnızca mevcut oturumda korunur.
        </div>
      </section>
    </div>
  );
}

function Privacy({ project }: { project: Project | null }) {
  return (
    <div className="page-content">
      <PageIntro eyebrow="VERİ VE GÜVEN SINIRI" title="ULAK ne yapar. Ne yapmaz." copy="Gizlilik varsayılanları, dış hizmete giden her adımın önünde açık bir onay kapısı bırakır." />
      <div className="privacy-grid">
        <section className="panel privacy-flow-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">VERİ AKIŞI</span>
              <h2>Üç ayrı durak</h2>
            </div>
            <LockKeyhole size={18} className="muted-icon" />
          </div>
          <div className="privacy-flow">
            <div className="flow-stage">
              <span className="flow-number">01</span>
              <span className="flow-icon local"><FileCode2 size={16} /></span>
              <div><strong>Arşiv yükleme</strong><p>Arşiv ULAK sunucusu ve yönetilen nesne deposunda saklanır. Kaynak dış hizmete otomatik gönderilmez.</p></div>
              <span className="flow-status active">YÜKLEMEDE</span>
            </div>
            <div className="flow-connector"><i /></div>
            <div className="flow-stage">
              <span className="flow-number">02</span>
              <span className="flow-icon ai"><Sparkles size={16} /></span>
              <div><strong>AI analizi</strong><p>Kullan kullanıcı seçilen modeli ve onay kutusunu doğrulayınca, sınırlı/maskelenmiş dosya bağlamı platform AI servisine gönderilir.</p></div>
              <span className={"flow-status " + (project?.aiConsentAt ? "complete" : "locked")}>{project?.aiConsentAt ? "KULLANILDI" : "KAPALI"}</span>
            </div>
            <div className="flow-connector"><i /></div>
            <div className="flow-stage">
              <span className="flow-number">03</span>
              <span className="flow-icon web"><Globe2 size={16} /></span>
              <div><strong>Canlı araştırma</strong><p>Onaylanan sorgular, paket adları ve sürümleri herkese açık API’lere gider. Kodun tamamı arama sağlayıcısına gönderilmez.</p></div>
              <span className={"flow-status " + (project?.researchConsentAt ? "complete" : "locked")}>{project?.researchConsentAt ? "KULLANILDI" : "KAPALI"}</span>
            </div>
          </div>
        </section>
        <div className="privacy-side">
          <section className="privacy-principle">
            <span><ShieldCheck size={17} /></span>
            <div><strong>Kod çalıştırılmaz</strong><p>Yüklenen arşivden hiçbir binary/script yürütülmez. Yalnız dosya envanteri ve statik metin taraması yapılır.</p></div>
          </section>
          <section className="privacy-principle">
            <span><Database size={17} /></span>
            <div><strong>Projeler oturuma bağlı</strong><p>Uygulama rastgele tarayıcı oturumuyla kayıt sahipliğini ayırır. Bu sürüm giriş/kimlik doğrulama içermez; linki başkalarıyla paylaşmayın.</p></div>
          </section>
          <section className="privacy-principle warning">
            <span><TriangleAlert size={17} /></span>
            <div><strong>Silme konusunda sınır</strong><p>Proje kaydını kaldırmak arşivi listeden saklar; platform runtime storage fiziksel silme sunmadığı için saklanan nesne kalır.</p></div>
          </section>
          <div className="privacy-status-list">
            <div><span>Site analitiği</span><strong><Check size={13} /> Kapalı</strong></div>
            <div><span>Platform badge script’i</span><strong><Check size={13} /> Kapalı</strong></div>
            <div><span>LLM / web isteği</span><strong><LockKeyhole size={13} /> Onay gerekli</strong></div>
          </div>
        </div>
        <div className="privacy-footer-note">
          <ShieldCheck size={15} />
          <span>Özel ULAK Preview alanı için tasarlanmıştır. Çok kullanıcılı yayıma geçmeden önce gerçek kimlik doğrulama, erişim rolleri, kullanıcıya özel arşiv silme ve saklama süresi eklenmelidir.</span>
        </div>
      </div>
    </div>
  );
}

function HowItWorks({ project, evrenStatus, onGo, onUpload }: { project: Project | null; evrenStatus: EvrenKeyStatus; onGo: (tab: Tab) => void; onUpload: () => void }) {
  if (!project) {
    return (
      <div className="how-body">
        <div className="eyebrow"><span className="signal-line" /> ULAK NEDİR, NASIL KULLANILIR</div>
        <h2 id="how-title">Tanımadığın bir kod tabanını <em>yarım saatte</em> anla.</h2>
        <p className="modal-description">
          ULAK, elindeki yazılım projesini (zip/tar arşivi ya da GitHub deposu) alır ve onu okunabilir bir haritaya çevirir:
          ne işe yaradığı, hangi teknolojilerle yazıldığı, hangi modüllerden oluştuğu, nereden başlayacağın ve nerede risk olduğu.
          Projen olmasa da kullanabilirsin — tek ihtiyacın bir arşiv dosyası veya herkese açık bir depo adresi.
        </p>

        <section className="how-section">
          <h3>Neler yapabilirsin?</h3>
          <div className="how-cards">
            <div><strong>Proje haritası</strong><small>Dosya ağacı, dil dağılımı, bağımlılıklar, modüller ve giriş noktaları tek ekranda.</small></div>
            <div><strong>Bulgular</strong><small>Gizli dosya, yetki yüzeyi ve mahremiyet sinyalleri kanıt satırıyla işaretlenir.</small></div>
            <div><strong>AI sentezi</strong><small>İzin verirsen EVREN modeli projenin amacını ve mimarisini düz dille anlatır.</small></div>
            <div><strong>Canlı araştırma</strong><small>Bağımlılıkların güncel sürümleri ve bilinen açıkları kaynak bağlantısıyla gelir.</small></div>
            <div><strong>Yol haritası</strong><small>Yapılacaklar etki/efor sırasına girer; hangi işin önce geldiği belli olur.</small></div>
            <div><strong>Döküm raporu</strong><small>Tüm ekranların özeti tek Markdown dosyası olarak indirilir.</small></div>
          </div>
        </section>

        <section className="how-section">
          <h3>Neden ULAK?</h3>
          <ul className="how-why">
            <li><strong>Devraldığın projeyi tanı.</strong> Yorumu olmayan, sahibi ayrılmış bir kod tabanında nereden başlayacağını gösterir.</li>
            <li><strong>Yeni işe alımda zaman kazan.</strong> Haftalarca süren keşfi ilk güne indirir.</li>
            <li><strong>Teslim öncesi kontrol.</strong> Sızabilecek dosya, açık bağımlılık ve eksik yetki kontrolünü görünür kılar.</li>
          </ul>
        </section>

        <section className="how-section">
          <h3>Dört adımda akış</h3>
          <ol className="how-steps">
            <li><span>01</span><div><strong>Yerel haritalama</strong><small>Arşiv açılır; dosya ağacı, dil dağılımı, bağımlılıklar, giriş noktaları ve modüller çıkarılır. Kod çalıştırılmaz.</small></div></li>
            <li><span>02</span><div><strong>Statik bulgular</strong><small>Yerel kurallar gizli dosya, yetki yüzeyi ve mahremiyet sinyallerini işaretler. Bunlar doğrulanması gereken ipuçlarıdır.</small></div></li>
            <li><span>03</span><div><strong>İzinli derinleşme</strong><small>EVREN modeliyle AI sentezi ve canlı kaynak araştırması yalnızca sen başlattığında çalışır.</small></div></li>
            <li><span>04</span><div><strong>Yol haritası ve döküm</strong><small>Bulgular etki/efor sırasına girer; tüm ekranların özeti tek bir Markdown dökümünde toplanır.</small></div></li>
          </ol>
        </section>

        <section className="how-section">
          <h3>Mahremiyet sözü</h3>
          <div className="how-chips">
            <span className="how-chip">Kodun çalıştırılmaz</span>
            <span className="how-chip">AI ve araştırma kapalı başlar</span>
            <span className="how-chip">Sırlar maskelenir</span>
            <span className="how-chip">Gönderilen kaynaklar ekranda görünür</span>
            <span className="how-chip">Anahtar diske şifreli yazılır</span>
          </div>
        </section>

        <p className="how-note">Başlamak için: <strong>Proje arşivi yükle</strong> → arşivi seç → yerel harita hazır olduğunda istersen AI sentezini başlat. Hiçbir adım otomatik dışarıya veri göndermez.</p>

        <div className="how-actions">
          <button className="primary-button" onClick={onUpload}><CloudUpload size={16} /> Proje arşivi yükle</button>
        </div>
      </div>
    );
  }

  const local = project.localReport;
  const ai = project.aiReport;
  const audit = project.proactiveAudit;
  const localFindings = local.findings.length;
  const aiFindings = ai?.findings.length ?? 0;
  const roadmap = ai?.roadmap.length ?? 0;
  const topModules = [...local.modules].sort((a, b) => b.files - a.files).slice(0, 5);
  const stack = local.stack.slice(0, 6);

  return (
    <div className="how-body">
      <div className="eyebrow"><span className="signal-line" /> PROJE SUNUMU</div>
      <h2 id="how-title">{project.name}<span className="heading-period">.</span></h2>
      <p className="modal-description">{local.projectPurpose || local.summary}</p>

      <section className="how-section">
        <h3>Bu projede ne yapabilirsin?</h3>
        <div className="how-chips">
          <span className="how-chip">Haritayı gez</span>
          <span className="how-chip">Bulguları incele</span>
          <span className="how-chip">AI sentezini başlat</span>
          <span className="how-chip">Güncel kaynakları araştır</span>
          <span className="how-chip">Yol haritasını oku</span>
          <span className="how-chip">Döküm raporunu indir</span>
        </div>
      </section>

      <div className="how-facts">
        <div><span>Dosya</span><strong>{local.fileCount}</strong></div>
        <div><span>İncelenen</span><strong>{local.analyzedFiles}</strong></div>
        <div><span>Yerel bulgu</span><strong>{localFindings}</strong></div>
        <div><span>AI bulgusu</span><strong>{aiFindings}</strong></div>
        <div><span>Yol adımı</span><strong>{roadmap}</strong></div>
        <div><span>Denetim</span><strong>{audit ? `${audit.score} · ${audit.grade}` : "—"}</strong></div>
      </div>

      <section className="how-section">
        <h3>Teknoloji</h3>
        {stack.length ? <div className="how-chips">{stack.map((item) => <span key={item.name} className="how-chip">{item.name}<i>{item.confidence === "high" ? "kesin" : "olası"}</i></span>)}</div> : <p className="how-empty">Dil tespiti sınırlı kaldı.</p>}
      </section>

      <section className="how-section">
        <h3>Modül haritası</h3>
        {topModules.length ? (
          <ul className="how-modules">
            {topModules.map((module) => <li key={module.name}><span>{module.name}</span><i style={{ width: `${Math.max(6, Math.round((module.files / topModules[0].files) * 100))}%` }} /><strong>{module.files}</strong></li>)}
          </ul>
        ) : <p className="how-empty">Modül çıkarılamadı.</p>}
      </section>

      <section className="how-section">
        <h3>Giriş noktaları</h3>
        {local.entryPoints.length ? <div className="how-chips">{local.entryPoints.slice(0, 6).map((entry) => <span key={entry} className="how-chip mono">{entry}</span>)}</div> : <p className="how-empty">Belirgin bir giriş noktası bulunamadı.</p>}
      </section>

      <section className="how-section">
        <h3>Durum</h3>
        <ul className="how-status">
          <li><span>Yerel analiz</span><strong className="ok"><Check size={13} /> tamamlandı</strong></li>
          <li><span>AI sentezi</span><strong className={ai ? "ok" : "off"}>{ai ? <><Check size={13} /> {ai.model}</> : "başlatılmadı"}</strong></li>
          <li><span>Canlı araştırma</span><strong className={project.research?.sources.length ? "ok" : "off"}>{project.research?.sources.length ? <><Check size={13} /> {project.research.sources.length} kaynak</> : "başlatılmadı"}</strong></li>
          <li><span>Proaktif denetim</span><strong className={audit ? "ok" : "off"}>{audit ? <><Check size={13} /> {audit.checks.length} kontrol</> : "çalıştırılmadı"}</strong></li>
          <li><span>EVREN anahtarı</span><strong className={evrenStatus.configured ? "ok" : "off"}>{evrenStatus.configured ? <><Check size={13} /> tanımlı</> : "tanımlı değil"}</strong></li>
        </ul>
      </section>

      <div className="how-actions">
        <button className="primary-button" onClick={() => onGo("overview")}><Activity size={16} /> Genel bakışa git</button>
        <button className="quiet-button" onClick={() => onGo("findings")}><ShieldAlert size={15} /> Bulguları gör</button>
        <button className="quiet-button" onClick={() => onGo("roadmap")}><Layers3 size={15} /> Yol haritası</button>
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="page-intro">
      <div className="eyebrow"><span className="signal-line" /> {eyebrow}</div>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}
