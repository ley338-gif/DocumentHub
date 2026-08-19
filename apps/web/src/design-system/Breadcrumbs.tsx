import { Link } from "react-router-dom";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last (current-page) item — it renders as plain text. */
  to?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/** Hierarchy trail for detail-ish pages (Product Detail, Document Detail,
 * Publish Wizard, ...). Renders above the page title inside PageHeader
 * (pass `breadcrumbs` to PageHeader rather than using this directly, unless
 * a page needs it outside that layout). Only the later phases retrofit this
 * onto every detail page — this component is intentionally proven against a
 * handful of real usages in this pass, not applied everywhere yet. */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {item.to && !isLast ? (
                <Link to={item.to} className={styles.link}>
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? styles.current : undefined} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className={styles.separator} aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
