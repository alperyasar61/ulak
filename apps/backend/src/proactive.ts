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

export interface AuditDiff { scoreDelta: number; previousScore: number; currentScore: number; previousGrade: ProactiveAudit["grade"]; currentGrade: ProactiveAudit["grade"]; regressed: string[]; improved: string[]; newChecks: string[]; }

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
  /** §4.2 — LICENSE dosyasından sınıflandırılmış lisans; verilmezse yalnızca dosya varlığına bakılır. */
  license?: { class: "A" | "B" | "C" | "D" | "E"; detected: string | null; mismatch: boolean; readmeClaim?: string | null };
  /** §4.6 — gerçek test dosyası sayımı; boolean "test var mı" sorusunun yerini alır. */
  testCount?: number;
}): ProactiveAudit {
  const names = input.archiveNames.map((name) => name.replace(/\\/g, "/"));
  const lowerNames = names.map((name) => name.toLowerCase());
  const hasManifest = hasName(lowerNames, /(^|\/)(package\.json|pyproject\.toml|requirements(?:-[^/]+)?\.txt|cargo\.toml|go\.mod|composer\.json)$/);
  const hasLock = hasName(lowerNames, /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|pipfile\.lock|cargo\.lock|go\.sum|composer\.lock)$/);
  const hasTests = input.testCount !== undefined ? input.testCount > 0 : hasName(lowerNames, /(^|\/)(__tests__|tests?|specs?)(\/|\.)/) || hasName(lowerNames, /(^|\/)(vitest|jest|pytest|tox|go\.test)\.[^/]+$/);
  const hasCi = hasName(lowerNames, /(^|\/)(\.github\/workflows|\.gitlab-ci\.yml|jenkinsfile|azure-pipelines\.yml|circleci\/config\.yml)(\/|$)/);
  const hasSecurityDocs = hasName(lowerNames, /(^|\/)(security\.md|\.github\/security\.md|codeowners)$/);
  const hasLicense = hasName(lowerNames, /(^|\/)(license|license\.md|license\.txt|copying)(\.|$)/);
  const hasReadme = hasName(lowerNames, /(^|\/)readme(?:\.|$)/);
  const hasDocker = hasName(lowerNames, /(^|\/)(dockerfile|\.dockerignore|docker-compose[^/]*\.ya?ml)$/);
  const dockerFiles = input.textFiles.filter((file) => /(^|\/)(dockerfile|docker-compose[^/]*\.ya?ml)$/i.test(file.path));
  const hasIaC = hasName(lowerNames, /(^|\/)(terraform|k8s|kubernetes|helm|charts)(\/|$)/) || hasName(lowerNames, /\.(tf|tfvars)$/);
  const iacHasPrivilegedSetting = input.textFiles.some((file) => /privileged\s*:\s*true|hostNetwork\s*:\s*true|runAsUser\s*:\s*0|0\.0\.0\.0\/0/i.test(file.content));
  const dockerHasWeakSetting = dockerFiles.some((file) => /(^|\n)\s*USER\s+root\b|(^|\n)\s*FROM\s+[^\n:]+:latest\b|(^|\n)\s*ADD\s+https?:/i.test(file.content));
  const ciFiles = input.textFiles.filter((file) => /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.yml$|jenkinsfile$|azure-pipelines\.yml$|circleci\/config\.yml$)/i.test(file.path));
  const ciHasFloatingAction = ciFiles.some((file) => /uses:\s*[^\s]+@(main|master|latest)\b/i.test(file.content));
  const hasBinary = hasName(lowerNames, /\.(exe|dll|so|dylib|class|jar|bin|wasm)$/);
  const hasPinned = input.dependencies.length > 0 && input.dependencies.every((dependency) => /(?:^|[^\d])\d+\.\d+(?:\.\d+)?/.test(dependency.version));
  const secretPattern = /(?:api[_-]?key|client[_-]?secret|access[_-]?token|secret|password|passwd|private[_-]?key)\s*[=:]\s*["'][^"']{8,}["']|\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{18,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{25,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;
  const filesWithRuntimeSecrets = input.textFiles.filter((file) => secretPattern.test(file.content));
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
      summary: hasTests && hasCi ? `Test yapısı (${input.testCount ?? "?"} dosya) ve CI yapılandırması birlikte görünüyor.` : hasTests ? `Test dosyası sayısı ${input.testCount ?? "?"}; CI yapılandırması ayrıca doğrulanmalı.` : hasCi ? "CI izi var; test kapsamı arşivden doğrulanamadı." : "Belirgin test veya CI izi bulunamadı.",
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
      id: "container-hardening", category: "Container", title: "Container yapılandırması sertleştirilmiş mi?",
      status: checkStatus(!hasDocker || !dockerHasWeakSetting, hasDocker && !dockerHasWeakSetting), severity: dockerHasWeakSetting ? "high" : "low",
      summary: !hasDocker ? "Docker yapılandırması bulunamadı; container yüzeyi değerlendirilmedi." : dockerHasWeakSetting ? "Root kullanıcı, latest image veya uzak ADD kullanımı gibi zayıf bir ayar sinyali var." : "Docker dosyalarında bilinen zayıf ayar örüntüsü görülmedi.",
      why: "Container varsayılanları ve imaj etiketleri, izolasyon ve tedarik zinciri riskini doğrudan etkiler.",
      evidence: dockerHasWeakSetting ? dockerFiles.map((file) => `${file.path} (ayar maskelendi)`).slice(0, 4) : [],
      nextStep: dockerHasWeakSetting ? "Root olmayan kullanıcı, sabit imaj digest’i ve güvenli COPY akışı kullanın." : "İmajları digest ile sabitleyin ve üretim container’ını en az yetkiyle çalıştırın.",
      basis: "CIS Docker Benchmark / SLSA — build integrity",
    },
    {
      id: "iac-exposure", category: "Cloud / IaC", title: "IaC ve orkestrasyon ayrıcalıkları",
      status: checkStatus(!hasIaC || !iacHasPrivilegedSetting, hasIaC), severity: iacHasPrivilegedSetting ? "high" : "low",
      summary: !hasIaC ? "Terraform, Kubernetes veya Helm izi bulunmadı." : iacHasPrivilegedSetting ? "Geniş network/host veya root ayrıcalığı veren IaC sinyali bulundu." : "IaC dosyalarında bilinen ayrıcalık örüntüsü görülmedi.",
      why: "Yanlış cloud veya orkestrasyon varsayımları tek bir uygulama açığını tüm çalışma alanına yayabilir.",
      evidence: iacHasPrivilegedSetting ? input.textFiles.filter((file) => /privileged|hostNetwork|runAsUser|0\.0\.0\.0\/0/i.test(file.content)).map((file) => `${file.path} (statik sinyal)`).slice(0, 4) : [],
      nextStep: iacHasPrivilegedSetting ? "Ayrıcalığı daraltın; public network ve root çalıştırmayı policy ile engelleyin." : "IaC policy scan ve değişiklik onayı ekleyin.",
      basis: "OWASP ASVS / Kubernetes Pod Security Standards",
    },
    {
      id: "ci-pinning", category: "CI/CD", title: "CI action ve pipeline bağımlılıkları sabit mi?",
      status: checkStatus(!hasCi || !ciHasFloatingAction, hasCi && !ciHasFloatingAction), severity: ciHasFloatingAction ? "medium" : "low",
      summary: !hasCi ? "CI yapılandırması bulunmadı." : ciHasFloatingAction ? "CI içinde main/master/latest gibi kayan action referansı bulundu." : "CI action referanslarında bilinen kayan etiket görülmedi.",
      why: "Kayan CI action’ları, aynı commit’in farklı zamanda farklı kod çalıştırmasına neden olabilir.",
      evidence: ciHasFloatingAction ? ciFiles.map((file) => `${file.path} (action referansı)`).slice(0, 4) : [],
      nextStep: ciHasFloatingAction ? "Action sürümlerini immutable commit SHA ile sabitleyin ve Dependabot benzeri güncelleme akışı kurun." : "CI action’larını SHA ile pinleyip provenance çıktısını saklayın.",
      basis: "OpenSSF Scorecard — Dangerous Workflow / Pinned Dependencies",
    },
    {
      id: "governance", category: "Yönetişim", title: "Güvenlik politikası ve lisans",
      status: checkStatus(hasSecurityDocs && hasLicense && (input.license?.class === "A" || input.license?.class === "D"), hasSecurityDocs || hasLicense), severity: hasSecurityDocs && hasLicense && (input.license?.class === "A" || input.license?.class === "D") ? "low" : input.license?.class === "C" || input.license?.class === "E" ? "high" : "medium",
      summary: !hasLicense
        ? "Lisans dosyası bulunamadı; yeniden kullanım koşulları doğrulanamadı."
        : input.license?.mismatch
          ? `README ile LICENSE çelişiyor: README "${input.license.readmeClaim ?? "?"}" diyor, LICENSE içeriği ${input.license.detected ?? "tanınmadı"} (sınıf ${input.license.class}).`
          : input.license
            ? `Lisans: ${input.license.detected ?? "tanınmadı"} (sınıf ${input.license.class}).${hasSecurityDocs ? " Güvenlik politikası da bulundu." : " Güvenlik politikası eksik."}`
            : hasSecurityDocs ? "Güvenlik politikası ve lisans dosyası bulundu." : "Güvenlik politikası eksik.",
      why: "Sorumlu bildirim, kullanım koşulları ve bakım sahipliği belirsizliği operasyonel riski artırır. Lisans sınıfı, kodun yeniden kullanılıp kullanılamayacağını belirler.",
      evidence: [...(hasSecurityDocs ? lowerNames.filter((name) => /security\.md|codeowners/.test(name)).slice(0, 2) : []), ...(hasLicense ? lowerNames.filter((name) => /license|copying/.test(name)).slice(0, 2) : []), ...(input.license?.detected ? [`LICENSE içeriği → ${input.license.detected} (${input.license.class})`] : [])],
      nextStep: !hasLicense
        ? "LICENSE dosyası ekleyin; lisans yoksa kod varsayılan olarak tüm hakları saklıdır."
        : input.license?.class === "B"
          ? "Copyleft kodu yalnızca ayrı süreç olarak çağırın; kendi kodunuza bağlamayın."
          : input.license?.class === "C"
            ? "Ticari kısıtları okuyun; bu kodu varsayılan bileşen yapmayın."
            : input.license?.class === "E"
              ? "Lisans metnini hukuki incelemeden geçirin; doğrulanana kadar kodu yeniden kullanmayın."
              : "SECURITY.md, CODEOWNERS ve lisans atıf metnini güncel tutun.",
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
      status: hasBinary ? "risk" : hasCi ? "pass" : "watch", severity: hasBinary ? "high" : "low",
      summary: hasBinary
        ? "Arşivde kontrol edilmesi gereken ikili/derlenmiş artefakt bulundu."
        : hasCi
          ? "İkili artefakt görünmedi ve CI izi var; build hattı gözden geçirilebilir."
          : "İkili artefakt görünmedi, fakat build hattı arşivden doğrulanamadı.",
      why: "Derlenmiş dosyaların kaynağa göre izlenebilirliği ve build provenansı tedarik zinciri güveninin temelidir.",
      evidence: hasBinary
        ? lowerNames.filter((name) => /\.(exe|dll|so|dylib|class|jar|bin|wasm)$/.test(name)).slice(0, 5)
        : hasCi || hasDocker
          ? lowerNames.filter((name) => /\.github\/workflows|gitlab-ci|jenkinsfile|circleci|dockerfile|docker-compose/.test(name)).slice(0, 3)
          : [],
      nextStep: hasBinary
        ? "İkilileri kaynaktan üretin; provenance ve imzalı release yaklaşımını değerlendirin."
        : hasCi
          ? "Build çıktısının hangi commit’ten üretildiğini belgeleyin."
          : "Build çıktısının hangi commit’ten üretildiğini belgeleyen bir CI workflow’u ekleyin.",
      basis: "SLSA — artifact integrity and provenance",
    },
    {
      id: "runtime-risk", category: "Güvenlik", title: "Dinamik çalıştırma sinyali",
      status: checkStatus(!input.hasDynamicExecution, false), severity: input.hasDynamicExecution ? "medium" : "low",
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

export function diffAudits(previous: ProactiveAudit | null, current: ProactiveAudit): AuditDiff | null {
  if (!previous) return null;
  const before = new Map(previous.checks.map((check) => [check.id, check]));
  const regressed: string[] = [];
  const improved: string[] = [];
  const newChecks: string[] = [];
  const rank = (status: AuditStatus) => status === "risk" ? 2 : status === "watch" ? 1 : 0;
  for (const check of current.checks) {
    const old = before.get(check.id);
    if (!old) { newChecks.push(check.title); continue; }
    if (rank(check.status) > rank(old.status)) regressed.push(`${check.title}: ${old.status} → ${check.status}`);
    if (rank(check.status) < rank(old.status)) improved.push(`${check.title}: ${old.status} → ${check.status}`);
  }
  return { scoreDelta: current.score - previous.score, previousScore: previous.score, currentScore: current.score, previousGrade: previous.grade, currentGrade: current.grade, regressed, improved, newChecks };
}
