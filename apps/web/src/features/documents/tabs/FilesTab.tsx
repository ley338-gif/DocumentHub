import { useState } from "react";
import { Button, Input, Select, useToast } from "../../../design-system";
import { ApiError } from "../../../lib/api-error";
import { uploadRevision } from "../api";

export interface FilesTabProps {
  documentId: string;
  canWrite: boolean;
  onUploaded: () => void;
}

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // matches revisions.service.ts MAX_FILE_SIZE_BYTES
const ALLOWED_MIME_TYPES = new Set(["application/pdf"]); // matches revisions.service.ts ALLOWED_MIME_TYPES

const LANGUAGE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "pl", label: "Polski" },
  { value: "pt", label: "Português" },
];

export function FilesTab({ documentId, canWrite, onUploaded }: FilesTabProps) {
  const toast = useToast();
  const [revision, setRevision] = useState("");
  const [language, setLanguage] = useState("de");
  const [changeDescription, setChangeDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!canWrite) {
    return <p>Sie haben keine Berechtigung, neue Revisionen hochzuladen.</p>;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFieldError(null);
    if (f) {
      // Client-side sanity checks mirroring the backend's — but the server
      // response is always authoritative if they disagree (e.g. a stricter
      // or looser rule change server-side that this UI hasn't caught up to).
      if (f.size > MAX_FILE_SIZE_BYTES) {
        setFieldError("Datei überschreitet die maximale Größe von 100 MB.");
        setFile(null);
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(f.type)) {
        setFieldError("Nur PDF-Dateien werden unterstützt.");
        setFile(null);
        return;
      }
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !revision.trim() || !language.trim()) return;
    setUploading(true);
    try {
      await uploadRevision(documentId, {
        revision,
        language,
        changeDescription: changeDescription || undefined,
        file,
      });
      toast.show({ message: "Revision hochgeladen.", tone: "success" });
      setRevision("");
      setChangeDescription("");
      setFile(null);
      const fileInput = document.getElementById("revision-file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
      onUploaded();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Upload fehlgeschlagen.", tone: "danger" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "28rem" }}>
      <Input label="Revisionsbezeichnung" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="z. B. A, 1.0" required />
      <Select label="Sprache" value={language} onChange={(e) => setLanguage(e.target.value)} options={LANGUAGE_OPTIONS} />
      <Input
        label="Änderungsbeschreibung"
        value={changeDescription}
        onChange={(e) => setChangeDescription(e.target.value)}
      />
      <div>
        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }} htmlFor="revision-file-input">
          Datei (PDF, max. 100 MB)
        </label>
        <input id="revision-file-input" type="file" accept="application/pdf" onChange={handleFileChange} required />
        {fieldError && <p role="alert" style={{ color: "var(--color-danger, #c0392b)" }}>{fieldError}</p>}
      </div>
      <div>
        <Button type="submit" disabled={uploading || !file || !revision.trim()}>
          {uploading ? "Wird hochgeladen…" : "Hochladen"}
        </Button>
      </div>
    </form>
  );
}
