import { describe, expect, it } from "vitest";
import { securityLearningIds, securityLearningRules, sharedKnowledgeId, validateSharedKnowledgeInput } from "./learning.js";

describe("security learning notes", () => {
  it("stores only known finding identifiers once", () => {
    const ids = securityLearningIds([
      { id: "possible-hardcoded-secret" },
      { id: "possible-hardcoded-secret" },
      { id: "attacker-controlled-finding" },
    ] as Parameters<typeof securityLearningIds>[0]);

    expect(ids).toEqual(["possible-hardcoded-secret"]);
  });

  it("uses fixed advice and does not retain evidence", () => {
    const rule = securityLearningRules()["secret-files"];

    expect(rule.title).toBe("Gizli dosyalar");
    expect(rule.recommendation).toContain("secret manager");
    expect(JSON.stringify(rule)).not.toContain("evidence");
  });

  it("accepts only project-independent notes and rejects sensitive identifiers", () => {
    const note = {
      category: "testing",
      title: "Girdi sınırlarını her katmanda doğrula",
      recommendation: "Kullanıcı girdisini güven sınırlarını aşmadan önce doğrula ve beklenmeyen biçimleri reddet.",
    };
    expect(validateSharedKnowledgeInput(note, ["Örnek Uygulama"])).toEqual(note);
    expect(() => validateSharedKnowledgeInput({
      ...note,
      recommendation: "API token: abcdefghijklmnopqrstuvwxyz0123456789",
    })).toThrow(/hassas veri/);
    expect(() => validateSharedKnowledgeInput(note, ["Girdi sınırlarını"])).toThrow(/proje veya kaynak adı/);
  });

  it("deduplicates equivalent notes independently of surrounding whitespace and case", () => {
    const first = validateSharedKnowledgeInput({
      category: "testing",
      title: "Girdi sınırlarını her katmanda doğrula",
      recommendation: "Kullanıcı girdisini güven sınırlarını aşmadan önce doğrula ve beklenmeyen biçimleri reddet.",
    });
    const repeated = validateSharedKnowledgeInput({
      category: "testing",
      title: "  girdi sınırlarını her katmanda doğrula ",
      recommendation: "Kullanıcı girdisini güven sınırlarını aşmadan önce doğrula ve beklenmeyen biçimleri reddet.",
    });
    expect(sharedKnowledgeId(first)).toBe(sharedKnowledgeId(repeated));
  });
});
