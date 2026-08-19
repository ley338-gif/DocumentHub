import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared a11y behavior for Dialog/Drawer: on open, moves focus into the
 * panel (respecting a field's own `autoFocus` if one already claimed focus,
 * otherwise the first focusable element, or the panel itself as a
 * fallback) and traps Tab/Shift+Tab inside it; on close, returns focus to
 * whatever triggered the open. Escape-to-close is handled by the callers
 * themselves since they already had that wired up. */
export function useFocusTrap(open: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Capture the trigger element during render, the instant `open` flips to
  // true — NOT inside an effect. A field's native `autoFocus` runs during
  // React's commit phase, before passive effects fire, so by the time an
  // effect could read `document.activeElement` it would already be inside
  // the just-opened dialog, not the button that opened it.
  if (open && !wasOpenRef.current) {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }
  wasOpenRef.current = open;

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    // Don't fight a field's own `autoFocus` (e.g. a dialog's first input) —
    // only move focus ourselves if nothing inside the panel already has it.
    if (container && !container.contains(document.activeElement)) {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable[0] ?? container).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Return focus to the triggering element once the panel closes.
      triggerRef.current?.focus?.();
    };
  }, [open, containerRef]);
}
