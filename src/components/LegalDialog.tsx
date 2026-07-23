import { X } from "lucide-react";

import { legalDocuments, type LegalDocument } from "../content/legalDocuments";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

export function LegalDialog({
  document,
  onClose,
}: {
  document: LegalDocument;
  onClose: () => void;
}) {
  const content = legalDocuments[document];
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose);

  return (
    <div className="legal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="legal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="legal-dialog-head">
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <h2 id="legal-dialog-title">{content.title}</h2>
          </div>
          <button
            className="icon-button"
            title="閉じる"
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="legal-dialog-body">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
