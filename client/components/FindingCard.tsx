import { Sparkles } from "lucide-react";
import type { AiFinding, LocalFinding } from "../types";
import { severityLabel } from "../lib/format";

export function FindingCard({ finding, ai = false }: { finding: AiFinding | LocalFinding; ai?: boolean }) {
  const impact = "impact" in finding ? finding.impact : "";
  const steps = "steps" in finding ? finding.steps : [];

  return (
    <article className={`finding-card severity-${finding.severity}`}>
      <div className="finding-severity">
        <span />
        {severityLabel(finding.severity)}
      </div>
      <div className="finding-main">
        <div className="finding-title-row">
          <span className="finding-area">{finding.area}</span>
          {ai && (
            <span className="ai-tag">
              <Sparkles size={11} /> AI sentezi
            </span>
          )}
        </div>
        <h3>{finding.title}</h3>
        <p>{finding.detail}</p>
        {impact && (
          <p className="finding-impact">
            <strong>Etki:</strong> {impact}
          </p>
        )}
        {steps.length > 0 && (
          <ol className="finding-steps">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        )}
        {finding.evidence.length ? (
          <div className="evidence-list">
            <span>KANIT</span>
            {finding.evidence.map((item) => (
              <code key={item}>{item}</code>
            ))}
          </div>
        ) : (
          <div className="no-evidence-note">Envanter düzeyinde bir sinyal; dosya içi kanıt yok.</div>
        )}
      </div>
      <div className="finding-confidence">
        Güven <strong>{finding.confidence === "high" ? "yüksek" : finding.confidence === "medium" ? "orta" : "düşük"}</strong>
      </div>
    </article>
  );
}
