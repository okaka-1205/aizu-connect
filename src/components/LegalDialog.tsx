import { X } from "lucide-react";
import type { KeyboardEvent } from "react";

import { legalDocuments, type LegalDocument } from "../content/legalDocuments";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

function handleDocumentScrollKey(event: KeyboardEvent<HTMLDivElement>) {
  if (event.target !== event.currentTarget) return;

  const body = event.currentTarget;
  const pageDistance = Math.max(160, Math.round(body.clientHeight * 0.82));
  let nextScrollTop: number | null = null;

  switch (event.key) {
    case "ArrowDown":
      nextScrollTop = body.scrollTop + 48;
      break;
    case "ArrowUp":
      nextScrollTop = body.scrollTop - 48;
      break;
    case "PageDown":
    case " ":
      nextScrollTop =
        body.scrollTop + (event.shiftKey ? -pageDistance : pageDistance);
      break;
    case "PageUp":
      nextScrollTop = body.scrollTop - pageDistance;
      break;
    case "Home":
      nextScrollTop = 0;
      break;
    case "End":
      nextScrollTop = body.scrollHeight;
      break;
    default:
      return;
  }

  event.preventDefault();
  body.scrollTop = nextScrollTop;
}

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
            aria-label="閉じる"
            title="閉じる"
            type="button"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        <div
          className="legal-dialog-body"
          role="region"
          aria-label={`${content.title}の本文`}
          tabIndex={0}
          data-dialog-initial-focus
          onKeyDown={handleDocumentScrollKey}
        >
          <div className="legal-document-intro">
            <p>{content.introduction}</p>
            <dl>
              <div>
                <dt>制定・適用日</dt>
                <dd>{content.effectiveDate}</dd>
              </div>
              <div>
                <dt>版</dt>
                <dd>{content.version}</dd>
              </div>
              {content.meta.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    {item.href ? (
                      <a href={item.href}>{item.value}</a>
                    ) : (
                      item.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
