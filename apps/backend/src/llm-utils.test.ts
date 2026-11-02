import { describe, expect, it } from "vitest";
import { AI_REPORT_SCHEMA, cleanText, extractJsonObject } from "./llm-utils.js";

describe("extractJsonObject", () => {
  it("düz JSON nesnesini ayrıştırır", () => {
    expect(extractJsonObject('{"summary":"ok"}')).toEqual({ summary: "ok" });
  });

  it("kod bloğu ve çevresindeki metni temizler", () => {
    const text = 'İşte rapor:\n```json\n{"summary":"x","findings":[]}\n```\nUmarım yardımcı olur.';
    expect(extractJsonObject(text)).toEqual({ summary: "x", findings: [] });
  });

  it("JSON olmayan yanıtı reddeder", () => {
    expect(() => extractJsonObject("rapor üretemedim")).toThrow(/JSON rapor biçiminde/);
  });

  it("bozuk JSON'da anlaşılır hata verir", () => {
    expect(() => extractJsonObject('{"summary": "a",}')).toThrow(/geçerli JSON değil/);
  });

  it("dizi kökünü geçersiz sayar", () => {
    expect(() => extractJsonObject("[1,2,3]")).toThrow();
  });
});

describe("cleanText", () => {
  it("string olmayanı boş döndürür", () => {
    expect(cleanText(null)).toBe("");
    expect(cleanText(42)).toBe("");
    expect(cleanText({ a: 1 })).toBe("");
  });

  it("NUL karakterini siler ve kırpar", () => {
    expect(cleanText("  a\u0000b  ")).toBe("ab");
  });

  it("üst sınırı uygular", () => {
    expect(cleanText("abcdef", 3)).toBe("abc");
  });
});

describe("AI_REPORT_SCHEMA", () => {
  it("zorunlu alan adlarını içerir", () => {
    for (const key of ["summary", "architecture", "findings", "roadmap", "questions"]) {
      expect(AI_REPORT_SCHEMA).toContain(`"${key}"`);
    }
  });

  it("kanıt kuralını açıkça belirtir", () => {
    expect(AI_REPORT_SCHEMA).toMatch(/evidence/);
    expect(AI_REPORT_SCHEMA).toMatch(/Türkçe/);
  });
});
