import { useEffect, useMemo, useRef, useState, type FormEvent, type DragEvent } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, BookOpenCheck, Boxes, Check, ChevronRight,
  CircleHelp, Clock3, CloudUpload, Code2, Database, ExternalLink, FileArchive, FileCode2,
  FileText, FolderKanban, Github, Globe2, Layers3, LoaderCircle, LockKeyhole, MessageSquare,
  Network, Radar, Search, Send, ShieldAlert, ShieldCheck, Sparkles, Trash2, TriangleAlert,
  WandSparkles, X,
} from "lucide-react";
import { api } from "./api";
import type { AiFinding, ChatMessage, ModelChoice, Project } from "./types";

type Tab = "overview" | "architecture" | "findings" | "proactive" | "research" | "roadmap" | "conversation" | "privacy";

const navigation: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Genel bakış", icon: Activity },
  { id: "architecture", label: "Proje haritası", icon: Network },
  { id: "findings", label: "Bulgular", icon: ShieldAlert },
  { id: "proactive", label: "Proaktif Denetim", icon: Radar },
  { id: "research", label: "Canlı araştırma", icon: Globe2 },
  { id: "roadmap", label: "Yol haritası", icon: Layers3 },
  { id: "conversation", label: "Takip sohbeti", icon: MessageSquare },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "henüz yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function severityLabel(value: string) {
  return value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
}

