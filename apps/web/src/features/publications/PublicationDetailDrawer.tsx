import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer, Spinner, StatusBadge } from "../../design-system";
import type { PublicationDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { formatFileSize, languageLabel } from "../../lib/format";
import { getPublication } from "./api";
import { formatRuleScope, formatRuleValidity } from "./ruleFormat";
import styles from "./PublicationDetailDrawer.module.css";

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
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setError(err instanceof ApiError ? err.userMessage : "Veröffentlichung konnte nicht geladen werden.");
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
      {loading && <Spinner centered />}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && publication && (
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
                <dl className={styles.dl}>
                  <dt>Revision</dt>
                  <dd>{snapshot.revision}</dd>
                  <dt>Sprache</dt>
                  <dd>{languageLabel(snapshot.language)}</dd>
                  <dt>Datei</dt>
                  <dd>{snapshot.filename}</dd>
                  <dt>MIME-Typ</dt>
                  <dd>{snapshot.mimeType}</dd>
                  <dt>Dateigröße</dt>
                  <dd>{formatFileSize(snapshot.fileSize)}</dd>
                  <dt>SHA-256</dt>
                  <dd className={styles.mono}>{snapshot.sha256}</dd>
                </dl>
              </>
            ) : (
              <p>Kein Snapshot vorhanden.</p>
            )}
          </section>

          <section>
            <h3>Veröffentlichung</h3>
            <dl className={styles.dl}>
              <dt>Veröffentlicht am</dt>
              <dd>{new Date(publication.publishedAt).toLocaleString("de-DE")}</dd>
              <dt>Veröffentlicht von</dt>
              <dd>{publication.publishedByName ?? "—"}</dd>
              <dt>Widerrufen am</dt>
              <dd>{publication.revokedAt ? new Date(publication.revokedAt).toLocaleString("de-DE") : "— (nicht widerrufen)"}</dd>
              <dt>Widerrufen von</dt>
              <dd>{publication.revokedAt ? (publication.revokedByName ?? "—") : "— (nicht widerrufen)"}</dd>
            </dl>
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
