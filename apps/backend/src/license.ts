/**
 * Lisans sınıflandırması — ARASTIRMA_YONTEMI.md §4.2.
 *
 * Kural: lisansı README'den değil **LICENSE dosyasının içeriğinden** oku.
 * README "MIT" yazarken LICENSE "Business Source License" olabilir; bu ikisinin
 * çelişmesi tek başına en değerli bulgudur.
 */

export type LicenseClass = "A" | "B" | "C" | "D" | "E";

export interface LicenseInfo {
  /** LICENSE dosyasından okunan lisans adı; dosya yoksa null. */
  detected: string | null;
  class: LicenseClass;
  /** Lisans dosyasının arşivdeki yolu. */
  file: string | null;
  /** Sınıflandırmayı doğrulayan ilk anlamlı satırlar. */
  evidence: string[];
  /** README'nin iddia ettiği lisans adı. */
  readmeClaim: string | null;
  readmeClaimClass: LicenseClass | null;
  /** README iddiası ile LICENSE içeriği çelişiyor mu? */
  mismatch: boolean;
  reason: string;
}

export const LICENSE_CLASS_LABEL: Record<LicenseClass, string> = {
  A: "Kısıt yok",
  B: "Copyleft — yalnızca alt süreç",
  C: "Ticari kısıtlı — varsayılan olamaz",
  D: "Atıf zorunlu",
  E: "Doğrulanmamış — kullanılamaz",
};

interface Rule {
  class: LicenseClass;
  name: string;
  pattern: RegExp;
}

/**
 * Sıra kritiktir: kısıtlayıcı lisanslar önce denenir. `LGPL` metni içinde
 * "GNU General Public License" da geçtiği için LGPL, GPL'den önce gelmek zorunda.
 */
const RULES: Rule[] = [
  { class: "C", name: "Business Source License", pattern: /business source license|\bBSL\s*1\.1\b/i },
  { class: "C", name: "Elastic License", pattern: /elastic license/i },
  { class: "C", name: "Server Side Public License", pattern: /server side public license|\bSSPL\b/i },
  { class: "C", name: "Commons Clause", pattern: /commons clause/i },
  { class: "C", name: "Ticari olmayan kullanım", pattern: /non[- ]?commercial|\bCC BY-NC/i },
  { class: "B", name: "AGPL", pattern: /\bAGPL\b|GNU Affero General Public License/i },
  { class: "B", name: "LGPL", pattern: /\bLGPL\b|GNU Lesser General Public License/i },
  { class: "B", name: "GPL", pattern: /\bGPL\b|GNU General Public License/i },
  { class: "B", name: "MPL", pattern: /Mozilla Public License/i },
  { class: "D", name: "CC BY", pattern: /creative commons attribution|\bCC BY\b/i },
  { class: "A", name: "Apache-2.0", pattern: /apache license|apache-2\.0/i },
  { class: "A", name: "MIT", pattern: /\bMIT\b/ },
  { class: "A", name: "BSD", pattern: /BSD \d-Clause|Redistribution and use in source and binary forms/i },
  { class: "A", name: "ISC", pattern: /\bISC\b/ },
  { class: "A", name: "Unlicense", pattern: /unlicense|public domain dedication/i },
  { class: "A", name: "CC0", pattern: /\bCC0\b/i },
];

const LICENSE_FILE = /(^|\/)(license|licence|copying|copyright)(\.(md|txt|rst))?$/i;
const README_FILE = /(^|\/)readme(\.(md|txt|rst))?$/i;

function firstMatch(text: string): Rule | null {
  for (const rule of RULES) if (rule.pattern.test(text)) return rule;
  return null;
}

/** Lisans metninden sınıflandırma kanıtı olarak gösterilecek ilk anlamlı satırlar. */
function evidenceLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && !/^[-=*_\s]+$/.test(line))
    .slice(0, 3)
    .map((line) => line.slice(0, 160));
}

