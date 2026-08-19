import { useEffect, useState } from "react";
import { Badge, DescriptionItem, DescriptionList, ErrorState, LoadingState, PageHeader } from "../../design-system";
import type { PlatformSystemSnapshotDto } from "../../lib/api-types";
import { fetchSystemSnapshot } from "./api";

function HealthBadge({ healthy }: { healthy: boolean }) {
  return <Badge tone={healthy ? "success" : "danger"}>{healthy ? "OK" : "Fehler"}</Badge>;
}

export function PlatformSystemPage() {
  const [snapshot, setSnapshot] = useState<PlatformSystemSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    fetchSystemSnapshot().then(setSnapshot).catch(setError).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="System" subtitle="Betriebsstatus dieser Installation — schreibgeschützt." />

      {loading && <LoadingState label="Systemstatus wird geladen…" />}
      {error != null && <ErrorState error={error} fallback="Systemstatus konnte nicht geladen werden." />}
      {!loading && !error && snapshot && (
        <DescriptionList>
          <DescriptionItem label="Version" value={snapshot.version} />
          <DescriptionItem label="Umgebung" value={snapshot.environment} />
          <DescriptionItem label="Registrierungsmodus" value={snapshot.registrationMode} />
          <DescriptionItem label="Öffentliche Basis-URL" value={snapshot.publicBaseUrl ?? "—"} />
          <DescriptionItem label="Storage-Treiber" value={snapshot.storageDriver} />
          <DescriptionItem label="Datenbank" value={<HealthBadge healthy={snapshot.database.healthy} />} />
          <DescriptionItem label="Storage" value={<HealthBadge healthy={snapshot.storage.healthy} />} />
          <DescriptionItem
            label="Letzte Migration"
            value={
              snapshot.lastMigration
                ? `${snapshot.lastMigration.name}${snapshot.lastMigration.appliedAt ? " · " + new Date(snapshot.lastMigration.appliedAt).toLocaleString("de-DE") : ""}`
                : "—"
            }
          />
        </DescriptionList>
      )}
    </div>
  );
}
