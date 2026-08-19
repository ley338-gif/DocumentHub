import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Spinner,
  StatTile,
  Table,
  type TableColumn,
  WizardSteps,
  useToast,
} from "../../design-system";
import {
  IMPORT_CANONICAL_FIELDS,
  type ImportCanonicalField,
  type ImportPreviewResponseDto,
  type InvalidRowDto,
  type ValidRowPreviewDto,
} from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { hasRole } from "../../lib/roles";
import { useCurrentRole } from "../auth/useCurrentRole";
import { commitImport, previewImport } from "./api";

const MAX_CLIENT_SIZE_BYTES = 20 * 1024 * 1024; // mirrors imports.service.ts's MAX_FILE_SIZE_BYTES — client-side hint only, server is authoritative.
const REQUIRED_FIELDS: ImportCanonicalField[] = ["serialNumber", "productReference"];
const ERROR_LIST_CAP = 50;
const VALID_SAMPLE_CAP = 30;

const FIELD_LABELS: Record<ImportCanonicalField, string> = {
  serialNumber: "Seriennummer",
  productReference: "Produktreferenz",
  variantReference: "Variantenreferenz",
  batchReference: "Chargenreferenz",
  manufacturedAt: "Herstellungsdatum",
  deliveredAt: "Lieferdatum",
  internalReference: "Interne Referenz",
};

const STEPS = [
  { key: "file", label: "1. Datei" },
  { key: "mapping", label: "2. Spalten zuordnen" },
  { key: "review", label: "3. Prüfen" },
  { key: "commit", label: "4. Importieren" },
] as const;

type MappingState = Partial<Record<ImportCanonicalField, number | null>>;

/**
 * CSV unit import wizard (spec §33-35). Entry point lives at the top level
 * (Products list), not nested under one product's Units tab: the API
 * resolves `productReference` per row inside the CSV itself
 * (imports.service.ts's `preview()`), so a single import can span many
 * products — there is no "import into this product" scoping at the API
 * level to nest this under.
 *
 * Nothing is persisted before the explicit commit in step 4 — both preview
 * calls (auto-detect in step 1->2, and the mapping-aware re-validation in
 * step 2->3) only stage a disposable, TTL'd server-side buffer keyed by
 * `importId` (see PendingImportStore). The backend remains the sole
 * validation authority throughout; this component never invents its own
 * pass/fail logic, it only renders what the server already decided.
 */
