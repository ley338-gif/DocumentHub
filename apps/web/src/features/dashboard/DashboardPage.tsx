import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
  StatusBadge,
  Table,
  type TableColumn,
} from "../../design-system";
import type { AuditEventDto, PublicationDto } from "../../lib/api-types";
import { useAuthStore } from "../auth/auth-store";
import { auditEventLabel } from "../audit/action-labels";
import { listAuditEvents } from "../audit/api";
import { resourceRoute } from "../audit/object-routes";
import { listDocuments } from "../documents/api";
import { listProducts, listUnits } from "../products/api";
import { listPublications } from "../publications/api";
import styles from "./DashboardPage.module.css";

interface DashboardKpis {
  products: number;
  documents: number;
  units: number;
  activePublications: number;
}

/**
 * Dashboard — real KPI cards and recent-activity lists, replacing the
 * former "folgen in späteren Phasen" placeholder.
 *
 * Every number here is either a paginated list endpoint's cheap `total`
 * (fetched with `pageSize: 1`) or the first page of an already-sorted list
 * — see apps/web/README.md's "Dashboard data sources" section for the
 * exact endpoint/field backing each card. No number is computed,
 * estimated, or hardcoded client-side.
 *
 * Deliberately NOT shown: an org-wide "Revisionen in Review" count.
 * `GET /api/documents/:id/revisions` is per-document only — there is no
 * organization-wide revision list endpoint, so getting this count would
 * require fetching every document's revisions individually (an N+1
 * pattern from the frontend), which is out of scope for a UI-only phase.
 * See README for the documented gap.
 *
 * Each section fetches independently with its own loading/error state —
 * the KPI row and the two recent-activity lists are unrelated data, so one
 * slow/failing section must not block the others.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<unknown>(null);

  const [recentPublications, setRecentPublications] = useState<PublicationDto[] | null>(null);
  const [pubLoading, setPubLoading] = useState(true);
  const [pubError, setPubError] = useState<unknown>(null);

  const [recentAudit, setRecentAudit] = useState<AuditEventDto[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<unknown>(null);

  function loadKpis() {
    let cancelled = false;
    setKpiLoading(true);
    setKpiError(null);
    Promise.all([
      listProducts({ pageSize: 1 }),
      listDocuments({ pageSize: 1 }),
      listUnits({ pageSize: 1 }),
      listPublications({ status: "ACTIVE", pageSize: 1 }),
    ])
      .then(([products, documents, units, activePublications]) => {
        if (cancelled) return;
        setKpis({
          products: products.total,
          documents: documents.total,
          units: units.total,
          activePublications: activePublications.total,
        });
      })
      .catch((err) => {
        if (!cancelled) setKpiError(err);
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }

  function loadRecentPublications() {
    let cancelled = false;
    setPubLoading(true);
    setPubError(null);
    listPublications({ pageSize: 5 })
      .then((res) => {
        if (!cancelled) setRecentPublications(res.items);
      })
      .catch((err) => {
        if (!cancelled) setPubError(err);
      })
      .finally(() => {
        if (!cancelled) setPubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }

  function loadRecentAudit() {
    let cancelled = false;
    setAuditLoading(true);
    setAuditError(null);
    listAuditEvents({}, 1, 5)
      .then((res) => {
        if (!cancelled) setRecentAudit(res.items);
      })
      .catch((err) => {
        if (!cancelled) setAuditError(err);
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(loadKpis, []);
  useEffect(loadRecentPublications, []);
  useEffect(loadRecentAudit, []);

  const publicationColumns: TableColumn<PublicationDto>[] = [
    {
      key: "document",
      header: "Dokument",
      render: (p) => p.snapshot?.documentName ?? "—",
    },
    {
      key: "revision",
      header: "Revision / Sprache",
      render: (p) => (p.snapshot ? `${p.snapshot.revision} · ${p.snapshot.language}` : "—"),
    },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "publishedAt",
      header: "Veröffentlicht am",
      render: (p) => new Date(p.publishedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }),
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Willkommen zurück${user ? `, ${user.fullName}` : ""}. Überblick über Produkte, Dokumente und Veröffentlichungen.`}
      />

      <section aria-label="Kennzahlen">
        {kpiLoading && <LoadingState label="Kennzahlen werden geladen…" />}
        {!kpiLoading && Boolean(kpiError) && (
          <ErrorState error={kpiError} fallback="Kennzahlen konnten nicht geladen werden." onRetry={loadKpis} />
        )}
        {!kpiLoading && !kpiError && kpis && (
          <div className={styles.kpiGrid}>
            <StatTile label="Produkte" value={kpis.products} tone="info" icon="📦" />
            <StatTile label="Dokumente" value={kpis.documents} tone="info" icon="📄" />
            <StatTile label="Einheiten" value={kpis.units} tone="neutral" icon="🔢" />
            <StatTile label="Aktive Veröffentlichungen" value={kpis.activePublications} tone="success" icon="🌐" />
          </div>
        )}
      </section>

      <div className={styles.sections}>
        <section className={styles.card} aria-labelledby="dashboard-recent-publications">
          <h2 id="dashboard-recent-publications" className={styles.cardTitle}>
            Zuletzt veröffentlicht
          </h2>
          {pubLoading && <LoadingState label="Wird geladen…" />}
          {!pubLoading && Boolean(pubError) && (
            <ErrorState
              error={pubError}
              fallback="Veröffentlichungen konnten nicht geladen werden."
              onRetry={loadRecentPublications}
            />
          )}
          {!pubLoading && !pubError && recentPublications && (
            <>
              <Table
                columns={publicationColumns}
                rows={recentPublications}
                rowKey={(p) => p.id}
                onRowClick={(p) => navigate(`/app/publications?open=${p.id}`)}
                emptyMessage={<EmptyState title="Noch keine Veröffentlichungen" />}
              />
              {recentPublications.length > 0 && (
                <a
                  className={styles.viewAllLink}
                  href="/app/publications"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/app/publications");
                  }}
                >
                  Alle Veröffentlichungen anzeigen →
                </a>
              )}
            </>
          )}
        </section>

        <section className={styles.card} aria-labelledby="dashboard-recent-audit">
          <h2 id="dashboard-recent-audit" className={styles.cardTitle}>
            Letzte Aktivität
          </h2>
          {auditLoading && <LoadingState label="Wird geladen…" />}
          {!auditLoading && Boolean(auditError) && (
            <ErrorState
              error={auditError}
              fallback="Audit-Log konnte nicht geladen werden."
              onRetry={loadRecentAudit}
            />
          )}
          {!auditLoading && !auditError && recentAudit && (
            <>
              {recentAudit.length === 0 ? (
                <EmptyState title="Noch keine Aktivität" />
              ) : (
                <ul className={styles.activityList}>
                  {recentAudit.map((event) => {
                    const route = resourceRoute(event);
                    return (
                      <li key={event.id} className={styles.activityItem}>
                        <div className={styles.activityLabel}>{auditEventLabel(event)}</div>
                        <div className={styles.activityMeta}>
                          {new Date(event.timestamp).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
                          {" · "}
                          {event.actorName ?? event.actorId ?? "System"}
                          {route && (
                            <>
                              {" · "}
                              <a
                                href={route}
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate(route);
                                }}
                              >
                                Details
                              </a>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <a
                className={styles.viewAllLink}
                href="/app/audit"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/app/audit");
                }}
              >
                Alle Audit-Ereignisse anzeigen →
              </a>
            </>
          )}
        </section>
      </div>
    </>
  );
}
