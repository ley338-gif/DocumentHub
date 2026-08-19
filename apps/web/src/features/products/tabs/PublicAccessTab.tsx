import { useEffect, useState } from "react";
import { ErrorState, Spinner, StatusBadge } from "../../../design-system";
import type { Product } from "../../../lib/api-types";
import { fetchQrImageUrl } from "../api";

export interface PublicAccessTabProps {
  product: Product;
}

export function PublicAccessTab({ product }: PublicAccessTabProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The SPA hosts /p/:stableId itself, so the page's own origin — not the
  // API's — is always the correct public URL, regardless of deployment
  // topology (see apps/web/README.md's "public routes" note).
  const publicUrl = `${window.location.origin}/p/${product.stableId}`;

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchQrImageUrl("products", product.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setQrUrl(url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "QR-Code konnte nicht geladen werden."));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "28rem" }}>
      <div>
        <span style={{ fontWeight: 600 }}>Stabile Produkt-ID: </span>
        <code>{product.stableId}</code>
      </div>
      <div>
        <span style={{ fontWeight: 600 }}>Öffentliche URL: </span>
        <a href={publicUrl} target="_blank" rel="noreferrer">
          {publicUrl}
        </a>
      </div>
      <div>
        <span style={{ fontWeight: 600 }}>Status: </span>
        <StatusBadge status={product.status} />
      </div>
      <div>
        <span style={{ fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>QR-Code</span>
        {error && <ErrorState error={error} fallback="QR-Code konnte nicht geladen werden." />}
        {!qrUrl && !error && <Spinner />}
        {qrUrl && <img src={qrUrl} alt={`QR-Code für ${product.name}`} width={200} height={200} />}
      </div>
    </div>
  );
}
