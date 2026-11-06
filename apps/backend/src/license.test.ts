import { describe, expect, it } from "vitest";
import { classifyLicense, licenseFinding } from "./license.js";

const MIT_TEXT = `MIT License

Copyright (c) 2024 Example

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction.`;

const GPL_TEXT = `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) 2007 Free Software Foundation, Inc.`;

const BSL_TEXT = `Business Source License 1.1

Licensor: Example Corp
Additional Use Grant: You may make use of the Licensed Work for non-production use.`;

describe("classifyLicense", () => {
  it("classifies MIT as A and produces no finding", () => {
    const info = classifyLicense([{ path: "LICENSE", content: MIT_TEXT }], ["LICENSE", "src/index.ts"]);

    expect(info.class).toBe("A");
    expect(info.detected).toBe("MIT");
    expect(info.file).toBe("LICENSE");
    expect(licenseFinding(info)).toBeNull();
  });

  it("classifies GPL as B and warns about the copyleft boundary", () => {
    const info = classifyLicense([{ path: "COPYING", content: GPL_TEXT }], ["COPYING"]);

    expect(info.class).toBe("B");
    expect(info.detected).toBe("GPL");
    const finding = licenseFinding(info);
    expect(finding?.id).toBe("license-copyleft-boundary");
    expect(finding?.severity).toBe("medium");
  });

  it("classifies Business Source License as C", () => {
    const info = classifyLicense([{ path: "LICENSE.md", content: BSL_TEXT }], ["LICENSE.md"]);

    expect(info.class).toBe("C");
    expect(licenseFinding(info)?.id).toBe("license-commercial-restriction");
  });

  it("prefers LGPL over GPL because the LGPL text also mentions the GPL", () => {
    const text = `GNU LESSER GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

This version of the GNU Lesser General Public License incorporates
the terms and conditions of version 3 of the GNU General Public License.`;
    const info = classifyLicense([{ path: "LICENSE", content: text }], ["LICENSE"]);

    expect(info.detected).toBe("LGPL");
    expect(info.class).toBe("B");
  });

  it("returns class E when no license file exists", () => {
    const info = classifyLicense([{ path: "README.md", content: "# Demo" }], ["README.md"]);

    expect(info.class).toBe("E");
    expect(info.file).toBeNull();
    expect(licenseFinding(info)?.id).toBe("license-unverified");
  });

  it("returns class E when the license text matches no known template", () => {
    const info = classifyLicense([{ path: "LICENSE", content: "All rights reserved by the author. Contact us for terms." }], ["LICENSE"]);

    expect(info.class).toBe("E");
    expect(info.detected).toBeNull();
    expect(info.evidence.length).toBeGreaterThan(0);
  });

  it("flags a README claim that contradicts the LICENSE file", () => {
    const info = classifyLicense(
      [
        { path: "LICENSE", content: BSL_TEXT },
        { path: "README.md", content: "# Demo\n\nReleased under the MIT license." },
      ],
      ["LICENSE", "README.md"],
    );

    expect(info.mismatch).toBe(true);
    expect(info.readmeClaim).toBe("MIT");
    expect(info.readmeClaimClass).toBe("A");
    expect(licenseFinding(info)?.id).toBe("license-readme-mismatch");
  });

  it("does not flag a mismatch when README and LICENSE agree", () => {
    const info = classifyLicense(
      [
        { path: "LICENSE", content: MIT_TEXT },
        { path: "README.md", content: "# Demo\n\nMIT licensed." },
      ],
      ["LICENSE", "README.md"],
    );

    expect(info.mismatch).toBe(false);
    expect(licenseFinding(info)).toBeNull();
  });

  it("reports class E when the license file exists but was not extracted", () => {
    const info = classifyLicense([], ["LICENSE", "src/index.ts"]);

    expect(info.class).toBe("E");
    expect(info.file).toBe("LICENSE");
    expect(info.reason).toContain("okunamadı");
  });
});
