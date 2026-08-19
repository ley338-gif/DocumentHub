import styles from "./WizardSteps.module.css";

export interface WizardStepItem {
  key: string;
  label: string;
}

export interface WizardStepsProps {
  steps: WizardStepItem[];
  currentIndex: number;
}

/**
 * Shared step indicator for multi-step wizards (Publish Wizard, CSV Import
 * wizard) — a numbered circle per step connected by a line, with
 * done/current/upcoming visual states. Purely presentational: it renders
 * whatever step list/index the caller passes and has no opinion on wizard
 * navigation logic, validation, or which step is reachable.
 */
export function WizardSteps({ steps, currentIndex }: WizardStepsProps) {
  return (
    <ol className={styles.list} aria-label="Fortschritt">
      {steps.map((step, idx) => {
        const isCurrent = idx === currentIndex;
        const isDone = idx < currentIndex;
        const isLast = idx === steps.length - 1;
        return (
          <li key={step.key} className={styles.item}>
            <div className={styles.stepColumn}>
              <span
                className={[styles.circle, isCurrent ? styles.circleCurrent : "", isDone ? styles.circleDone : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isDone ? "✓" : idx + 1}
              </span>
              <span className={[styles.label, isCurrent ? styles.labelCurrent : ""].filter(Boolean).join(" ")}>
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                className={[styles.connector, isDone ? styles.connectorDone : ""].filter(Boolean).join(" ")}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
