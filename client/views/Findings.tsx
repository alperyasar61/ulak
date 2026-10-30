import { LoaderCircle, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import type { ModelChoice, Project } from "../types";
import { FindingCard } from "../components/FindingCard";
import { PageIntro } from "../components/PageIntro";

export function Findings({
  project,
  onRunAI,
  busy,
  consent,
  setConsent,
  models,
  selectedModel,
  setSelectedModel,
  modelInfo,
}: {
  project: Project;
  onRunAI: () => void;
  busy: boolean;
  consent: boolean;
  setConsent: (value: boolean) => void;
  models: ModelChoice[];
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  modelInfo: ModelChoice | null;
}) {
  const localFindings = project.localReport.findings;
  const aiFindings = project.aiReport?.findings ?? [];

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="BULGULAR"
        title="Her işaretin arkasında kanıt."
        copy="Önce yerel kural taraması. Daha geniş mimari yorum için, seçtiğin proje bağlamı onayınla EVREN LLM Gateway üzerinden seçili modele gönderilir."
      />

      <section className="ai-consent-card">
        <div className="ai-consent-symbol">
          <WandSparkles size={19} />
        </div>
        <div className="ai-consent-copy">
          <span className="panel-overline">İSTEĞE BAĞLI · AI DERİN İNCELEME</span>
          <h2>Bağlamı sentezleyelim mi?</h2>
          <p>
            AI’ye kaynak kodunun bir kısmı, proje özeti ve dosya manifesti gönderilir. Bilinen sırlar maskelenir. AI bu
            içeriği araştırma sağlayıcılarına göndermez.
          </p>
          <div className="ai-model-row">
            <label className="model-select-label">
              MODEL
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={!models.length}
              >
                <option value="">Model seçin…</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} · {model.cost} maliyet
                  </option>
                ))}
              </select>
            </label>
            <span className="model-cost">
              <span className={`cost-dot cost-${modelInfo?.cost ?? "medium"}`} /> İşlem maliyeti:{" "}
              {modelInfo?.cost ?? "belirsiz"}
            </span>
          </div>
        </div>
        <div className="ai-consent-action">
          <button className="primary-button" onClick={onRunAI} disabled={!consent || busy || !selectedModel}>
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" /> İnceleniyor…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Onayla ve analiz et
              </>
            )}
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
            <span className="subtle-chip">
              <Sparkles size={13} /> {project.aiReport?.model}
            </span>
          </div>
          <p className="ai-summary">{project.aiReport?.summary}</p>
          <div className="finding-stack">
            {aiFindings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} ai />
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel local-findings-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">KURAL TABANLI · YEREL</span>
            <h2>{localFindings.length} inceleme işareti</h2>
          </div>
          <span className="subtle-chip">
            <ShieldCheck size={13} /> Kaynak dışarı gönderilmedi
          </span>
        </div>
        {localFindings.length ? (
          <div className="finding-stack">
            {localFindings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
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
