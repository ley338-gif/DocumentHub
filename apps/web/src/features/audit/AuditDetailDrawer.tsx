import { DescriptionItem, DescriptionList, Drawer } from "../../design-system";
import type { AuditEventDto } from "../../lib/api-types";
import { auditEventLabel } from "./action-labels";
import styles from "./AuditDetailDrawer.module.css";

export interface AuditDetailDrawerProps {
  event: AuditEventDto | null;
  onClose: () => void;
}

/** Shared "not applicable" rendering for a null field — same muted/italic
 * treatment as the Publication detail drawer's un-revoked "— (nicht
 * widerrufen)" fields, so the two read-only history drawers don't invent
 * two different conventions for "there's genuinely nothing here". */
function notRecorded(value: string | null | undefined) {
  if (value) return value;
  return <span className={styles.notAvailable}>nicht erfasst</span>;
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
          <DescriptionList>
            <DescriptionItem
              label="Event ID"
              value={
                <span className={styles.mono} title={event.id}>
                  {event.id}
                </span>
              }
            />
            <DescriptionItem label="Zeitpunkt" value={new Date(event.timestamp).toLocaleString("de-DE")} />
            <DescriptionItem label="Action" value={<span className={styles.mono}>{event.action}</span>} />
            <DescriptionItem label="Ressourcentyp" value={event.objectType} />
            <DescriptionItem
              label="Object ID"
              value={
                <span className={styles.mono} title={event.objectId}>
                  {event.objectId}
                </span>
              }
            />
            <DescriptionItem label="Akteur" value={event.actorName ?? event.actorId ?? "System"} />
          </DescriptionList>
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
          <DescriptionList>
            <DescriptionItem label="Request ID" value={notRecorded(event.requestId)} />
            <DescriptionItem label="IP-Adresse" value={notRecorded(event.ipAddress)} />
            <DescriptionItem label="User Agent" value={notRecorded(event.userAgent)} />
          </DescriptionList>
        </section>
      </div>
    </Drawer>
  );
}
