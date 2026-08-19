// The audit endpoint (GET /api/audit — apps/api/src/audit/audit.controller.ts)
// only supports filtering by objectType/action/from/to, NOT objectId. There
// is no way to fetch a true per-object history without either fetching the
// organization's entire audit log and filtering client-side (which would
// misrepresent an unbounded, unpaginated fetch as a small per-object list)
// or guessing at an unsupported query param. Per the brief's guidance to be
// honest rather than fabricate data, this tab is a clearly-labeled
// "not available yet" placeholder until the audit endpoint gains an
// objectId filter.
export function HistoryTab({ objectLabel }: { objectLabel: string }) {
  return (
    <div style={{ maxWidth: "32rem" }}>
      <p>
        Der Verlauf für {objectLabel} ist in dieser Version noch nicht verfügbar. Die Audit-API unterstützt aktuell
        keine Filterung nach einem einzelnen Objekt (nur nach Objekttyp, Aktion und Zeitraum), sodass hier bewusst
        keine unvollständigen oder verfälschten Daten angezeigt werden.
      </p>
    </div>
  );
}
