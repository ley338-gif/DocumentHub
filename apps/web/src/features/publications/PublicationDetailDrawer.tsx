import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, DescriptionItem, DescriptionList, Dialog, Drawer, ErrorState, LoadingState, StatusBadge, useToast } from "../../design-system";
import type { PublicationDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { formatFileSize, languageLabel } from "../../lib/format";
import { useCurrentRole } from "../auth/useCurrentRole";
import { hasRole } from "../../lib/roles";
import { getPublication, revokePublication } from "./api";
import { formatRuleScope, formatRuleValidity } from "./ruleFormat";
import styles from "./PublicationDetailDrawer.module.css";

/** Shared "not applicable" rendering for a null field inside this drawer —
 * same muted/italic treatment as the Audit detail drawer's "nicht erfasst"
 * fields, so the two read-only history drawers don't invent two different
 * conventions for "there's genuinely nothing here". */
function notApplicable(text: string) {
  return <span className={styles.notAvailable}>{text}</span>;
}

export interface PublicationDetailDrawerProps {
  publicationId: string | null;
  onClose: () => void;
  onRevoked?: () => void;
}

/**
 * Full publication detail. Every field here comes from `publication` /
 * `publication.snapshot` as returned by GET /api/publications/:id — the
 * frozen historical record. See PublicationHistoryPage's top comment for
 * the "never fetch live Product/Document data" invariant this drawer must
 * also honor.
 */
export function PublicationDetailDrawer({ publicationId, onClose, onRevoked }: PublicationDetailDrawerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const role = useCurrentRole();
  const [publication, setPublication] = useState<PublicationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [revoking, setRevoking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!publicationId) {
      setPublication(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPublication(publicationId)
      .then((p) => {
        if (!cancelled) setPublication(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicationId]);

  const snapshot = publication?.snapshot;

  async function handleRevoke() {
    if (!publication) return;
    setRevoking(true);
    try {
      await revokePublication(publication.id);
      // The PATCH .../revoke response is a bare Prisma row (no snapshot or
      // resolved actor names) — re-fetch via the enriched GET to keep the
      // drawer showing the full detail instead of blanking those fields.
      const refreshed = await getPublication(publication.id);
      setPublication(refreshed);
      toast.show({ message: "Veröffentlichung widerrufen.", tone: "success" });
      onRevoked?.();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Widerruf fehlgeschlagen.", tone: "danger" });
    } finally {
      setRevoking(false);
      setConfirmOpen(false);
    }
  }

  return (
    <Drawer open={Boolean(publicationId)} onClose={onClose} title="Veröffentlichung">
      {loading && <LoadingState label="Veröffentlichung wird geladen…" />}
      {error != null && <ErrorState error={error} fallback="Veröffentlichung konnte nicht geladen werden." />}
      {!loading && error == null && publication && (
        <div className={styles.content}>
          <section>
            <h3>Status</h3>
            <StatusBadge status={publication.status} />
            {publication.status === "ACTIVE" && hasRole(role, "PUBLISHER") && (
              <div style={{ marginTop: "0.75rem" }}>
                <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
                  Widerrufen
                </Button>
              </div>
            )}
          </section>

          <section>
            <h3>Dokument</h3>
            {snapshot ? (
              <>
                <p>
                  <a
                    href={`/app/documents/${snapshot.documentId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/app/documents/${snapshot.documentId}`);
                      onClose();
                    }}
                  >
                    {snapshot.documentName}
                  </a>{" "}
                  ({snapshot.documentType})
                </p>
                <DescriptionList>
                  <DescriptionItem label="Revision" value={snapshot.revision} />
                  <DescriptionItem label="Sprache" value={languageLabel(snapshot.language)} />
                  <DescriptionItem label="Datei" value={snapshot.filename} />
                  <DescriptionItem label="MIME-Typ" value={snapshot.mimeType} />
                  <DescriptionItem label="Dateigröße" value={formatFileSize(snapshot.fileSize)} />
                  <DescriptionItem
                    label="SHA-256"
                    value={
                      <span className={styles.mono} title={snapshot.sha256}>
                        {snapshot.sha256}
                      </span>
                    }
                  />
                </DescriptionList>
              </>
            ) : (
              <p>Kein Snapshot vorhanden.</p>
            )}
          </section>

          <section>
            <h3>Veröffentlichung</h3>
            <DescriptionList>
              <DescriptionItem label="Veröffentlicht am" value={new Date(publication.publishedAt).toLocaleString("de-DE")} />
              <DescriptionItem label="Veröffentlicht von" value={publication.publishedByName ?? "—"} />
              <DescriptionItem
                label="Widerrufen am"
                value={
                  publication.revokedAt
                    ? new Date(publication.revokedAt).toLocaleString("de-DE")
                    : notApplicable("— (nicht widerrufen)")
                }
              />
              <DescriptionItem
                label="Widerrufen von"
                value={
                  publication.revokedAt
                    ? (publication.revokedByName ?? "—")
                    : notApplicable("— (nicht widerrufen)")
                }
              />
            </DescriptionList>
          </section>

          <section>
            <h3>Anwendbarkeits-Snapshot (zum Veröffentlichungszeitpunkt)</h3>
            {snapshot && snapshot.applicabilityRules?.length > 0 ? (
              <ul className={styles.ruleList}>
                {snapshot.applicabilityRules.map((rule) => (
                  <li key={rule.id} className={styles.ruleItem}>
                    <div>{formatRuleScope(rule)}</div>
                    <div className={styles.ruleMeta}>Gültigkeit: {formatRuleValidity(rule)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Keine Anwendbarkeitsregeln erfasst.</p>
            )}
          </section>
        </div>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Veröffentlichung widerrufen">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: "20rem" }}>
          <p>
            Diese Veröffentlichung wirklich widerrufen? Die öffentliche Seite zeigt dieses Dokument danach sofort
            nicht mehr an. Dieser Schritt kann nicht rückgängig gemacht werden.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={revoking}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={handleRevoke} disabled={revoking}>
              {revoking ? "Wird widerrufen…" : "Widerrufen"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Drawer>
  );
}