function buildQueries(project: Project) {
  const report = project.localReport;
  const stack = report.stack.slice(0, 3).map((item) => item.name);
  const deps = report.dependencies.slice(0, 3).map((item) => item.name);
  const purpose = report.projectPurpose || report.summary || "software project";
  return [...new Set([
    [...stack, "secure architecture best practices"].filter(Boolean).join(" "),
    [...deps, "maintenance alternatives"].filter(Boolean).join(" "),
    `${purpose} open source implementation patterns`,
  ].map((q) => q.replace(/[\u0000-\u001f<>"'`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)).filter((q) => q.length > 3))].slice(0, 4);
}

function sourceHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Kaynak"; }
}

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
  const [busy, setBusy] = useState<"upload" | "ai" | "research" | "audit" | "chat" | "delete" | "" >(
    "",
  );
  const [toast, setToast] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [queries, setQueries] = useState<string[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const project = projects.find((item) => item.id === activeId) ?? null;
  const localReport = project?.localReport ?? null;

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.listProjects(), api.getModels()]).then(([projectResult, modelResult]) => {
      if (!mounted) return;
      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value.projects);
        if (projectResult.value.projects.length) setActiveId(projectResult.value.projects[0].id);
      } else setLoadError(projectResult.reason instanceof Error ? projectResult.reason.message : "ULAK servisine bağlanılamadı.");
      if (modelResult.status === "fulfilled") {
        setModels(modelResult.value.models);
        const preferred = modelResult.value.models.find((model) => /gpt-6-luna/i.test(model.id)) ?? modelResult.value.models[0];
        if (preferred) setSelectedModel(preferred.id);
      }
      setBooting(false);
    });
    return () => { mounted = false; };
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages.length, busy]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedModelInfo = useMemo(() => models.find((model) => model.id === selectedModel) ?? null, [models, selectedModel]);

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
    if (!projectName) setProjectName(file.name.replace(/\.(tar\.gz|7z|zip|tgz)$/i, "").replace(/[._-]+/g, " "));
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
    } finally { setBusy(""); }
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
      setToast(result.research.sources.length ? `${result.research.sources.length} kaynak bulundu; kısmi servis hataları varsa ayrıca gösteriliyor.` : "Araştırma tamamlandı; kullanılabilir kaynak bulunamadı.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Canlı araştırma başarısız oldu."); }
    finally { setBusy(""); }
  }

  async function runAudit() {
    if (!project) return;
    setBusy("audit");
    try {
      const result = await api.runProactiveAudit(project.id);
      upsertProject({ ...project, proactiveAudit: result.proactiveAudit });
      setToast("Proaktif denetim yenilendi; yeni sinyaller ve kanıtlar hazır.");
    } catch (error) { setToast(error instanceof Error ? error.message : "Proaktif denetim yenilenemedi."); }
    finally { setBusy(""); }
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
      setChatMessages((current) => [...current, { role: "assistant", content: `Yanıt alınamadı: ${error instanceof Error ? error.message : "geçici bir hata oluştu"}` }]);
    } finally { setBusy(""); }
  }

  async function removeProject() {
    if (!project || !window.confirm("Bu proje kaydını ULAK listesinden kaldırayım mı? Nesne depolamadaki arşiv fiziksel olarak silinemez.")) return;
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

  function setQuery(index: number, value: string) {
    setQueries((current) => current.map((query, i) => i === index ? value : query));
  }

  if (booting) {
    return <div className="boot-screen"><div className="boot-mark"><img src="/favicon.svg" alt="" /><span>ULAK</span></div><div className="boot-spinner" /><p>Proje alanın hazırlanıyor…</p></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><img src="/favicon.svg" alt="" /></div>
          <div><div className="brand-name">ULAK<span>↗</span></div><div className="brand-subtitle">PROJE İSTİHBARATI</div></div>
        </div>
        <div className="workspace-label"><span>ÇALIŞMA ALANI</span><span className="live-pip" /> ÖZEL</div>
        <button className="new-project-button" onClick={() => setUploadOpen(true)}><CloudUpload size={16} /> Yeni proje ekle <span>+</span></button>
        <div className="sidebar-section-title">PROJELER <span>{projects.length.toString().padStart(2, "0")}</span></div>
        <div className="project-list">
          {projects.length ? projects.map((item) => (
            <button key={item.id} className={`project-nav-item ${activeId === item.id ? "active" : ""}`} onClick={() => { setActiveId(item.id); setTab("overview"); }}>
              <span className="project-nav-icon">{item.sourceKind === "github" ? <Github size={16} /> : <FileArchive size={16} />}</span>
              <span className="project-nav-copy"><strong>{item.name}</strong><small>{item.localReport.stack[0]?.name ?? "Proje analizi"}</small></span>
              <ChevronRight size={14} className="project-nav-chevron" />
            </button>
          )) : <div className="sidebar-empty">Henüz proje yok.<br />İlk arşivi ekleyin.</div>}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-mini"><ShieldCheck size={16} /><div><strong>Önce mahremiyet</strong><small>AI ve araştırma kapalı başlar.</small></div></div>
          <button className={`side-link ${tab === "privacy" ? "selected" : ""}`} onClick={() => setTab("privacy")}><LockKeyhole size={16} /> Veri ve gizlilik</button>
          <div className="sidebar-version"><span>ULAK / 0.1</span><span>ÖNİZLEME</span></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>ULAK</span><span className="crumb-slash">/</span><span>{tab === "overview" ? "Çalışma masası" : navigation.find((item) => item.id === tab)?.label ?? "Veri ve gizlilik"}</span></div>
          <div className="topbar-right"><span className="local-only"><span /> İŞLEMLER KONTROLLÜ</span><button className="help-button" onClick={() => setTab("privacy")}><CircleHelp size={17} /><span>Nasıl çalışır?</span></button><div className="avatar">U</div></div>
        </header>

        {loadError && <div className="system-alert"><TriangleAlert size={17} /><span>{loadError} API ve veritabanı hizmetlerini kontrol edin.</span><button onClick={() => window.location.reload()}>Yenile</button></div>}

        {!project ? (
          <section className="empty-state-wrap">
            <div className="empty-orbit"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-dot orbit-dot-one" /><div className="orbit-dot orbit-dot-two" /><div className="orbit-core"><img src="/favicon.svg" alt="" /></div></div>
            <div className="empty-eyebrow"><span className="signal-line" /> KODU ÖNCE ANLAR. SONRA ARAŞTIRIR.</div>
            <h1>Bir projeyi <em>gerçekten</em><br />anlamanın kısa yolu.</h1>
            <p className="empty-description">ULAK önce dosya yapısını yerel kurallarla haritalar. AI ve canlı internet araştırması, yalnızca sen açıkça başlattığında devreye girer.</p>
            <button className="primary-button empty-cta" onClick={() => setUploadOpen(true)}><CloudUpload size={18} /> Proje arşivi yükle <ArrowRight size={16} /></button>
            <div className="empty-trust"><span><ShieldCheck size={14} /> Kodun çalıştırılmaz</span><span><LockKeyhole size={14} /> AI aktarımı izne bağlı</span><span><Globe2 size={14} /> Kaynaklar bağlantılı</span></div>
            <div className="empty-how"><div><span>01</span><strong>İçeriği anlar</strong><small>Dosya ağacı · teknoloji · bileşenler</small></div><ArrowRight size={16} /><div><span>02</span><strong>İzinle derinleşir</strong><small>AI sentezi · güncel kaynaklar</small></div><ArrowRight size={16} /><div><span>03</span><strong>Yol önerir</strong><small>Kanıt · etki · uygulanabilirlik</small></div></div>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div className="heading-copy"><div className="eyebrow"><span className="signal-line" /> PROJE İNCELEME MASASI</div><h1>{project.name}<span className="heading-period">.</span></h1><p>{project.sourceKind === "github" ? <><Github size={13} /> {project.sourceUrl}</> : <><FileArchive size={13} /> {project.sourceName}</>} <span className="heading-divider">·</span> Yerel envanter {formatDate(project.localReport.analyzedAt)}</p></div>
              <div className="heading-actions"><button className="quiet-button" onClick={removeProject} disabled={busy === "delete"}><Trash2 size={15} /> Kaydı kaldır</button><button className="primary-button small" onClick={() => setUploadOpen(true)}><CloudUpload size={15} /> Proje ekle</button></div>
            </section>

            <div className="section-tabs">
              {navigation.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15} /> {label}{id === "research" && project.research?.sources?.length ? <span className="tab-count">{project.research.sources.length}</span> : null}</button>)}
              <button className={`privacy-tab ${tab === "privacy" ? "active" : ""}`} onClick={() => setTab("privacy")}><LockKeyhole size={15} /> Gizlilik</button>
            </div>

            {tab === "overview" && localReport && <Overview project={project} onTab={setTab} onRunResearch={() => setTab("research")} />}
            {tab === "architecture" && localReport && <Architecture project={project} />}
            {tab === "findings" && localReport && <Findings project={project} onRunAI={runAI} busy={busy === "ai"} consent={aiConsent} setConsent={setAiConsent} models={models} selectedModel={selectedModel} setSelectedModel={setSelectedModel} modelInfo={selectedModelInfo} />}
            {tab === "proactive" && <ProactivePanel project={project} onRun={runAudit} busy={busy === "audit"} />}
            {tab === "research" && <ResearchPanel project={project} queries={queries} setQuery={setQuery} onRun={runResearch} busy={busy === "research"} consent={researchConsent} setConsent={setResearchConsent} />}
            {tab === "roadmap" && <Roadmap project={project} onRunAI={() => setTab("findings")} />}
            {tab === "conversation" && <Conversation project={project} messages={chatMessages} question={question} setQuestion={setQuestion} onSend={sendQuestion} busy={busy === "chat"} consent={aiConsent} setConsent={setAiConsent} selectedModel={selectedModel} modelInfo={selectedModelInfo} />}
            {tab === "privacy" && <Privacy project={project} />}
          </>
        )}
      </main>

      {uploadOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== "upload") setUploadOpen(false); }}>
        <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
          <div className="modal-top"><div className="modal-symbol"><FolderKanban size={20} /></div><button className="icon-button" onClick={() => setUploadOpen(false)} disabled={busy === "upload"} aria-label="Kapat"><X size={18} /></button></div>
          <div className="eyebrow"><span className="signal-line" /> YENİ PROJE</div><h2 id="upload-title">İlk önce <em>dosyaları</em> tanıyalım.</h2><p className="modal-description">Arşiv sunucuya güvenli inceleme için yüklenir ve proje alanında saklanır. Kod çalıştırılmaz. AI veya araştırmaya henüz gönderilmez.</p>
          <form onSubmit={submitProject}>
            <label className="field-label">PROJE ADI <span>İsteğe bağlı</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Örn. OpenJarvis" maxLength={180} /></label>
            <div className={`drop-zone ${isDragging ? "dragging" : ""} ${uploadFile ? "has-file" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}>
              <input ref={fileInputRef} type="file" accept=".7z,.zip,.tar,.tgz,.gz" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) chooseFile(file); }} />
              <div className="drop-icon">{uploadFile ? <FileArchive size={20} /> : <CloudUpload size={20} />}</div>
              {uploadFile ? <><strong>{uploadFile.name}</strong><span>{formatBytes(uploadFile.size)} · Arşiv seçildi <button type="button" className="inline-clear" onClick={(event) => { event.stopPropagation(); setUploadFile(null); }}>Kaldır</button></span></> : <><strong>Arşivi buraya bırak</strong><span>veya <u>bilgisayarından seç</u> · 25 MB’a kadar</span></>}
            </div>
            <div className="separator-label"><span /> YA DA HERKESE AÇIK DEPO <span /></div>
            <label className="field-label">GITHUB ADRESİ <input value={repoUrl} onChange={(event) => { setRepoUrl(event.target.value); if (event.target.value) setUploadFile(null); }} placeholder="https://github.com/owner/repository" autoComplete="url" /></label>
            <div className="data-transfer-note"><ShieldCheck size={17} /><p><strong>Ne gönderiliyor?</strong> Arşiv, ULAK sunucusu ve proje nesne deposunda tutulur. Kod bu ekranda çalıştırılmaz. AI ve kaynak araması şu an kapalı; bunları rapor içinden ayrı ayrı başlatacaksın.</p></div>
            <button type="submit" className="primary-button modal-submit" disabled={busy === "upload" || (!uploadFile && !repoUrl.trim())}>{busy === "upload" ? <><LoaderCircle size={17} className="spin" /> Dosyalar haritalanıyor…</> : <>Yerel incelemeyi başlat <ArrowRight size={16} /></>}</button>
          </form>
        </div>
      </div>}

      {toast && <div className="toast" role="status"><span className="toast-dot" />{toast}<button onClick={() => setToast("")} aria-label="Bildirimi kapat"><X size={14} /></button></div>}
    </div>
  );
}

function Metric({ label, value, note, icon: Icon, tone = "mint" }: { label: string; value: string | number; note: string; icon: typeof Activity; tone?: "mint" | "amber" | "blue" }) {
  return <div className={`metric-card tone-${tone}`}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function Overview({ project, onTab, onRunResearch }: { project: Project; onTab: (tab: Tab) => void; onRunResearch: () => void }) {
  const local = project.localReport;
  const totalFindings = local.findings.length + (project.aiReport?.findings.length ?? 0);
  return <div className="page-content">
    <div className="overview-banner"><div className="banner-left"><div className="banner-icon"><Radar size={20} /></div><div><span className="banner-kicker">ULAK ÖZETİ <span className="dot-sep">·</span> YEREL ANALİZ TAMAMLANDI</span><p>{local.summary}</p></div></div><div className="banner-right"><span className="status-check"><Check size={13} /></span> Kod çalıştırılmadı</div></div>
    <div className="metrics-row"><Metric label="ARŞİVDEKİ ÖĞE" value={local.fileCount.toLocaleString("tr-TR")} note={`${local.analyzedFiles} metin dosyası incelendi`} icon={FileCode2} /><Metric label="TEKNOLOJİLER" value={local.stack.length} note={local.stack.map((item) => item.name).slice(0, 2).join(" · ") || "Belirgin imza bulunamadı"} icon={Code2} tone="blue" /><Metric label="BAĞIMLILIK" value={local.dependencies.length} note="Paket manifestlerinden çıkarıldı" icon={Boxes} tone="amber" /><Metric label="İNCELEME İŞARETİ" value={totalFindings} note={`${local.findings.length} yerel · ${project.aiReport?.findings.length ?? 0} AI`} icon={ShieldAlert} /></div>
    <div className="overview-grid">
      <section className="panel purpose-panel"><div className="panel-heading"><div><span className="panel-overline">PROJEYİ NASIL ANLADIK</span><h2>İlk okuma</h2></div><span className="subtle-chip"><span className="green-dot" /> Statik inceleme</span></div><p className="purpose-text">{local.projectPurpose}</p><div className="stack-chips">{local.stack.length ? local.stack.map((item) => <span key={item.name} className="stack-chip"><span className="stack-dot" />{item.name}<small>{item.confidence === "high" ? "doğrudan" : "tahmin"}</small></span>) : <span className="muted-text">Teknoloji yığınına dair henüz güçlü işaret bulunamadı.</span>}</div><div className="purpose-footer"><span><Clock3 size={14} /> İnceleme: {formatDate(local.analyzedAt)}</span><span><Database size={14} /> {formatBytes(local.totalBytes)} açılmış içerik</span></div></section>
      <section className="panel next-step-panel"><div className="panel-heading"><div><span className="panel-overline">BİR SONRAKİ ADIM</span><h2>İzni sen verirsin</h2></div><div className="compass-badge"><ArrowDownRight size={18} /></div></div><div className="next-step-list"><button onClick={() => onTab("findings")}><span className="step-icon ai"><Sparkles size={16} /></span><span><strong>AI ile mimariyi derinleştir</strong><small>Kaynak parçaları modele onayla aktarılır.</small></span><ChevronRight size={15} /></button><button onClick={onRunResearch}><span className="step-icon web"><Globe2 size={16} /></span><span><strong>Güncel kaynakları araştır</strong><small>Arama sorgularını önce inceleyebilirsin.</small></span><ChevronRight size={15} /></button></div><div className="consent-footnote"><LockKeyhole size={13} /> Hiçbir ek aktarım otomatik başlamaz.</div></section>
      <section className="panel modules-panel"><div className="panel-heading"><div><span className="panel-overline">KOD TABANI</span><h2>Öne çıkan klasörler</h2></div><button className="text-button" onClick={() => onTab("architecture")}>Haritayı aç <ArrowRight size={13} /></button></div><div className="module-list">{local.modules.length ? local.modules.slice(0, 5).map((module, index) => <div key={module.name} className="module-row"><div className={`folder-glyph glyph-${index % 4}`}><FolderKanban size={15} /></div><span className="module-name">{module.name}/</span><span className="module-bar"><i style={{ width: `${Math.max(12, Math.min(100, module.files / Math.max(1, local.fileCount) * 220))}%` }} /></span><span className="module-count">{module.files}</span></div>) : <div className="muted-text">Klasör dağılımı çıkarılamadı.</div>}</div></section>
      <section className="panel pulse-panel"><div className="panel-heading"><div><span className="panel-overline">KAYNAK DURUMU</span><h2>Kanıt bağlantıları</h2></div><span className="status-live">CANLI</span></div>{project.research ? <><div className="pulse-number">{project.research.sources.length}<small> kaynak</small></div><p>Son araştırma {formatDate(project.research.researchedAt)} tarihinde çalıştırıldı.</p><button className="text-button" onClick={() => onTab("research")}>Kaynaklara git <ArrowRight size={13} /></button></> : <><div className="source-orbit"><span /><span /><span /><Globe2 size={17} /></div><p>Henüz araştırma yapılmadı. Kaynakları sorgulamadan önce gönderilecek kelimeleri görebilirsin.</p><button className="text-button" onClick={onRunResearch}>Sorguları incele <ArrowRight size={13} /></button></>}</section>
    </div>
    <div className="bottom-note"><span className="note-mark"><ShieldCheck size={14} /></span><span><strong>ULAK kesin hüküm vermez.</strong> Otomatik taramadaki işaretler doğrulanması gereken ipuçlarıdır. AI ve araştırma raporları da olası hata içerebilir.</span><button onClick={() => onTab("privacy")}>Veri akışını gör <ArrowRight size={13} /></button></div>
  </div>;
}

function Architecture({ project }: { project: Project }) {
  const report = project.localReport;
  const extMap = new Map<string, number>();
  report.stack.forEach((item) => extMap.set(item.name, 1));
  const languages = new Map<string, number>();
  project.manifest.forEach((entry) => languages.set(entry.language, (languages.get(entry.language) ?? 0) + 1));
  const sortedLanguages = [...languages.entries()].sort((a, b) => b[1] - a[1]).filter(([name]) => name !== "Other");
  return <div className="page-content">
    <PageIntro eyebrow="SİSTEM HARİTASI" title="Yapı, bileşen ve giriş noktaları." copy="Bu harita arşiv envanteri ile seçilmiş metin dosyalarından çıkarıldı. Bağlantılar statik import eşleşmeleridir; çalışma zamanı çağrı grafiği değildir." />
    <div className="architecture-grid">
      <section className="panel architecture-main"><div className="panel-heading"><div><span className="panel-overline">İÇERİK GÖRÜNÜMÜ</span><h2>Modül topolojisi</h2></div><span className="subtle-chip">{report.modules.length} üst klasör</span></div>
        <div className="topology-canvas"><div className="topology-core"><div className="core-icon"><img src="/favicon.svg" alt="" /></div><strong>{project.name}</strong><small>{report.fileCount} öğe · {report.stack.map((item) => item.name).slice(0, 2).join(" / ") || "dil tespiti sınırlı"}</small></div><div className="topology-wires"><i /><i /><i /><i /></div><div className="topology-nodes">{report.modules.length ? report.modules.slice(0, 4).map((module, index) => <div key={module.name} className={`topology-node node-${index}`}><FolderKanban size={15} /><strong>{module.name}/</strong><small>{module.files} dosya</small></div>) : <div className="topology-node"><FileText size={15} /><strong>Klasör verisi yok</strong></div>}</div><div className="topology-caption"><span className="legend-dot" /> Proje içindeki en üst seviye klasörler <span className="legend-line" /> Statik dosya ilişkisi</div></div>
        <div className="relationships-heading"><span>ÇIKARILAN DOSYA İLİŞKİLERİ</span><span>{report.relationships.length} bağlantı</span></div>
        {report.relationships.length ? <div className="relationship-list">{report.relationships.slice(0, 10).map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`} className="relationship-row"><code>{edge.from}</code><ArrowRight size={13} /><code>{edge.to}</code><span>{edge.type}</span></div>)}</div> : <div className="empty-inline"><Network size={17} /><span>Yerel import eşleşmesi bulunamadı. Dinamik yüklemeler bu statik taramada görülmeyebilir.</span></div>}
      </section>
      <div className="architecture-side"><section className="panel"><div className="panel-heading"><div><span className="panel-overline">TEKNOLOJİ DAĞILIMI</span><h2>Dosya türleri</h2></div></div>{sortedLanguages.length ? <div className="language-list">{sortedLanguages.slice(0, 7).map(([name, count], index) => <div className="language-row" key={name}><span className={`language-swatch swatch-${index % 5}`} /><span>{name}</span><strong>{count}</strong><div className="language-track"><i style={{ width: `${Math.max(5, count / Math.max(1, sortedLanguages[0][1]) * 100)}%` }} /></div></div>)}</div> : <p className="muted-text">Dosya türü verisi yetersiz.</p>}</section>
        <section className="panel entry-panel"><div className="panel-heading"><div><span className="panel-overline">BAŞLANGIÇ NOKTALARI</span><h2>Olası entry point’ler</h2></div></div>{report.entryPoints.length ? report.entryPoints.map((entry) => <div key={entry} className="entry-row"><span><Code2 size={14} /></span><code>{entry}</code><span className="entry-tag">aday</span></div>) : <div className="empty-inline"><FileCode2 size={16} /> Standart giriş dosyası adı tespit edilmedi.</div>}</section>
      </div>
    </div>
    <section className="panel dependencies-panel"><div className="panel-heading"><div><span className="panel-overline">MANIFESTLERDEN</span><h2>Bağımlılık envanteri</h2></div><span className="subtle-chip">{report.dependencies.length} kayıt</span></div>{report.dependencies.length ? <div className="dependencies-table"><div className="dependency-table-head"><span>PAKET</span><span>EKOSİSTEM</span><span>ARŞİVDEKİ SÜRÜM</span></div>{report.dependencies.slice(0, 20).map((dep) => <div key={`${dep.ecosystem}-${dep.name}`} className="dependency-row"><strong>{dep.name}</strong><span>{dep.ecosystem}</span><code>{dep.version || "belirtilmemiş"}</code></div>)}</div> : <p className="muted-text">Desteklenen manifest dosyalarında bağımlılık kaydı bulunamadı.</p>}</section>
  </div>;
}

