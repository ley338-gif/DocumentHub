import { useParams } from "react-router-dom";
import type { PublicProductDto } from "../../lib/api-types";
import { fetchPublicProduct } from "./api";
import { usePublicResource } from "./usePublicResource";
import { useLanguageFilter } from "./useLanguageFilter";
import { LanguageSelector } from "./LanguageSelector";
import { PublicationList } from "./PublicationList";
import { EmptyPublicationsState, ErrorState, LoadingPublicPageState, NotFoundState } from "./PublicPageStates";
import { PublicPageFrame } from "./PublicPageFrame";
import styles from "./PublicPage.module.css";

export function PublicProductPage() {
  const { stableId } = useParams<{ stableId: string }>();
  const state = usePublicResource(stableId, fetchPublicProduct);

  return (
    <PublicPageFrame>
      {state.status === "loading" && <LoadingPublicPageState />}
      {state.status === "not-found" && <NotFoundState />}
      {state.status === "error" && <ErrorState message={state.message} />}
      {state.status === "success" && <ProductContent product={state.data} />}
    </PublicPageFrame>
  );
}

function ProductContent({ product }: { product: PublicProductDto }) {
  const { languages, selected, setSelected, filtered } = useLanguageFilter(product.publications);

  return (
    <>
      <div className={styles.heroCard}>
        <div className={styles.productName}>{product.name}</div>
        <div className={styles.metaList}>
          {product.modelDesignation && (
            <div>
              <span className={styles.metaLabel}>Modell:</span>
              {product.modelDesignation}
            </div>
          )}
        </div>
        {product.description && <p className={styles.description}>{product.description}</p>}
      </div>

      <LanguageSelector languages={languages} selected={selected} onSelect={setSelected} />

      {product.publications.length === 0 ? (
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
