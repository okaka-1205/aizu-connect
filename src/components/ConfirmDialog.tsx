import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";

import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose);

  return createPortal(
    <div className="report-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="report-dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="report-dialog-head">
          <div>
            <p className="eyebrow">CONFIRM</p>
            <h2 id="confirm-dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            title="閉じる"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="confirm-dialog-copy">
          <AlertTriangle size={20} />
          <p id="confirm-dialog-description">{description}</p>
        </div>
        <div className="report-dialog-actions">
          <button
            className="secondary-action"
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
          >
            戻る
          </button>
          <button
            className={danger ? "danger-action" : "primary-action"}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
