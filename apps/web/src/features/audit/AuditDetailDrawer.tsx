import { Drawer } from "../../design-system";
import type { AuditEventDto } from "../../lib/api-types";
import { auditEventLabel } from "./action-labels";
import styles from "./AuditDetailDrawer.module.css";

export interface AuditDetailDrawerProps {
  event: AuditEventDto | null;
  onClose: () => void;
}

function notRecorded(value: string | null | undefined): string {
  return value ? value : "nicht erfasst";
}

function sha256Of(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>).sha256;
  return typeof value === "string" ? value : undefined;
}

/** Read-only detail view of one audit event — full raw `before`/`after`
 * JSON alongside the human-readable label, per docs/audit.md: the UI may
 * label an event, but the true action code / object id / raw payload must
 * stay fully traceable. No edit or delete control exists here, by design —
 * the backend has no such endpoint at all. */
export function AuditDetailDrawer({ event, onClose }: AuditDetailDrawerProps) {
  if (!event) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const sha256 = sha256Of(event.after) ?? sha256Of(event.before);

  return (
    <Drawer open={Boolean(event)} onClose={onClose} title="Audit-Ereignis">
      <div className={styles.content}>
        <section>
          <h3>Zusammenfassung</h3>
          <p>{auditEventLabel(event)}</p>
        </section>

        <section>
          <h3>Kerndaten</h3>
          <dl className={styles.dl}>
            <dt>Event ID</dt>
            <dd className={styles.mono}>{event.id}</dd>
            <dt>Zeitpunkt</dt>
            <dd>{new Date(event.timestamp).toLocaleString("de-DE")}</dd>
            <dt>Action</dt>
            <dd className={styles.mono}>{event.action}</dd>
            <dt>Ressourcentyp</dt>
            <dd>{event.objectType}</dd>
            <dt>Object ID</dt>
            <dd className={styles.mono}>{event.objectId}</dd>
            <dt>Akteur</dt>
            <dd>{event.actorName ?? event.actorId ?? "System"}</dd>
          </dl>
        </section>

        {sha256 && (
          <section>
            <h3>SHA-256</h3>
            <p className={styles.mono}>{sha256}</p>
          </section>
        )}

        <section>
          <h3>Vorher</h3>
          <pre className={styles.json}>{JSON.stringify(event.before ?? null, null, 2)}</pre>
        </section>

        <section>
          <h3>Nachher</h3>
          <pre className={styles.json}>{JSON.stringify(event.after ?? null, null, 2)}</pre>
        </section>

        <section>
          <h3>Technischer Kontext</h3>
          <dl className={styles.dl}>
            <dt>Request ID</dt>
            <dd>{notRecorded(event.requestId)}</dd>
            <dt>IP-Adresse</dt>
            <dd>{notRecorded(event.ipAddress)}</dd>
            <dt>User Agent</dt>
            <dd>{notRecorded(event.userAgent)}</dd>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
