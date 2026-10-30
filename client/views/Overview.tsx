import {
  ArrowDownRight,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  FileCode2,
  FolderKanban,
  Globe2,
  LockKeyhole,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Project } from "../types";
import type { Tab } from "../navigation";
import { Metric } from "../components/Metric";
import { formatBytes, formatDate } from "../lib/format";

export function Overview({
  project,
  onTab,
  onRunResearch,
}: {
  project: Project;
  onTab: (tab: Tab) => void;
  onRunResearch: () => void;
}) {
  const local = project.localReport;
  const totalFindings = local.findings.length + (project.aiReport?.findings.length ?? 0);

  return (
    <div className="page-content">
      <div className="overview-banner">
        <div className="banner-left">
          <div className="banner-icon">
            <Radar size={20} />
          </div>
          <div>
            <span className="banner-kicker">
              ULAK ÖZETİ <span className="dot-sep">·</span> YEREL ANALİZ TAMAMLANDI
            </span>
            <p>{local.summary}</p>
          </div>
        </div>
        <div className="banner-right">
          <span className="status-check">
            <Check size={13} />
          </span>{" "}
          Kod çalıştırılmadı
        </div>
      </div>

      <div className="metrics-row">
        <Metric
          label="ARŞİVDEKİ ÖĞE"
          value={local.fileCount.toLocaleString("tr-TR")}
          note={`${local.analyzedFiles} metin dosyası incelendi`}
          icon={FileCode2}
        />
        <Metric
          label="TEKNOLOJİLER"
          value={local.stack.length}
          note={local.stack.map((item) => item.name).slice(0, 2).join(" · ") || "Belirgin imza bulunamadı"}
          icon={Code2}
          tone="blue"
        />
        <Metric
          label="BAĞIMLILIK"
          value={local.dependencies.length}
          note="Paket manifestlerinden çıkarıldı"
          icon={Boxes}
          tone="amber"
        />
        <Metric
          label="İNCELEME İŞARETİ"
          value={totalFindings}
          note={`${local.findings.length} yerel · ${project.aiReport?.findings.length ?? 0} AI`}
          icon={ShieldAlert}
        />
      </div>

      <div className="overview-grid">
        <section className="panel purpose-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">PROJEYİ NASIL ANLADIK</span>
              <h2>İlk okuma</h2>
            </div>
            <span className="subtle-chip">
              <span className="green-dot" /> Statik inceleme
            </span>
          </div>
          <p className="purpose-text">{local.projectPurpose}</p>
          <div className="stack-chips">
            {local.stack.length ? (
              local.stack.map((item) => (
                <span key={item.name} className="stack-chip">
                  <span className="stack-dot" />
                  {item.name}
                  <small>{item.confidence === "high" ? "doğrudan" : "tahmin"}</small>
                </span>
              ))
            ) : (
              <span className="muted-text">Teknoloji yığınına dair henüz güçlü işaret bulunamadı.</span>
            )}
          </div>
          <div className="purpose-footer">
            <span>
              <Clock3 size={14} /> İnceleme: {formatDate(local.analyzedAt)}
            </span>
            <span>
              <Database size={14} /> {formatBytes(local.totalBytes)} açılmış içerik
            </span>
          </div>
        </section>

        <section className="panel next-step-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">BİR SONRAKİ ADIM</span>
              <h2>İzni sen verirsin</h2>
            </div>
            <div className="compass-badge">
              <ArrowDownRight size={18} />
            </div>
          </div>
          <div className="next-step-list">
            <button onClick={() => onTab("findings")}>
              <span className="step-icon ai">
                <Sparkles size={16} />
              </span>
              <span>
                <strong>AI ile mimariyi derinleştir</strong>
                <small>Kaynak parçaları modele onayla aktarılır.</small>
              </span>
              <ChevronRight size={15} />
            </button>
            <button onClick={onRunResearch}>
              <span className="step-icon web">
                <Globe2 size={16} />
              </span>
              <span>
                <strong>Güncel kaynakları araştır</strong>
                <small>Arama sorgularını önce inceleyebilirsin.</small>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="consent-footnote">
            <LockKeyhole size={13} /> Hiçbir ek aktarım otomatik başlamaz.
          </div>
        </section>

        <section className="panel modules-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">KOD TABANI</span>
              <h2>Öne çıkan klasörler</h2>
            </div>
            <button className="text-button" onClick={() => onTab("architecture")}>
              Haritayı aç <ArrowRight size={13} />
            </button>
          </div>
          <div className="module-list">
            {local.modules.length ? (
              local.modules.slice(0, 5).map((module, index) => (
                <div key={module.name} className="module-row">
                  <div className={`folder-glyph glyph-${index % 4}`}>
                    <FolderKanban size={15} />
                  </div>
                  <span className="module-name">{module.name}/</span>
                  <span className="module-bar">
                    <i
                      style={{
                        width: `${Math.max(12, Math.min(100, (module.files / Math.max(1, local.fileCount)) * 220))}%`,
                      }}
                    />
                  </span>
                  <span className="module-count">{module.files}</span>
                </div>
              ))
            ) : (
              <div className="muted-text">Klasör dağılımı çıkarılamadı.</div>
            )}
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
              <div className="pulse-number">
                {project.research.sources.length}
                <small> kaynak</small>
              </div>
              <p>Son araştırma {formatDate(project.research.researchedAt)} tarihinde çalıştırıldı.</p>
              <button className="text-button" onClick={() => onTab("research")}>
                Kaynaklara git <ArrowRight size={13} />
              </button>
            </>
          ) : (
            <>
              <div className="source-orbit">
                <span />
                <span />
                <span />
                <Globe2 size={17} />
              </div>
              <p>Henüz araştırma yapılmadı. Kaynakları sorgulamadan önce gönderilecek kelimeleri görebilirsin.</p>
              <button className="text-button" onClick={onRunResearch}>
                Sorguları incele <ArrowRight size={13} />
              </button>
            </>
          )}
        </section>
      </div>

      <div className="bottom-note">
        <span className="note-mark">
          <ShieldCheck size={14} />
        </span>
        <span>
          <strong>ULAK kesin hüküm vermez.</strong> Otomatik taramadaki işaretler doğrulanması gereken ipuçlarıdır. AI ve
          araştırma raporları da olası hata içerebilir.
        </span>
        <button onClick={() => onTab("privacy")}>
          Veri akışını gör <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
