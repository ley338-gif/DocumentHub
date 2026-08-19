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
 */
export function ConflictBanner({ conflicts }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;

  return (
    <div
      role="alert"
      style={{
        border: "1px solid var(--color-danger, #d92d20)",
        background: "var(--color-danger-bg, #fef3f2)",
        borderRadius: 8,
        padding: "1rem",
        marginBottom: "1rem",
      }}
    >
      <p style={{ margin: "0 0 0.5rem", fontWeight: 700, color: "var(--color-danger, #d92d20)" }}>
        Diese Revision kann derzeit NICHT veröffentlicht werden — {conflicts.length}{" "}
        {conflicts.length === 1 ? "Konflikt" : "Konflikte"} in den Anwendbarkeitsregeln.
      </p>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {conflicts.map((c, idx) => (
          <li key={`${c.newRuleId}-${c.conflictingRuleId}-${idx}`}>
            Regel <code>{c.newRuleId}</code> überschneidet sich bei gleicher Spezifität mit einer Regel der aktiven
            Veröffentlichung <strong>{c.existingPublicationStableId}</strong> (konfligierende Regel{" "}
            <code>{c.conflictingRuleId}</code>).
          </li>
        ))}
      </ul>
    </div>
  );
}
