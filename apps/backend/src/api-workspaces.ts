import { randomUUID } from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type ApiAuth =
  | { type: "none" | "inherit" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "api-key"; key: string; value: string; in: "header" | "query" };

export interface ApiVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface ApiHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiAssertion {
  id: string;
  name: string;
  target: "status" | "json" | "header" | "body";
  operator: "equals" | "contains" | "exists";
  path: string;
  expected: string;
  isSecret: boolean;
  enabled: boolean;
}

export interface ApiSavedRequest {
  id: string;
  name: string;
  folder: string;
  method: ApiMethod;
  url: string;
  headers: ApiHeader[];
  body: string;
  auth: ApiAuth;
  assertions: ApiAssertion[];
  captureTokenPath: string;
  captureTokenVariable: string;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  category: string;
  proxyEnabled: boolean;
  proxyUrl: string;
  proxyUrlConfigured: boolean;
  variables: ApiVariable[];
  auth: ApiAuth;
  requests: ApiSavedRequest[];
  createdAt: string;
  updatedAt: string;
}

const METHODS = new Set<ApiMethod>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const SECRET_KEY = /(?:token|secret|password|passwd|api[_-]?key|authorization|client[_-]?secret|credential)/i;
const MAX_WORKSPACE_JSON = 1_000_000;
const MAX_REQUEST_BODY = 100_000;
const MAX_RESPONSE_BODY = 1_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
const BLOCKED_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "proxy-authorization", "upgrade"]);

interface ApiResponseLike {
  status: number;
  statusText: string;
  ok: boolean;
  headers: { forEach(callback: (value: string, key: string) => void): void };
  body: unknown;
}

interface ApiByteReader {
  read(): Promise<unknown>;
  cancel(): Promise<unknown>;
}

function isApiByteReader(value: unknown): value is ApiByteReader {
  return isRecord(value) && typeof value.read === "function" && typeof value.cancel === "function";
}

