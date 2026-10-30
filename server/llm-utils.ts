/**
 * AI raporunun beklenen şeması. Modelin serbest biçimde farklı anahtarlar üretmesini
 * engellemek için istem metnine eklenir; sunucu yine de alanları tek tek doğrular.
 */
export const AI_REPORT_SCHEMA = `Yanıtı yalnızca aşağıdaki şemaya uyan tek bir JSON nesnesi olarak döndür. Açıklama, markdown veya kod bloğu ekleme.
{
  "summary": "string — mimari ve en önemli riskler, en fazla 3 cümle",
  "architecture": [{ "name": "string", "detail": "string", "evidence": ["manifestteki/dosya/yolu"] }],
  "findings": [{ "title": "string", "area": "string", "severity": "high|medium|low", "detail": "string", "impact": "string", "confidence": "high|medium|low", "evidence": ["manifestteki/dosya/yolu"], "steps": ["string"] }],
  "roadmap": [{ "title": "string", "area": "string", "severity": "high|medium|low", "detail": "string", "impact": "string", "effort": "string", "confidence": "high|medium|low", "evidence": ["manifestteki/dosya/yolu"], "steps": ["string"] }],
  "questions": ["string"]
}
Kurallar: en fazla 8 bulgu ve 5 yol haritası adımı üret. "evidence" alanına yalnızca verilen dosya manifestinde birebir geçen yolları yaz; emin değilsen boş dizi bırak. Kanıtı olmayan iddiayı bulgu olarak yazma. Tüm metinler Türkçe olsun.`;

export function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI yanıtı beklenen JSON rapor biçiminde değil.");
  const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI rapor yapısı geçersiz.");
  return value as Record<string, unknown>;
}

export function cleanText(value: unknown, max = 2_000) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}