export function classifyLicense(
  files: Array<{ path: string; content: string }>,
  archiveNames: string[],
): LicenseInfo {
  const licensePath = archiveNames.find((name) => LICENSE_FILE.test(name)) ?? null;
  const licenseFile = licensePath ? files.find((file) => file.path === licensePath) : undefined;
  const readmeFile = files.find((file) => README_FILE.test(file.path));

  const readmeRule = readmeFile ? firstMatch(readmeFile.content.slice(0, 8_000)) : null;

  if (!licensePath) {
    return {
      detected: null,
      class: "E",
      file: null,
      evidence: [],
      readmeClaim: readmeRule?.name ?? null,
      readmeClaimClass: readmeRule?.class ?? null,
      mismatch: false,
      reason: "Lisans dosyası yok; yeniden kullanım koşulları doğrulanamaz.",
    };
  }

  if (!licenseFile) {
    return {
      detected: null,
      class: "E",
      file: licensePath,
      evidence: [],
      readmeClaim: readmeRule?.name ?? null,
      readmeClaimClass: readmeRule?.class ?? null,
      mismatch: false,
      reason: "Lisans dosyası arşivde var fakat içeriği okunamadı (ikili dosya veya boyut sınırı).",
    };
  }

  const text = licenseFile.content.slice(0, 12_000);
  const rule = firstMatch(text);

  if (!rule) {
    return {
      detected: null,
      class: "E",
      file: licensePath,
      evidence: evidenceLines(text),
      readmeClaim: readmeRule?.name ?? null,
      readmeClaimClass: readmeRule?.class ?? null,
      mismatch: false,
      reason: "Lisans metni tanınan bir şablona uymuyor; hukuki inceleme gerekir.",
    };
  }

  return {
    detected: rule.name,
    class: rule.class,
    file: licensePath,
    evidence: evidenceLines(text),
    readmeClaim: readmeRule?.name ?? null,
    readmeClaimClass: readmeRule?.class ?? null,
    mismatch: Boolean(readmeRule && readmeRule.class !== rule.class),
    reason: LICENSE_CLASS_LABEL[rule.class],
  };
}

const SEVERITY: Record<LicenseClass, "high" | "medium" | "low"> = { A: "low", B: "medium", C: "high", D: "low", E: "high" };

/**
 * Lisans sınıfını bulguya çevirir. A sınıfı bulgu üretmez: kısıt yoksa
 * raporu gürültüyle doldurmak, gerçek riskleri görünmez kılar.
 */
export function licenseFinding(info: LicenseInfo): {
  id: string;
  area: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string[];
  confidence: "medium" | "low";
} | null {
  if (info.class === "A" && !info.mismatch) return null;

  const evidence = [
    ...(info.file ? [`${info.file} → ${info.detected ?? "tanınmadı"} (${info.class})`] : []),
    ...(info.readmeClaim ? [`README iddiası → ${info.readmeClaim} (${info.readmeClaimClass})`] : []),
    ...info.evidence,
  ];

  if (info.mismatch) {
    return {
      id: "license-readme-mismatch",
      area: "Yönetişim",
      severity: "high",
      title: "README'nin lisans iddiası LICENSE dosyasıyla çelişiyor",
      detail: `README "${info.readmeClaim}" diyor, LICENSE dosyası "${info.detected}" içeriyor. Yeniden kullanım kararı LICENSE dosyasına göre verilmelidir; README iddiası güvenilir değildir.`,
      evidence,
      confidence: "medium",
    };
  }

  if (info.class === "E") {
    return {
      id: "license-unverified",
      area: "Yönetişim",
      severity: "high",
      title: "Lisans doğrulanamadı — kod yeniden kullanılamaz",
      detail: `${info.reason} Lisansı doğrulanmamış bir projeden kod almak, kaynağı belirsiz bir yükümlülük devralmak demektir.`,
      evidence,
      confidence: "medium",
    };
  }

  if (info.class === "C") {
    return {
      id: "license-commercial-restriction",
      area: "Yönetişim",
      severity: "high",
      title: "Lisans ticari kullanımı kısıtlıyor",
      detail: `${info.detected} lisansı ticari kullanımı koşullu veya ücretli hale getirir. Varsayılan motor olarak seçilemez; kullanım ölçeği ve gelir eşiği ayrıca kontrol edilmelidir.`,
      evidence,
      confidence: "medium",
    };
  }

  if (info.class === "B") {
    return {
      id: "license-copyleft-boundary",
      area: "Yönetişim",
      severity: "medium",
      title: "Copyleft lisans — yalnızca alt süreç olarak çağrılabilir",
      detail: `${info.detected} lisansı, kendi kodunuza bağlanan türev çalışmaların aynı lisansla dağıtılmasını ister. Kod içe aktarılmadan, ayrı süreç olarak çalıştırılmalıdır.`,
      evidence,
      confidence: "medium",
    };
  }

  return {
    id: "license-attribution-required",
    area: "Yönetişim",
    severity: SEVERITY[info.class],
    title: "Lisans atıf zorunluluğu getiriyor",
    detail: `${info.detected} lisansı atıf metninin korunmasını ister. Atıf metni dağıtımla birlikte saklanmalıdır.`,
    evidence,
    confidence: "medium",
  };
}
