import { useEffect, useRef, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, MessageSquare, Send, Sparkles } from "lucide-react";
import type { ChatMessage, ModelChoice, Project } from "../types";
import { PageIntro } from "../components/PageIntro";

export function Conversation({
  project,
  messages,
  question,
  setQuestion,
  onSend,
  busy,
  consent,
  setConsent,
  selectedModel,
  modelInfo,
  onOpenFindings,
}: {
  project: Project;
  messages: ChatMessage[];
  question: string;
  setQuestion: (value: string) => void;
  onSend: (event: FormEvent) => void;
  busy: boolean;
  consent: boolean;
  setConsent: (value: boolean) => void;
  selectedModel: string;
  modelInfo: ModelChoice | null;
  onOpenFindings: () => void;
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  if (!project.aiReport) {
    return (
      <div className="page-content">
        <PageIntro
          eyebrow="TAKİP SOHBETİ"
          title="Rapora soru sor."
          copy="ULAK kayıtlı analiz özetini kullanır; ham arşiv içeriği takip sorusuna eklenmez."
        />
        <div className="roadmap-empty">
          <div className="roadmap-empty-mark">
            <MessageSquare size={22} />
          </div>
          <h2>Önce AI raporu gerekli.</h2>
          <p>Rapor hazır olduktan sonra bulgulara ve önerilere ilişkin takip soruları sorabilirsin.</p>
          <button className="primary-button" onClick={onOpenFindings}>
            <Sparkles size={16} /> Bulgulara git
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageIntro
        eyebrow="RAPOR HAKKINDA"
        title="Takıldığın yeri sor."
        copy="Yanıtlar kayıtlı rapor özetine dayanır. Her soru, sen onayladığında seçili modele iletilir."
      />

      <section className="chat-shell">
        <div className="chat-topline">
          <span className="chat-ai-icon">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>ULAK yardımcı</strong>
            <small>
              {project.name} rapor bağlamı · {modelInfo?.name ?? selectedModel}
            </small>
          </div>
          <span className="chat-cost">{modelInfo?.cost ?? "belirsiz"} maliyet</span>
        </div>

        <div className="chat-history">
          {messages.length ? (
            messages.map((message, index) => (
              <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                <span className="message-avatar">
                  {message.role === "assistant" ? <img src="/favicon.svg" alt="" /> : "S"}
                </span>
                <div>
                  <span className="message-role">{message.role === "assistant" ? "ULAK" : "SEN"}</span>
                  <p>{message.content}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="chat-welcome">
              <div className="chat-welcome-mark">
                <MessageSquare size={18} />
              </div>
              <strong>Raporun hakkında merak ettiğini sor.</strong>
              <p>Örnek: “Bu önerinin hangi dosyayla ilişkisi var?”</p>
              <div className="suggestion-chips">
                {["En önemli risk hangisi?", "İlk önce neyi düzeltmeliyim?"].map((item) => (
                  <button key={item} onClick={() => setQuestion(item)}>
                    {item} <ArrowRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {busy && (
            <div className="chat-thinking">
              <LoaderCircle size={15} className="spin" /> Rapor bağlamı yanıtlanıyor…
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form className="chat-compose" onSubmit={onSend}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Rapor hakkında bir soru yaz…"
            maxLength={2_000}
            rows={2}
          />
          <div className="chat-compose-bottom">
            <label className="consent-checkbox">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Bu soruyu seçili AI modeline göndermeyi onaylıyorum.</span>
            </label>
            <button
              className="send-button"
              type="submit"
              disabled={!question.trim() || !consent || busy || !selectedModel}
              aria-label="Soruyu gönder"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
        <div className="chat-retention">
          <LockKeyhole size={12} /> Sorular ve yanıtlar bu proje alanında saklanır.
        </div>
      </section>
    </div>
  );
}
