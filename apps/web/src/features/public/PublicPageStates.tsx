import styles from "./PublicPage.module.css";

export function NotFoundState() {
  return (
    <div className={styles.stateWrap}>
      <span className={[styles.stateIcon, styles.stateIconNeutral].join(" ")}>?</span>
      <h1 className={styles.stateTitle}>Nicht gefunden</h1>
      <p className={styles.stateText}>
        Für diesen Link konnten wir keine Dokumentation finden. Bitte prüfen Sie den QR-Code oder Link.
      </p>
    </div>
  );
}

export function EmptyPublicationsState() {
  return (
    <div className={styles.stateWrap}>
      <span className={[styles.stateIcon, styles.stateIconWarning].join(" ")}>i</span>
      <h1 className={styles.stateTitle}>Keine Dokumente verfügbar</h1>
      <p className={styles.stateText}>
        Für dieses Produkt sind derzeit keine Dokumente veröffentlicht.
      </p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className={styles.stateWrap}>
      <span className={[styles.stateIcon, styles.stateIconDanger].join(" ")}>!</span>
      <h1 className={styles.stateTitle}>Etwas ist schiefgelaufen</h1>
      <p className={styles.stateText}>{message}</p>
    </div>
  );
}
