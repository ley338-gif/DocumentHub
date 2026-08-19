import { useCallback, useEffect, useState } from "react";
import type { ApplicabilityRuleDto, PublishPreviewDto } from "../../lib/api-types";
import { ApiError } from "../../lib/api-error";
import { listApplicabilityRules } from "../documents/api";
import { getPublishPreview } from "../publications/api";

/**
 * Single fetch point for a revision's applicability rules AND the backend
 * preview (specificity/affectedUnitsCount/conflicts), shared by the rule
 * builder and the matrix view so both render the exact same underlying data
 * — never two separately-fetched or separately-computed datasets.
 *
 * `canPreview` gates the preview call: the preview endpoint is Editor+
 * server-side, so a Viewer session must not attempt it (that would just be
 * a guaranteed, confusing 403). The rule list itself is Viewer-readable.
 *
 * Design choice (see README.md / final report): the preview is refetched
 * automatically after every mutation (create/update/delete) and once on
 * mount, plus on demand via `reloadPreview()` — NOT on every keystroke of
 * an unsaved form. A preview is a description of PERSISTED rules; firing it
 * against not-yet-saved form state would blur the line between "what the
 * backend has decided" and "what the user is currently typing," which is
 * exactly the kind of client-side guessing this phase must avoid.
 */
export function useApplicabilityData(revisionId: string | undefined, canPreview: boolean) {
  const [rules, setRules] = useState<ApplicabilityRuleDto[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PublishPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const reloadRules = useCallback(() => {
    if (!revisionId) return Promise.resolve();
    setRulesLoading(true);
    setRulesError(null);
    return listApplicabilityRules(revisionId)
      .then((res) => setRules(res))
      .catch((err) => {
        setRulesError(err instanceof ApiError ? err.userMessage : "Regeln konnten nicht geladen werden.");
      })
      .finally(() => setRulesLoading(false));
  }, [revisionId]);

  const reloadPreview = useCallback(() => {
    if (!revisionId || !canPreview) return Promise.resolve();
    setPreviewLoading(true);
    setPreviewError(null);
    return getPublishPreview(revisionId)
      .then((res) => setPreview(res))
      .catch((err) => {
        setPreviewError(err instanceof ApiError ? err.userMessage : "Vorschau konnte nicht geladen werden.");
      })
      .finally(() => setPreviewLoading(false));
  }, [revisionId, canPreview]);

  const reloadAll = useCallback(() => {
    return Promise.all([reloadRules(), reloadPreview()]);
  }, [reloadRules, reloadPreview]);

  useEffect(() => {
    setPreview(null);
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisionId, canPreview]);

  return { rules, rulesLoading, rulesError, preview, previewLoading, previewError, reloadAll, reloadPreview };
}
