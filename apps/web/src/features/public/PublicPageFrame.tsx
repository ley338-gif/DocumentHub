import type { ReactNode } from "react";
import styles from "./PublicPage.module.css";

/** Shared chrome for the public QR-scan pages: no admin navigation, just a
 * small brand header and footer — this is a standalone page someone lands
 * on after scanning a QR code on a physical product. */
export function PublicPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brandIcon}>DH</span>
        Document Hub
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>Document Hub · Dokumente immer aktuell.</footer>
    </div>
  );
}
