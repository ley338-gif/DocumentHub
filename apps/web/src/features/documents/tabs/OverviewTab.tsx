import { useState } from "react";
import { Button, DescriptionItem, DescriptionList, Input, StatusBadge, useToast } from "../../../design-system";
import type { DocumentDto } from "../../../lib/api-types";
import { ApiError } from "../../../lib/api-error";
import { updateDocument } from "../api";

export interface OverviewTabProps {
  document: DocumentDto;
  canWrite: boolean;
  onUpdated: (doc: DocumentDto) => void;
}

export function OverviewTab({ document, canWrite, onUpdated }: OverviewTabProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(document.name);
  const [documentType, setDocumentType] = useState(document.documentType);
  const [description, setDescription] = useState(document.description ?? "");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setName(document.name);
    setDocumentType(document.documentType);
    setDescription(document.description ?? "");
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateDocument(document.id, { name, documentType, description: description || undefined });
      toast.show({ message: "Dokument aktualisiert.", tone: "success" });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Speichern fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "32rem" }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Dokumenttyp" value={documentType} onChange={(e) => setDocumentType(e.target.value)} required />
        <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button type="submit" disabled={saving}>
            Speichern
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Abbrechen
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <DescriptionList>
        <DescriptionItem label="Name" value={document.name} />
        <DescriptionItem label="Typ" value={document.documentType} />
        <DescriptionItem label="Beschreibung" value={document.description ?? "–"} />
        <DescriptionItem label="Status" value={<StatusBadge status={document.status} />} />
      </DescriptionList>
      {canWrite && (
        <div>
          <Button variant="outline" onClick={startEdit}>
            Bearbeiten
          </Button>
        </div>
      )}
    </div>
  );
}
