import { ArrowDownRight, Check, Clock3, LoaderCircle, Radar, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AuditStatus, Project } from "../types";
import { PageIntro } from "../components/PageIntro";
import { formatDate } from "../lib/format";

function statusLabel(status: AuditStatus) {
  return status === "pass" ? "Güçlü sinyal" : status === "risk" ? "Öncelikli doğrulama" : "İzleme alanı";
}

function StatusIcon({ status }: { status: AuditStatus }) {
  if (status === "pass") return <Check size={15} />;
  if (status === "risk") return <TriangleAlert size={15} />;
  return <Clock3 size={15} />;
}

export function ProactivePanel({ project, onRun, busy }: { project: Project; onRun: () => void; busy: boolean }) {
  const audit = project.proactiveAudit;

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="PROAKTİF DENETİM"
        title="Sen sormadan önce görünen riskler."
        copy="Bu katman arşivi çalıştırmadan, dış servise veri göndermeden ve AI beklemeden proje sağlığına dair erken sinyaller üretir. Her sinyal kanıt, sınır ve uygulanabilir sonraki adımla birlikte gelir."
      />

      {!audit ? (
        <div className="audit-empty">
          <div className="audit-empty-mark">
            <Radar size={23} />
          </div>
          <h2>Denetim henüz hazır değil.</h2>
          <p>Arşiv yüklenirken otomatik üretilir. Yenile düğmesiyle güvenli statik kontrolü tekrar çalıştırabilirsin.</p>
          <button className="primary-button" onClick={onRun} disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" /> Denetleniyor…
              </>
            ) : (
              <>
                <Radar size={16} /> Denetimi başlat
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <section className="audit-hero">
            <div className={`audit-score grade-${audit.grade}`}>
              <strong>{audit.score}</strong>
              <span>/100</span>
              <small>yol gösterici sinyal</small>
            </div>
            <div className="audit-hero-copy">
              <span className="panel-overline">KOD ÇALIŞTIRILMADAN · {formatDate(audit.checkedAt)}</span>
              <h2>
                Proje hazırlık seviyesi: <b>{audit.grade}</b>
              </h2>
              <p>{audit.summary}</p>
              <div className="audit-legend">
                <span>
                  <i className="audit-dot dot-pass" /> {audit.checks.filter((check) => check.status === "pass").length}{" "}
                  güçlü
                </span>
                <span>
                  <i className="audit-dot dot-watch" /> {audit.checks.filter((check) => check.status === "watch").length}{" "}
                  izleme
                </span>
                <span>
                  <i className="audit-dot dot-risk" /> {audit.checks.filter((check) => check.status === "risk").length}{" "}
                  öncelikli
                </span>
              </div>
            </div>
            <div className="audit-hero-action">
              <button className="quiet-button" onClick={onRun} disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle size={15} className="spin" /> Yenileniyor
                  </>
                ) : (
                  <>
                    <Radar size={15} /> Denetimi yenile
                  </>
                )}
              </button>
              <small>Yerel · dış aktarım yok</small>
            </div>
          </section>

          <div className="audit-notice">
            <ShieldCheck size={16} />
            <span>
              <strong>Bu bir güvenlik sertifikası değildir.</strong> Statik işaretler doğrulanması gereken ipuçlarıdır.
              Paket güncelliği ve OSV sonuçları için canlı araştırma ayrıca onaylanır.
            </span>
            <button
              className="text-button"
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
            >
              Yöntemi gör <ArrowDownRight size={13} />
            </button>
          </div>

          <section className="audit-grid">
            {audit.checks.map((check) => (
              <article className={`audit-card audit-${check.status}`} key={check.id}>
                <div className="audit-card-top">
                  <span className="audit-category">{check.category}</span>
                  <span className={`audit-status status-${check.status}`}>
                    <StatusIcon status={check.status} /> {statusLabel(check.status)}
                  </span>
                </div>
                <h3>{check.title}</h3>
                <p className="audit-summary">{check.summary}</p>
                <p className="audit-why">
                  <strong>Neden önemli:</strong> {check.why}
                </p>
                {check.evidence.length ? (
                  <div className="audit-evidence">
                    <span>KANIT</span>
                    {check.evidence.map((item) => (
                      <code key={item}>{item}</code>
                    ))}
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
              <p>
                Kontroller, arşiv envanteri ve seçilmiş metin dosyalarındaki güvenli örüntülerle sınırlıdır. OpenSSF
                Scorecard, SLSA ve OWASP ASVS gibi çerçevelerden ilham alır; bu standartların tam tarayıcısı olduğunu
                iddia etmez.
              </p>
            </div>
            <div className="audit-method-badges">
              <span>Statik</span>
              <span>Kanıtlı</span>
              <span>Onay kontrollü</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
