import { ArrowDownRight, Layers3, Sparkles } from "lucide-react";
import type { Project } from "../types";
import { PageIntro } from "../components/PageIntro";
import { severityLabel } from "../lib/format";

export function Roadmap({ project, onRunAI }: { project: Project; onRunAI: () => void }) {
  const steps = project.aiReport?.roadmap ?? [];

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="ÖNERİLEN SIRALAMA"
        title="Bulgudan, uygulanabilir adıma."
        copy="Öneriler kanıt ve beklenen etkiye dayanmalı. AI raporu yoksa önce derin analizi başlatın; canlı araştırmayı tamamladıysanız kaynaklarınızı da karar verirken kullanın."
      />

      {steps.length ? (
        <div className="roadmap-list">
          {steps.map((step, index) => (
            <article className="roadmap-card" key={step.id}>
              <div className="roadmap-index">
                {String(index + 1).padStart(2, "0")}
                <span />
              </div>
              <div className="roadmap-card-main">
                <div className="roadmap-meta">
                  <span>{step.area}</span>
                  <span className={`severity-text severity-text-${step.severity}`}>
                    {severityLabel(step.severity)} öncelik
                  </span>
                </div>
                <h2>{step.title}</h2>
                <p>{step.detail}</p>
                {step.steps.length > 0 && (
                  <ol className="roadmap-steps">
                    {step.steps.map((item, stepIndex) => (
                      <li key={`${stepIndex}-${item}`}>{item}</li>
                    ))}
                  </ol>
                )}
                {step.evidence.length > 0 && (
                  <div className="evidence-list">
                    <span>KANIT</span>
                    {step.evidence.map((item) => (
                      <code key={item}>{item}</code>
                    ))}
                  </div>
                )}
              </div>
              <div className="roadmap-side">
                <span className="impact-mark">
                  <ArrowDownRight size={15} />
                </span>
                <span>ETKİ</span>
                <strong>{step.impact || "İncelenmeli"}</strong>
                <small>Efor: {step.effort || "belirtilmemiş"}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="roadmap-empty">
          <div className="roadmap-empty-mark">
            <Layers3 size={22} />
          </div>
          <h2>Yol haritası henüz oluşturulmadı.</h2>
          <p>AI analizi, kanıtlı bulguları önem ve uygulanabilirliğe göre sıralı adımlara dönüştürür.</p>
          <button className="primary-button" onClick={onRunAI}>
            <Sparkles size={16} /> AI analizine git
          </button>
        </div>
      )}
    </div>
  );
}
