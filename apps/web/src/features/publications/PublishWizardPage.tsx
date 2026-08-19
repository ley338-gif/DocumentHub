import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, PageHeader, Spinner, useToast } from "../../design-system";
import type { ApplicabilityRuleDto, DocumentDto, DocumentRevisionDto, PublishPreviewDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { languageLabel } from "../../lib/format";
import { hasRole } from "../../lib/roles";
import { useCurrentRole } from "../auth/useCurrentRole";
import { getDocument, getRevision, listApplicabilityRules } from "../documents/api";
import { ConflictBanner } from "../applicability/ConflictBanner";
import { getPublishPreview, publishRevision } from "./api";

const STEPS = [
  { key: "revision", label: "1. Revision" },
  { key: "applicability", label: "2. Anwendbarkeit" },
  { key: "impact", label: "3. Auswirkung" },
  { key: "conflicts", label: "4. Konflikte" },
  { key: "confirmation", label: "5. Bestätigung" },
] as const;

/**
 * Publish Wizard (spec §65). Every number and every conflict shown here
 * comes from GET /api/publications/preview/:revisionId — fetched fresh the
 * moment the user reaches step 3 (Impact), never reused from a stale
 * fetch made elsewhere (e.g. the Applicability tab). Step 5's confirm
 * button calls the real POST /api/publications — the preview is advisory,
 * that POST is the only authority, and it can still reject with
 * APPLICABILITY_CONFLICT under a race even after a clean preview; that is
 * the system working as designed, not a UI bug.
 */
export function PublishWizardPage() {
  const { id: documentId, revisionId } = useParams<{ id: string; revisionId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const role = useCurrentRole();
  const canPublish = hasRole(role, "PUBLISHER");

  const [stepIndex, setStepIndex] = useState(0);
  const [doc, setDoc] = useState<DocumentDto | null>(null);
  const [revision, setRevision] = useState<DocumentRevisionDto | null>(null);
  const [rules, setRules] = useState<ApplicabilityRuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PublishPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewFetchToken, setPreviewFetchToken] = useState(0);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedStableId, setPublishedStableId] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId || !revisionId) return;
    setLoading(true);
    Promise.all([getDocument(documentId), getRevision(documentId, revisionId), listApplicabilityRules(revisionId)])
      .then(([d, r, rs]) => {
        setDoc(d);
        setRevision(r);
        setRules(rs);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.userMessage : "Daten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [documentId, revisionId]);

  // Fresh preview fetch every time the user reaches the Impact step (index
  // 2) — including re-entries, via previewFetchToken — so what step
  // 4/5 show is never a stale snapshot from earlier navigation.
  useEffect(() => {
    if (stepIndex !== 2 || !revisionId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    getPublishPreview(revisionId)
      .then((res) => setPreview(res))
      .catch((err) => setPreviewError(err instanceof ApiError ? err.userMessage : "Vorschau konnte nicht geladen werden."))
      .finally(() => setPreviewLoading(false));
  }, [stepIndex, revisionId, previewFetchToken]);

  async function handlePublish() {
    if (!revisionId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const publication = await publishRevision(revisionId);
      setPublishedStableId(publication.stableId);
      toast.show({ message: "Revision erfolgreich veröffentlicht.", tone: "success" });
    } catch (err) {
      // The backend is the actual authority — a rejection here (even after
      // a clean preview, e.g. APPLICABILITY_CONFLICT from a race with
      // another publish) is shown as-is, not treated as a UI bug.
      const message = err instanceof ApiError ? err.userMessage : "Veröffentlichung fehlgeschlagen.";
      setPublishError(message);
      toast.show({ message, tone: "danger" });
    } finally {
      setPublishing(false);
    }
  }

  if (!documentId || !revisionId) return <p role="alert">Ungültiger Aufruf.</p>;
  if (loading) return <Spinner centered size={32} />;
  if (loadError || !doc || !revision) {
    return (
      <div>
        <p role="alert">{loadError ?? "Nicht gefunden."}</p>
        <Button variant="secondary" onClick={() => navigate(`/app/documents/${documentId}`)}>
          Zurück
        </Button>
      </div>
    );
  }

  if (!canPublish) {
    return (
      <div>
        <PageHeader title="Veröffentlichen" subtitle={doc.name} />
        <p role="alert">
          Für die Veröffentlichung ist mindestens die Rolle Publisher erforderlich. Diese Aktion ist mit Ihrer
          aktuellen Rolle nicht verfügbar.
        </p>
        <Button variant="secondary" onClick={() => navigate(`/app/documents/${documentId}`)}>
          Zurück zum Dokument
        </Button>
      </div>
    );
  }

  if (revision.status !== "APPROVED" && !publishedStableId) {
    return (
      <div>
        <PageHeader title="Veröffentlichen" subtitle={doc.name} />
        <p role="alert">
          Diese Revision hat den Status „{revision.status}“ — nur freigegebene (APPROVED) Revisionen können
          veröffentlicht werden.
        </p>
        <Button variant="secondary" onClick={() => navigate(`/app/documents/${documentId}`)}>
          Zurück zum Dokument
        </Button>
      </div>
    );
  }

  const step = STEPS[stepIndex].key;
  const hasConflicts = (preview?.conflicts.length ?? 0) > 0;
  const hasRealConflicts = preview?.conflicts.some((c) => c.reason !== "ALREADY_PUBLISHED") ?? false;
  const isOnlyAlreadyPublished = hasConflicts && !hasRealConflicts;

  return (
    <div>
      <PageHeader
        title="Revision veröffentlichen"
        subtitle={`${doc.name} · ${revision.revision} (${languageLabel(revision.language)})`}
        actions={
          <Button variant="secondary" onClick={() => navigate(`/app/documents/${documentId}`)}>
            Abbrechen
          </Button>
        }
      />

      <ol style={{ display: "flex", gap: "0.5rem", listStyle: "none", padding: 0, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {STEPS.map((s, idx) => (
          <li key={s.key}>
            <Badge tone={idx === stepIndex ? "info" : idx < stepIndex ? "success" : "neutral"}>{s.label}</Badge>
          </li>
        ))}
      </ol>

      {step === "revision" && (
        <div>
          <h3>Zu veröffentlichende Revision</h3>
          <dl>
            <dt>Dokument</dt>
            <dd>{doc.name} ({doc.documentType})</dd>
            <dt>Revision</dt>
            <dd>{revision.revision}</dd>
            <dt>Sprache</dt>
            <dd>{languageLabel(revision.language)}</dd>
            <dt>Status</dt>
            <dd>
              <Badge tone="success">{revision.status}</Badge>
            </dd>
            <dt>Datei</dt>
            <dd>{revision.originalFilename}</dd>
          </dl>
        </div>
      )}

      {step === "applicability" && (
        <div>
          <h3>Anwendbarkeitsregeln dieser Revision</h3>
          <p style={{ color: "var(--color-text-secondary, #666)" }}>
            Nur lesend — um Regeln zu ändern, brechen Sie ab und wechseln Sie zum Tab „Anwendbarkeit“ des Dokuments.
          </p>
          {rules.length === 0 && <p>Keine Anwendbarkeitsregeln (die Revision gilt dann uneingeschränkt).</p>}
          <ul>
            {rules.map((r) => (
              <li key={r.id}>
                {r.explicitExclusion ? "Ausschluss" : "Regel"} <code>{r.id}</code>
                {r.serialFrom || r.serialTo ? ` · Seriennummer ${r.serialFrom ?? "…"}–${r.serialTo ?? "…"}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "impact" && (
        <div>
          <h3>Auswirkung</h3>
          {previewLoading && <Spinner size={28} />}
          {previewError && <p role="alert">{previewError}</p>}
          {preview && (
            <>
              <p style={{ fontSize: "1.1rem" }}>
                Diese Veröffentlichung betrifft ca. <strong>{preview.totalAffectedUnitsCount}</strong> Einheiten.
              </p>
              {preview.sampleSerials.length > 0 && (
                <p>Beispiel-Seriennummern: {preview.sampleSerials.join(", ")}</p>
              )}
              <ul>
                {preview.rules.map((r) => (
                  <li key={r.ruleId}>
                    {r.description} — Spezifität {r.specificity}, {r.affectedUnitsCount} Einheiten
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {step === "conflicts" && (
        <div>
          <h3>Konflikte</h3>
          {previewLoading && <Spinner size={28} />}
          {previewError && <p role="alert">{previewError}</p>}
          {preview && preview.conflicts.length === 0 && (
            <p>
              <Badge tone="success">Keine Konflikte</Badge> — diese Revision kann veröffentlicht werden, sofern sich
              der Zustand bis zur Bestätigung nicht ändert.
            </p>
          )}
          {preview && <ConflictBanner conflicts={preview.conflicts} />}
        </div>
      )}

      {step === "confirmation" && (
        <div>
          <h3>Bestätigung</h3>
          {publishedStableId ? (
            <div>
              <p>
                <Badge tone="success">Veröffentlicht</Badge> Neue Veröffentlichung <strong>{publishedStableId}</strong>{" "}
                wurde angelegt.
              </p>
              <Button onClick={() => navigate(`/app/documents/${documentId}`)}>Zurück zum Dokument</Button>
            </div>
          ) : (
            <div>
              <p>
                Dokument <strong>{doc.name}</strong>, Revision <strong>{revision.revision}</strong> (
                {languageLabel(revision.language)}) wird jetzt veröffentlicht.
              </p>
              {hasRealConflicts && (
                <p role="alert" style={{ color: "var(--color-danger, #d92d20)", fontWeight: 600 }}>
                  Veröffentlichung blockiert: Es bestehen Konflikte laut letzter Vorschau (Schritt 4). Beheben Sie die
                  Konflikte, bevor Sie erneut versuchen.
                </p>
              )}
              {isOnlyAlreadyPublished && (
                <p role="status" style={{ fontWeight: 600 }}>
                  Diese Revision ist für diesen Gültigkeitsbereich bereits veröffentlicht — ein erneutes
                  Veröffentlichen ist nicht nötig.
                </p>
              )}
              {publishError && <p role="alert">{publishError}</p>}
              <Button
                onClick={handlePublish}
                disabled={publishing || hasConflicts || previewLoading || !preview}
                variant="primary"
              >
                {publishing
                  ? "Wird veröffentlicht…"
                  : isOnlyAlreadyPublished
                    ? "Bereits veröffentlicht"
                    : "Jetzt veröffentlichen"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!publishedStableId && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
          <Button
            variant="secondary"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Zurück
          </Button>
          {stepIndex < STEPS.length - 1 && (
            <Button
              onClick={() => {
                const nextIndex = stepIndex + 1;
                if (nextIndex === 2) setPreviewFetchToken((t) => t + 1);
                setStepIndex(nextIndex);
              }}
            >
              Weiter
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
