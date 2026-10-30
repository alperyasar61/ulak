import { Check, Database, FileCode2, Globe2, LockKeyhole, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import type { Project } from "../types";
import { PageIntro } from "../components/PageIntro";

export function Privacy({ project }: { project: Project | null }) {
  return (
    <div className="page-content">
      <PageIntro
        eyebrow="VERİ VE GÜVEN SINIRI"
        title="ULAK ne yapar. Ne yapmaz."
        copy="Gizlilik varsayılanları, dış hizmete giden her adımın önünde açık bir onay kapısı bırakır."
      />

      <div className="privacy-grid">
        <section className="panel privacy-flow-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-overline">VERİ AKIŞI</span>
              <h2>Üç ayrı durak</h2>
            </div>
            <LockKeyhole size={18} className="muted-icon" />
          </div>

          <div className="privacy-flow">
            <div className="flow-stage">
              <span className="flow-number">01</span>
              <span className="flow-icon local">
                <FileCode2 size={16} />
              </span>
              <div>
                <strong>Arşiv yükleme</strong>
                <p>
                  Arşiv ULAK sunucusunun yerel veri dizininde saklanır. Kaynak dış hizmete otomatik gönderilmez.
                </p>
              </div>
              <span className="flow-status active">YÜKLEMEDE</span>
            </div>

            <div className="flow-connector">
              <i />
            </div>

            <div className="flow-stage">
              <span className="flow-number">02</span>
              <span className="flow-icon ai">
                <Sparkles size={16} />
              </span>
              <div>
                <strong>AI analizi</strong>
                <p>
                  Kullanıcı modeli seçip onay kutusunu işaretleyince, sınırlı ve maskelenmiş dosya bağlamı EVREN LLM
                  Gateway üzerinden seçili modele gönderilir.
                </p>
              </div>
              <span className={`flow-status ${project?.aiConsentAt ? "complete" : "locked"}`}>
                {project?.aiConsentAt ? "KULLANILDI" : "KAPALI"}
              </span>
            </div>

            <div className="flow-connector">
              <i />
            </div>

            <div className="flow-stage">
              <span className="flow-number">03</span>
              <span className="flow-icon web">
                <Globe2 size={16} />
              </span>
              <div>
                <strong>Canlı araştırma</strong>
                <p>
                  Onaylanan sorgular, paket adları ve sürümleri herkese açık API’lere gider. Kodun tamamı arama
                  sağlayıcısına gönderilmez.
                </p>
              </div>
              <span className={`flow-status ${project?.researchConsentAt ? "complete" : "locked"}`}>
                {project?.researchConsentAt ? "KULLANILDI" : "KAPALI"}
              </span>
            </div>
          </div>
        </section>

        <div className="privacy-side">
          <section className="privacy-principle">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>Kod çalıştırılmaz</strong>
              <p>Yüklenen arşivden hiçbir binary/script yürütülmez. Yalnız dosya envanteri ve statik metin taraması yapılır.</p>
            </div>
          </section>

          <section className="privacy-principle">
            <span>
              <Database size={17} />
            </span>
            <div>
              <strong>Projeler oturuma bağlı</strong>
              <p>
                Uygulama rastgele tarayıcı oturumuyla kayıt sahipliğini ayırır. Bu sürüm giriş/kimlik doğrulama
                içermez; linki başkalarıyla paylaşmayın.
              </p>
            </div>
          </section>

          <section className="privacy-principle warning">
            <span>
              <TriangleAlert size={17} />
            </span>
            <div>
              <strong>Silme davranışı</strong>
              <p>
                Proje kaydını kaldırmak, yerel veri dizinindeki arşiv nesnesini de siler. Veritabanı satırı denetim izi
                için pasif olarak işaretlenir.
              </p>
            </div>
          </section>

          <div className="privacy-status-list">
            <div>
              <span>Site analitiği</span>
              <strong>
                <Check size={13} /> Kapalı
              </strong>
            </div>
            <div>
              <span>Üçüncü taraf script’i</span>
              <strong>
                <Check size={13} /> Kapalı
              </strong>
            </div>
            <div>
              <span>LLM / web isteği</span>
              <strong>
                <LockKeyhole size={13} /> Onay gerekli
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div className="privacy-footer-note">
        <ShieldCheck size={15} />
        <span>
          Özel ULAK Preview alanı için tasarlanmıştır. Çok kullanıcılı yayıma geçmeden önce gerçek kimlik doğrulama,
          erişim rolleri, kullanıcıya özel arşiv silme ve saklama süresi eklenmelidir.
        </span>
      </div>
    </div>
  );
}