function getApiByteReader(body: unknown): ApiByteReader | null {
  if (body === null || body === undefined) return null;
  if (typeof body !== "object") throw new Error("Servis yanıt akışı okunamadı.");
  const getReader: unknown = Reflect.get(body, "getReader");
  if (typeof getReader !== "function") throw new Error("Servis yanıt akışı okunamadı.");
  const reader: unknown = Reflect.apply(getReader, body, []);
  if (!isApiByteReader(reader)) throw new Error("Servis yanıt akışı okuyucusu geçersiz.");
  return reader;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label} geçersiz veya çok uzun.`);
  return value;
}

function parseAuth(value: unknown): ApiAuth {
  if (!isRecord(value) || typeof value.type !== "string") return { type: "none" };
  if (value.type === "inherit" || value.type === "none") return { type: value.type };
  if (value.type === "bearer") return { type: "bearer", token: boundedText(value.token ?? "", "Bearer token", 8_000) };
  if (value.type === "basic") return {
    type: "basic",
    username: boundedText(value.username ?? "", "Kullanıcı adı", 2_000),
    password: boundedText(value.password ?? "", "Parola", 8_000),
  };
  if (value.type === "api-key") {
    if (value.in !== "header" && value.in !== "query") throw new Error("API anahtarının yeri header veya query olmalı.");
    return {
      type: "api-key",
      key: boundedText(value.key ?? "", "API anahtar adı", 200),
      value: boundedText(value.value ?? "", "API anahtar değeri", 8_000),
      in: value.in,
    };
  }
  throw new Error("Desteklenmeyen kimlik doğrulama türü.");
}

export function normalizeApiWorkspace(input: unknown): Omit<ApiWorkspace, "id" | "createdAt" | "updatedAt"> {
  if (!isRecord(input)) throw new Error("API çalışma alanı verisi geçersiz.");
  const name = boundedText(input.name, "Çalışma alanı adı", 180).trim();
  const category = boundedText(input.category ?? "", "Kategori", 100).trim();
  const proxyUrl = boundedText(input.proxyUrl ?? "", "Proxy adresi", 2_000).trim();
  const proxyEnabled = input.proxyEnabled === true;
  const proxyUrlConfigured = Boolean(proxyUrl) || input.proxyUrlConfigured === true;
  if (!name) throw new Error("Çalışma alanı adı gerekli.");
  if (proxyUrl) {
    let proxy: URL;
    try { proxy = new URL(proxyUrl); } catch { throw new Error("Proxy adresini sağlayıcının verdiği HTTP(S) URL biçiminde girin."); }
    if (!["http:", "https:"].includes(proxy.protocol) || !proxy.hostname) {
      throw new Error("Şu an yalnız HTTP(S) proxy adresleri destekleniyor.");
    }
    if (proxy.pathname !== "/" || proxy.search || proxy.hash) {
      throw new Error("Proxy adresi yalnız HTTP(S) şema, sunucu ve port içerebilir; yol veya query eklemeyin.");
    }
  }
  const variablesInput = Array.isArray(input.variables) ? input.variables : [];
  const requestInput = Array.isArray(input.requests) ? input.requests : [];
  if (variablesInput.length > 200 || requestInput.length > 500) throw new Error("Çalışma alanında çok fazla değişken veya istek var.");
  const variables: ApiVariable[] = variablesInput.map((item) => {
    if (!isRecord(item)) throw new Error("Değişken biçimi geçersiz.");
    const key = boundedText(item.key, "Değişken adı", 120).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new Error(`Değişken adı geçersiz: ${key}`);
    const value = boundedText(item.value ?? "", `“${key}” değişken değeri`, 8_000);
    const isSecret = item.isSecret === true || SECRET_KEY.test(key);
    return { key, value, isSecret };
  });
  if (new Set(variables.map((item) => item.key)).size !== variables.length) throw new Error("Değişken adları benzersiz olmalı.");
  const requests: ApiSavedRequest[] = requestInput.map((item) => {
    if (!isRecord(item)) throw new Error("İstek biçimi geçersiz.");
    const method = boundedText(item.method ?? "GET", "HTTP metodu", 10).toUpperCase() as ApiMethod;
    if (!METHODS.has(method)) throw new Error(`Desteklenmeyen HTTP metodu: ${method}`);
    const headersInput = Array.isArray(item.headers) ? item.headers : [];
    if (headersInput.length > 100) throw new Error("Bir istekte en fazla 100 header olabilir.");
    const headers = headersInput.map((header) => {
      if (!isRecord(header)) throw new Error("Header biçimi geçersiz.");
      const key = boundedText(header.key ?? "", "Header adı", 200).trim();
      const value = boundedText(header.value ?? "", `“${key}” header değeri`, 8_000);
      if (key && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) throw new Error(`Header adı geçersiz: ${key}`);
      return { key, value, enabled: header.enabled !== false };
    });
    const id = typeof item.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(item.id) ? item.id : randomUUID();
    const assertionInput = Array.isArray(item.assertions) ? item.assertions : [];
    if (assertionInput.length > 50) throw new Error("Bir istekte en fazla 50 yanıt testi olabilir.");
    const assertions = assertionInput.map((assertion) => {
      if (!isRecord(assertion)) throw new Error("Yanıt testi biçimi geçersiz.");
      const target = assertion.target;
      if (!["status", "json", "header", "body"].includes(String(target))) throw new Error("Yanıt testi türü desteklenmiyor.");
      const operator = assertion.operator;
      if (!["equals", "contains", "exists"].includes(String(operator))) throw new Error("Yanıt testi işlemi desteklenmiyor.");
      if (target === "status" && operator !== "equals") throw new Error("HTTP durum kodu yalnızca eşitlik testi destekler.");
      if (target === "body" && operator === "exists") throw new Error("Yanıt metni testi contains veya equals olmalı.");
      const path = boundedText(assertion.path ?? "", "Yanıt testi alanı", 500).trim();
      const expected = boundedText(assertion.expected ?? "", "Yanıt testi beklenen değer", 2_000);
      if ((target === "json" || target === "header") && !path) throw new Error("JSON alanı veya header adı gerekli.");
      return {
        id: typeof assertion.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(assertion.id) ? assertion.id : randomUUID(),
        name: boundedText(assertion.name ?? "Yanıt testi", "Yanıt testi adı", 120).trim() || "Yanıt testi",
        target: target as ApiAssertion["target"],
        operator: operator as ApiAssertion["operator"],
        path,
        expected,
        isSecret: assertion.isSecret === true,
        enabled: assertion.enabled !== false,
      };
    });
    return {
      id,
      name: boundedText(item.name ?? "Yeni istek", "İstek adı", 180).trim() || "Yeni istek",
      folder: boundedText(item.folder ?? "", "İstek klasörü", 500).trim(),
      method,
      url: boundedText(item.url ?? "", "İstek URL’si", 4_000).trim(),
      headers,
      body: boundedText(item.body ?? "", "İstek gövdesi", MAX_REQUEST_BODY),
      auth: parseAuth(item.auth),
      assertions,
      captureTokenPath: boundedText(item.captureTokenPath ?? "", "Token alanı yolu", 300).trim(),
      captureTokenVariable: boundedText(item.captureTokenVariable ?? "", "Token değişken adı", 120).trim(),
    };
  });
  const ids = requests.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("İstek kimlikleri benzersiz olmalı.");
  for (const request of requests) {
    if (new Set(request.assertions.map((assertion) => assertion.id)).size !== request.assertions.length) {
      throw new Error(`“${request.name}” isteğinde yanıt testi kimlikleri benzersiz olmalı.`);
    }
  }
  return { name, category, proxyEnabled, proxyUrl, proxyUrlConfigured, variables, auth: parseAuth(input.auth), requests };
}

function postmanVariable(value: unknown): { key: string; value: string; isSecret: boolean } | null {
  if (!isRecord(value) || typeof value.key !== "string") return null;
  const key = value.key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) return null;
  const isSecret = value.type === "secret" || SECRET_KEY.test(key);
  return { key, value: typeof value.value === "string" ? value.value : "", isSecret };
}

function uniqueVariableKey(base: string, variables: Map<string, ApiVariable>) {
  let key = base;
  let suffix = 2;
  while (variables.has(key)) key = `${base}_${suffix++}`;
  return key;
}

function postmanUrl(requestUrl: unknown) {
  if (typeof requestUrl === "string") return requestUrl;
  if (!isRecord(requestUrl)) return "";
  if (typeof requestUrl.raw === "string") return requestUrl.raw;
  const protocol = typeof requestUrl.protocol === "string" ? `${requestUrl.protocol}://` : "";
  const host = Array.isArray(requestUrl.host) ? requestUrl.host.join(".") : "";
  const path = Array.isArray(requestUrl.path) ? `/${requestUrl.path.join("/")}` : "";
  const query = Array.isArray(requestUrl.query)
    ? requestUrl.query.filter((item) => isRecord(item) && item.disabled !== true && typeof item.key === "string")
      .map((item) => `${encodeURIComponent(String(item.key))}=${encodeURIComponent(String(item.value ?? ""))}`).join("&")
    : "";
  return `${protocol}${host}${path}${query ? `?${query}` : ""}`;
}

