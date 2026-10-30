import { ChevronRight, CloudUpload, FileArchive, Github, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Project } from "../types";
import type { Tab } from "../navigation";

export function Sidebar({
  projects,
  activeId,
  tab,
  onSelect,
  onNewProject,
  onOpenPrivacy,
}: {
  projects: Project[];
  activeId: string;
  tab: Tab;
  onSelect: (id: string) => void;
  onNewProject: () => void;
  onOpenPrivacy: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <img src="/favicon.svg" alt="" />
        </div>
        <div>
          <div className="brand-name">
            ULAK<span>↗</span>
          </div>
          <div className="brand-subtitle">PROJE İSTİHBARATI</div>
        </div>
      </div>

      <div className="workspace-label">
        <span>ÇALIŞMA ALANI</span>
        <span className="live-pip" /> ÖZEL
      </div>

      <button className="new-project-button" onClick={onNewProject}>
        <CloudUpload size={16} /> Yeni proje ekle <span>+</span>
      </button>

      <div className="sidebar-section-title">
        PROJELER <span>{projects.length.toString().padStart(2, "0")}</span>
      </div>

      <div className="project-list">
        {projects.length ? (
          projects.map((item) => (
            <button
              key={item.id}
              className={`project-nav-item ${activeId === item.id ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="project-nav-icon">
                {item.sourceKind === "github" ? <Github size={16} /> : <FileArchive size={16} />}
              </span>
              <span className="project-nav-copy">
                <strong>{item.name}</strong>
                <small>{item.localReport.stack[0]?.name ?? "Proje analizi"}</small>
              </span>
              <ChevronRight size={14} className="project-nav-chevron" />
            </button>
          ))
        ) : (
          <div className="sidebar-empty">
            Henüz proje yok.
            <br />
            İlk arşivi ekleyin.
          </div>
        )}
      </div>

      <div className="sidebar-bottom">
        <div className="privacy-mini">
          <ShieldCheck size={16} />
          <div>
            <strong>Önce mahremiyet</strong>
            <small>AI ve araştırma kapalı başlar.</small>
          </div>
        </div>
        <button className={`side-link ${tab === "privacy" ? "selected" : ""}`} onClick={onOpenPrivacy}>
          <LockKeyhole size={16} /> Veri ve gizlilik
        </button>
        <div className="sidebar-version">
          <span>ULAK / 0.1</span>
          <span>ÖNİZLEME</span>
        </div>
      </div>
    </aside>
  );
}
