import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={[styles.badge, styles[tone]].join(" ")}>{children}</span>;
}

// Generic status -> tone mapping. Covers the domain vocabulary the API
// already uses (RevisionStatus, PublicationStatus, MembershipRole,
// OrganizationStatus) plus a couple of German labels used on the public
// page, with a safe neutral fallback for anything unrecognized so this
// component never has to change just because a new status string appears.
const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "success",
  APPROVED: "success",
  PUBLISHED: "success",
  "Gültig": "success",
  DRAFT: "neutral",
  IN_REVIEW: "info",
  RETIRED: "neutral",
  SUPERSEDED: "neutral",
  REVOKED: "danger",
  SUSPENDED: "danger",
  EXPIRED: "danger",
  INVITED: "warning",
};

export interface StatusBadgeProps {
  status: string;
  label?: string;
}

/** Color-codes a raw backend status string without the caller needing to
 * know the tone mapping. Pass `label` to show different text than the raw
 * status (e.g. a translated/German label) while still coloring by status. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return <Badge tone={tone}>{label ?? status}</Badge>;
}
