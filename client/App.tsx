import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowRight, CloudUpload, FileArchive, Github, Globe2, LockKeyhole, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import { api } from "./api";
import type { ChatMessage, ModelChoice, Project } from "./types";
import { navigation, type Tab } from "./navigation";
import { buildQueries, formatDate } from "./lib/format";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { UploadModal } from "./components/UploadModal";
import { Overview } from "./views/Overview";
import { Architecture } from "./views/Architecture";
import { Findings } from "./views/Findings";
import { ProactivePanel } from "./views/ProactivePanel";
import { ResearchPanel } from "./views/ResearchPanel";
import { Roadmap } from "./views/Roadmap";
import { Conversation } from "./views/Conversation";
import { Privacy } from "./views/Privacy";

type BusyState = "upload" | "ai" | "research" | "audit" | "chat" | "delete" | "";

const PREFERRED_MODEL = /glm-5\.3|qwen3\.8|gemma-4/i;

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState("");
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [booting, setBooting] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState<BusyState>("");
  const [toast, setToast] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [queries, setQueries] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = projects.find((item) => item.id === activeId) ?? null;
  const localReport = project?.localReport ?? null;
  const selectedModelInfo = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? null,
    [models, selectedModel],
  );

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.listProjects(), api.getModels()]).then(([projectResult, modelResult]) => {
      if (!mounted) return;
      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value.projects);
        if (projectResult.value.projects.length) setActiveId(projectResult.value.projects[0].id);
      } else {
        setLoadError(
          projectResult.reason instanceof Error ? projectResult.reason.message : "ULAK servisine bağlanılamadı.",
        );
      }
      if (modelResult.status === "fulfilled") {
        const available = modelResult.value.models;
        setModels(available);
        const preferred = available.find((model) => PREFERRED_MODEL.test(model.id)) ?? available[0];
        if (preferred) setSelectedModel(preferred.id);
      }
      setBooting(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
  }, [activeId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function upsertProject(next: Project) {
    setProjects((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    setActiveId(next.id);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const candidate = event.dataTransfer.files?.[0];
    if (candidate) chooseFile(candidate);
  }

  function chooseFile(file: File) {
    if (!/\.(7z|zip|tar|tgz|tar\.gz)$/i.test(file.name)) {
      setToast(".7z, .zip, .tar veya .tar.gz arşivi seçin.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setToast("Arşiv boyutu 25 MB sınırını aşıyor.");
      return;
    }
    setUploadFile(file);
    setRepoUrl("");
    if (!projectName) {
      setProjectName(file.name.replace(/\.(tar\.gz|7z|zip|tgz)$/i, "").replace(/[._-]+/g, " "));
    }
  }

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile && !repoUrl.trim()) {
      setToast("Devam etmek için arşiv seçin veya herkese açık depo bağlantısı yazın.");
      return;
    }
    setBusy("upload");
    setLoadError("");
    try {
      const form = new FormData();
      if (uploadFile) form.set("archive", uploadFile);
      if (repoUrl.trim()) form.set("sourceUrl", repoUrl.trim());
      if (projectName.trim()) form.set("projectName", projectName.trim());
      const result = await api.createProject(form);
      upsertProject(result.project);
      setUploadFile(null);
      setRepoUrl("");
      setProjectName("");
      setUploadOpen(false);
      setTab("overview");
      setToast("Proje yerel olarak haritalandı. AI ve canlı araştırma ayrı onay bekliyor.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Proje incelenemedi.");
    } finally {
      setBusy("");
    }
  }

  async function runAI() {
    if (!project || !selectedModel || !aiConsent) return;
    setBusy("ai");
    try {
      const result = await api.analyzeWithAI(project.id, selectedModel);
      upsertProject({ ...project, aiReport: result.aiReport, aiConsentAt: new Date().toISOString() });
      setAiConsent(false);
      setTab("findings");
      setToast("AI raporu hazır. Kaynak içerik yalnız onaylı LLM analizinde kullanıldı.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "AI analizi başarısız oldu.");
    } finally {
      setBusy("");
    }
  }

  async function runResearch() {
    if (!project || !researchConsent) return;
    const trimmed = queries.map((query) => query.trim()).filter(Boolean);
    if (!trimmed.length) {
      setToast("En az bir araştırma sorgusu girin.");
      return;
    }
    setBusy("research");
    try {
      const result = await api.runResearch(project.id, trimmed);
      upsertProject({ ...project, research: result.research, researchConsentAt: new Date().toISOString() });
      setResearchConsent(false);
      setTab("research");
      setToast(
        result.research.sources.length
          ? `${result.research.sources.length} kaynak bulundu; kısmi servis hataları varsa ayrıca gösteriliyor.`
          : "Araştırma tamamlandı; kullanılabilir kaynak bulunamadı.",
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Canlı araştırma başarısız oldu.");
    } finally {
      setBusy("");
    }
  }

  async function runAudit() {
    if (!project) return;
    setBusy("audit");
    try {
      const result = await api.runProactiveAudit(project.id);
      upsertProject({ ...project, proactiveAudit: result.proactiveAudit });
      setToast("Proaktif denetim yenilendi; yeni sinyaller ve kanıtlar hazır.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Proaktif denetim yenilenemedi.");
    } finally {
      setBusy("");
    }
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
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Yanıt alınamadı: ${error instanceof Error ? error.message : "geçici bir hata oluştu"}`,
        },
      ]);
    } finally {
      setBusy("");
    }
  }

  async function removeProject() {
    if (!project) return;
    if (!window.confirm("Bu proje kaydını ve yerel arşivini kaldırayım mı? Bu işlem geri alınamaz.")) return;
    setBusy("delete");
    try {
      const result = await api.deleteProject(project.id);
      const remaining = projects.filter((item) => item.id !== project.id);
      setProjects(remaining);
      setActiveId(remaining[0]?.id ?? "");
      setToast(result.warning);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Kayıt kaldırılamadı.");
    } finally {
      setBusy("");
    }
  }

  function setQuery(index: number, value: string) {
    setQueries((current) => current.map((query, i) => (i === index ? value : query)));
  }

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">
          <img src="/favicon.svg" alt="" />
          <span>ULAK</span>
        </div>
        <div className="boot-spinner" />
        <p>Proje alanın hazırlanıyor…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        activeId={activeId}
        tab={tab}
        onSelect={(id) => {
          setActiveId(id);
          setTab("overview");
        }}
        onNewProject={() => setUploadOpen(true)}
        onOpenPrivacy={() => setTab("privacy")}
      />

      <main className="main-shell">
        <Topbar tab={tab} onHelp={() => setTab("privacy")} />

        {loadError && (
          <div className="system-alert">
            <TriangleAlert size={17} />
            <span>{loadError} API ve veritabanı hizmetlerini kontrol edin.</span>
            <button onClick={() => window.location.reload()}>Yenile</button>
          </div>
        )}

        {!project ? (
          <section className="empty-state-wrap">
            <div className="empty-orbit">
              <div className="orbit-ring orbit-ring-one" />
              <div className="orbit-ring orbit-ring-two" />
              <div className="orbit-dot orbit-dot-one" />
              <div className="orbit-dot orbit-dot-two" />
              <div className="orbit-core">
                <img src="/favicon.svg" alt="" />
              </div>
            </div>
            <div className="empty-eyebrow">
              <span className="signal-line" /> KODU ÖNCE ANLAR. SONRA ARAŞTIRIR.
            </div>
            <h1>
              Bir projeyi <em>gerçekten</em>
              <br />
              anlamanın kısa yolu.
            </h1>
            <p className="empty-description">
              ULAK önce dosya yapısını yerel kurallarla haritalar. AI ve canlı internet araştırması, yalnızca sen açıkça
              başlattığında devreye girer.
            </p>
            <button className="primary-button empty-cta" onClick={() => setUploadOpen(true)}>
              <CloudUpload size={18} /> Proje arşivi yükle <ArrowRight size={16} />
            </button>
            <div className="empty-trust">
              <span>
                <ShieldCheck size={14} /> Kodun çalıştırılmaz
              </span>
              <span>
                <LockKeyhole size={14} /> AI aktarımı izne bağlı
              </span>
              <span>
                <Globe2 size={14} /> Kaynaklar bağlantılı
              </span>
            </div>
            <div className="empty-how">
              <div>
                <span>01</span>
                <strong>İçeriği anlar</strong>
                <small>Dosya ağacı · teknoloji · bileşenler</small>
              </div>
              <ArrowRight size={16} />
              <div>
                <span>02</span>
                <strong>İzinle derinleşir</strong>
                <small>AI sentezi · güncel kaynaklar</small>
              </div>
              <ArrowRight size={16} />
              <div>
                <span>03</span>
                <strong>Yol önerir</strong>
                <small>Kanıt · etki · uygulanabilirlik</small>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div className="heading-copy">
                <div className="eyebrow">
                  <span className="signal-line" /> PROJE İNCELEME MASASI
                </div>
                <h1>
                  {project.name}
                  <span className="heading-period">.</span>
                </h1>
                <p>
                  {project.sourceKind === "github" ? (
                    <>
                      <Github size={13} /> {project.sourceUrl}
                    </>
                  ) : (
                    <>
                      <FileArchive size={13} /> {project.sourceName}
                    </>
                  )}
                  <span className="heading-divider">·</span> Yerel envanter {formatDate(project.localReport.analyzedAt)}
                </p>
              </div>
              <div className="heading-actions">
                <button className="quiet-button" onClick={removeProject} disabled={busy === "delete"}>
                  <Trash2 size={15} /> Kaydı kaldır
                </button>
                <button className="primary-button small" onClick={() => setUploadOpen(true)}>
                  <CloudUpload size={15} /> Proje ekle
                </button>
              </div>
            </section>

            <div className="section-tabs">
              {navigation.map(({ id, label, icon: Icon }) => (
                <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                  <Icon size={15} /> {label}
                  {id === "research" && project.research?.sources?.length ? (
                    <span className="tab-count">{project.research.sources.length}</span>
                  ) : null}
                </button>
              ))}
              <button className={`privacy-tab ${tab === "privacy" ? "active" : ""}`} onClick={() => setTab("privacy")}>
                <LockKeyhole size={15} /> Gizlilik
              </button>
            </div>

            {tab === "overview" && localReport && (
              <Overview project={project} onTab={setTab} onRunResearch={() => setTab("research")} />
            )}
            {tab === "architecture" && localReport && <Architecture project={project} />}
            {tab === "findings" && localReport && (
              <Findings
                project={project}
                onRunAI={runAI}
                busy={busy === "ai"}
                consent={aiConsent}
                setConsent={setAiConsent}
                models={models}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                modelInfo={selectedModelInfo}
              />
            )}
            {tab === "proactive" && <ProactivePanel project={project} onRun={runAudit} busy={busy === "audit"} />}
            {tab === "research" && (
              <ResearchPanel
                project={project}
                queries={queries}
                setQuery={setQuery}
                onRun={runResearch}
                busy={busy === "research"}
                consent={researchConsent}
                setConsent={setResearchConsent}
              />
            )}
            {tab === "roadmap" && <Roadmap project={project} onRunAI={() => setTab("findings")} />}
            {tab === "conversation" && (
              <Conversation
                project={project}
                messages={chatMessages}
                question={question}
                setQuestion={setQuestion}
                onSend={sendQuestion}
                busy={busy === "chat"}
                consent={aiConsent}
                setConsent={setAiConsent}
                selectedModel={selectedModel}
                modelInfo={selectedModelInfo}
                onOpenFindings={() => setTab("findings")}
              />
            )}
            {tab === "privacy" && <Privacy project={project} />}
          </>
        )}
      </main>

      {uploadOpen && (
        <UploadModal
          busy={busy === "upload"}
          onClose={() => setUploadOpen(false)}
          onSubmit={submitProject}
          uploadFile={uploadFile}
          onChooseFile={chooseFile}
          onClearFile={() => setUploadFile(null)}
          repoUrl={repoUrl}
          setRepoUrl={setRepoUrl}
          projectName={projectName}
          setProjectName={setProjectName}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          onDrop={handleDrop}
          fileInputRef={fileInputRef}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          {toast}
          <button onClick={() => setToast("")} aria-label="Bildirimi kapat">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
