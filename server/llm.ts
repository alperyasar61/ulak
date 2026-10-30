export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** EVREN LLM Gateway'in `/v1/models` yanıtındaki model kaydı. */
export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  task?: string;
  modalities?: string[];
  ownedBy?: string;
  /** Her iki fiyat da sıfırsa promosyon/ücretsiz dönem demektir. */
  freeUntil?: string;
  isFree?: boolean;
}

const DEFAULT_BASE_URL = "https://evren-llmapi.ssyz.org.tr/v1";
const MODEL_CACHE_MS = 60_000;
/** Bazı modeller (ör. glm-5.3) uzun bağlamlarda 3 dakikayı aşabiliyor; sınır ortamdan ayarlanabilir. */
const DEFAULT_TIMEOUT_MS = 300_000;
const NON_CHAT_MODEL = /(embedding|rerank|ocr|asr|tts|speech|transcri|guard|moderation|voxcpm)/i;

let cached: { models: ModelInfo[]; at: number } | null = null;

function gatewayConfig() {
  const base = (process.env.EVREN_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const key = process.env.EVREN_API_KEY ?? "";
  if (!key) throw new Error("EVREN API anahtarı yapılandırılmamış. Sunucu ortamına EVREN_API_KEY ekleyin.");
  return { base, key };
}

interface RawModel {
  id?: string;
  task?: string;
  modalities?: string[];
  owned_by?: string;
  pricing?: { prompt_token_price?: number; completion_token_price?: number; free_until?: string };
  context_length?: number;
  max_output_tokens?: number;
}

function isChatModel(model: RawModel) {
  if (!model.id) return false;
  if (model.task && model.task !== "chat") return false;
  return !NON_CHAT_MODEL.test(model.id);
}

function toModelInfo(model: RawModel): ModelInfo {
  const pricing = model.pricing ?? {};
  const isFree = Number(pricing.prompt_token_price ?? 0) === 0 && Number(pricing.completion_token_price ?? 0) === 0;
  return {
    id: String(model.id),
    name: String(model.id),
    description: isFree
      ? `EVREN LLM Gateway${pricing.free_until ? ` · ${pricing.free_until} tarihine kadar ücretsiz` : " · ücretsiz dönem"}`
      : "EVREN LLM Gateway · kredi ile ücretlendirilir",
    task: model.task ?? "chat",
    modalities: Array.isArray(model.modalities) ? model.modalities : ["text"],
    ownedBy: model.owned_by ?? "evren",
    freeUntil: pricing.free_until,
    isFree,
  };
}

export async function listAvailableModels(): Promise<ModelInfo[]> {
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.models;
  const { base, key } = gatewayConfig();
  const response = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: RawModel[];
    error?: { message?: string };
  };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `EVREN model listesi alınamadı (${response.status}).`);
  }
  const models = (body.data ?? []).filter(isChatModel).map(toModelInfo);
  if (!models.length) throw new Error("EVREN hesabında sohbet modeli bulunamadı.");
  cached = { models, at: Date.now() };
  return models;
}

export async function chatWithModel(modelId: string, messages: ChatMessage[], maxTokens = 7_000) {
  const models = await listAvailableModels();
  if (!models.some((model) => model.id === modelId)) {
    throw new Error(`"${modelId}" modeli EVREN hesabında kullanılabilir değil.`);
  }
  const { base, key } = gatewayConfig();
  const timeoutMs = Number(process.env.EVREN_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const request = async () => fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, temperature: 0.2 }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let response = await request();
  // EVREN kapasite hatası kısa süreli olabilir; tek bir kez yeniden denenir.
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    response = await request();
  }

  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | Array<{ type?: string; text?: string }>; reasoning?: string };
    }>;
  };
  if (!response.ok || result.error) {
    throw new Error(result.error?.message ?? `EVREN AI isteği başarısız oldu (${response.status}).`);
  }

  const choice = result.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : content;
  if (!text?.trim()) {
    throw new Error(choice?.finish_reason === "length"
      ? "Model yanıtı token sınırında kesildi; daha kısa bir bağlamla yeniden deneyin."
      : "AI boş yanıt döndürdü; sonuç kaydedilmedi.");
  }
  return { text: text.trim(), finishReason: choice?.finish_reason };
}
