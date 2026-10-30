import type { DragEvent, FormEvent, RefObject } from "react";
import { ArrowRight, CloudUpload, FileArchive, FolderKanban, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { formatBytes } from "../lib/format";

export function UploadModal({
  busy,
  onClose,
  onSubmit,
  uploadFile,
  onChooseFile,
  onClearFile,
  repoUrl,
  setRepoUrl,
  projectName,
  setProjectName,
  isDragging,
  setIsDragging,
  onDrop,
  fileInputRef,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  uploadFile: File | null;
  onChooseFile: (file: File) => void;
  onClearFile: () => void;
  repoUrl: string;
  setRepoUrl: (value: string) => void;
  projectName: string;
  setProjectName: (value: string) => void;
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="modal-top">
          <div className="modal-symbol">
            <FolderKanban size={20} />
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="eyebrow">
          <span className="signal-line" /> YENİ PROJE
        </div>
        <h2 id="upload-title">
          İlk önce <em>dosyaları</em> tanıyalım.
        </h2>
        <p className="modal-description">
          Arşiv sunucuya güvenli inceleme için yüklenir ve ULAK veri dizininde saklanır. Kod çalıştırılmaz. AI veya
          araştırmaya henüz gönderilmez.
        </p>

        <form onSubmit={onSubmit}>
          <label className="field-label">
            PROJE ADI <span>İsteğe bağlı</span>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Örn. OpenJarvis"
              maxLength={180}
            />
          </label>

          <div
            className={`drop-zone ${isDragging ? "dragging" : ""} ${uploadFile ? "has-file" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".7z,.zip,.tar,.tgz,.gz"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onChooseFile(file);
              }}
            />
            <div className="drop-icon">{uploadFile ? <FileArchive size={20} /> : <CloudUpload size={20} />}</div>
            {uploadFile ? (
              <>
                <strong>{uploadFile.name}</strong>
                <span>
                  {formatBytes(uploadFile.size)} · Arşiv seçildi{" "}
                  <button
                    type="button"
                    className="inline-clear"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClearFile();
                    }}
                  >
                    Kaldır
                  </button>
                </span>
              </>
            ) : (
              <>
                <strong>Arşivi buraya bırak</strong>
                <span>
                  veya <u>bilgisayarından seç</u> · 25 MB’a kadar
                </span>
              </>
            )}
          </div>

          <div className="separator-label">
            <span /> YA DA HERKESE AÇIK DEPO <span />
          </div>

          <label className="field-label">
            GITHUB ADRESİ
            <input
              value={repoUrl}
              onChange={(event) => {
                setRepoUrl(event.target.value);
                if (event.target.value) onClearFile();
              }}
              placeholder="https://github.com/owner/repository"
              autoComplete="url"
            />
          </label>

          <div className="data-transfer-note">
            <ShieldCheck size={17} />
            <p>
              <strong>Ne gönderiliyor?</strong> Arşiv, ULAK sunucusunun yerel veri dizininde tutulur. Kod bu ekranda
              çalıştırılmaz. AI ve kaynak araması şu an kapalı; bunları rapor içinden ayrı ayrı başlatacaksın.
            </p>
          </div>

          <button
            type="submit"
            className="primary-button modal-submit"
            disabled={busy || (!uploadFile && !repoUrl.trim())}
          >
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" /> Dosyalar haritalanıyor…
              </>
            ) : (
              <>
                Yerel incelemeyi başlat <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
