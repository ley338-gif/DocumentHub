import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DescriptionItem, DescriptionList, Drawer, ErrorState, LoadingState, StatusBadge } from "../../design-system";
import type { PublicationDto } from "../../lib/api-types";
import { formatFileSize, languageLabel } from "../../lib/format";
import { getPublication } from "./api";
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
}

/**
 * Full publication detail. Every field here comes from `publication` /
 * `publication.snapshot` as returned by GET /api/publications/:id — the
 * frozen historical record. See PublicationHistoryPage's top comment for
 * the "never fetch live Product/Document data" invariant this drawer must
 * also honor.
 */
export function PublicationDetailDrawer({ publicationId, onClose }: PublicationDetailDrawerProps) {
  const navigate = useNavigate();
  const [publication, setPublication] = useState<PublicationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

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

  return (
    <Drawer open={Boolean(publicationId)} onClose={onClose} title="Veröffentlichung">
      {loading && <LoadingState label="Veröffentlichung wird geladen…" />}
      {error != null && <ErrorState error={error} fallback="Veröffentlichung konnte nicht geladen werden." />}
      {!loading && error == null && publication && (
        <div className={styles.content}>
          <section>
            <h3>Status</h3>
            <StatusBadge status={publication.status} />
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
    </Drawer>
  );
}
