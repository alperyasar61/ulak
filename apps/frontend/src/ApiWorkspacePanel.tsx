import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronRight, Download, FileText, Folder, KeyRound, Play, Plus, Save, Search, Trash2, WandSparkles, X } from "lucide-react";
import type { ApiAssertion, ApiAuth, ApiResponse, ApiSavedRequest, ApiWorkspace } from "./types";

const METHODS: ApiSavedRequest["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function blankRequest(): ApiSavedRequest {
  return {
    id: crypto.randomUUID(),
    name: "Yeni istek",
    folder: "",
    method: "GET",
    url: "",
    headers: [],
    body: "",
    auth: { type: "inherit" },
    assertions: [],
    captureTokenPath: "",
    captureTokenVariable: "access_token",
  };
}

function responseSummary(response: ApiResponse) {
  if (response.status >= 200 && response.status < 300) return "Servis isteği başarıyla tamamladı.";
  if (response.status >= 300 && response.status < 400) return "Servis yönlendirme yanıtı verdi. Güvenlik için otomatik yönlendirme izlenmedi.";
  if (response.status === 407) return "Proxy erişimi reddedildi. Proxy kullanıcı bilgilerini ve sağlayıcı hesabını kontrol edin.";
  if (response.status === 401 || response.status === 403) return "Kimlik doğrulama veya yetki bilgilerini kontrol edin.";
  if (response.status === 404) return "İstenen endpoint bulunamadı; URL ve servis sürümünü kontrol edin.";
  if (response.status === 405) return "Bu endpoint HTTP metodunu kabul etmiyor; GET/POST gibi metodu servis dokümantasyonundan doğrulayın.";
  if (response.status === 415) return "Servis istek biçimini kabul etmiyor; Content-Type header’ını ve gövde biçimini kontrol edin.";
  if (response.status === 422) return "İstek alanları doğrulamadan geçmedi; yanıt gövdesindeki alan hatalarını inceleyin.";
  if (response.status === 429) return "İstek sınırına ulaşıldı; bir süre bekleyip tekrar deneyin.";
  if (response.status >= 400 && response.status < 500) return "İstek servis tarafından reddedildi. Parametreleri ve istek gövdesini inceleyin.";
  if (response.status >= 500) return "Servis tarafında hata oluştu; servis sağlayıcısının hata ayrıntılarını inceleyin.";
  return "HTTP yanıtı alındı; servis dokümantasyonuyla karşılaştırın.";
}

function responseNextStep(response: ApiResponse) {
  if (response.status === 407) return "Proxy adresi, kullanıcı adı/şifre ve sağlayıcı panelindeki ülke/oturum ayarını kontrol edin.";
  if (response.status === 401) return "Yetkilendirme sekmesinde token/anahtarı doğrulayın. Giriş isteği kullanıyorsanız token yolunu (ör. data.access_token) tanımlayın.";
  if (response.status === 403) return "Hesabın bu endpoint’e ve seçili proxy ülkesinden erişmeye yetkili olduğunu servis sahibiyle doğrulayın.";
  if (response.status === 404) return "Base URL, endpoint yolu ve API sürümünü (ör. /v1) servis dokümanıyla karşılaştırın.";
  if (response.status === 400 || response.status === 422) return "Zorunlu alanları, JSON biçimini ve alan adlarını servis dokümanıyla karşılaştırın.";
  if (response.status === 415) return "JSON gönderirken Content-Type: application/json header’ını ekleyin.";
  if (response.status === 429) return "Servisin hız sınırına uymak için bekleyin; tekrar deneme sıklığını azaltın.";
  if (response.status >= 500) return "İstek servis tarafına ulaştı ancak servis hata verdi; yanıt gövdesini ve servis durumunu kontrol edin.";
  return "Önce temel bir GET/health isteği deneyin; ardından kimlik doğrulamayı ve isteğin zorunlu alanlarını ekleyin.";
}

function pretty(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "";
}

