export type AuditStatus = "pass" | "watch" | "risk";
export type AuditSeverity = "high" | "medium" | "low";

export interface ProactiveCheck {
  id: string;
  category: string;
  title: string;
  status: AuditStatus;
  severity: AuditSeverity;
  summary: string;
  why: string;
  evidence: string[];
  nextStep: string;
  basis: string;
}

export interface ProactiveAudit {
  score: number;
  grade: "A" | "B" | "C" | "D";
  summary: string;
  checkedAt: string;
  checks: ProactiveCheck[];
  externalResearchPending: boolean;
}

type TextFile = { path: string; content: string };
type Dependency = { name: string; version: string; ecosystem: string };

function hasName(names: string[], pattern: RegExp) {
  return names.some((name) => pattern.test(name));
}
function hasContent(files: TextFile[], pattern: RegExp) {
  return files.some((file) => pattern.test(file.content));
}
function checkStatus(ok: boolean, watch: boolean): AuditStatus {
  return ok ? "pass" : watch ? "watch" : "risk";
}
function gradeFor(score: number): ProactiveAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function buildProactiveAudit(input: {
  archiveNames: string[];
  textFiles: TextFile[];
  dependencies: Dependency[];
  secretFileCount: number;
  hasDynamicExecution: boolean;
}): ProactiveAudit {
  const names = input.archiveNames.map((name) => name.replace(/\\/g, "/"));
  const lowerNames = names.map((name) => name.toLowerCase());
  const hasManifest = hasName(lowerNames, /(^|\/)(package\.json|pyproject\.toml|requirements(?:-[^/]+)?\.txt|cargo\.toml|go\.mod|composer\.json)$/);
  const hasLock = hasName(lowerNames, /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pipfile\.lock|cargo\.lock|go\.sum|composer\.lock)$/);
  const hasTests = hasName(lowerNames, /(^|\/)(__tests__|tests?|specs?)(\/|\.)/) || hasName(lowerNames, /(^|\/)(vitest|jest|pytest|tox|go\.test)\.[^/]+$/);
  const hasCi = hasName(lowerNames, /(^|\/)(\.github\/workflows|\.gitlab-ci\.yml|jenkinsfile|azure-pipelines\.yml|circleci\/config\.yml)(\/|$)/);
  const hasSecurityDocs = hasName(lowerNames, /(^|\/)(security\.md|\.github\/security\.md|codeowners)$/);
  const hasLicense = hasName(lowerNames, /(^|\/)(license|license\.md|license\.txt|copying)(\.|$)/);
  const hasReadme = hasName(lowerNames, /(^|\/)readme(?:\.|$)/);
  const hasDocker = hasName(lowerNames, /(^|\/)(dockerfile|\.dockerignore|docker-compose[^/]*\.ya?ml)$/);
  const hasBinary = hasName(lowerNames, /\.(exe|dll|so|dylib|class|jar|bin|wasm)$/);
  const hasPinned = input.dependencies.length > 0 && input.dependencies.every((dependency) => /(?:^|[^\d])\d+\.\d+(?:\.\d+)?/.test(dependency.version));
  const filesWithRuntimeSecrets = input.textFiles.filter((file) => /(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[=:]\s*["'][^"']{8,}["']/i.test(file.content));
  const checks: ProactiveCheck[] = [
    {
      id: "dependency-locking", category: "Tedarik zinciri", title: "Bağımlılık sürümleri kilitlenmiş mi?",
      status: checkStatus(hasLock, hasManifest), severity: hasLock ? "low" : "high",
      summary: hasLock ? "Kilit dosyası bulundu; yeniden üretilebilir kurulum için olumlu sinyal." : hasManifest ? "Manifest var fakat kilit dosyası görünmüyor." : "Desteklenen bağımlılık manifesti bulunamadı.",
      why: "Kilitlenmemiş sürümler, farklı kurulumlarda beklenmeyen paket veya davranış riskini büyütür.",
      evidence: (hasLock ? lowerNames.filter((name) => /(lock|go\.sum)/.test(name)) : lowerNames.filter((name) => /(package\.json|pyproject|requirements|cargo\.toml|go\.mod)/.test(name))).slice(0, 4),
      nextStep: hasLock ? "Kilit dosyasını CI’da güncel tutun ve değişiklikleri inceleyin." : "Kullandığınız ekosistemin lockfile’ını üretip değişiklikleri kod incelemesinden geçirin.",
      basis: "OpenSSF Scorecard — Pinned Dependencies",
    },
    {
      id: "test-ci", category: "Kalite", title: "Test ve sürekli entegrasyon izi",
      status: checkStatus(hasTests && hasCi, hasTests || hasCi), severity: hasTests && hasCi ? "low" : "medium",
      summary: hasTests && hasCi ? "Test yapısı ve CI yapılandırması birlikte görünüyor." : hasTests ? "Test izi var; CI yapılandırması ayrıca doğrulanmalı." : hasCi ? "CI izi var; test kapsamı arşivden doğrulanamadı." : "Belirgin test veya CI izi bulunamadı.",
      why: "Proaktif denetimin tekrar edilebilir olması ve güvenli değişiklik yapılması için otomatik test sinyali gerekir.",
      evidence: [...(hasTests ? lowerNames.filter((name) => /(test|spec|pytest|vitest|jest)/.test(name)).slice(0, 3) : []), ...(hasCi ? lowerNames.filter((name) => /\.github\/workflows|gitlab-ci|jenkinsfile|circleci/.test(name)).slice(0, 2) : [])],
      nextStep: hasTests && hasCi ? "Kritik yolları ve güvenlik kontrollerini CI’da zorunlu tutun." : "En az bir hızlı test komutu ve CI workflow’u ekleyin; içerik çalıştırılmadan yalnızca varlığı işaretlendi.",
      basis: "OpenSSF Scorecard — CI Tests / SAST",
    },
    {
      id: "secrets", category: "Güvenlik", title: "Sır ve kimlik bilgisi hijyeni",
      status: checkStatus(input.secretFileCount === 0 && filesWithRuntimeSecrets.length === 0, false), severity: input.secretFileCount || filesWithRuntimeSecrets.length ? "high" : "low",
      summary: input.secretFileCount || filesWithRuntimeSecrets.length ? "Sır içerebilecek dosya veya sabit değer sinyali var; içerik rapora alınmadı." : "Bilinen sır dosyası veya sabit sır örüntüsü görülmedi.",
      why: "Depoya giren anahtarlar yetkisiz kullanım, veri sızıntısı ve maliyet riski yaratabilir.",
      evidence: [...(input.secretFileCount ? [".env/credentials benzeri dosyalar (içerik okunmadı)"] : []), ...filesWithRuntimeSecrets.map((file) => `${file.path} (değer maskelendi)`).slice(0, 4)],
      nextStep: input.secretFileCount || filesWithRuntimeSecrets.length ? "Anahtarları döndürün, geçmişten temizleyin ve secret manager kullanın." : "Secret scanning ve push protection benzeri kontrolleri CI’a ekleyin.",
      basis: "GitHub Code Security — Secret scanning",
    },
    {
      id: "governance", category: "Yönetişim", title: "Güvenlik politikası ve lisans",
      status: checkStatus(hasSecurityDocs && hasLicense, hasSecurityDocs || hasLicense), severity: hasSecurityDocs && hasLicense ? "low" : "medium",
      summary: hasSecurityDocs && hasLicense ? "Güvenlik yönetişimi ve lisans işareti bulundu." : "Güvenlik politikası veya lisans eksik/tespit edilemedi.",
      why: "Sorumlu bildirim, kullanım koşulları ve bakım sahipliği belirsizliği operasyonel riski artırır.",
      evidence: [...(hasSecurityDocs ? lowerNames.filter((name) => /security\.md|codeowners/.test(name)).slice(0, 2) : []), ...(hasLicense ? lowerNames.filter((name) => /license|copying/.test(name)).slice(0, 2) : [])],
      nextStep: hasSecurityDocs && hasLicense ? "Sorumluları ve güvenlik iletişim kanalını güncel tutun." : "SECURITY.md, CODEOWNERS ve uygun bir LICENSE ekleyin.",
      basis: "OpenSSF Scorecard — Security Policy / Licence",
    },
    {
      id: "documentation", category: "Bakım", title: "Yeni katkı için açıklanabilirlik",
      status: checkStatus(hasReadme, false), severity: hasReadme ? "low" : "medium",
      summary: hasReadme ? "README bulundu; amacı ve kurulum akışı ayrıca incelenebilir." : "README görünmüyor.",
      why: "Projenin amacı, kurulum sınırları ve güvenli çalıştırma varsayımları belgelenmezse bakım maliyeti artar.",
      evidence: hasReadme ? lowerNames.filter((name) => /readme/.test(name)).slice(0, 3) : [],
      nextStep: hasReadme ? "Kurulum, tehdit modeli ve veri akışını README’de güncel tutun." : "Amaç, kurulum, test, dağıtım ve güvenlik sınırlarını açıklayan README ekleyin.",
      basis: "OpenSSF Scorecard — Maintenance",
    },
    {
      id: "artifact-integrity", category: "Tedarik zinciri", title: "Kaynak ve build bütünlüğü sinyali",
      status: checkStatus(!hasBinary && (hasCi || !hasDocker), hasDocker || hasBinary), severity: hasBinary ? "high" : "low",
      summary: hasBinary ? "Arşivde kontrol edilmesi gereken ikili/derlenmiş artefakt bulundu." : hasCi ? "CI izi var; artefakt üretim hattı gözden geçirilebilir." : "İkili artefakt görülmedi, fakat build hattı arşivden doğrulanamadı.",
      why: "Derlenmiş dosyaların kaynağa göre izlenebilirliği ve build provenansı tedarik zinciri güveninin temelidir.",
      evidence: hasBinary ? lowerNames.filter((name) => /\.(exe|dll|so|dylib|class|jar|bin|wasm)$/.test(name)).slice(0, 5) : (hasCi ? ["CI yapılandırması görüldü"] : []),
      nextStep: hasBinary ? "İkilileri kaynaktan üretin; provenance ve imzalı release yaklaşımını değerlendirin." : "Build çıktısının hangi commit’ten üretildiğini belgeleyin.",
      basis: "SLSA — artifact integrity and provenance",
    },
    {
      id: "runtime-risk", category: "Güvenlik", title: "Dinamik çalıştırma sinyali",
      status: checkStatus(!input.hasDynamicExecution, true), severity: input.hasDynamicExecution ? "medium" : "low",
      summary: input.hasDynamicExecution ? "eval/exec/shell benzeri kullanım bulundu; veri akışı doğrulanmalı." : "Bilinen dinamik çalıştırma örüntüsü görülmedi.",
      why: "Kullanıcı girdisine ulaşan dinamik çalıştırma kalıpları enjeksiyon ve uzaktan kod çalıştırma riskini büyütebilir.",
      evidence: input.hasDynamicExecution ? ["Statik örüntü bulundu; satır içeriği gösterilmedi"] : [],
      nextStep: input.hasDynamicExecution ? "Kullanıcı girdisinin akışını inceleyin; izinli komut listesi ve sandbox sınırı kullanın." : "SAST ve güvenlik testleriyle kontrolü derinleştirin.",
      basis: "OWASP ASVS 5.0.0 — secure development verification",
    },
    {
      id: "freshness", category: "Güncellik", title: "Güncel sürüm araştırmasına hazır mı?",
      status: checkStatus(!input.dependencies.length || hasManifest, true), severity: input.dependencies.length && !hasManifest ? "medium" : "low",
      summary: input.dependencies.length ? `${input.dependencies.length} bağımlılık çıkarıldı; güncel sürüm ve OSV eşlemesi için canlı araştırma bekliyor.` : "İncelenecek desteklenen bağımlılık kaydı çıkarılamadı.",
      why: "Yerel arşiv tek başına paketin güncel veya zafiyetsiz olduğunu kanıtlayamaz; sürüm kanıtı ayrı kaynaktan doğrulanmalıdır.",
      evidence: input.dependencies.slice(0, 5).map((dependency) => `${dependency.name}${dependency.version ? `@${dependency.version}` : " (sürüm belirsiz)"}`),
      nextStep: input.dependencies.length ? "Sorguları inceleyip canlı araştırmayı onaylayın; OSV ve registry sonuçlarını sürüm uyumluluğuyla birlikte değerlendirin." : "Manifest formatını desteklenen bir dosyada açıkça belirtin.",
      basis: "OSV.dev, npm Registry ve PyPI JSON API",
    },
  ];
  const points = checks.reduce((total, check) => total + (check.status === "pass" ? 100 : check.status === "watch" ? 62 : 25), 0);
  const score = Math.round(points / checks.length);
  const risks = checks.filter((check) => check.status === "risk").length;
  const watches = checks.filter((check) => check.status === "watch").length;
  return {
    score,
    grade: gradeFor(score),
    summary: risks ? `${risks} kritikleşen sinyal ve ${watches} izleme alanı var. Önce yüksek etkili kontrolleri doğrulayın.` : watches ? `Kritik kırmızı sinyal yok; ${watches} alan için doğrulama veya canlı araştırma öneriliyor.` : "Temel proaktif kontrollerde güçlü sinyaller var; bu sonuç tam güvenlik kanıtı değildir.",
    checkedAt: new Date().toISOString(),
    checks,
    externalResearchPending: input.dependencies.length > 0,
  };
}
