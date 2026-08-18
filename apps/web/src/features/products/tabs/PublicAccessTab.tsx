import { useEffect, useState } from "react";
import { Spinner, StatusBadge } from "../../../design-system";
import type { Product } from "../../../lib/api-types";
import { API_BASE_URL } from "../../../lib/api-client";
import { fetchQrImageUrl } from "../api";

export interface PublicAccessTabProps {
  product: Product;
}

export function PublicAccessTab({ product }: PublicAccessTabProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicUrl = `${API_BASE_URL.replace(/\/$/, "")}/p/${product.stableId}`;

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
        {error && <p role="alert">{error}</p>}
        {!qrUrl && !error && <Spinner />}
        {qrUrl && <img src={qrUrl} alt={`QR-Code für ${product.name}`} width={200} height={200} />}
      </div>
    </div>
  );
}