function variablesFromAuth(auth: unknown, variables: Map<string, ApiVariable>, missing: ApiAuth): ApiAuth {
  if (!isRecord(auth) || typeof auth.type !== "string") return missing;
  if (auth.type === "noauth") return { type: "none" };
  if (auth.type === "inherit") return { type: "inherit" };
  const entries = Array.isArray(auth[auth.type]) ? auth[auth.type] as unknown[] : [];
  const values = new Map<string, string>();
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry.key === "string") values.set(entry.key, typeof entry.value === "string" ? entry.value : "");
  }
  const makeVariable = (key: string, fallback: string) => {
    const value = values.get(key) ?? fallback;
    const varKey = uniqueVariableKey(`postman_${key.replace(/[^A-Za-z0-9_]/g, "_")}_${variables.size + 1}`, variables);
    const isSecret = SECRET_KEY.test(key) || ["token", "password", "key", "value"].includes(key.toLowerCase());
    variables.set(varKey, { key: varKey, value, isSecret });
    return `{{${varKey}}}`;
  };
  if (auth.type === "bearer") return { type: "bearer", token: makeVariable("token", "") };
  if (auth.type === "basic") return { type: "basic", username: makeVariable("username", ""), password: makeVariable("password", "") };
  if (auth.type === "apikey") {
    const location = values.get("in") === "query" ? "query" : "header";
    return { type: "api-key", key: values.get("key") ?? "", value: makeVariable("value", ""), in: location };
  }
  return { type: "inherit" };
}