export function ApiWorkspacePanel({
  workspace,
  response,
  busy,
  onChange,
  onSave,
  onSend,
  onDelete,
  onExport,
  onExportMarkdown,
}: {
  workspace: ApiWorkspace;
  response: ApiResponse | null;
  busy: boolean;
  onChange: (workspace: ApiWorkspace) => void;
  onSave: () => void;
  onSend: (requestId: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onExportMarkdown: () => void;
}) {
  type RequestTree = { folders: Map<string, RequestTree>; requests: ApiSavedRequest[] };
  const [selectedId, setSelectedId] = useState(workspace.requests[0]?.id ?? "");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestTab, setRequestTab] = useState<"params" | "auth" | "headers" | "body" | "tests">("params");
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const selectedRequest = workspace.requests.find((item) => item.id === selectedId) ?? workspace.requests[0] ?? null;
  const workspaceBearer = workspace.auth.type === "bearer" ? workspace.auth : null;
  const workspaceBasic = workspace.auth.type === "basic" ? workspace.auth : null;
  const workspaceApiKey = workspace.auth.type === "api-key" ? workspace.auth : null;

  useEffect(() => {
    const first = workspace.requests[0];
    setSelectedId(first?.id ?? "");
    setExpandedFolders(Object.fromEntries((first?.folder.split("/").map((part) => part.trim()).filter(Boolean) ?? []).map((_part, index, parts) => [
      parts.slice(0, index + 1).join(" / "),
      true,
    ])));
  }, [workspace.id]);

  const filteredRequests = useMemo(() => {
    const query = requestSearch.trim().toLocaleLowerCase("tr");
    if (!query) return workspace.requests;
    return workspace.requests.filter((item) =>
      `${item.folder} ${item.name} ${item.method} ${item.url}`.toLocaleLowerCase("tr").includes(query),
    );
  }, [requestSearch, workspace.requests]);
  const request = filteredRequests.find((item) => item.id === selectedId)
    ?? filteredRequests[0]
    ?? (requestSearch.trim() ? null : selectedRequest);
  const requestIndex = workspace.requests.findIndex((item) => item.id === request?.id);
  const requestBearer = request?.auth.type === "bearer" ? request.auth : null;
  const requestBasic = request?.auth.type === "basic" ? request.auth : null;
  const requestApiKey = request?.auth.type === "api-key" ? request.auth : null;
  const updateWorkspace = (patch: Partial<ApiWorkspace>) => onChange({ ...workspace, ...patch });
  const updateRequest = (patch: Partial<ApiSavedRequest>) => {
    if (!request) return;
    const requests = workspace.requests.map((item, index) => index === requestIndex ? { ...item, ...patch } : item);
    onChange({ ...workspace, requests });
  };
  const secretVariables = useMemo(() => new Set(workspace.variables.filter((item) => item.isSecret).map((item) => item.key)), [workspace.variables]);
  const requestTree = useMemo(() => {
    const root: RequestTree = { folders: new Map(), requests: [] };
    for (const item of filteredRequests) {
      let node = root;
      for (const segment of item.folder.split("/").map((part) => part.trim()).filter(Boolean)) {
        if (!node.folders.has(segment)) node.folders.set(segment, { folders: new Map(), requests: [] });
        node = node.folders.get(segment)!;
      }
      node.requests.push(item);
    }
    return root;
  }, [filteredRequests]);
  const folders = useMemo(() => [...new Set(workspace.requests.map((item) => item.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [workspace.requests]);
  const queryParams = useMemo(() => {
    if (!request) return [];
    const query = request.url.split("?")[1]?.split("#")[0] ?? "";
    return query.split("&").filter(Boolean).map((part) => {
      const equals = part.indexOf("=");
      const decode = (value: string) => {
        try { return decodeURIComponent(value.replace(/\+/g, " ")); } catch { return value; }
      };
      return {
        key: decode(equals < 0 ? part : part.slice(0, equals)),
        value: decode(equals < 0 ? "" : part.slice(equals + 1)),
      };
    });
  }, [request?.url]);

  function addRequest() {
    const next = blankRequest();
    setRequestSearch("");
    updateWorkspace({ requests: [...workspace.requests, next] });
    setSelectedId(next.id);
  }

  function removeRequest() {
    if (!request || !window.confirm(`“${request.name}” isteği silinsin mi?`)) return;
    const requests = workspace.requests.filter((item) => item.id !== request.id);
    setRequestSearch("");
    updateWorkspace({ requests });
    setSelectedId(requests[0]?.id ?? "");
  }

  function setAuthType(type: ApiAuth["type"]) {
    const auth: ApiAuth = type === "bearer" ? { type, token: "" }
      : type === "basic" ? { type, username: "", password: "" }
        : type === "api-key" ? { type, key: "x-api-key", value: "", in: "header" }
          : { type };
    updateRequest({ auth });
  }

  function addVariable() {
    const key = `variable_${workspace.variables.length + 1}`;
    updateWorkspace({ variables: [...workspace.variables, { key, value: "", isSecret: false }] });
  }

  function updateVariable(index: number, patch: Partial<ApiWorkspace["variables"][number]>) {
    updateWorkspace({ variables: workspace.variables.map((variable, i) => i === index ? { ...variable, ...patch } : variable) });
  }

  function updateQueryParams(params: Array<{ key: string; value: string }>) {
    if (!request) return;
    const urlWithoutHash = request.url.split("#")[0];
    const base = urlWithoutHash.split("?")[0];
    const hash = request.url.includes("#") ? `#${request.url.split("#").slice(1).join("#")}` : "";
    const encode = (value: string) => encodeURIComponent(value).replace(/%7B%7B([^%]+)%7D%7D/gi, "{{$1}}");
    const query = params.filter((param) => param.key.trim())
      .map((param) => `${encode(param.key)}=${encode(param.value)}`).join("&");
    updateRequest({ url: `${base}${query ? `?${query}` : ""}${hash}` });
  }

  function addQueryParam() {
    updateQueryParams([...queryParams, { key: `param_${queryParams.length + 1}`, value: "" }]);
  }

  function renderRequestItems(items: ApiSavedRequest[]) {
    return items.map((item) => (
      <button key={item.id} className={"api-request-item " + (item.id === request?.id ? "active" : "")} onClick={() => setSelectedId(item.id)}>
        <span className={"api-method method-" + item.method.toLowerCase()}>{item.method}</span>
        <span className="api-request-label"><strong>{item.name}</strong><small>{item.url || "URL girilmedi"}</small></span>
        <ChevronRight size={14} />
      </button>
    ));
  }

  function renderRequestTree(node: RequestTree, parentPath = ""): ReactNode {
    return <>
      {node.requests.length > 0 && renderRequestItems(node.requests)}
      {[...node.folders.entries()].map(([name, child]) => {
        const path = parentPath ? `${parentPath} / ${name}` : name;
        const open = expandedFolders[path] === true || Boolean(requestSearch.trim());
        const countRequests = (tree: RequestTree): number => tree.requests.length + [...tree.folders.values()].reduce((sum, nested) => sum + countRequests(nested), 0);
        return <div className="api-folder-group" key={path}>
          <button className={"api-folder-row " + (open ? "open" : "")} onClick={() => setExpandedFolders((current) => ({ ...current, [path]: !open }))}>
            <ChevronRight size={14} /><Folder size={14} /><span>{name}</span><small>{countRequests(child)}</small>
          </button>
          {open && <div className="api-folder-children">{renderRequestTree(child, path)}</div>}
        </div>;
      })}
    </>;
  }

  function formatBody() {
    if (!request) return;
    try { updateRequest({ body: JSON.stringify(JSON.parse(request.body), null, 2) }); }
    catch { window.alert("İstek gövdesi geçerli JSON değil; biçimlendirme yapılmadı."); }
  }

  function addAssertion() {
    if (!request) return;
    updateRequest({
      assertions: [...request.assertions, {
        id: crypto.randomUUID(),
        name: `Yanıt testi ${request.assertions.length + 1}`,
        target: "status",
        operator: "equals",
        path: "",
        expected: "200",
        isSecret: false,
        enabled: true,
      }],
    });
  }

  function updateAssertion(index: number, patch: Partial<ApiAssertion>) {
    if (!request) return;
    updateRequest({
      assertions: request.assertions.map((assertion, i) => {
        if (i !== index) return assertion;
        const updated = { ...assertion, ...patch };
        if (patch.target === "status") updated.operator = "equals";
        else if (patch.target === "body" && updated.operator === "exists") updated.operator = "contains";
        return updated;
      }),
    });
  }

  return (
    <div className="api-workspace-page">
      <section className="page-heading api-workspace-heading">
        <div className="heading-copy">
          <div className="eyebrow"><span className="signal-line" /> API ÇALIŞMA ALANI</div>
          <h1>API test alanı<span className="heading-period">.</span></h1>
          <p><KeyRound size={13} /> {workspace.name} · Seçtiğiniz endpoint’e istek gönderin; otomatik tarama yapılmaz.</p>
        </div>
        <div className="heading-actions">
          <button className="quiet-button" onClick={onExportMarkdown}><FileText size={15} /> AI için .md indir</button>
          <button className="quiet-button" onClick={onExport}><Download size={15} /> Postman dışa aktar</button>
          <button className="quiet-button" onClick={onDelete}><Trash2 size={15} /> Alanı sil</button>
          <button className="primary-button small" onClick={onSave} disabled={busy}><Save size={15} /> Kaydet</button>
        </div>
      </section>

      <details className="api-connection-details">
        <summary><ChevronRight size={15} /> Bağlantı, proxy ve çalışma alanı ayarları</summary>
      <div className="api-section-heading">
        <div><span className="panel-overline">BAĞLANTI AYARLARI</span><h2>Servis ve çıkış noktası</h2></div>
        <p>Proxy, hedef servise hangi ülkeden bağlanacağını belirler. Bu alanı boş bırakırsanız normal ağ bağlantınız kullanılır.</p>
      </div>
      <div className="api-workspace-meta">
        <label className="field-label">ÇALIŞMA ALANI ADI
          <input value={workspace.name} maxLength={180} onChange={(event) => updateWorkspace({ name: event.target.value })} />
        </label>
        <label className="field-label">SERVİS GRUBU / ETİKET
          <input value={workspace.category} maxLength={100} onChange={(event) => updateWorkspace({ category: event.target.value })} placeholder="Örn. Türkiye / Ödeme API" />
        </label>
      </div>

      <section className="api-proxy-card panel">
        <div className="api-proxy-copy">
          <div className="api-section-title"><div><span className="panel-overline">İSTEĞE BAĞLI · COĞRAFİ ÇIKIŞ</span><strong>Proxy üzerinden gönder</strong></div></div>
          <p>Bu istek, girdiğiniz proxy sağlayıcısı üzerinden çıkar. Servis karşısında sağlayıcının seçilen ülkedeki IP’si görünür; kurumun gerçek IP’si taklit edilmez.</p>
        </div>
        <div className="api-proxy-controls">
          <label className="api-proxy-toggle"><input type="checkbox" checked={workspace.proxyEnabled} onChange={(event) => updateWorkspace({ proxyEnabled: event.target.checked })} /> İsteklerde proxy kullan</label>
          <label className="field-label">SAĞLAYICININ HTTP(S) PROXY ADRESİ
            <input
              type="password"
              autoComplete="off"
              value={workspace.proxyUrl}
              onChange={(event) => updateWorkspace({ proxyUrl: event.target.value, proxyUrlConfigured: Boolean(event.target.value) || workspace.proxyUrlConfigured })}
              placeholder={workspace.proxyUrlConfigured ? "Kayıtlı adres şifreli saklanır; değiştirmek için yeni adres girin" : "https://kullanici:sifre@proxy.ornek.com:8080"}
            />
          </label>
          <div className="api-proxy-foot">
            <span>{workspace.proxyUrlConfigured ? "Proxy bilgisi şifreli kaydedilmiş." : "HTTP(S) proxy desteklenir; SOCKS5 şu an desteklenmiyor."} Ülke ayarı sağlayıcının paneli veya kullanıcı adı biçiminde olabilir.</span>
            {workspace.proxyUrlConfigured && <button className="text-button" onClick={() => updateWorkspace({ proxyUrl: "", proxyUrlConfigured: false, proxyEnabled: false })}><Trash2 size={13} /> Proxy kaydını kaldır</button>}
          </div>
          <p className="api-proxy-warning">Proxy sağlayıcısı hedef URL’yi ve trafiğin metadata’sını görebilir. Sağlayıcıya güvendiğinizden emin olun; mümkünse HTTPS proxy adresi kullanın.</p>
          {workspace.proxyEnabled && !workspace.proxyUrl && !workspace.proxyUrlConfigured && <p className="api-proxy-error">Proxy kullanımı açık; göndermeden önce sağlayıcı adresini girip çalışma alanını kaydedin.</p>}
        </div>
      </section>

      <details className="api-setup-guide">
        <summary><ChevronRight size={15} /> Servis bağlantısı için adım adım rehber</summary>
        <ol>
          <li>Sağlayıcının dokümanından base URL’yi, endpoint’i ve gerekli HTTP metodunu alın.</li>
          <li>Önce <code>GET</code> health/status endpoint’ini deneyin. Kimlik doğrulama gerekiyorsa Yetkilendirme sekmesinde türünü seçin.</li>
          <li>Giriş servisi token döndürüyorsa Parametreler sekmesinde JSON yolunu (ör. <code>data.access_token</code>) yazın. Sonraki isteklerde tokenı <code>{"{{access_token}}"}</code> olarak kullanın.</li>
          <li>Gövde bekleniyorsa JSON’u Gövde sekmesine ekleyin; <code>Content-Type: application/json</code> header’ını kontrol edin.</li>
          <li>Ülke çıkışı gerekiyorsa proxy sağlayıcısından HTTP(S) endpoint’i alın ve bu alana girin. ULAK, sağlayıcının verdiği IP’yi kullanır; adres ya da ülke seçimi proxy hesabınız tarafından belirlenir.</li>
        </ol>
        <p>İpucu: sağlayıcı özel bir kullanıcı adı biçimi (ör. ülke kodu) istiyorsa onu proxy URL’sine aynen ekleyin. API yanıtı yerel görüntülenir; gizli alanlar maskelenir.</p>
      </details>
      </details>

      <div className="api-section-heading api-requests-heading">
        <div><span className="panel-overline">İSTEKLER</span><h2>İstek koleksiyonu</h2></div>
        <p>İstek ara, düzenle ve yalnızca seçtiğin endpoint’e gönder.</p>
      </div>
      <div className="api-workbench">
        <aside className="api-request-list panel">
          <div className="panel-heading">
            <div><span className="panel-overline">KOLEKSİYON</span><h2>{filteredRequests.length}{requestSearch.trim() ? ` / ${workspace.requests.length}` : ""} istek</h2></div>
            <button className="icon-button" onClick={addRequest} aria-label="İstek ekle"><Plus size={17} /></button>
          </div>
          <label className="api-request-search">
            <Search size={15} />
            <input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="İstek adı, metot veya URL ara" aria-label="İsteklerde ara" />
            {requestSearch && <button type="button" onClick={() => setRequestSearch("")} aria-label="Aramayı temizle"><X size={14} /></button>}
          </label>
          <div className="api-request-items">
            {renderRequestTree(requestTree)}
            {!workspace.requests.length && <p className="muted-text">Koleksiyonda henüz istek yok. “+” ile ekleyin.</p>}
            {workspace.requests.length > 0 && !filteredRequests.length && <div className="api-search-empty"><p>“{requestSearch}” ile eşleşen istek yok.</p><button className="text-button" onClick={() => setRequestSearch("")}>Aramayı temizle</button></div>}
          </div>
          <div className="api-variable-panel">
            <div className="api-section-title"><div><span className="panel-overline">ORTAM DEĞİŞKENLERİ</span><small>URL ve isteklerde {"{{ad}}"} kullanın.</small></div><button className="icon-button" onClick={addVariable} aria-label="Değişken ekle"><Plus size={16} /></button></div>
            {workspace.variables.map((variable, index) => (
              <div className="api-variable-row" key={`${variable.key}-${index}`}>
                <input aria-label="Değişken adı" value={variable.key} onChange={(event) => updateVariable(index, { key: event.target.value })} />
                <input aria-label={`${variable.key} değeri`} type={variable.isSecret ? "password" : "text"} value={variable.value} placeholder={variable.isSecret ? "Kayıtlı gizli değer (boş bırakın)" : "Değer"} onChange={(event) => updateVariable(index, { value: event.target.value })} />
                <button className={"secret-toggle " + (variable.isSecret ? "selected" : "")} onClick={() => updateVariable(index, { isSecret: !variable.isSecret })} title="Gizli değer olarak sakla"><KeyRound size={13} /></button>
                <button className="api-remove-button" onClick={() => updateWorkspace({ variables: workspace.variables.filter((_item, i) => i !== index) })} aria-label="Değişkeni kaldır"><Trash2 size={13} /></button>
                {variable.isSecret && <small className="api-variable-hint">{variable.value ? "Değer şifreli saklanacak" : "Daha önce kaydedilen değer korunur"}</small>}
              </div>
            ))}
            {secretVariables.size > 0 && <p className="api-secret-note"><KeyRound size={12} /> Token ve gizli değişkenler ULAK sunucusunda şifreli saklanır; API yanıtlarında geri gösterilmez.</p>}
          </div>
        </aside>

        <section className="api-request-editor panel">
          {!request ? (
            <div className="empty-inline">İlk API isteğinizi ekleyerek başlayın.</div>
          ) : (
            <>
              <div className="api-request-title">
                <input aria-label="İstek adı" value={request.name} onChange={(event) => updateRequest({ name: event.target.value })} />
                <input className="api-request-folder-input" aria-label="İstek klasörü" list={`api-folders-${workspace.id}`} value={request.folder} onChange={(event) => updateRequest({ folder: event.target.value })} placeholder="Klasör" />
                <datalist id={`api-folders-${workspace.id}`}>{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
                <button className="quiet-button" onClick={removeRequest}><Trash2 size={14} /> Sil</button>
              </div>
              <div className="api-url-row">
                <select aria-label="HTTP metodu" value={request.method} onChange={(event) => updateRequest({ method: event.target.value as ApiSavedRequest["method"] })}>
                  {METHODS.map((method) => <option key={method}>{method}</option>)}
                </select>
                <input aria-label="Servis URL’si" value={request.url} onChange={(event) => updateRequest({ url: event.target.value })} placeholder="https://api.example.com/v1/resource veya {{base_url}}/path" />
                <button className="primary-button" onClick={() => onSend(request.id)} disabled={busy || !request.url.trim()}><Play size={15} /> {busy ? "Gönderiliyor…" : "Gönder"}</button>
              </div>

              <div className="api-request-tabs">
                {(["params", "auth", "headers", "body", "tests"] as const).map((tab) => <button key={tab} className={requestTab === tab ? "active" : ""} onClick={() => setRequestTab(tab)}>{tab === "params" ? "Parametreler" : tab === "auth" ? "Yetkilendirme" : tab === "headers" ? `Başlıklar (${request.headers.length})` : tab === "body" ? "Gövde" : `Testler (${request.assertions.length})`}</button>)}
              </div>

              {requestTab === "params" && (
                <div className="api-tab-content">
                  <div className="api-body-head"><span>SORGU PARAMETRELERİ · URL’YE OTOMATİK YANSIR</span><button className="text-button" onClick={addQueryParam}><Plus size={13} /> Parametre ekle</button></div>
                  <div className="api-query-param-head"><span>PARAMETRE</span><span>DEĞER</span><span></span></div>
                  {queryParams.map((param, index) => (
                    <div className="api-query-param-row" key={`${index}-${param.key}`}>
                      <input aria-label="Sorgu parametresi adı" value={param.key} placeholder="limit" onChange={(event) => updateQueryParams(queryParams.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} />
                      <input aria-label={`${param.key || "Sorgu parametresi"} değeri`} value={param.value} placeholder="Değer veya {{değişken}}" onChange={(event) => updateQueryParams(queryParams.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
                      <button className="api-remove-button" onClick={() => updateQueryParams(queryParams.filter((_item, i) => i !== index))} aria-label="Sorgu parametresini sil"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  {!queryParams.length && <p className="api-assertion-empty">Bu istekte sorgu parametresi yok. URL’ye <code>?anahtar=değer</code> ekleyin veya yukarıdan yeni parametre oluşturun.</p>}
                  <p className="api-help-text">Parametre değerlerinde {"{{değişken}}"} kullanabilirsiniz; gizli değişkenler gönderilmeden önce çözülür.</p>
                  <div className="api-request-options-divider" />
                  <label className="field-label">YANITTAN TOKEN AL (İSTEĞE BAĞLI)
                    <div className="api-token-capture">
                      <input value={request.captureTokenPath} onChange={(event) => updateRequest({ captureTokenPath: event.target.value })} placeholder="JSON yolu · örn. data.access_token" />
                      <span>→</span>
                      <input value={request.captureTokenVariable} onChange={(event) => updateRequest({ captureTokenVariable: event.target.value })} placeholder="Değişken adı · access_token" />
                    </div>
                  </label>
                  <p className="api-help-text">Bu yanıt yolundan tokenı alıp şifreli değişkene kaydeder. Sonraki isteklerde Yetkilendirme alanından {"{{access_token}}"} olarak kullanabilirsiniz.</p>
                </div>
              )}

              {requestTab === "auth" && (
                <div className="api-tab-content">
                  <label className="field-label">KİMLİK DOĞRULAMA
                    <select value={request.auth.type} onChange={(event) => setAuthType(event.target.value as ApiAuth["type"])}>
                      <option value="inherit">Çalışma alanı varsayılanı</option><option value="none">Yok</option><option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option><option value="api-key">API Key</option>
                    </select>
                  </label>
                  {requestBearer && <label className="field-label">TOKEN<input type="password" value={requestBearer.token} onChange={(event) => updateRequest({ auth: { type: "bearer", token: event.target.value } })} placeholder="Kayıtlı tokenı korumak için boş bırakın veya {{access_token}} kullanın" /></label>}
                  {requestBasic && <div className="api-auth-pair">
                    <label className="field-label">KULLANICI<input value={requestBasic.username} onChange={(event) => updateRequest({ auth: { type: "basic", username: event.target.value, password: requestBasic.password } })} /></label>
                    <label className="field-label">PAROLA<input type="password" value={requestBasic.password} onChange={(event) => updateRequest({ auth: { type: "basic", username: requestBasic.username, password: event.target.value } })} placeholder="Kayıtlı parolayı korumak için boş bırakın" /></label>
                  </div>}
                  {requestApiKey && <div className="api-auth-pair">
                    <label className="field-label">ANAHTAR ADI<input value={requestApiKey.key} onChange={(event) => updateRequest({ auth: { type: "api-key", key: event.target.value, value: requestApiKey.value, in: requestApiKey.in } })} /></label>
                    <label className="field-label">DEĞER<input type="password" value={requestApiKey.value} onChange={(event) => updateRequest({ auth: { type: "api-key", key: requestApiKey.key, value: event.target.value, in: requestApiKey.in } })} placeholder="Kayıtlı anahtarı korumak için boş bırakın" /></label>
                    <label className="field-label">GÖNDERİM YERİ<select value={requestApiKey.in} onChange={(event) => updateRequest({ auth: { type: "api-key", key: requestApiKey.key, value: requestApiKey.value, in: event.target.value as "header" | "query" } })}><option value="header">Header</option><option value="query">Query</option></select></label>
                  </div>}
                  {request.auth.type === "inherit" && <label className="field-label">ÇALIŞMA ALANI VARSAYILANI
                    <select value={workspace.auth.type} onChange={(event) => updateWorkspace({ auth: event.target.value === "bearer" ? { type: "bearer", token: "" } : event.target.value === "basic" ? { type: "basic", username: "", password: "" } : event.target.value === "api-key" ? { type: "api-key", key: "x-api-key", value: "", in: "header" } : { type: "none" }})}>
                      <option value="none">Yok</option><option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option><option value="api-key">API Key</option>
                    </select>
                  </label>}
                  {request.auth.type === "inherit" && workspaceBearer && <label className="field-label">BEARER TOKEN<input type="password" value={workspaceBearer.token} onChange={(event) => updateWorkspace({ auth: { type: "bearer", token: event.target.value } })} placeholder="Kayıtlı tokenı korumak için boş bırakın veya {{access_token}} kullanın" /></label>}
                  {request.auth.type === "inherit" && workspaceBasic && <div className="api-auth-pair">
                    <label className="field-label">KULLANICI<input value={workspaceBasic.username} onChange={(event) => updateWorkspace({ auth: { type: "basic", username: event.target.value, password: workspaceBasic.password } })} /></label>
                    <label className="field-label">PAROLA<input type="password" value={workspaceBasic.password} onChange={(event) => updateWorkspace({ auth: { type: "basic", username: workspaceBasic.username, password: event.target.value } })} placeholder="Kayıtlı parolayı korumak için boş bırakın" /></label>
                  </div>}
                  {request.auth.type === "inherit" && workspaceApiKey && <div className="api-auth-pair">
                    <label className="field-label">ANAHTAR ADI<input value={workspaceApiKey.key} onChange={(event) => updateWorkspace({ auth: { type: "api-key", key: event.target.value, value: workspaceApiKey.value, in: workspaceApiKey.in } })} /></label>
                    <label className="field-label">DEĞER<input type="password" value={workspaceApiKey.value} onChange={(event) => updateWorkspace({ auth: { type: "api-key", key: workspaceApiKey.key, value: event.target.value, in: workspaceApiKey.in } })} placeholder="Kayıtlı anahtarı korumak için boş bırakın" /></label>
                    <label className="field-label">GÖNDERİM YERİ<select value={workspaceApiKey.in} onChange={(event) => updateWorkspace({ auth: { type: "api-key", key: workspaceApiKey.key, value: workspaceApiKey.value, in: event.target.value as "header" | "query" } })}><option value="header">Header</option><option value="query">Query</option></select></label>
                  </div>}
                  <p className="api-help-text">Gizli değerleri {"{{değişken}}"} olarak girin. Postman pre-request/test scriptleri güvenlik nedeniyle çalıştırılmaz.</p>
                </div>
              )}

              {requestTab === "headers" && (
                <div className="api-tab-content">
                  <div className="api-header-head"><span></span><strong>HEADER</strong><strong>DEĞER</strong><span></span></div>
                  {request.headers.map((header, index) => (
                    <div className="api-header-row" key={index}>
                      <input type="checkbox" checked={header.enabled} aria-label="Header etkin" onChange={(event) => updateRequest({ headers: request.headers.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item) })} />
                      <input value={header.key} placeholder="Content-Type" onChange={(event) => updateRequest({ headers: request.headers.map((item, i) => i === index ? { ...item, key: event.target.value } : item) })} />
                      <input value={header.value} placeholder="application/json veya {{değişken}}" onChange={(event) => updateRequest({ headers: request.headers.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} />
                      <button className="api-remove-button" onClick={() => updateRequest({ headers: request.headers.filter((_item, i) => i !== index) })} aria-label="Header sil"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button className="text-button" onClick={() => updateRequest({ headers: [...request.headers, { key: "", value: "", enabled: true }] })}><Plus size={14} /> Header ekle</button>
                </div>
              )}

              {requestTab === "body" && (
                <div className="api-tab-content">
                  <div className="api-body-head"><span>RAW · JSON</span><button className="text-button" onClick={formatBody}><WandSparkles size={13} /> JSON düzenle</button></div>
                  <textarea className="api-body-editor" value={request.body} onChange={(event) => updateRequest({ body: event.target.value })} placeholder={'{\n  "customerId": "{{customer_id}}"\n}'} spellCheck={false} />
                  <p className="api-help-text">Gövde en fazla 100 KB olabilir. Parola/token gibi değerleri sabit yazmak yerine şifreli ortam değişkenlerini kullanın.</p>
                </div>
              )}

              {requestTab === "tests" && (
                <div className="api-tab-content api-assertion-editor">
                  <div className="api-assertion-heading">
                    <div><strong>Yanıt kontrolleri</strong><p>İstekten sonra HTTP durumunu, JSON alanlarını, header’ları veya yanıt metnini doğrulayın.</p></div>
                    <button className="text-button" onClick={addAssertion}><Plus size={14} /> Test ekle</button>
                  </div>
                  <p className="api-help-text">Postman JavaScript testleri içe aktarılsa bile çalıştırılmaz. Bu görsel kontroller yalnızca alınan yanıtı değerlendirir.</p>
                  {request.assertions.map((assertion, index) => (
                    <div className={"api-assertion-row " + (!assertion.enabled ? "disabled" : "")} key={assertion.id}>
                      <div className="api-assertion-title">
                        <input type="checkbox" checked={assertion.enabled} aria-label="Yanıt testi etkin" onChange={(event) => updateAssertion(index, { enabled: event.target.checked })} />
                        <input aria-label="Test adı" value={assertion.name} onChange={(event) => updateAssertion(index, { name: event.target.value })} placeholder="Test adı" />
                        <button className="api-remove-button" onClick={() => updateRequest({ assertions: request.assertions.filter((_item, i) => i !== index) })} aria-label="Testi sil"><Trash2 size={13} /></button>
                      </div>
                      <div className="api-assertion-fields">
                        <select aria-label="Test edilecek yanıt alanı" value={assertion.target} onChange={(event) => {
                          const target = event.target.value as ApiAssertion["target"];
                          updateAssertion(index, {
                            target,
                            path: target === "status" || target === "body" ? "" : assertion.path,
                            expected: target === "status" && !assertion.expected ? "200" : assertion.expected,
                          });
                        }}>
                          <option value="status">HTTP durum kodu</option><option value="json">JSON alanı</option><option value="header">Yanıt header’ı</option><option value="body">Yanıt metni</option>
                        </select>
                        {(assertion.target === "json" || assertion.target === "header") && <input aria-label={assertion.target === "json" ? "JSON alan yolu" : "Yanıt header adı"} value={assertion.path} onChange={(event) => updateAssertion(index, { path: event.target.value })} placeholder={assertion.target === "json" ? "data.id" : "content-type"} />}
                        <select aria-label="Test işlemi" value={assertion.operator} onChange={(event) => updateAssertion(index, { operator: event.target.value as ApiAssertion["operator"] })}>
                          <option value="equals">eşittir</option>{assertion.target !== "status" && <option value="contains">içerir</option>}{(assertion.target === "json" || assertion.target === "header") && <option value="exists">mevcut</option>}
                        </select>
                        {assertion.operator !== "exists" && <div className="api-assertion-expected">
                          <input aria-label="Beklenen yanıt değeri" type={assertion.isSecret ? "password" : "text"} value={assertion.expected} onChange={(event) => updateAssertion(index, { expected: event.target.value })} placeholder={assertion.isSecret ? "Şifreli beklenen değer" : "Beklenen değer"} />
                          <button className={"secret-toggle " + (assertion.isSecret ? "selected" : "")} onClick={() => updateAssertion(index, { isSecret: !assertion.isSecret })} title="Beklenen değeri gizli sakla"><KeyRound size={13} /></button>
                        </div>}
                      </div>
                    </div>
                  ))}
                  {!request.assertions.length && <div className="api-assertion-empty">Henüz test eklenmedi. Örneğin HTTP durum kodunun 200 olmasını veya <code>data.id</code> alanının bulunmasını doğrulayın.</div>}
                </div>
              )}

              <div className="api-editor-footer">
                <span><Check size={14} /> Yalnızca seçili istek gönderilir · 20 sn zaman aşımı</span>
                <button className="quiet-button" onClick={onSave} disabled={busy}><Save size={14} /> İsteği kaydet</button>
              </div>
            </>
          )}
        </section>
      </div>

      {response && <section className="panel api-response-panel">
        <div className="panel-heading">
          <div><span className="panel-overline">SERVİS YANITI · YEREL YORUM</span><h2>{responseSummary(response)}</h2></div>
          <div className={"api-response-status " + (response.ok ? "success" : "failure")}>{response.status} {response.statusText}<small>{response.durationMs} ms</small></div>
        </div>
        {response.capturedVariable && <div className="api-token-success"><KeyRound size={14} /> Token alındı ve “{response.capturedVariable}” adıyla şifreli kaydedildi.</div>}
        {response.assertions.length > 0 && <section className="api-assertion-results" aria-label="Yanıt testi sonuçları">
          <div className="api-assertion-results-heading">
            <strong>Yanıt testleri</strong>
            <span className={response.assertions.every((item) => item.passed) ? "passed" : "failed"}>
              {response.assertions.filter((item) => item.passed).length}/{response.assertions.length} başarılı
            </span>
          </div>
          {response.assertions.map((assertion) => <div className={"api-assertion-result " + (assertion.passed ? "passed" : "failed")} key={assertion.id}>
            {assertion.passed ? <Check size={14} /> : <X size={14} />}<span>{assertion.message}</span>
          </div>)}
        </section>}
        <p className="api-help-text api-next-step"><strong>Sonraki adım:</strong> {responseNextStep(response)}</p>
        <div className="api-request-tabs response-tabs">
          <button className={responseTab === "body" ? "active" : ""} onClick={() => setResponseTab("body")}>Yanıt gövdesi</button>
          <button className={responseTab === "headers" ? "active" : ""} onClick={() => setResponseTab("headers")}>Yanıt başlıkları ({Object.keys(response.headers).length})</button>
        </div>
        {responseTab === "body" ? <pre className="api-response-body">{pretty(response.body) || "(Boş yanıt)"}</pre> : <pre className="api-response-body">{pretty(response.headers)}</pre>}
        <p className="api-help-text">Yorum HTTP durum kodu ve yanıt biçimine dayanır; yanıt AI’ye veya başka servise gönderilmez.</p>
      </section>}
    </div>
  );
}
