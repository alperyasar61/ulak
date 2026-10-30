export interface ModelInfo {
  id: string;
  display_name?: string;
  description?: string;
  owned_by?: string;
  pricing?: { input_per_1m_usd?: number; output_per_1m_usd?: number; input_credits_per_1m_tokens?: number; output_credits_per_1m_tokens?: number };
  capabilities?: Record<string, unknown>;
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

function platformConfig() {
  const base = (process.env.MANUS_API_URL || process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
  const key = process.env.MANUS_API_KEY || process.env.BUILT_IN_FORGE_API_KEY || "";
  if (!base || !key) throw new Error("Platform AI servisi yapılandırılmamış.");
  return { base, key };
}

export async function listAvailableModels(): Promise<ModelInfo[]> {
  const { base, key } = platformConfig();
  const response = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as { data?: ModelInfo[]; error?: { message?: string } };
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `Model listesi alınamadı (${response.status}).`);
  return (body.data ?? []).filter((m) => m.id && !/unsupported|deprecated|superseded|shutdown/i.test(m.description ?? ""));
}

export async function chatWithModel(modelId: string, messages: ChatMessage[]) {
  const models = await listAvailableModels();
  const model = models.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error("Seçilen AI modeli bu projede kullanılabilir değil.");
  const { base, key } = platformConfig();
  const body: Record<string, unknown> = { model: modelId, messages };
  const owner = (model.owned_by ?? "").toLowerCase();
  const thinkingParam = String(model.capabilities?.thinking_param ?? "");
  const description = model.description ?? "";
  if (owner.includes("google") || modelId.startsWith("gemini")) {
    body.max_tokens = 7_000;
    if (thinkingParam === "reasoning") body.reasoning = { effort: "low" };
    if (thinkingParam === "thinking") body.thinking = { budget_tokens: 1_024 };
  } else if (owner.includes("openai") || modelId.startsWith("gpt")) {
    body.max_completion_tokens = 7_000;
    const effortLine = /Effort:\s*([^\n]+)/i.exec(description)?.[1] ?? "";
    if (thinkingParam === "reasoning" && /\blow\b/i.test(effortLine)) body.reasoning = { effort: "low" };
  } else if (owner.includes("anthropic") || modelId.startsWith("claude")) {
    body.max_tokens = 7_000;
    if (thinkingParam === "thinking") body.thinking = { type: "enabled", budget_tokens: 2_048 };
  }
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  if (!response.ok || result.error) throw new Error(result.error?.message ?? `AI isteği başarısız oldu (${response.status}).`);
  const content = result.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((part) => part.text ?? "").join("\n") : content;
  if (!text?.trim()) throw new Error("AI boş yanıt döndürdü; sonuç kaydedilmedi.");
  return text.trim();
}