function protectImportedBody(body: string, variables: Map<string, ApiVariable>) {
  if (!body) return body;
  try {
    const parsed: unknown = JSON.parse(body);
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      if (!isRecord(value)) return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (SECRET_KEY.test(key) && typeof child === "string" && child) {
          const varKey = uniqueVariableKey(`postman_${key.replace(/[^A-Za-z0-9_]/g, "_")}_${variables.size + 1}`, variables);
          variables.set(varKey, { key: varKey, value: child, isSecret: true });
          return [key, `{{${varKey}}}`];
        }
        return [key, visit(child)];
      }));
    };
    return JSON.stringify(visit(parsed), null, 2);
  } catch {
    return body;
  }
}

export function importPostmanCollection(collection: unknown, name: string, category = "") {
  if (!isRecord(collection) || !isRecord(collection.info) || !Array.isArray(collection.item)) {
    throw new Error("Postman Collection v2.1 JSON dosyası okunamadı.");
  }
  const variables = new Map<string, ApiVariable>();
  if (Array.isArray(collection.variable)) {
    for (const item of collection.variable) {
      const variable = postmanVariable(item);
      if (variable) variables.set(variable.key, variable);
    }
  }
  const workspaceAuth = variablesFromAuth(collection.auth, variables, { type: "none" });
  const requests: ApiSavedRequest[] = [];
  const walk = (items: unknown[], folder = "", folderAuth: unknown = null) => {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const itemName = typeof item.name === "string" ? item.name : "İsimsiz istek";
      if (Array.isArray(item.item)) {
        walk(item.item, folder ? `${folder} / ${itemName}` : itemName, item.auth ?? folderAuth);
        continue;
      }
      if (!isRecord(item.request)) continue;
      const rawRequest = item.request;
      const method = typeof rawRequest.method === "string" && METHODS.has(rawRequest.method.toUpperCase() as ApiMethod)
        ? rawRequest.method.toUpperCase() as ApiMethod
        : "GET";
      const headers = Array.isArray(rawRequest.header)
        ? rawRequest.header.filter((header) => isRecord(header) && header.disabled !== true && typeof header.key === "string")
          .map((header) => ({ key: String(header.key), value: typeof header.value === "string" ? header.value : "", enabled: true }))
        : [];
      let body = "";
      if (isRecord(rawRequest.body) && rawRequest.body.mode === "raw" && typeof rawRequest.body.raw === "string") {
        body = protectImportedBody(rawRequest.body.raw, variables);
      }
      const effectiveAuth = rawRequest.auth ?? folderAuth;
      const requestAuth = effectiveAuth
        ? variablesFromAuth(effectiveAuth, variables, { type: "inherit" })
        : { type: "inherit" as const };
      requests.push({
        id: randomUUID(),
        name: itemName,
        folder,
        method,
        url: postmanUrl(rawRequest.url),
        headers,
        body,
        auth: requestAuth,
        assertions: [],
        captureTokenPath: "",
        captureTokenVariable: "access_token",
      });
    }
  };
  walk(collection.item);
  const created = normalizeApiWorkspace({ name: name || (isRecord(collection.info) ? collection.info.name : "Postman koleksiyonu"), category, variables: [...variables.values()], auth: workspaceAuth, requests });
  return created;
}

