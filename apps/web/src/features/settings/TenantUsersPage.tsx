import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  type TableColumn,
  useToast,
} from "../../design-system";
import { useAuthStore } from "../auth/auth-store";
import { useCurrentRole } from "../auth/useCurrentRole";
import { hasRole } from "../../lib/roles";
import { ApiError } from "../../lib/api-error";
import type { InvitationDto } from "../../lib/api-types";
import { createInvitation, listInvitations, resendInvitation, revokeInvitation } from "../invitations/api";
import { listMembers, updateMemberRole, updateMemberStatus, type MembershipDto } from "./api";

const ROLE_OPTIONS = [
  { value: "VIEWER", label: "Viewer" },
  { value: "EDITOR", label: "Editor" },
  { value: "PUBLISHER", label: "Publisher" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];

export function TenantUsersPage() {
  const toast = useToast();
  const organizationId = useAuthStore((s) => s.currentOrganizationId);
  const role = useCurrentRole();
  const canManage = hasRole(role, "ADMINISTRATOR");

  const [members, setMembers] = useState<MembershipDto[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VIEWER");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  function load() {
    if (!organizationId) return;
    setLoading(true);
    Promise.all([listMembers(organizationId), listInvitations(organizationId)])
      .then(([m, i]) => {
        setMembers(m);
        setInvitations(i.filter((inv) => inv.status === "PENDING"));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }

  useEffect(load, [organizationId]);

  async function handleRoleChange(membershipId: string, newRole: string) {
    if (!organizationId) return;
    try {
      await updateMemberRole(organizationId, membershipId, newRole);
      toast.show({ message: "Rolle aktualisiert.", tone: "success" });
      load();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Rolle konnte nicht geändert werden.", tone: "danger" });
    }
  }

  async function handleStatusToggle(m: MembershipDto) {
    if (!organizationId) return;
    const nextStatus = m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await updateMemberStatus(organizationId, m.id, nextStatus);
      toast.show({ message: "Status aktualisiert.", tone: "success" });
      load();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Status konnte nicht geändert werden.", tone: "danger" });
    }
  }

  async function handleInviteSubmit() {
    if (!organizationId || !inviteEmail.trim()) return;
    setSubmitting(true);
    setInviteError(null);
    try {
      const res = await createInvitation(organizationId, { email: inviteEmail, role: inviteRole });
      setInviteLink(`${window.location.origin}/invite/${res.token}`);
      load();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.userMessage : "Einladung konnte nicht erstellt werden.");
    } finally {
      setSubmitting(false);
    }
  }

  function closeInviteDialog() {
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("VIEWER");
    setInviteLink(null);
    setInviteError(null);
  }

  async function handleRevoke(invitationId: string) {
    if (!organizationId) return;
    try {
      await revokeInvitation(organizationId, invitationId);
      toast.show({ message: "Einladung widerrufen.", tone: "success" });
      load();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Einladung konnte nicht widerrufen werden.", tone: "danger" });
    }
  }

  async function handleResend(invitationId: string) {
    if (!organizationId) return;
    try {
      const res = await resendInvitation(organizationId, invitationId);
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${res.token}`);
      toast.show({ message: "Neuer Einladungslink kopiert.", tone: "success" });
      load();
    } catch (err) {
      toast.show({ message: err instanceof ApiError ? err.userMessage : "Einladung konnte nicht erneuert werden.", tone: "danger" });
    }
  }

  const memberColumns: TableColumn<MembershipDto>[] = [
    { key: "name", header: "Name", render: (m) => m.user.fullName },
    { key: "email", header: "E-Mail", render: (m) => m.user.email },
    {
      key: "role",
      header: "Rolle",
      render: (m) =>
        canManage ? (
          <Select
            aria-label="Rolle"
            value={m.role}
            onChange={(e) => handleRoleChange(m.id, e.target.value)}
            options={ROLE_OPTIONS}
          />
        ) : (
          ROLE_OPTIONS.find((r) => r.value === m.role)?.label ?? m.role
        ),
    },
    { key: "status", header: "Status", render: (m) => <StatusBadge status={m.status} /> },
    {
      key: "actions",
      header: "",
      render: (m) =>
        canManage ? (
          <Button variant={m.status === "ACTIVE" ? "danger" : "primary"} size="sm" onClick={() => handleStatusToggle(m)}>
            {m.status === "ACTIVE" ? "Deaktivieren" : "Reaktivieren"}
          </Button>
        ) : null,
    },
  ];

  const invitationColumns: TableColumn<InvitationDto>[] = [
    { key: "email", header: "E-Mail", render: (i) => i.email },
    { key: "role", header: "Rolle", render: (i) => ROLE_OPTIONS.find((r) => r.value === i.role)?.label ?? i.role },
    { key: "expiresAt", header: "Läuft ab", render: (i) => new Date(i.expiresAt).toLocaleDateString("de-DE") },
    {
      key: "actions",
      header: "",
      render: (i) => (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="secondary" size="sm" onClick={() => handleResend(i.id)}>
            Link erneuern & kopieren
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleRevoke(i.id)}>
            Widerrufen
          </Button>
        </div>
      ),
    },
  ];

  if (loading) return <LoadingState label="Benutzer werden geladen…" />;
  if (error != null) return <ErrorState error={error} fallback="Benutzer konnten nicht geladen werden." />;

  return (
    <div>
      <PageHeader
        title="Benutzer"
        subtitle="Mitglieder Ihrer Organisation verwalten."
        actions={canManage ? <Button onClick={() => setInviteOpen(true)}>Einladen</Button> : undefined}
      />

      <Table
        columns={memberColumns}
        rows={members}
        rowKey={(m) => m.id}
        emptyMessage={<EmptyState title="Keine Mitglieder" description="Noch keine Mitglieder in dieser Organisation." />}
      />

      {(invitations.length > 0 || canManage) && (
        <>
          <h3 style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", margin: "1.5rem 0 0.75rem" }}>
            Offene Einladungen
          </h3>
          <Table
            columns={invitationColumns}
            rows={invitations}
            rowKey={(i) => i.id}
            emptyMessage={<EmptyState title="Keine offenen Einladungen" description="Alle Einladungen wurden angenommen oder sind abgelaufen." />}
          />
        </>
      )}

      <Dialog open={inviteOpen} onClose={closeInviteDialog} title="Mitarbeiter einladen">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: "22rem" }}>
          {inviteError && <div style={{ color: "var(--color-danger-text)" }}>{inviteError}</div>}
          {!inviteLink ? (
            <>
              <Input label="E-Mail" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required autoFocus />
              <Select label="Rolle" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} options={ROLE_OPTIONS} />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <Button variant="secondary" onClick={closeInviteDialog}>
                  Abbrechen
                </Button>
                <Button onClick={handleInviteSubmit} disabled={submitting || !inviteEmail.trim()}>
                  {submitting ? "Wird gesendet…" : "Einladen"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>Einladung für {inviteEmail} erstellt.</p>
              <Input label="Einladungslink" value={inviteLink} readOnly onFocus={(e) => e.target.select()} />
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink);
                    toast.show({ message: "Link kopiert.", tone: "success" });
                  }}
                >
                  Link kopieren
                </Button>
                <Button onClick={closeInviteDialog}>Fertig</Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