function Findings({ project, onRunAI, busy, consent, setConsent, models, selectedModel, setSelectedModel, modelInfo }: { project: Project; onRunAI: () => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void; models: ModelChoice[]; selectedModel: string; setSelectedModel: (id: string) => void; modelInfo: ModelChoice | null }) {
  const localFindings = project.localReport.findings;
  const aiFindings = project.aiReport?.findings ?? [];
  return <div className="page-content">
    <PageIntro eyebrow="BULGULAR" title="Her işaretin arkasında kanıt." copy="Önce yerel kural taraması. Daha geniş mimari yorum için, seçtiğin proje bağlamı onayınla Manus AI servisine gönderilir." />
    <section className="ai-consent-card"><div className="ai-consent-symbol"><WandSparkles size={19} /></div><div className="ai-consent-copy"><span className="panel-overline">İSTEĞE BAĞLI · AI DERİN İNCELEME</span><h2>Bağlamı sentezleyelim mi?</h2><p>AI’ye kaynak kodunun bir kısmı, proje özeti ve dosya manifesti gönderilir. Bilinen sırlar maskelenir. AI bu içeriği araştırma sağlayıcılarına göndermez.</p><div className="ai-model-row"><label className="model-select-label">MODEL <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={!models.length}><option value="">Model seçin…</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.cost} maliyet</option>)}</select></label><span className="model-cost"><span className={`cost-dot cost-${modelInfo?.cost ?? "medium"}`} /> İşlem maliyeti: {modelInfo?.cost ?? "belirsiz"}</span></div></div><div className="ai-consent-action"><button className="primary-button" onClick={onRunAI} disabled={!consent || busy || !selectedModel}>{busy ? <><LoaderCircle size={16} className="spin" /> İnceleniyor…</> : <><Sparkles size={16} /> Onayla ve analiz et</>}</button><label className="consent-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Bu AI isteği için dosya bağlamını paylaşmayı onaylıyorum.</span></label></div></section>
    {aiFindings.length ? <section className="panel ai-result-panel"><div className="panel-heading"><div><span className="panel-overline">AI RAPORU</span><h2>{aiFindings.length} analiz bulgusu</h2></div><span className="subtle-chip"><Sparkles size={13} /> {project.aiReport?.model}</span></div><p className="ai-summary">{project.aiReport?.summary}</p><div className="finding-stack">{aiFindings.map((finding) => <FindingCard key={finding.id} finding={finding} ai />)}</div></section> : null}
    <section className="panel local-findings-panel"><div className="panel-heading"><div><span className="panel-overline">KURAL TABANLI · YEREL</span><h2>{localFindings.length} inceleme işareti</h2></div><span className="subtle-chip"><ShieldCheck size={13} /> Kaynak dışarı gönderilmedi</span></div>{localFindings.length ? <div className="finding-stack">{localFindings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}</div> : <div className="success-empty"><ShieldCheck size={19} /><span>Yaygın kural örüntülerinde otomatik işaret bulunmadı. Bu, kodun güvenli olduğunu kanıtlamaz.</span></div>}</section>
  </div>;
}

