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
