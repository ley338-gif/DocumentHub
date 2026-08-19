import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Input } from "../../design-system";
import { useAuthStore } from "./auth-store";
import styles from "./LoginPage.module.css";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const storeError = useAuthStore((s) => s.error);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/app";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch {
      // error is surfaced via storeError / useAuthStore().error already
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>DH</span>
          Document Hub
        </div>
        <h1 className={styles.title}>Anmelden</h1>
        <p className={styles.subtitle}>Melden Sie sich mit Ihrem Konto an.</p>

        {(localError ?? storeError) && <div className={styles.errorBanner}>{localError ?? storeError}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={submitting} fullWidth>
            {submitting ? "Anmeldung läuft…" : "Anmelden"}
          </Button>
        </form>

        <p className={styles.hint}>
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </p>
      </div>
    </div>
  );
}
