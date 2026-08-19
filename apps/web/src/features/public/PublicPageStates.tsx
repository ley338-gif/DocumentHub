import { Spinner } from "../../design-system";
import styles from "./PublicPage.module.css";

/** Same card treatment (`.stateWrap`) as NotFoundState/EmptyPublicationsState/
 * ErrorState below, so all four states this page can be in read as one
 * consistent visual language rather than the spinner being a bare,
 * unwrapped element while the other three sit inside a card. */
export function LoadingPublicPageState() {
  return (
    <div className={styles.stateWrap}>
      <Spinner size={32} />
      <p className={styles.stateText}>Wird geladen…</p>
    </div>
  );
}

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