function FindingCard({ finding, ai = false }: { finding: AiFinding | Project["localReport"]["findings"][number]; ai?: boolean }) {
  return <article className={`finding-card severity-${finding.severity}`}><div className="finding-severity"><span />{severityLabel(finding.severity)}</div><div className="finding-main"><div className="finding-title-row"><span className="finding-area">{finding.area}</span>{ai && <span className="ai-tag"><Sparkles size={11} /> AI sentezi</span>}</div><h3>{finding.title}</h3><p>{finding.detail}</p>{"impact" in finding && finding.impact && <p className="finding-impact"><strong>Etki:</strong> {finding.impact}</p>}{"steps" in finding && finding.steps.length ? <ol className="finding-steps">{finding.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol> : null}{finding.evidence.length ? <div className="evidence-list"><span>KANIT</span>{finding.evidence.map((item) => <code key={item}>{item}</code>)}</div> : <div className="no-evidence-note">Envanter düzeyinde bir sinyal; dosya içi kanıt yok.</div>}</div><div className="finding-confidence">Güven <strong>{finding.confidence === "high" ? "yüksek" : finding.confidence === "medium" ? "orta" : "düşük"}</strong></div></article>;
}

function ResearchPanel({ project, queries, setQuery, onRun, busy, consent, setConsent }: { project: Project; queries: string[]; setQuery: (index: number, value: string) => void; onRun: () => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void }) {
  const research = project.research;
  return <div className="page-content">
    <PageIntro eyebrow="CANLI ARAŞTIRMA" title="Koddan çıkan ipucu. İnternetten kanıt." copy="Paket adı ve sürüm bilgileri güvenlik kayıtlarıyla eşleştirilir. Teknik sorgular ayrı gösterilir; istersen düzenle, sonra başlat." />
    <section className="research-callout"><div className="research-sources-strip"><span>ARAŞTIRMA UÇLARI</span><b>GitHub</b><b>OSV.dev</b><b>Stack Overflow</b><b>npm / PyPI</b></div><p>Bu adımda gönderilenler: aşağıdaki sorgular ile projeden çıkartılmış paket adları ve sürüm aralıkları. Kaynak dosyalarının ham içeriği araştırma sağlayıcılarına gönderilmez.</p></section>
    <section className="panel query-panel"><div className="panel-heading"><div><span className="panel-overline">GÖNDERİLECEK SORGULAR</span><h2>Önce kelimelere bak.</h2></div><span className="subtle-chip"><Search size={13} /> {queries.length} sorgu</span></div><div className="query-list">{queries.map((query, index) => <label key={index} className="query-field"><span>0{index + 1}</span><input value={query} maxLength={180} onChange={(event) => setQuery(index, event.target.value)} aria-label={`Araştırma sorgusu ${index + 1}`} /><button type="button" aria-label="Sorguyu temizle" onClick={() => setQuery(index, "")}><X size={14} /></button></label>)}</div><div className="research-consent-row"><label className="consent-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Bu sorguları ve paket ad/sürümlerini herkese açık internet API’lerine göndermeyi onaylıyorum.</span></label><button className="primary-button" onClick={onRun} disabled={!consent || busy || !queries.some((query) => query.trim())}>{busy ? <><LoaderCircle size={16} className="spin" /> Kaynaklar taranıyor…</> : <><Radar size={16} /> Araştırmayı başlat</>}</button></div></section>
    {research ? <section className="research-results"><div className="results-heading"><div><span className="panel-overline">KAYNAKLI SONUÇLAR · {formatDate(research.researchedAt)}</span><h2>{research.sources.length ? `${research.sources.length} kaynak bulundu` : "Eşleşen kaynak bulunamadı"}</h2></div><span className="subtle-chip">{research.queries.length} onaylı sorgu</span></div><div className="searched-query-chips">{research.queries.map((query, index) => <span key={`${query}-${index}`}><Search size={12} /> {query}</span>)}</div>{research.errors.length > 0 && <div className="partial-warning"><TriangleAlert size={15} /><div><strong>Bazı kaynaklar yanıt vermedi.</strong><small>{research.errors.join(" · ")}</small></div></div>}{research.sources.length ? <div className="source-grid">{research.sources.map((source) => <article className="source-card" key={source.id}><div className="source-meta"><span className="source-provider"><span className="source-icon">{source.provider.includes("GitHub") ? <Github size={13} /> : source.provider.includes("OSV") ? <ShieldCheck size={13} /> : <BookOpenCheck size={13} />}</span>{source.provider}</span><a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${sourceHost(source.url)} kaynağını aç`}><ExternalLink size={14} /></a></div><a className="source-title" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><p>{source.summary}</p><div className="source-footer"><span>{sourceHost(source.url)}</span>{source.publishedAt && <time>{formatDate(source.publishedAt)}</time>}</div></article>)}</div> : <div className="empty-inline"><Globe2 size={18} /><span>Bu sorgularla kaynak döndürülmedi. Sorguları düzenleyip yeniden deneyin; bu durum araştırma tamamlanmadığı anlamına gelebilir.</span></div>}</section> : <div className="research-empty"><div className="research-empty-icon"><Globe2 size={20} /></div><strong>Henüz canlı araştırma yok.</strong><p>Sorguları gözden geçirip onayladığında kaynaklar ve güncel sürüm bilgileri burada listelenir.</p></div>}
  </div>;
}

function ProactivePanel({ project, onRun, busy }: { project: Project; onRun: () => void; busy: boolean }) {
  const audit = project.proactiveAudit;
  const statusLabel = (status: string) => status === "pass" ? "Güçlü sinyal" : status === "risk" ? "Öncelikli doğrulama" : "İzleme alanı";
  const statusIcon = (status: string) => status === "pass" ? <Check size={15} /> : status === "risk" ? <TriangleAlert size={15} /> : <Clock3 size={15} />;
  return <div className="page-content">
    <PageIntro eyebrow="PROAKTİF DENETİM" title="Sen sormadan önce görünen riskler." copy="Bu katman arşivi çalıştırmadan, dış servise veri göndermeden ve AI beklemeden proje sağlığına dair erken sinyaller üretir. Her sinyal kanıt, sınır ve uygulanabilir sonraki adımla birlikte gelir." />
    {!audit ? <div className="audit-empty"><div className="audit-empty-mark"><Radar size={23} /></div><h2>Denetim henüz hazır değil.</h2><p>Arşiv yüklenirken otomatik üretilir. Yenile düğmesiyle güvenli statik kontrolü tekrar çalıştırabilirsin.</p><button className="primary-button" onClick={onRun} disabled={busy}>{busy ? <><LoaderCircle size={16} className="spin" /> Denetleniyor…</> : <><Radar size={16} /> Denetimi başlat</>}</button></div> : <>
      <section className="audit-hero">
        <div className={`audit-score grade-${audit.grade}`}><strong>{audit.score}</strong><span>/100</span><small>yol gösterici sinyal</small></div>
        <div className="audit-hero-copy"><span className="panel-overline">KOD ÇALIŞTIRILMADAN · {formatDate(audit.checkedAt)}</span><h2>Proje hazırlık seviyesi: <b>{audit.grade}</b></h2><p>{audit.summary}</p><div className="audit-legend"><span><i className="audit-dot dot-pass" /> {audit.checks.filter((check) => check.status === "pass").length} güçlü</span><span><i className="audit-dot dot-watch" /> {audit.checks.filter((check) => check.status === "watch").length} izleme</span><span><i className="audit-dot dot-risk" /> {audit.checks.filter((check) => check.status === "risk").length} öncelikli</span></div></div>
        <div className="audit-hero-action"><button className="quiet-button" onClick={onRun} disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin" /> Yenileniyor</> : <><Radar size={15} /> Denetimi yenile</>}</button><small>Yerel · dış aktarım yok</small></div>
      </section>
      <div className="audit-notice"><ShieldCheck size={16} /><span><strong>Bu bir güvenlik sertifikası değildir.</strong> Statik işaretler doğrulanması gereken ipuçlarıdır. Paket güncelliği ve OSV sonuçları için canlı araştırma ayrıca onaylanır.</span><button className="text-button" onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>Yöntemi gör <ArrowDownRight size={13} /></button></div>
      <section className="audit-grid">{audit.checks.map((check) => <article className={`audit-card audit-${check.status}`} key={check.id}><div className="audit-card-top"><span className="audit-category">{check.category}</span><span className={`audit-status status-${check.status}`}>{statusIcon(check.status)} {statusLabel(check.status)}</span></div><h3>{check.title}</h3><p className="audit-summary">{check.summary}</p><p className="audit-why"><strong>Neden önemli:</strong> {check.why}</p>{check.evidence.length ? <div className="audit-evidence"><span>KANIT</span>{check.evidence.map((item) => <code key={item}>{item}</code>)}</div> : <div className="audit-no-evidence">Arşivde bu kontrolü destekleyen dosya izi bulunmadı.</div>}<div className="audit-next"><span>SONRAKİ ADIM</span><p>{check.nextStep}</p></div><div className="audit-basis">Dayanak: {check.basis}</div></article>)}</section>
      <section className="audit-method panel"><div><span className="panel-overline">KAPSAM VE SINIR</span><h2>ULAK’ın proaktif bakışı</h2><p>Kontroller, arşiv envanteri ve seçilmiş metin dosyalarındaki güvenli örüntülerle sınırlıdır. OpenSSF Scorecard, SLSA ve OWASP ASVS gibi çerçevelerden ilham alır; bu standartların tam tarayıcısı olduğunu iddia etmez.</p></div><div className="audit-method-badges"><span>Statik</span><span>Kanıtlı</span><span>Onay kontrollü</span></div></section>
    </>}
  </div>;
}

function Roadmap({ project, onRunAI }: { project: Project; onRunAI: () => void }) {
  const steps = project.aiReport?.roadmap ?? [];
  return <div className="page-content"><PageIntro eyebrow="ÖNERİLEN SIRALAMA" title="Bulgudan, uygulanabilir adıma." copy="Öneriler kanıt ve beklenen etkiye dayanmalı. AI raporu yoksa önce derin analizi başlatın; canlı araştırmayı tamamladıysanız kaynaklarını da karar verirken kullanın." />
    {steps.length ? <div className="roadmap-list">{steps.map((step, index) => <article className="roadmap-card" key={step.id}><div className="roadmap-index">{String(index + 1).padStart(2, "0")}<span /></div><div className="roadmap-card-main"><div className="roadmap-meta"><span>{step.area}</span><span className={`severity-text severity-text-${step.severity}`}>{severityLabel(step.severity)} öncelik</span></div><h2>{step.title}</h2><p>{step.detail}</p>{step.steps.length > 0 && <ol className="roadmap-steps">{step.steps.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ol>}{step.evidence.length > 0 && <div className="evidence-list"><span>KANIT</span>{step.evidence.map((item) => <code key={item}>{item}</code>)}</div>}</div><div className="roadmap-side"><span className="impact-mark"><ArrowDownRight size={15} /></span><span>ETKİ</span><strong>{step.impact || "İncelenmeli"}</strong><small>Efor: {step.effort || "belirtilmemiş"}</small></div></article>)}</div> : <div className="roadmap-empty"><div className="roadmap-empty-mark"><Layers3 size={22} /></div><h2>Yol haritası henüz oluşturulmadı.</h2><p>AI analizi, kanıtlı bulguları önem ve uygulanabilirliğe göre sıralı adımlara dönüştürür.</p><button className="primary-button" onClick={onRunAI}><Sparkles size={16} /> AI analizine git</button></div>}
  </div>;
}

function Conversation({ project, messages, question, setQuestion, onSend, busy, consent, setConsent, selectedModel, modelInfo }: { project: Project; messages: ChatMessage[]; question: string; setQuestion: (value: string) => void; onSend: (event: FormEvent) => void; busy: boolean; consent: boolean; setConsent: (value: boolean) => void; selectedModel: string; modelInfo: ModelChoice | null }) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  if (!project.aiReport) return <div className="page-content"><PageIntro eyebrow="TAKİP SOHBETİ" title="Rapora soru sor." copy="ULAK kayıtlı analiz özetini kullanır; ham arşiv içeriği takip sorusuna eklenmez." /><div className="roadmap-empty"><div className="roadmap-empty-mark"><MessageSquare size={22} /></div><h2>Önce AI raporu gerekli.</h2><p>Rapor hazır olduktan sonra bulgulara ve önerilere ilişkin takip soruları sorabilirsin.</p><button className="primary-button" onClick={() => document.querySelector<HTMLButtonElement>("[data-tab='findings']")?.click()}><Sparkles size={16} /> Bulgulara git</button></div></div>;
  return <div className="page-content"><PageIntro eyebrow="RAPOR HAKKINDA" title="Takıldığın yeri sor." copy="Yanıtlar kayıtlı rapor özetine dayanır. Her soru, sen onayladığında seçili modele iletilir." />
    <section className="chat-shell"><div className="chat-topline"><span className="chat-ai-icon"><Sparkles size={15} /></span><div><strong>ULAK yardımcı</strong><small>{project.name} rapor bağlamı · {modelInfo?.name ?? selectedModel}</small></div><span className="chat-cost">{modelInfo?.cost ?? "belirsiz"} maliyet</span></div><div className="chat-history">{messages.length ? messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="message-avatar">{message.role === "assistant" ? <img src="/favicon.svg" alt="" /> : "S"}</span><div><span className="message-role">{message.role === "assistant" ? "ULAK" : "SEN"}</span><p>{message.content}</p></div></div>) : <div className="chat-welcome"><div className="chat-welcome-mark"><MessageSquare size={18} /></div><strong>Raporun hakkında merak ettiğini sor.</strong><p>Örnek: “Bu önerinin hangi dosyayla ilişkisi var?”</p><div className="suggestion-chips">{["En önemli risk hangisi?", "İlk önce neyi düzeltmeliyim?"].map((item) => <button key={item} onClick={() => setQuestion(item)}>{item} <ArrowRight size={12} /></button>)}</div></div>}{busy && <div className="chat-thinking"><LoaderCircle size={15} className="spin" /> Rapor bağlamı yanıtlanıyor…</div>}<div ref={chatEndRef} /></div><form className="chat-compose" onSubmit={onSend}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Rapor hakkında bir soru yaz…" maxLength={2_000} rows={2} /><div className="chat-compose-bottom"><label className="consent-checkbox"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Bu soruyu seçili AI modeline göndermeyi onaylıyorum.</span></label><button className="send-button" type="submit" disabled={!question.trim() || !consent || busy || !selectedModel} aria-label="Soruyu gönder"><Send size={16} /></button></div></form><div className="chat-retention"><LockKeyhole size={12} /> Sorular ve yanıtlar bu proje alanında saklanır.</div></section>
  </div>;
}

function Privacy({ project }: { project: Project | null }) {
  return <div className="page-content"><PageIntro eyebrow="VERİ VE GÜVEN SINIRI" title="ULAK ne yapar. Ne yapmaz." copy="Gizlilik varsayılanları, dış hizmete giden her adımın önünde açık bir onay kapısı bırakır." />
    <div className="privacy-grid"><section className="panel privacy-flow-panel"><div className="panel-heading"><div><span className="panel-overline">VERİ AKIŞI</span><h2>Üç ayrı durak</h2></div><LockKeyhole size={18} className="muted-icon" /></div><div className="privacy-flow"><div className="flow-stage"><span className="flow-number">01</span><span className="flow-icon local"><FileCode2 size={16} /></span><div><strong>Arşiv yükleme</strong><p>Arşiv ULAK sunucusu ve yönetilen nesne deposunda saklanır. Kaynak dış hizmete otomatik gönderilmez.</p></div><span className="flow-status active">YÜKLEMEDE</span></div><div className="flow-connector"><i /></div><div className="flow-stage"><span className="flow-number">02</span><span className="flow-icon ai"><Sparkles size={16} /></span><div><strong>AI analizi</strong><p>Kullanıcı seçilen modeli ve onay kutusunu doğrulayınca, sınırlı/maskelenmiş dosya bağlamı platform AI servisine gönderilir.</p></div><span className={`flow-status ${project?.aiConsentAt ? "complete" : "locked"}`}>{project?.aiConsentAt ? "KULLANILDI" : "KAPALI"}</span></div><div className="flow-connector"><i /></div><div className="flow-stage"><span className="flow-number">03</span><span className="flow-icon web"><Globe2 size={16} /></span><div><strong>Canlı araştırma</strong><p>Onaylanan sorgular, paket adları ve sürümleri herkese açık API’lere gider. Kodun tamamı arama sağlayıcısına gönderilmez.</p></div><span className={`flow-status ${project?.researchConsentAt ? "complete" : "locked"}`}>{project?.researchConsentAt ? "KULLANILDI" : "KAPALI"}</span></div></div></section>
      <div className="privacy-side"><section className="privacy-principle"><span><ShieldCheck size={17} /></span><div><strong>Kod çalıştırılmaz</strong><p>Yüklenen arşivden hiçbir binary/script yürütülmez. Yalnız dosya envanteri ve statik metin taraması yapılır.</p></div></section><section className="privacy-principle"><span><Database size={17} /></span><div><strong>Projeler oturuma bağlı</strong><p>Uygulama rastgele tarayıcı oturumuyla kayıt sahipliğini ayırır. Bu sürüm giriş/kimlik doğrulama içermez; linki başkalarıyla paylaşmayın.</p></div></section><section className="privacy-principle warning"><span><TriangleAlert size={17} /></span><div><strong>Silme konusunda sınır</strong><p>Proje kaydını kaldırmak arşivi listeden saklar; platform runtime storage fiziksel silme sunmadığı için saklanan nesne kalır.</p></div></section><div className="privacy-status-list"><div><span>Site analitiği</span><strong><Check size={13} /> Kapalı</strong></div><div><span>Platform badge script’i</span><strong><Check size={13} /> Kapalı</strong></div><div><span>LLM / web isteği</span><strong><LockKeyhole size={13} /> Onay gerekli</strong></div></div></div>
    </div><div className="privacy-footer-note"><ShieldCheck size={15} /><span>Özel ULAK Preview alanı için tasarlanmıştır. Çok kullanıcılı yayıma geçmeden önce gerçek kimlik doğrulama, erişim rolleri, kullanıcıya özel arşiv silme ve saklama süresi eklenmelidir.</span></div>
  </div>;
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="page-intro"><div className="eyebrow"><span className="signal-line" /> {eyebrow}</div><h1>{title}</h1><p>{copy}</p></div>;
}