export function exportPostmanCollection(workspace: Omit<ApiWorkspace, "id" | "createdAt" | "updatedAt">) {
  const safeValue = (value: string) => /^\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\}$/.test(value) ? value : "";
  const toPostmanAuth = (auth: ApiAuth) => {
    if (auth.type === "bearer") return { type: "bearer", bearer: [{ key: "token", value: safeValue(auth.token), type: "string" }] };
    if (auth.type === "basic") return { type: "basic", basic: [{ key: "username", value: safeValue(auth.username), type: "string" }, { key: "password", value: safeValue(auth.password), type: "string" }] };
    if (auth.type === "api-key") return { type: "apikey", apikey: [{ key: "key", value: auth.key, type: "string" }, { key: "value", value: safeValue(auth.value), type: "string" }, { key: "in", value: auth.in, type: "string" }] };
    return { type: auth.type === "inherit" ? "inherit" : "noauth" };
  };
  const variable = workspace.variables.map((item) => ({ key: item.key, value: item.isSecret ? "" : item.value, type: item.isSecret ? "secret" : "default" }));
  type CollectionItem = { name: string; item?: CollectionItem[]; request?: Record<string, unknown> };
  const collectionItems: CollectionItem[] = [];
  const folderItems = new Map<string, CollectionItem>();
  const getRequestItems = (folder: string) => {
    let items = collectionItems;
    let parentPath = "";
    for (const segment of folder.split("/").map((part) => part.trim()).filter(Boolean)) {
      parentPath = parentPath ? `${parentPath} / ${segment}` : segment;
      let folderItem = folderItems.get(parentPath);
      if (!folderItem) {
        folderItem = { name: segment, item: [] };
        items.push(folderItem);
        folderItems.set(parentPath, folderItem);
      }
      items = folderItem.item!;
    }
    return items;
  };
  for (const request of workspace.requests) {
    getRequestItems(request.folder).push({
      name: request.name,
      request: {
        method: request.method,
        header: request.headers.map((header) => ({ key: header.key, value: /(?:authorization|token|secret|password|api[_-]?key|credential)/i.test(header.key) ? safeValue(header.value) : header.value, type: "text", disabled: !header.enabled })),
        url: { raw: request.url },
        ...(request.body ? { body: { mode: "raw", raw: request.body, options: { raw: { language: "json" } } } } : {}),
        auth: toPostmanAuth(request.auth),
      },
    });
  }
  return {
    info: {
      name: workspace.name,
      description: workspace.category ? `ULAK servis grubu: ${workspace.category}` : "ULAK API çalışma alanı",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: toPostmanAuth(workspace.auth),
    variable,
    item: collectionItems,
  };
}

function interpolate(value: string, variables: Map<string, string>) {
  return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g, (_match, key: string) => {
    if (!variables.has(key)) throw new Error(`“${key}” değişkeni tanımlı değil.`);
    return variables.get(key)!;
  });
}

function interpolateUrl(value: string, variables: Map<string, string>) {
  const baseMatch = value.match(/^(https?:\/\/)?\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}(?=\/|[?#]|$)/i);
  if (baseMatch) {
    const key = baseMatch[2];
    if (!variables.has(key)) throw new Error(`“${key}” değişkeni tanımlı değil.`);
    const base = variables.get(key)!;
    const prefix = baseMatch[1] && !/^https?:\/\//i.test(base) ? baseMatch[1] : "";
    value = `${prefix}${base}${value.slice(baseMatch[0].length)}`;
  }
  return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_.-]*)\}\}/g, (_match, key: string) => {
    if (!variables.has(key)) throw new Error(`“${key}” değişkeni tanımlı değil.`);
    return encodeURIComponent(variables.get(key)!);
  });
}

function safeResponseHeaders(headers: ApiResponseLike["headers"], secrets: string[]) {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (/^(set-cookie|www-authenticate|authorization|proxy-authenticate)$/i.test(key) || SECRET_KEY.test(key)) return;
    result[key] = secrets.reduce((text, secret) => text.split(secret).join("[gizlendi]"), value).slice(0, 2_000);
  });
  return result;
}

function redactJson(value: unknown, secrets: string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => redactJson(item, secrets));
  if (typeof value === "string") return secrets.reduce((text, secret) => text.split(secret).join("[gizlendi]"), value);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SECRET_KEY.test(key) ? "[gizlendi]" : redactJson(child, secrets),
  ]));
}

function knownSecrets(workspace: ApiWorkspace, request: ApiSavedRequest) {
  const values = workspace.variables.filter((item) => item.isSecret).map((item) => item.value);
  const addAuth = (auth: ApiAuth) => {
    if (auth.type === "bearer") values.push(auth.token);
    if (auth.type === "basic") values.push(auth.password);
    if (auth.type === "api-key") values.push(auth.value);
  };
  addAuth(workspace.auth);
  addAuth(request.auth);
  for (const header of request.headers) {
    if (SECRET_KEY.test(header.key)) values.push(header.value);
  }
  for (const assertion of request.assertions) {
    if (assertion.isSecret) values.push(assertion.expected);
  }
  if (workspace.proxyUrl) {
    try {
      const proxy = new URL(workspace.proxyUrl);
      if (proxy.username) values.push(decodeURIComponent(proxy.username));
      if (proxy.password) values.push(decodeURIComponent(proxy.password));
    } catch { /* Invalid proxy URLs are rejected before sending. */ }
  }
  return [...new Set(values.filter((value) => value && !/^\{\{.*\}\}$/.test(value)))];
}

