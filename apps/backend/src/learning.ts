import { createHash } from "node:crypto";
import type { LocalFinding } from "./archive.js";

export const SHARED_KNOWLEDGE_CATEGORIES = ["security", "architecture", "testing", "performance", "other"] as const;
export type SharedKnowledgeCategory = typeof SHARED_KNOWLEDGE_CATEGORIES[number];

export interface SecurityLearningNote {
  id: string;
  title: string;
  recommendation: string;
  scansSeen: number;
  source?: "builtin" | "shared";
  category?: SharedKnowledgeCategory;
  contributions?: number;
}

export interface SharedKnowledgeInput {
  category: SharedKnowledgeCategory;
  title: string;
  recommendation: string;
}

const SENSITIVE_CONTENT = [
  /https?:\/\/|www\./i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/i,
  /\b(?:token|secret|password|passwd|api[_-]?key|authorization|client[_-]?secret)\s*[:=]/i,
  /(?:^|\s)(?:[A-Za-z]:[\\/]|\.{0,2}[\\/]|\/)[\w.-]+(?:[\\/][\w.-]+)+/,
  /\b[\w.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|json|ya?ml|env|zip)\b/i,
  /[`{}<>]/,
];

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function validateSharedKnowledgeInput(value: unknown, forbiddenTerms: string[] = []): SharedKnowledgeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Öğrenme notu biçimi geçersiz.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["category", "title", "recommendation"].includes(key))) {
    throw new Error("Öğrenme notunda beklenmeyen alan var.");
  }
  if (typeof record.category !== "string" || !SHARED_KNOWLEDGE_CATEGORIES.includes(record.category as SharedKnowledgeCategory)) {
    throw new Error("Geçerli bir öğrenme notu kategorisi seçin.");
  }
  if (typeof record.title !== "string" || typeof record.recommendation !== "string") {
    throw new Error("Başlık ve genel öneri metni gerekli.");
  }

  const title = normalizeText(record.title);
  const recommendation = normalizeText(record.recommendation);
  if (title.length < 8 || title.length > 100) throw new Error("Başlık 8-100 karakter arasında olmalı.");
  if (recommendation.length < 20 || recommendation.length > 600) throw new Error("Öneri 20-600 karakter arasında olmalı.");
  if (/[\u0000-\u001f\u007f]/.test(title + recommendation)) throw new Error("Kontrol karakterleri öğrenme notuna eklenemez.");
  if (SENSITIVE_CONTENT.some((pattern) => pattern.test(title) || pattern.test(recommendation))) {
    throw new Error("Notta proje/servis bilgisi, dosya yolu, kod veya hassas veri olabilecek bir ifade var. Yalnız genel ilkeyi yazın.");
  }

  const normalizedNote = `${title} ${recommendation}`.toLocaleLowerCase("tr");
  for (const term of forbiddenTerms) {
    const normalizedTerm = normalizeText(term).toLocaleLowerCase("tr");
    if (normalizedTerm.length >= 5 && normalizedNote.includes(normalizedTerm)) {
      throw new Error("Not proje veya kaynak adı içeriyor. Projeden bağımsız genel bir ifade kullanın.");
    }
  }

  return { category: record.category as SharedKnowledgeCategory, title, recommendation };
}

export function sharedKnowledgeId(note: SharedKnowledgeInput) {
  const canonical = [note.category, note.title, note.recommendation]
    .map((value) => normalizeText(value).toLocaleLowerCase("tr"))
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const LEARNING_RULES: Record<string, Omit<SecurityLearningNote, "scansSeen">> = {
  "secret-files": {
    id: "secret-files",
    title: "Gizli dosyalar",
    recommendation: "Gizli dosyaları depoya eklemeyin; secret manager kullanın ve sızmış olabilecek anahtarları döndürün.",
  },
  "possible-hardcoded-secret": {
    id: "possible-hardcoded-secret",
    title: "Kaynakta sabit sır",
    recommendation: "Sırları kaynak kodundan çıkarıp secret manager veya ortam değişkeni kullanın; eşleşmeyi manuel doğrulayın.",
  },
  "dynamic-execution": {
    id: "dynamic-execution",
    title: "Dinamik kod çalıştırma",
    recommendation: "Dinamik çalıştırma girdilerinin güven sınırlarını ve mümkünse izin listesi/sandbox kullanımını inceleyin.",
  },
  "tainted-input-sink": {
    id: "tainted-input-sink",
    title: "Girdi ve tehlikeli sink",
    recommendation: "Kullanıcı girdisinin komut veya HTML sink’ine ulaşıp ulaşmadığını veri akışı analiziyle doğrulayın.",
  },
  "api-auth-review": {
    id: "api-auth-review",
    title: "API yetkilendirmesi",
    recommendation: "Hassas route’larda her istekte kimlik doğrulama ve kaynak bazlı yetkilendirme uygulandığını doğrulayın.",
  },
  "pii-data-signal": {
    id: "pii-data-signal",
    title: "Kişisel veri işleme",
    recommendation: "Kişisel veri için veri minimizasyonu, erişim denetimi, log maskeleme ve saklama süresini gözden geçirin.",
  },
  "insecure-tls-verification": {
    id: "insecure-tls-verification",
    title: "TLS doğrulaması",
    recommendation: "Üretim ortamında TLS sertifika doğrulamasını kapatmayın; test istisnalarını üretim yapılandırmasından ayırın.",
  },
  "permissive-cors": {
    id: "permissive-cors",
    title: "CORS kapsamı",
    recommendation: "CORS izinlerini gereken origin’lerle sınırlayın ve kimlik bilgileriyle birlikte wildcard kullanmayın.",
  },
};

export function securityLearningRules() {
  return LEARNING_RULES;
}

export function securityLearningIds(findings: LocalFinding[]) {
  return [...new Set(findings.map((finding) => finding.id).filter((id) => Object.hasOwn(LEARNING_RULES, id)))];
}
