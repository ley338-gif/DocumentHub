import { useParams } from "react-router-dom";
import type { PublicUnitDto } from "../../lib/api-types";
import { fetchPublicUnit } from "./api";
import { usePublicResource } from "./usePublicResource";
import { useLanguageFilter } from "./useLanguageFilter";
import { LanguageSelector } from "./LanguageSelector";
import { PublicationList } from "./PublicationList";
import { EmptyPublicationsState, ErrorState, LoadingPublicPageState, NotFoundState } from "./PublicPageStates";
import { PublicPageFrame } from "./PublicPageFrame";
import styles from "./PublicPage.module.css";

export function PublicUnitPage() {
  const { stableId } = useParams<{ stableId: string }>();
  const state = usePublicResource(stableId, fetchPublicUnit);

  return (
    <PublicPageFrame>
      {state.status === "loading" && <LoadingPublicPageState />}
      {state.status === "not-found" && <NotFoundState />}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "success" && <UnitContent unit={state.data} />}
    </PublicPageFrame>
  );
}

function UnitContent({ unit }: { unit: PublicUnitDto }) {
  const { languages, selected, setSelected, filtered } = useLanguageFilter(unit.publications);

  return (
    <>
      <div className={styles.heroCard}>
        <div className={styles.productName}>{unit.productName}</div>
        <div className={styles.metaList}>
          {unit.variantName && (
            <div>
              <span className={styles.metaLabel}>Variante:</span>
              {unit.variantName}
            </div>
          )}
          <div>
            <span className={styles.metaLabel}>Seriennummer:</span>
            {unit.serialNumber}
          </div>
        </div>
      </div>

      <LanguageSelector languages={languages} selected={selected} onSelect={setSelected} />

      {unit.publications.length === 0 ? (
        <EmptyPublicationsState />
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Verfügbare Dokumente{selected ? ` (${selected.toUpperCase()})` : ""}
          </div>
          <PublicationList publications={filtered} />
        </div>
      )}
    </>
  );
}
