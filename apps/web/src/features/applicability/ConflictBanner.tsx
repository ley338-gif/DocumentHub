import type { PublishConflictDto } from "../../lib/api-types";

export interface ConflictBannerProps {
  conflicts: PublishConflictDto[];
}

/**
 * Renders the exact conflicts the backend preview returned — naming the
 * conflicting existing publication's stable id, per rule id involved. No
 * conflict-resolution suggestion is invented here: the backend doesn't
 * offer one, so neither does this UI. Reused by both the Applicability tab
 * and the Publish Wizard so a conflict reads identically everywhere.
 *
 * The backend distinguishes a real conflict against a *different*,
 * competing revision (`reason: "CONFLICT"`) from a "conflict" that's
 * actually just this exact revision already being ACTIVE with an
 * unchanged rule set (`reason: "ALREADY_PUBLISHED"`) — both still block a
 * publish attempt (the real endpoint 409s either way), but they mean very
 * different things to a human, so they get different framing here: a red
 * warning for a real conflict, a neutral info notice for "already live".
 */
export function ConflictBanner({ conflicts }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;

  const real = conflicts.filter((c) => c.reason !== "ALREADY_PUBLISHED");
  const alreadyPublished = conflicts.filter((c) => c.reason === "ALREADY_PUBLISHED");

  return (
    <>
      {real.length > 0 && (
        <div
          role="alert"
          style={{
            border: "1px solid var(--color-danger-text)",
            background: "var(--color-danger-bg)",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "var(--color-danger-text)" }}>
            Diese Revision kann derzeit NICHT veröffentlicht werden — {real.length}{" "}
            {real.length === 1 ? "Konflikt" : "Konflikte"} in den Anwendbarkeitsregeln.
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {real.map((c, idx) => (
              <li key={`${c.newRuleId}-${c.conflictingRuleId}-${idx}`}>
                Regel <code>{c.newRuleId}</code> überschneidet sich bei gleicher Spezifität mit einer Regel der
                aktiven Veröffentlichung <strong>{c.existingPublicationStableId}</strong> (konfligierende Regel{" "}
                <code>{c.conflictingRuleId}</code>).
              </li>
            ))}
          </ul>
        </div>
      )}

      {alreadyPublished.length > 0 && (
        <div
          role="status"
          style={{
            border: "1px solid var(--color-border)",
            background: "var(--color-surface-muted)",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <p style={{ margin: 0 }}>
            Diese Revision ist für diesen Gültigkeitsbereich bereits veröffentlicht (
            <strong>{alreadyPublished[0].existingPublicationStableId}</strong>). Ein erneutes Veröffentlichen mit
            unveränderten Anwendbarkeitsregeln ist nicht nötig.
          </p>
        </div>
      )}
    </>
  );
}
