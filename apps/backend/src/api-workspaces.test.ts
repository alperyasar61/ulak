import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  executeApiRequest,
  exportPostmanCollection,
  importPostmanCollection,
  normalizeApiWorkspace,
  type ApiWorkspace,
} from "./api-workspaces.js";

afterEach(() => vi.unstubAllGlobals());

describe("API workspace collection handling", () => {
  it("imports Postman folders, auth, variables, and request bodies without scripts", () => {
    const workspace = importPostmanCollection({
      info: { name: "Ödeme servisi" },
      auth: { type: "bearer", bearer: [{ key: "token", value: "private-token" }] },
      variable: [{ key: "base_url", value: "https://api.example.test" }],
      event: [{ listen: "prerequest", script: { exec: ["throw new Error('must not run')"] } }],
      item: [{
        name: "Auth",
        item: [{
          name: "Oturum aç",
          request: {
            method: "POST",
            url: "{{base_url}}/login",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: '{"password":"sample-password"}' },
          },
        }],
      }],
    }, "Servis", "Kazakistan");

    expect(workspace.category).toBe("Kazakistan");
    expect(workspace.requests[0].folder).toBe("Auth");
    expect(workspace.requests[0].name).toBe("Oturum aç");
    expect(workspace.requests[0].auth.type).toBe("inherit");
    expect(workspace.auth.type).toBe("bearer");
    expect(workspace.auth.type === "bearer" && workspace.auth.token).toMatch(/^\{\{postman_token_/);
    expect(workspace.variables.some((item) => item.isSecret && item.value === "private-token")).toBe(true);
    expect(workspace.requests[0].body).toContain("{{postman_password_");
    expect(workspace.requests[0].body).not.toContain("sample-password");
  });

  it("exports a Postman v2.1 collection without exporting secret values", () => {
    const workspace = normalizeApiWorkspace({
      name: "Servis",
      variables: [{ key: "access_token", value: "must-not-export", isSecret: true }],
      auth: { type: "bearer", token: "{{access_token}}" },
      requests: [{ name: "Liste", folder: "Kullanıcılar / Yönetim", method: "GET", url: "https://api.example.test/users" }],
    });

    const collection = exportPostmanCollection(workspace);
    const json = JSON.stringify(collection);
    expect(json).toContain("collection/v2.1.0/collection.json");
    expect(json).toContain("{{access_token}}");
    expect(collection.item[0]).toMatchObject({ name: "Kullanıcılar", item: [{ name: "Yönetim", item: [{ name: "Liste" }] }] });
    expect(json).not.toContain("must-not-export");
  });

  it("rejects unsupported request methods and invalid variable names", () => {
    expect(() => normalizeApiWorkspace({ name: "API", requests: [{ method: "TRACE" }] })).toThrow("Desteklenmeyen HTTP metodu");
    expect(() => normalizeApiWorkspace({ name: "API", variables: [{ key: "bad key", value: "x" }] })).toThrow("Değişken adı geçersiz");
  });

  it("accepts only HTTP(S) proxy endpoints", () => {
    expect(() => normalizeApiWorkspace({ name: "API", proxyEnabled: true, proxyUrl: "socks5://proxy.example:1080" })).toThrow("HTTP(S) proxy");
    expect(() => normalizeApiWorkspace({ name: "API", proxyUrl: "https://proxy.example:8443/path" })).toThrow("yol veya query");
    expect(normalizeApiWorkspace({ name: "API", proxyEnabled: false })).toMatchObject({
      proxyEnabled: false,
      proxyUrl: "",
      proxyUrlConfigured: false,
    });
  });
});

describe("API workspace request execution", () => {
  it("sends one request, captures a token, and redacts it from the displayed response", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { access_token: "sensitive-access-token" }, status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "session=private" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const config = normalizeApiWorkspace({
      name: "Servis",
      variables: [],
      requests: [{
        id: "login",
        name: "Login",
        method: "POST",
        url: "https://api.example.test/login",
        headers: [],
        body: "{}",
        auth: { type: "none" },
        captureTokenPath: "data.access_token",
        captureTokenVariable: "access_token",
      }],
    });
    const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };

    const result = await executeApiRequest(workspace, "login");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.capturedVariable).toBe("access_token");
    expect(result.savedSecrets.access_token).toBe("sensitive-access-token");
    expect(JSON.stringify(result.body)).not.toContain("sensitive-access-token");
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(workspace.variables[0]).toMatchObject({ key: "access_token", value: "sensitive-access-token", isSecret: true });
  });

  it("evaluates selected response checks and redacts secret expectations", async () => {
    const secretValue = "private-response-value";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: { id: 42, access_token: secretValue },
      status: "created",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    })));
    const config = normalizeApiWorkspace({
      name: "Servis",
      requests: [{
        id: "create",
        name: "Create",
        method: "POST",
        url: "https://api.example.test/items",
        headers: [],
        body: "{}",
        auth: { type: "none" },
        captureTokenPath: "",
        captureTokenVariable: "",
        assertions: [
          { id: "status", name: "HTTP durum", target: "status", operator: "equals", expected: "201" },
          { id: "json", name: "ID mevcut", target: "json", operator: "equals", path: "data.id", expected: "42" },
          { id: "header", name: "JSON header", target: "header", operator: "contains", path: "content-type", expected: "application/json" },
          { id: "secret", name: "Token değeri", target: "json", operator: "equals", path: "data.access_token", expected: secretValue, isSecret: true },
        ],
      }],
    });
    const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };

    const result = await executeApiRequest(workspace, "create");

    expect(result.assertions).toHaveLength(4);
    expect(result.assertions.every((item) => item.passed)).toBe(true);
    expect(JSON.stringify(result.assertions)).not.toContain(secretValue);
    expect(JSON.stringify(result.body)).not.toContain(secretValue);
  });

  it("fails JSON checks clearly for invalid JSON and missing paths", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const config = normalizeApiWorkspace({
      name: "Servis",
      requests: [{
        id: "check",
        name: "Check",
        method: "GET",
        url: "https://api.example.test/items",
        headers: [],
        body: "",
        auth: { type: "none" },
        captureTokenPath: "",
        captureTokenVariable: "",
        assertions: [
          { id: "not-json", target: "json", operator: "exists", path: "data.id" },
        ],
      }],
    });
    const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };

    const result = await executeApiRequest(workspace, "check");

    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].message).toContain("Yanıt geçerli JSON değil");
    expect(result.assertions[0].message).not.toContain("not-json");

    workspace.requests[0].id = "missing";
    workspace.requests[0].assertions[0].id = "missing-path";
    const missingPathResult = await executeApiRequest(workspace, "missing");
    expect(missingPathResult.assertions[0].passed).toBe(false);
    expect(missingPathResult.assertions[0].message).toContain("yanıtta bulunamadı");
  });

  it("does not follow redirects or allow metadata service targets", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("", { status: 302, headers: { location: "https://other.example.test" } }));
    vi.stubGlobal("fetch", fetchMock);
    const config = normalizeApiWorkspace({
      name: "Servis",
      requests: [{
        id: "redirect", name: "Redirect", method: "GET", url: "https://api.example.test/",
        headers: [], body: "", auth: { type: "none" }, captureTokenPath: "", captureTokenVariable: "",
      }],
    });
    const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };
    const response = await executeApiRequest(workspace, "redirect");
    expect(response.status).toBe(302);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");

    workspace.requests[0].url = "http://169.254.169.254/latest/meta-data/";
    await expect(executeApiRequest(workspace, "redirect")).rejects.toThrow("metadata adreslerine");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encodes URL variables and redacts secret response headers", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-access-token": "private-token",
        "x-request-id": "request-private-token",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const config = normalizeApiWorkspace({
      name: "Servis",
      variables: [
        { key: "base_url", value: "https://api.example.test", isSecret: false },
        { key: "path", value: "a/b", isSecret: false },
        { key: "filter", value: "a&admin=true", isSecret: false },
        { key: "access_token", value: "private-token", isSecret: true },
      ],
      requests: [{
        id: "encoded", name: "Encoded", method: "GET",
        url: "{{base_url}}/items/{{path}}?filter={{filter}}",
        headers: [], body: "", auth: { type: "none" },
        captureTokenPath: "", captureTokenVariable: "",
      }],
    });
    const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };

    const result = await executeApiRequest(workspace, "encoded");
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(calledUrl.pathname).toBe("/items/a%2Fb");
    expect(calledUrl.searchParams.get("filter")).toBe("a&admin=true");
    expect(result.headers["x-access-token"]).toBeUndefined();
    expect(result.headers["x-request-id"]).toBe("request-[gizlendi]");
  });

  it("routes the selected request through the configured provider proxy", async () => {
    let proxyAuthorization = "";
    const proxyServer = createServer((request, response) => {
      proxyAuthorization = String(request.headers["proxy-authorization"] ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ routedUrl: request.url }));
    });
    proxyServer.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => proxyServer.once("listening", resolve));
    const address = proxyServer.address() as AddressInfo;
    try {
      const config = normalizeApiWorkspace({
        name: "Servis",
        proxyEnabled: true,
        proxyUrl: `http://user:secret@127.0.0.1:${address.port}`,
        requests: [{
          id: "proxied", name: "Proxied", method: "GET", url: "http://service.example.test/health",
          headers: [], body: "", auth: { type: "none" },
          captureTokenPath: "", captureTokenVariable: "",
        }],
      });
      const workspace: ApiWorkspace = { ...config, id: "workspace", createdAt: "", updatedAt: "" };

      const result = await executeApiRequest(workspace, "proxied");

      expect(result.body).toEqual({ routedUrl: "http://service.example.test/health" });
      expect(proxyAuthorization).toBe(`Basic ${Buffer.from("user:secret").toString("base64")}`);
    } finally {
      proxyServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        proxyServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
