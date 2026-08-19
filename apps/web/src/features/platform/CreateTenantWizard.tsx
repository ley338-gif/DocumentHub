import { useState, type FormEvent } from "react";
import { Button, Dialog, Input, WizardSteps, useToast } from "../../design-system";
import { ApiError } from "../../lib/api-error";
import type { CreateTenantResponseDto } from "../../lib/api-types";
import { createTenant } from "./api";

const STEPS = [
  { key: "tenant", label: "Tenant" },
  { key: "admin", label: "Administrator" },
  { key: "review", label: "Prüfen" },
];

export interface CreateTenantWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTenantWizard({ open, onClose, onCreated }: CreateTenantWizardProps) {
  const toast = useToast();
  const [stepIndex, setStepIndex] = useState(0);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("de");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [adminEmail, setAdminEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTenantResponseDto | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function reset() {
    setStepIndex(0);
    setName("");
    setSlug("");
    setDefaultLanguage("de");
    setTimezone("Europe/Berlin");
    setAdminEmail("");
    setError(null);
    setResult(null);
    setLinkCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await createTenant({
        name,
        slug: slug || undefined,
        defaultLanguage,
        timezone,
        adminEmail,
      });
      setResult(res);
      setStepIndex(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : "Tenant konnte nicht erstellt werden.");
    } finally {
      setSubmitting(false);
    }
  }

  function invitationLink() {
    if (!result) return "";
    return `${window.location.origin}/invite/${result.invitationToken}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitationLink());
      setLinkCopied(true);
      toast.show({ message: "Einladungslink kopiert.", tone: "success" });
    } catch {
      toast.show({ message: "Kopieren fehlgeschlagen.", tone: "danger" });
    }
  }

  function finish() {
    reset();
    onCreated();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Neuen Tenant anlegen">
      <div style={{ minWidth: "26rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <WizardSteps steps={STEPS} currentIndex={stepIndex} />

        {error && (
          <div style={{ color: "var(--color-danger-text)", background: "var(--color-danger-bg)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
            {error}
          </div>
        )}

        {stepIndex === 0 && (
          <form
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              setStepIndex(1);
            }}
          >
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            <Input label="Slug (optional)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="wird aus Name abgeleitet" />
            <Input label="Standardsprache" value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} />
            <Input label="Zeitzone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Weiter
              </Button>
            </div>
          </form>
        )}

        {stepIndex === 1 && (
          <form style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }} onSubmit={handleSubmit}>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
              Diese Person erhält eine Einladung als Administrator von <strong>{name}</strong>.
            </p>
            <Input
              label="E-Mail des Administrators"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
              autoFocus
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setStepIndex(0)} disabled={submitting}>
                Zurück
              </Button>
              <Button type="submit" disabled={submitting || !adminEmail.trim()}>
                {submitting ? "Wird erstellt…" : "Tenant erstellen"}
              </Button>
            </div>
          </form>
        )}

        {stepIndex === 2 && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p>
              Tenant <strong>{result.tenant.name}</strong> wurde erstellt. Die Einladung für{" "}
              <strong>{result.invitation.email}</strong> ist bereit.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <Input label="Einladungslink" value={invitationLink()} readOnly onFocus={(e) => e.target.select()} />
              </div>
              <Button type="button" onClick={copyLink}>
                {linkCopied ? "Kopiert ✓" : "Link kopieren"}
              </Button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={finish}>Fertig</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
