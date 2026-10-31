import { useLayoutEffect, useRef } from "react";

const focusableSelector = [
  "[data-dialog-initial-focus]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useDialogAccessibility<T extends HTMLElement>(
  onClose: () => void,
  getFallbackFocus?: () => HTMLElement | null,
) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  const fallbackFocusRef = useRef(getFallbackFocus);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    fallbackFocusRef.current = getFallbackFocus;
  }, [getFallbackFocus, onClose]);

  useLayoutEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusDialog = window.requestAnimationFrame(() => {
      const preferred = dialogRef.current?.querySelector<HTMLElement>(
        "[data-dialog-initial-focus]",
      );
      const firstFocusable =
        preferred ??
        dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-modal="true"]'),
      );
      const isTopmostDialog =
        dialogRef.current && openDialogs.at(-1) === dialogRef.current;
      if (!isTopmostDialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const canRestorePreviousFocus =
        previouslyFocused &&
        previouslyFocused !== document.body &&
        previouslyFocused.isConnected;
      const returnFocus = canRestorePreviousFocus
        ? previouslyFocused
        : fallbackFocusRef.current?.();
      returnFocus?.focus();
    };
  }, []);

  return dialogRef;
}
