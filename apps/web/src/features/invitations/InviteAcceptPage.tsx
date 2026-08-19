import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Input, Spinner } from "../../design-system";
import { useAuthStore } from "../auth/auth-store";
import { ApiError } from "../../lib/api-error";
import type { InvitationPreviewDto } from "../../lib/api-types";
import { setStoredToken } from "../../lib/session-storage";
import { acceptInvitation, previewInvitation } from "./api";
import styles from "../auth/LoginPage.module.css";

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRATOR: "Administrator",
  PUBLISHER: "Publisher",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export function InviteAcceptPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const refreshOrganizations = useAuthStore((s) => s.refreshOrganizations);

  const [preview, setPreview] = useState<InvitationPreviewDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    if (authStatus === "idle") void bootstrap();
  }, [authStatus, bootstrap]);

  useEffect(() => {
    let cancelled = false;
    previewInvitation(token)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.userMessage : "Diese Einladung ist ungültig oder abgelaufen.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isAuthenticated = authStatus === "authenticated" && Boolean(currentUser);
  const emailMatches = isAuthenticated && preview && currentUser!.email === preview.email;
  const emailMismatch = isAuthenticated && preview && currentUser!.email !== preview.email;

  async function handleAcceptAsCurrentUser() {
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await acceptInvitation(token, {}, true);
      await refreshOrganizations(res.organizationId);
      navigate("/app", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.userMessage : "Einladung konnte nicht angenommen werden.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAccount(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await acceptInvitation(token, { fullName, password }, false);
      if (res.accessToken) {
        setStoredToken(res.accessToken);
        await bootstrap();
      }
      navigate("/app", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVITATION_LOGIN_REQUIRED") {
        setNeedsLogin(true);
      } else {
        setFormError(err instanceof ApiError ? err.userMessage : "Einladung konnte nicht angenommen werden.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <Spinner centered size={32} />
      </div>
    );
  }

  if (loadError || !preview) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>DH</span>
            Document Hub
          </div>
          <h1 className={styles.title}>Einladung nicht verfügbar</h1>
          <p className={styles.subtitle}>{loadError ?? "Diese Einladung ist ungültig oder abgelaufen."}</p>
          <p className={styles.hint}>
            <Link to="/login">Zur Anmeldung</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>DH</span>
          Document Hub
        </div>
        <h1 className={styles.title}>Einladung annehmen</h1>
        <p className={styles.subtitle}>
          Sie wurden zu <strong>{preview.organizationName}</strong> eingeladen — Rolle:{" "}
          <strong>{ROLE_LABEL[preview.role] ?? preview.role}</strong>.
        </p>

        {(formError || emailMismatch) && (
          <div className={styles.errorBanner}>
            {emailMismatch
              ? `Diese Einladung wurde an ${preview.email} gesendet. Sie sind aktuell als ${currentUser!.email} angemeldet.`
              : formError}
          </div>
        )}

        {emailMatches && (
          <Button onClick={handleAcceptAsCurrentUser} disabled={submitting} fullWidth>
            {submitting ? "Wird angenommen…" : `Als ${currentUser!.email} annehmen`}
          </Button>
        )}

        {emailMismatch && (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate("/login", { state: { from: `/invite/${token}` } })}
          >
            Abmelden und als {preview.email} anmelden
          </Button>
        )}

        {!isAuthenticated && needsLogin && (
          <>
            <p className={styles.subtitle}>
              Für {preview.email} existiert bereits ein Konto. Bitte melden Sie sich an, um die Einladung anzunehmen.
            </p>
            <Button fullWidth onClick={() => navigate("/login", { state: { from: `/invite/${token}` } })}>
              Zur Anmeldung
            </Button>
          </>
        )}

        {!isAuthenticated && !needsLogin && (
          <form className={styles.form} onSubmit={handleCreateAccount}>
            <Input label="E-Mail" value={preview.email} disabled />
            <Input
              label="Name"
              name="fullName"
              autoComplete="name"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              label="Passwort"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" disabled={submitting} fullWidth>
              {submitting ? "Wird erstellt…" : "Konto erstellen & Einladung annehmen"}
            </Button>
            <p className={styles.hint}>
              Bereits ein Konto? <Link to="/login" state={{ from: `/invite/${token}` }}>Anmelden</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
