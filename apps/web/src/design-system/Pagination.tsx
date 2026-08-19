import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={styles.pagination}>
      <span>
        {from}–{to} von {total}
      </span>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.pageButton}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Vorherige Seite"
        >
          ‹
        </button>
        <span className={[styles.pageButton, styles.current].join(" ")}>{page}</span>
        <span>/ {pageCount}</span>
        <button
          type="button"
          className={styles.pageButton}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Nächste Seite"
        >
          ›
        </button>
      </div>
    </div>
  );
}
