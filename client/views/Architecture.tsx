import { ArrowRight, Code2, FileCode2, FileText, FolderKanban, Network } from "lucide-react";
import type { Project } from "../types";
import { PageIntro } from "../components/PageIntro";

export function Architecture({ project }: { project: Project }) {
  const report = project.localReport;

  const languages = new Map<string, number>();
  project.manifest.forEach((entry) => languages.set(entry.language, (languages.get(entry.language) ?? 0) + 1));
  const sortedLanguages = [...languages.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([name]) => name !== "Other");

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="SİSTEM HARİTASI"
        title="Yapı, bileşen ve giriş noktaları."
        copy="Bu harita arşiv envanteri ile seçilmiş metin dosyalarından çıkarıldı. Bağlantılar statik import eşleşmeleridir; çalışma zamanı çağrı grafiği değildir."
      />

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
              <div className="core-icon">
                <img src="/favicon.svg" alt="" />
              </div>
              <strong>{project.name}</strong>
              <small>
                {report.fileCount} öğe · {report.stack.map((item) => item.name).slice(0, 2).join(" / ") || "dil tespiti sınırlı"}
              </small>
            </div>
            <div className="topology-wires">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="topology-nodes">
              {report.modules.length ? (
                report.modules.slice(0, 4).map((module, index) => (
                  <div key={module.name} className={`topology-node node-${index}`}>
                    <FolderKanban size={15} />
                    <strong>{module.name}/</strong>
                    <small>{module.files} dosya</small>
                  </div>
                ))
              ) : (
                <div className="topology-node">
                  <FileText size={15} />
                  <strong>Klasör verisi yok</strong>
                </div>
              )}
            </div>
            <div className="topology-caption">
              <span className="legend-dot" /> Proje içindeki en üst seviye klasörler{" "}
              <span className="legend-line" /> Statik dosya ilişkisi
            </div>
          </div>

          <div className="relationships-heading">
            <span>ÇIKARILAN DOSYA İLİŞKİLERİ</span>
            <span>{report.relationships.length} bağlantı</span>
          </div>
          {report.relationships.length ? (
            <div className="relationship-list">
              {report.relationships.slice(0, 10).map((edge, index) => (
                <div key={`${edge.from}-${edge.to}-${index}`} className="relationship-row">
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
                  <div className="language-row" key={name}>
                    <span className={`language-swatch swatch-${index % 5}`} />
                    <span>{name}</span>
                    <strong>{count}</strong>
                    <div className="language-track">
                      <i style={{ width: `${Math.max(5, (count / Math.max(1, sortedLanguages[0][1])) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">Dosya türü verisi yetersiz.</p>
            )}
          </section>

          <section className="panel entry-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-overline">BAŞLANGIÇ NOKTALARI</span>
                <h2>Olası entry point’ler</h2>
              </div>
            </div>
            {report.entryPoints.length ? (
              report.entryPoints.map((entry) => (
                <div key={entry} className="entry-row">
                  <span>
                    <Code2 size={14} />
                  </span>
                  <code>{entry}</code>
                  <span className="entry-tag">aday</span>
                </div>
              ))
            ) : (
              <div className="empty-inline">
                <FileCode2 size={16} /> Standart giriş dosyası adı tespit edilmedi.
              </div>
            )}
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
            {report.dependencies.slice(0, 20).map((dependency) => (
              <div key={`${dependency.ecosystem}-${dependency.name}`} className="dependency-row">
                <strong>{dependency.name}</strong>
                <span>{dependency.ecosystem}</span>
                <code>{dependency.version || "belirtilmemiş"}</code>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-text">Desteklenen manifest dosyalarında bağımlılık kaydı bulunamadı.</p>
        )}
      </section>
    </div>
  );
}
