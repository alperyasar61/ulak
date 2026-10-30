import {
  BookOpenCheck,
  ExternalLink,
  Github,
  Globe2,
  LoaderCircle,
  Radar,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Project } from "../types";
import { PageIntro } from "../components/PageIntro";
import { formatDate, sourceHost } from "../lib/format";

export function ResearchPanel({
  project,
  queries,
  setQuery,
  onRun,
  busy,
  consent,
  setConsent,
}: {
  project: Project;
  queries: string[];
  setQuery: (index: number, value: string) => void;
  onRun: () => void;
  busy: boolean;
  consent: boolean;
  setConsent: (value: boolean) => void;
}) {
  const research = project.research;

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="CANLI ARAŞTIRMA"
        title="Koddan çıkan ipucu. İnternetten kanıt."
        copy="Paket adı ve sürüm bilgileri güvenlik kayıtlarıyla eşleştirilir. Teknik sorgular ayrı gösterilir; istersen düzenle, sonra başlat."
      />

      <section className="research-callout">
        <div className="research-sources-strip">
          <span>ARAŞTIRMA UÇLARI</span>
          <b>GitHub</b>
          <b>OSV.dev</b>
          <b>Stack Overflow</b>
          <b>npm / PyPI</b>
        </div>
        <p>
          Bu adımda gönderilenler: aşağıdaki sorgular ile projeden çıkartılmış paket adları ve sürüm aralıkları. Kaynak
          dosyalarının ham içeriği araştırma sağlayıcılarına gönderilmez.
        </p>
      </section>

      <section className="panel query-panel">
        <div className="panel-heading">
          <div>
            <span className="panel-overline">GÖNDERİLECEK SORGULAR</span>
            <h2>Önce kelimelere bak.</h2>
          </div>
          <span className="subtle-chip">
            <Search size={13} /> {queries.length} sorgu
          </span>
        </div>

        <div className="query-list">
          {queries.map((query, index) => (
            <label key={index} className="query-field">
              <span>0{index + 1}</span>
              <input
                value={query}
                maxLength={180}
                onChange={(event) => setQuery(index, event.target.value)}
                aria-label={`Araştırma sorgusu ${index + 1}`}
              />
              <button type="button" aria-label="Sorguyu temizle" onClick={() => setQuery(index, "")}>
                <X size={14} />
              </button>
            </label>
          ))}
        </div>

        <div className="research-consent-row">
          <label className="consent-checkbox">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Bu sorguları ve paket ad/sürümlerini herkese açık internet API’lerine göndermeyi onaylıyorum.</span>
          </label>
          <button
            className="primary-button"
            onClick={onRun}
            disabled={!consent || busy || !queries.some((query) => query.trim())}
          >
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" /> Kaynaklar taranıyor…
              </>
            ) : (
              <>
                <Radar size={16} /> Araştırmayı başlat
              </>
            )}
          </button>
        </div>
      </section>

      {research ? (
        <section className="research-results">
          <div className="results-heading">
            <div>
              <span className="panel-overline">KAYNAKLI SONUÇLAR · {formatDate(research.researchedAt)}</span>
              <h2>
                {research.sources.length ? `${research.sources.length} kaynak bulundu` : "Eşleşen kaynak bulunamadı"}
              </h2>
            </div>
            <span className="subtle-chip">{research.queries.length} onaylı sorgu</span>
          </div>

          <div className="searched-query-chips">
            {research.queries.map((query, index) => (
              <span key={`${query}-${index}`}>
                <Search size={12} /> {query}
              </span>
            ))}
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
                      <span className="source-icon">
                        {source.provider.includes("GitHub") ? (
                          <Github size={13} />
                        ) : source.provider.includes("OSV") ? (
                          <ShieldCheck size={13} />
                        ) : (
                          <BookOpenCheck size={13} />
                        )}
                      </span>
                      {source.provider}
                    </span>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${sourceHost(source.url)} kaynağını aç`}>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <a className="source-title" href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
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
              <span>
                Bu sorgularla kaynak döndürülmedi. Sorguları düzenleyip yeniden deneyin; bu durum araştırma
                tamamlanmadığı anlamına gelebilir.
              </span>
            </div>
          )}
        </section>
      ) : (
        <div className="research-empty">
          <div className="research-empty-icon">
            <Globe2 size={20} />
          </div>
          <strong>Henüz canlı araştırma yok.</strong>
          <p>Sorguları gözden geçirip onayladığında kaynaklar ve güncel sürüm bilgileri burada listelenir.</p>
        </div>
      )}
    </div>
  );
}
