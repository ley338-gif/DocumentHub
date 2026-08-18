import { useState } from "react";
import { Button, Dialog, Input, useToast } from "../../design-system";
import type { DocumentDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { createDocument } from "./api";

export interface CreateDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (doc: DocumentDto) => void;
}

export function CreateDocumentDialog({ open, onClose, onCreated }: CreateDocumentDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setDocumentType("");
    setDescription("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !documentType.trim()) return;
    setSaving(true);
    try {
      const doc = await createDocument({ name, documentType, description: description || undefined });
      toast.show({ message: "Dokument angelegt.", tone: "success" });
      reset();
      onCreated(doc);
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Anlegen fehlgeschlagen.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Neues Dokument">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "24rem" }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <Input
          label="Dokumenttyp"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          placeholder="z. B. Betriebsanleitung"
          required
        />
        <Input label="Beschreibung" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving || !name.trim() || !documentType.trim()}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
