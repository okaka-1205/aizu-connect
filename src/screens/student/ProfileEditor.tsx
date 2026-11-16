import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { useDialogAccessibility } from "../../hooks/useDialogAccessibility";

export function ProfileEditor({
  children,
  dirty,
  onClose,
  onSubmit,
}: {
  children: ReactNode;
  dirty: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const formRef = useDialogAccessibility<HTMLFormElement>(onClose, () =>
    document.querySelector<HTMLButtonElement>(".profile-edit-button"),
  );
  const closeRef = useRef(onClose);
  const mounted = useRef(false);
  const session = useId();
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    mounted.current = true;
    const url = window.location.href;
    const pushEditorEntry = () =>
      window.history.pushState(
        { ...window.history.state, profileEditor: session },
        "",
        url,
      );
    if (window.history.state?.profileEditor !== session) pushEditorEntry();
    const handleBack = () => {
      pushEditorEntry();
      closeRef.current();
    };
    window.addEventListener("popstate", handleBack);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", handleBack);
      // StrictMode remounts effects immediately; only remove a real closed editor.
      queueMicrotask(() => {
        if (
          !mounted.current &&
          window.history.state?.profileEditor === session
        ) {
          window.addEventListener(
            "popstate",
            () =>
              window.requestAnimationFrame(() => {
                document
                  .querySelector<HTMLButtonElement>(".profile-edit-button")
                  ?.focus({ preventScroll: true });
              }),
            { once: true },
          );
          window.history.back();
        }
      });
    };
  }, [session]);

  useEffect(() => {
    if (!dirty) return;
    const handleUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [dirty]);

  return (
    <div className="report-backdrop profile-edit-backdrop" onClick={onClose}>
      <form
        ref={formRef}
        className="profile-edit-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-edit-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        {children}
      </form>
    </div>
  );
}