export function ImportWizardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const role = useCurrentRole();
  const canImport = hasRole(role, "EDITOR");

  const [stepIndex, setStepIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ImportPreviewResponseDto | null>(null);
  // Headers shown in the mapping step's Selects. Normally comes straight
  // from a successful preview's `headers`. When the backend rejects the
  // file with FILE_VALIDATION_FAILED because auto-detection couldn't find
  // serialNumber/productReference at all, the same header list is still
  // available on `error.details.headers` (imports.service.ts attaches it
  // specifically for this case) — the user still needs to reach step 2 to
  // fix the mapping by hand, and this is the real, backend-parsed header
  // row, not a client-side re-implementation of CSV parsing that could
  // disagree with the server on edge cases like quoted headers containing
  // commas. `headers` is decoupled from `preview` for exactly this reason.
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [mapping, setMapping] = useState<MappingState>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  if (!canImport) {
    return (
      <div>
        <PageHeader title="Einheiten importieren" />
        <p role="alert">
          Für den CSV-Import ist mindestens die Rolle Editor erforderlich. Diese Aktion ist mit Ihrer aktuellen Rolle
          nicht verfügbar.
        </p>
        <Button variant="secondary" onClick={() => navigate("/app/products")}>
          Zurück zu Produkten
        </Button>
      </div>
    );
  }

  function handleFileChange(f: File | null) {
    setFile(f);
    setFileError(null);
    if (!f) return;
    const nameOk = /\.csv$/i.test(f.name);
    const typeOk = f.type === "" || ["text/csv", "application/vnd.ms-excel", "text/plain"].includes(f.type);
    if (!nameOk && !typeOk) {
      setFileError("Bitte wählen Sie eine CSV-Datei (.csv).");
      return;
    }
    if (f.size > MAX_CLIENT_SIZE_BYTES) {
      setFileError("Die Datei überschreitet die maximal zulässige Größe von 20 MB.");
    }
  }

  // Step 1 -> 2: first preview call, no columnMapping override, to get
  // auto-detected headers/columnMapping to seed the editable mapping step.
  async function handleStartMapping() {
    if (!file) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await previewImport(file);
      setPreview(res);
      setHeaders(res.headers);
      setMapping(res.columnMapping);
      setStepIndex(1);
    } catch (err) {
      // FILE_VALIDATION_FAILED for a missing required column still carries
      // the real, backend-parsed header row in `details` (see
      // imports.service.ts) — the user needs to reach step 2 to fix the
      // mapping by hand, and this is the actual server parse, not a
      // client-side guess that could disagree on edge cases (quoted
      // headers containing commas, for example).
      const rejectionHeaders = err instanceof ApiError ? extractHeadersFromErrorDetails(err.details) : null;
      if (rejectionHeaders) {
        setPreview(null);
        setHeaders(rejectionHeaders.headers);
        setMapping(rejectionHeaders.columnMapping);
        setStepIndex(1);
        return;
      }
      setPreviewError(err instanceof ApiError ? err.userMessage : "Datei konnte nicht analysiert werden.");
    } finally {
      setPreviewLoading(false);
    }
  }

  // Step 2 -> 3: re-validate with the user's (possibly edited) mapping. The
  // file object cached in state is resent — a browser cannot replay a prior
  // multipart upload. The server is the actual authority on whether the
  // required fields are mapped: if not, this comes back with
  // FILE_VALIDATION_FAILED, shown as-is, rather than us blocking client-side.
  async function handleReview() {
    if (!file) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await previewImport(file, mapping);
      setPreview(res);
      setHeaders(res.headers);
      setStepIndex(2);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.userMessage : "Vorschau konnte nicht erstellt werden.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await commitImport(preview.importId);
      setImportedCount(res.importedCount);
      toast.show({ message: `${res.importedCount} Einheit(en) erfolgreich importiert.`, tone: "success" });
    } catch (err) {
      const message = err instanceof ApiError ? err.userMessage : "Import fehlgeschlagen.";
      setCommitError(message);
      toast.show({ message, tone: "danger" });
    } finally {
      setCommitting(false);
    }
  }

  const step = STEPS[stepIndex].key;

  return (
    <div>
      <PageHeader
        title="Einheiten aus CSV importieren"
        subtitle="Lädt Seriennummern und Zuordnungen zu Produkten, Varianten und Chargen aus einer CSV-Datei."
        actions={
          <Button variant="secondary" onClick={() => navigate("/app/products")}>
            Abbrechen
          </Button>
        }
      />

      <WizardSteps steps={STEPS.map((s) => ({ key: s.key, label: s.label.replace(/^\d+\.\s*/, "") }))} currentIndex={stepIndex} />

      {step === "file" && (
        <FileStep
          file={file}
          fileError={fileError}
          previewLoading={previewLoading}
          previewError={previewError}
          onFileChange={handleFileChange}
        />
      )}

      {step === "mapping" && headers && (
        <MappingStep
          headers={headers}
          unknownColumns={preview?.unknownColumns ?? []}
          mapping={mapping}
          onMappingChange={setMapping}
          previewLoading={previewLoading}
          previewError={previewError}
        />
      )}

      {step === "review" && preview && <ReviewStep preview={preview} />}

      {step === "commit" && preview && (
        <CommitStep
          preview={preview}
          committing={committing}
          commitError={commitError}
          importedCount={importedCount}
          onCommit={handleCommit}
          onGoToUnits={() => {
            const distinctProductIds = [...new Set(preview.validRows.map((r) => r.productId))];
            if (distinctProductIds.length === 1) {
              navigate(`/app/products/${distinctProductIds[0]}?tab=units`);
            } else {
              navigate("/app/products");
            }
          }}
        />
      )}

      {importedCount === null && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
          <Button
            variant="secondary"
            disabled={stepIndex === 0 || previewLoading}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Zurück
          </Button>
          {step === "file" && (
            <Button onClick={handleStartMapping} disabled={!file || Boolean(fileError) || previewLoading}>
              {previewLoading ? "Wird analysiert…" : "Weiter"}
            </Button>
          )}
          {step === "mapping" && (
            <Button onClick={handleReview} disabled={previewLoading}>
              {previewLoading ? "Wird geprüft…" : "Weiter"}
            </Button>
          )}
          {step === "review" && (
            <Button onClick={() => setStepIndex(3)} disabled={!preview || preview.validRows.length === 0}>
              Weiter
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Datei
// ---------------------------------------------------------------------------

/** Pulls the real, backend-parsed `{headers, columnMapping}` out of a
 * FILE_VALIDATION_FAILED error's `details` (see imports.service.ts) — the
 * exact shape the success response also uses. Returns null for any other
 * error, or if `details` doesn't have the expected shape (defensive, not
 * expected to happen against this backend, but never crash on a malformed
 * response instead of showing the real error). */
function extractHeadersFromErrorDetails(
  details: unknown,
): { headers: string[]; columnMapping: MappingState } | null {
  if (!details || typeof details !== "object") return null;
  const d = details as { headers?: unknown; columnMapping?: unknown };
  if (!Array.isArray(d.headers) || !d.headers.every((h) => typeof h === "string")) return null;
  const columnMapping = d.columnMapping && typeof d.columnMapping === "object" ? (d.columnMapping as MappingState) : {};
  return { headers: d.headers as string[], columnMapping };
}

function FileStep({
  file,
  fileError,
  previewLoading,
  previewError,
  onFileChange,
}: {
  file: File | null;
  fileError: string | null;
  previewLoading: boolean;
  previewError: string | null;
  onFileChange: (f: File | null) => void;
}) {
  return (
    <div>
      <h3>CSV-Datei auswählen</h3>
      <p style={{ color: "var(--color-text-secondary)" }}>
        Die Datei muss mindestens Spalten für Seriennummer und Produktreferenz enthalten. Im nächsten Schritt können
        Sie die Spaltenzuordnung prüfen und bei Bedarf korrigieren.
      </p>
      <input
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      {file && !fileError && (
        <p>
          Ausgewählt: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}
      {fileError && <p role="alert">{fileError}</p>}
      {previewLoading && <Spinner size={24} />}
      {previewError && <ErrorState error={previewError} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Spalten zuordnen
// ---------------------------------------------------------------------------

function MappingStep({
  headers,
  unknownColumns,
  mapping,
  onMappingChange,
  previewLoading,
  previewError,
}: {
  headers: string[];
  unknownColumns: string[];
  mapping: MappingState;
  onMappingChange: (m: MappingState) => void;
  previewLoading: boolean;
  previewError: string | null;
}) {
  const headerOptions = [
    { value: "", label: "— nicht zugeordnet —" },
    ...headers.map((h, idx) => ({ value: String(idx), label: `${h || "(leer)"} (Spalte ${idx + 1})` })),
  ];
  const noAutoDetection = unknownColumns.length === 0 && Object.keys(mapping).length === 0;

  return (
    <div>
      <h3>Spaltenzuordnung prüfen</h3>
      {noAutoDetection ? (
        <p role="alert">
          Die Spalten dieser Datei konnten nicht automatisch erkannt werden. Ordnen Sie unten bitte mindestens
          Seriennummer und Produktreferenz manuell einer Spalte zu.
        </p>
      ) : (
        <p style={{ color: "var(--color-text-secondary)" }}>
          Automatisch erkannte Zuordnung aus den Kopfzeilen Ihrer Datei. Sie können jede Zuordnung ändern —
          Seriennummer und Produktreferenz sind erforderlich.
        </p>
      )}
      {unknownColumns.length > 0 && (
        <p>
          Nicht erkannte Spalten (werden ignoriert): <em>{unknownColumns.join(", ")}</em>
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem", maxWidth: "40rem" }}>
        {IMPORT_CANONICAL_FIELDS.map((field) => {
          const value = mapping[field];
          const isRequired = REQUIRED_FIELDS.includes(field);
          return (
            <Select
              key={field}
              label={`${FIELD_LABELS[field]}${isRequired ? " *" : ""}`}
              required={isRequired}
              options={headerOptions}
              value={value === undefined || value === null ? "" : String(value)}
              onChange={(e) => {
                const raw = e.target.value;
                onMappingChange({ ...mapping, [field]: raw === "" ? null : Number(raw) });
              }}
            />
          );
        })}
      </div>
      <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
        * Pflichtfeld. Fehlt eine erforderliche Zuordnung, meldet der Server dies beim nächsten Schritt.
      </p>
      {previewLoading && <Spinner size={24} />}
      {previewError && <ErrorState error={previewError} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Prüfen
// ---------------------------------------------------------------------------

// The backend doesn't return a structured category for "why" a row is
// invalid, only a free-text `errors` array (imports.service.ts). Duplicate
// rows within the same file always carry the exact, stable phrase
// "appears more than once in this file" (csv-parser.ts's
// findDuplicateSerialsInFile), so string-matching on that known phrase is
// used to split the invalid-row count into "duplicate in file" vs "other"
// for the summary headline. This is a documented MVP compromise: it
// couples this UI to backend message text. It does NOT affect what is
// actually imported — that's still driven entirely by validRows/invalidRows
// as returned, never re-derived from this categorization.
const DUPLICATE_IN_FILE_PHRASE = "appears more than once in this file";

function categorizeInvalidRows(invalidRows: InvalidRowDto[]): { duplicates: number; other: number } {
  let duplicates = 0;
  let other = 0;
  for (const row of invalidRows) {
    if (row.errors.some((e) => e.includes(DUPLICATE_IN_FILE_PHRASE))) {
      duplicates++;
    } else {
      other++;
    }
  }
  return { duplicates, other };
}

function ReviewStep({ preview }: { preview: ImportPreviewResponseDto }) {
  const { duplicates, other } = useMemo(() => categorizeInvalidRows(preview.invalidRows), [preview.invalidRows]);

  const shownErrors = preview.invalidRows.slice(0, ERROR_LIST_CAP);
  const remainingErrors = preview.invalidRows.length - shownErrors.length;

  const sampleValid = preview.validRows.slice(0, VALID_SAMPLE_CAP);
  const remainingValid = preview.validRows.length - sampleValid.length;

  const validColumns: TableColumn<ValidRowPreviewDto>[] = [
    { key: "line", header: "Zeile", render: (r) => r.line },
    { key: "serial", header: "Seriennummer", render: (r) => r.serialNumber },
    { key: "product", header: "Produkt", render: (r) => r.productName },
    { key: "manufacturedAt", header: "Herstellungsdatum", render: (r) => r.manufacturedAt ?? "–" },
  ];

  return (
    <div>
      <h3>Vorschau prüfen</h3>

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <StatTile label="Gesamt" value={preview.totalRows} tone="neutral" />
        <StatTile label="Gültig" value={preview.validRows.length} tone="success" />
        <StatTile label="Ungültig" value={preview.invalidRows.length} tone={preview.invalidRows.length > 0 ? "danger" : "neutral"} />
        <StatTile label="davon Duplikate in der Datei" value={duplicates} tone={duplicates > 0 ? "warning" : "neutral"} />
        <StatTile label="davon andere Fehler" value={other} tone={other > 0 ? "warning" : "neutral"} />
      </div>

      {preview.invalidRows.length > 0 && (
        <p role="alert" style={{ fontWeight: 600 }}>
          {preview.invalidRows.length} ungültige Zeile(n) werden beim Import übersprungen und NICHT angelegt. Nur die{" "}
          {preview.validRows.length} gültigen Zeilen werden importiert.
        </p>
      )}
      {preview.validRows.length === 0 && (
        <p role="alert">Diese Datei enthält keine gültigen Zeilen — ein Import ist nicht möglich.</p>
      )}

      {preview.invalidRows.length > 0 && (
        <>
          <h4>Fehlerhafte Zeilen{remainingErrors > 0 ? ` (erste ${ERROR_LIST_CAP} von ${preview.invalidRows.length})` : ""}</h4>
          <ul style={{ maxHeight: "16rem", overflowY: "auto", border: "1px solid var(--color-border)", padding: "0.5rem 1rem", borderRadius: 4 }}>
            {shownErrors.map((r) => (
              <li key={r.row}>
                Zeile {r.row}: {r.errors.join(", ")}
              </li>
            ))}
          </ul>
          {remainingErrors > 0 && <p>… und {remainingErrors} weitere.</p>}
        </>
      )}

      <h4 style={{ marginTop: "1.5rem" }}>
        Beispiel gültiger Zeilen{remainingValid > 0 ? ` (erste ${VALID_SAMPLE_CAP} von ${preview.validRows.length})` : ""}
      </h4>
      <Table
        columns={validColumns}
        rows={sampleValid}
        rowKey={(r) => String(r.line)}
        emptyMessage={<EmptyState title="Keine gültigen Zeilen." />}
      />
      {remainingValid > 0 && <p>… und {remainingValid} weitere gültige Zeilen (nicht einzeln angezeigt).</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Importieren
// ---------------------------------------------------------------------------

function CommitStep({
  preview,
  committing,
  commitError,
  importedCount,
  onCommit,
  onGoToUnits,
}: {
  preview: ImportPreviewResponseDto;
  committing: boolean;
  commitError: string | null;
  importedCount: number | null;
  onCommit: () => void;
  onGoToUnits: () => void;
}) {
  if (importedCount !== null) {
    return (
      <div>
        <h3>Import abgeschlossen</h3>
        <p>
          <Badge tone="success">Erfolgreich</Badge> <strong>{importedCount.toLocaleString("de-DE")}</strong> Einheit(en)
          wurden angelegt.
        </p>
        {importedCount !== preview.validRows.length && (
          <p role="alert">
            Hinweis: Die tatsächlich importierte Anzahl ({importedCount}) weicht von der zuvor geprüften Anzahl (
            {preview.validRows.length}) ab.
          </p>
        )}
        <Button onClick={onGoToUnits}>Zur Einheiten-Übersicht</Button>
      </div>
    );
  }

  return (
    <div>
      <h3>Import bestätigen</h3>
      <p>
        <strong>{preview.validRows.length.toLocaleString("de-DE")}</strong> Einheit(en) werden jetzt importiert.{" "}
        {preview.invalidRows.length > 0 && (
          <>
            <strong>{preview.invalidRows.length.toLocaleString("de-DE")}</strong> ungültige Zeile(n) werden dabei
            übersprungen.
          </>
        )}
      </p>
      <p style={{ color: "var(--color-text-secondary)" }}>
        Vor diesem Klick wurde noch nichts in der Datenbank gespeichert — dieser Schritt importiert genau die zuvor
        geprüfte Menge, nicht mehr und nicht weniger.
      </p>
      {commitError && <ErrorState error={commitError} onRetry={onCommit} retryLabel="Erneut versuchen" />}
      <Button onClick={onCommit} disabled={committing || preview.validRows.length === 0} variant="primary">
        {committing ? "Wird importiert…" : "Jetzt importieren"}
      </Button>
    </div>
  );
}