function readPath(value: unknown, path: string) {
  return path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    return isRecord(current) ? current[part] : undefined;
  }, value);
}

function assertionValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value);
}

function runAssertions(
  assertions: ApiAssertion[],
  context: {
    status: number;
    bodyText: string;
    bodyJson: unknown;
    isJson: boolean;
    headers: ApiResponseLike["headers"];
    variables: Map<string, string>;
  },
) {
  const headers: Record<string, string> = {};
  context.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return assertions.filter((assertion) => assertion.enabled).map((assertion) => {
    let passed = false;
    let failure = "Beklenen değerle eşleşmedi.";
    try {
      const expected = interpolate(assertion.expected, context.variables);
      let actual: unknown;
      if (assertion.target === "status") actual = String(context.status);
      else if (assertion.target === "body") actual = context.bodyText;
      else if (assertion.target === "header") actual = headers[assertion.path.toLowerCase()];
      else if (!context.isJson) failure = "Yanıt geçerli JSON değil.";
      else actual = readPath(context.bodyJson, assertion.path);

      if (assertion.operator === "exists") {
        passed = actual !== undefined && actual !== null;
        if (assertion.target === "header" || context.isJson) {
          failure = "JSON alanı veya header yanıtta bulunamadı.";
        }
      } else if (actual !== undefined && actual !== null) {
        if (assertion.operator === "equals") passed = assertionValue(actual) === expected;
        else if (Array.isArray(actual)) passed = actual.some((item) => assertionValue(item) === expected);
        else passed = assertionValue(actual).includes(expected);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : "Test çalıştırılamadı.";
    }
    const label = assertion.name || "Yanıt testi";
    return {
      id: assertion.id,
      name: label,
      passed,
      message: passed ? `${label}: başarılı.` : `${label}: başarısız. ${failure}`,
    };
  });
}

async function boundedResponseText(response: ApiResponseLike) {
  const reader = getApiByteReader(response.body);
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result: unknown = await reader.read();
    if (!isRecord(result) || typeof result.done !== "boolean") throw new Error("Servis yanıt akışı geçersiz.");
    if (result.done) break;
    if (!(result.value instanceof Uint8Array)) throw new Error("Servis yanıtı metin akışı olarak okunamadı.");
    const value = result.value;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BODY) {
      await reader.cancel();
      throw Object.assign(new Error("Servis yanıtı 1 MB sınırını aştı; yanıt gösterilmedi."), { status: 413 });
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function executeApiRequest(workspace: ApiWorkspace, requestId: string) {
  const request = workspace.requests.find((item) => item.id === requestId);
  if (!request) throw Object.assign(new Error("Kaydedilmiş istek bulunamadı."), { status: 404 });
  const variableMap = new Map(workspace.variables.map((item) => [item.key, item.value]));
  const urlText = interpolateUrl(request.url, variableMap);
  let url: URL;
  try { url = new URL(urlText); } catch { throw new Error("İstek için geçerli bir URL girin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Yalnız HTTP/HTTPS servis URL’leri desteklenir; URL içine kullanıcı bilgisi eklemeyin.");
  if (url.hostname.toLowerCase() === "metadata.google.internal" || url.hostname === "169.254.169.254") {
    throw new Error("Bulut metadata adreslerine istek gönderilmesine izin verilmiyor.");
  }
  if (request.body.length > MAX_REQUEST_BODY) throw new Error("İstek gövdesi 100 KB sınırını aşıyor.");
  const headers = new Headers();
  for (const header of request.headers) {
    if (!header.enabled || !header.key.trim()) continue;
    if (BLOCKED_HEADERS.has(header.key.toLowerCase())) throw new Error(`“${header.key}” header’ı güvenlik nedeniyle ayarlanamaz.`);
    headers.set(header.key, interpolate(header.value, variableMap));
  }
  const auth = request.auth.type === "inherit" ? workspace.auth : request.auth;
  if (auth.type === "bearer") {
    headers.set("Authorization", `Bearer ${interpolate(auth.token, variableMap)}`);
  } else if (auth.type === "basic") {
    const username = interpolate(auth.username, variableMap);
    const password = interpolate(auth.password, variableMap);
    headers.set("Authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  } else if (auth.type === "api-key") {
    const key = interpolate(auth.key, variableMap);
    const value = interpolate(auth.value, variableMap);
    if (auth.in === "header") headers.set(key, value);
    else url.searchParams.set(key, value);
  }
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : interpolate(request.body, variableMap);
  if (body && !headers.has("content-type")) headers.set("Content-Type", "application/json");
  const startedAt = Date.now();
  if (workspace.proxyEnabled && !workspace.proxyUrl) {
    throw new Error("Proxy etkin ancak adres boş. Sağlayıcı adresini girip çalışma alanını kaydedin.");
  }
  let proxyAgent: ProxyAgent | null = null;
  if (workspace.proxyEnabled) {
    try { proxyAgent = new ProxyAgent({ uri: workspace.proxyUrl, proxyTunnel: false }); }
    catch { throw new Error("Proxy adresi okunamadı. Sağlayıcının HTTP(S) proxy biçimini kontrol edin."); }
  }
  let response: ApiResponseLike;
  try {
    const fetchOptions = {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    } as const;
    response = proxyAgent
      ? await undiciFetch(url, { ...fetchOptions, dispatcher: proxyAgent })
      : await fetch(url, fetchOptions);
  } catch (error) {
    await proxyAgent?.close();
    if (error instanceof Error && error.name === "TimeoutError") throw Object.assign(new Error("İstek 20 saniyede yanıt vermedi; proxy ve servis erişimini kontrol edin."), { status: 504 });
    throw Object.assign(new Error(workspace.proxyEnabled
      ? "Proxy üzerinden servise bağlanılamadı. Proxy adresi, kullanıcı bilgileri, ülke ayarı ve sağlayıcı erişimini kontrol edin."
      : "Servise bağlanılamadı. URL, ağ erişimi ve TLS sertifikasını kontrol edin."), { status: 502 });
  }
  let rawBody: string;
  try { rawBody = await boundedResponseText(response); }
  finally { await proxyAgent?.close(); }
  const secretsToRedact = knownSecrets(workspace, request);
  let displayBody: unknown = rawBody;
  let tokenToSave = "";
  let capturedVariable = "";
  let json = false;
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
    json = true;
    if (response.ok && request.captureTokenPath) {
      const tokenValue = readPath(parsedBody, request.captureTokenPath);
      if (typeof tokenValue === "string" || typeof tokenValue === "number") {
        tokenToSave = String(tokenValue).slice(0, 8_000);
        capturedVariable = request.captureTokenVariable || "access_token";
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(capturedVariable)) throw new Error("Token değişken adı geçersiz.");
        const existing = workspace.variables.find((item) => item.key === capturedVariable);
        if (existing) {
          existing.value = tokenToSave;
          existing.isSecret = true;
        } else {
          workspace.variables.push({ key: capturedVariable, value: tokenToSave, isSecret: true });
        }
      }
    }
    if (tokenToSave) secretsToRedact.push(tokenToSave);
    displayBody = redactJson(parsedBody, secretsToRedact);
  } catch (error) {
    if (error instanceof Error && error.message === "Token değişken adı geçersiz.") throw error;
    displayBody = secretsToRedact.reduce((text, secret) => String(text).split(secret).join("[gizlendi]"), rawBody);
  }
  const assertions = runAssertions(request.assertions, {
    status: response.status,
    bodyText: rawBody,
    bodyJson: parsedBody,
    isJson: json,
    headers: response.headers,
    variables: variableMap,
  });
  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    headers: safeResponseHeaders(response.headers, secretsToRedact),
    body: displayBody,
    isJson: json,
    capturedVariable: capturedVariable || null,
    assertions,
    savedSecrets: tokenToSave ? { [capturedVariable]: tokenToSave } : {},
  };
}

export const MAX_API_WORKSPACE_JSON_BYTES = MAX_WORKSPACE_JSON;
