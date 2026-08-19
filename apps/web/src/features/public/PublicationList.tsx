import buttonStyles from "../../design-system/Button.module.css";
import { apiUrl } from "../../lib/api-client";
import { formatFileSize } from "../../lib/format";
import type { PublicPublicationDto } from "../../lib/api-types";
import styles from "./PublicPage.module.css";

function buttonClass(variant: "primary" | "outline") {
  // Sized via .pubActionButton, not the shared Button size classes — this is
  // the one screen in the app primarily used right after scanning a QR code
  // on a phone, so its tap targets need the ~44px minimum regardless of how
  // "sm" is tuned for admin table rows elsewhere.
  return [buttonStyles.button, buttonStyles[variant], styles.pubActionButton].join(" ");
}

export interface PublicationListProps {
  publications: PublicPublicationDto[];
}

/** Renders the resolved publication list with "Öffnen"/"Herunterladen"
 * actions pointed straight at the backend's own downloadUrl — the frontend
 * never constructs a download URL itself. */
export function PublicationList({ publications }: PublicationListProps) {
  return (
    <ul className={styles.pubList}>
      {publications.map((pub) => {
        const href = apiUrl(pub.downloadUrl);
        return (
          <li key={pub.publicationStableId} className={styles.pubRow}>
            <div className={styles.pubInfo}>
              <div className={styles.pubName}>{pub.documentName}</div>
              <div className={styles.pubMeta}>
                {pub.documentType} · Rev. {pub.revision} · {formatFileSize(pub.fileSize)}
              </div>
            </div>
            <div className={styles.pubActions}>
              <a className={buttonClass("outline")} href={href} target="_blank" rel="noopener noreferrer">
                Öffnen
              </a>
              <a className={buttonClass("primary")} href={href} download={pub.filename}>
                Herunterladen
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
