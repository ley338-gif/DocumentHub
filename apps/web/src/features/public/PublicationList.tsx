import buttonStyles from "../../design-system/Button.module.css";
import { apiUrl } from "../../lib/api-client";
import { formatFileSize } from "../../lib/format";
import type { PublicPublicationDto } from "../../lib/api-types";
import styles from "./PublicPage.module.css";

function buttonClass(variant: "primary" | "outline", size: "sm") {
  return [buttonStyles.button, buttonStyles[variant], buttonStyles[size]].join(" ");
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
              <a className={buttonClass("outline", "sm")} href={href} target="_blank" rel="noopener noreferrer">
                Öffnen
              </a>
              <a className={buttonClass("primary", "sm")} href={href} download={pub.filename}>
                Herunterladen
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
