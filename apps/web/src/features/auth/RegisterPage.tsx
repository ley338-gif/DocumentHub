import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Spinner } from "../../design-system";
import { useAuthStore } from "./auth-store";
import { useRegistrationMode } from "./useRegistrationMode";
import styles from "./LoginPage.module.css";

type Step = "account" | "organization";

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const createOrganization = useAuthStore((s) => s.createOrganization);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();
  const { mode, loading: modeLoading } = useRegistrationMode();

  const [step, setStep] = useState<Step>("account");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleAccountSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await register(email, password, fullName);
      setStep("organization");
    } catch {
      // error surfaced via storeError already
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOrganizationSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await createOrganization(orgName);
      navigate("/app", { replace: true });
    } catch {
      // error surfaced via storeError already
    } finally {
      setSubmitting(false);
    }
  }

  if (modeLoading) {
    return (
      <div className={styles.page}>
        <Spinner centered size={32} />
      </div>
    );
  }

  if (mode === "INVITE_ONLY") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>DH</span>
            Document Hub
          </div>
          <h1 className={styles.title}>Sie wurden eingeladen?</h1>
          <p className={styles.subtitle}>
            Document Hub ist derzeit nur über eine persönliche Einladung zugänglich. Öffnen Sie den Einladungslink, den
            Sie erhalten haben, um Ihr Konto einzurichten.
          </p>
          <p className={styles.hint}>
            Bereits ein Konto? <Link to="/login">Anmelden</Link>
          </p>
        </div>
      </div>
    );
  }

  if (step === "organization") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>DH</span>
            Document Hub
          </div>
          <h1 className={styles.title}>Organisation anlegen</h1>
          <p className={styles.subtitle}>
            Erstellen Sie Ihre erste Organisation. Sie werden automatisch als Administrator hinzugefügt.
          </p>

          {(localError ?? storeError) && <div className={styles.errorBanner}>{localError ?? storeError}</div>}

          <form className={styles.form} onSubmit={handleOrganizationSubmit}>
            <Input
              label="Organisationsname"
              name="orgName"
              autoComplete="organization"
              autoFocus
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
            <Button type="submit" disabled={submitting} fullWidth>
              {submitting ? "Wird erstellt…" : "Organisation erstellen"}
            </Button>
          </form>
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
        <h1 className={styles.title}>Konto erstellen</h1>
        <p className={styles.subtitle}>Legen Sie ein neues Konto an.</p>

        {(localError ?? storeError) && <div className={styles.errorBanner}>{localError ?? storeError}</div>}

        <form className={styles.form} onSubmit={handleAccountSubmit}>
          <Input
            label="Name"
            name="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            label="E-Mail"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            {submitting ? "Wird erstellt…" : "Konto erstellen"}
          </Button>
        </form>

        <p className={styles.hint}>
          Bereits ein Konto? <Link to="/login">Anmelden</Link>
        </p>
      </div>
    </div>
  );
}
